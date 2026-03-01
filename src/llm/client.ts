import { tool, zodSchema, type Tool } from "ai";
import { z } from "zod";
import { getConfig } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { webSearch, type WebSearchResult } from "../tools/webSearch.js";
import { calculator, type CalculatorResult } from "../tools/calculator.js";
import {
  ProjectBuilder,
  type ProjectBuildResult,
  type ProjectFile,
} from "../tools/projectBuilder.js";
import {
  createOpenAIProvider,
  createAnthropicProvider,
  type LLMProvider,
} from "./providers/index.js";

// Errors that are worth retrying (usually transient LLM output issues)
const RETRYABLE_ERROR_PATTERNS = [
  'InvalidToolArgumentsError',
  'AI_InvalidToolArgumentsError',
  'JSONParseError',
  'AI_JSONParseError',
];

/**
 * Get retry configuration from app config
 */
function getRetryConfig() {
  const config = getConfig();
  return {
    maxRetries: config.llmRetryMaxAttempts,
    baseDelayMs: config.llmRetryBaseDelayMs,
    maxDelayMs: config.llmRetryMaxDelayMs,
    fallbackNoTools: config.llmRetryFallbackNoTools,
  };
}

export interface LLMResponse {
  text: string;
  toolCalls?: {
    name: string;
    args: Record<string, unknown>;
    result: unknown;
  }[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Why generation stopped; 'length' = output truncated (increase maxTokens). */
  finishReason?: string;
  // If a project was built during this response
  projectBuild?: ProjectBuildResult;
}

// Active project builder instance (one per generation)
// Using a type assertion to work around TypeScript narrowing issues
let activeProjectBuilder: ProjectBuilder | null = null;

// Helper to get the project builder with correct typing
function getActiveBuilder(): ProjectBuilder | null {
  return activeProjectBuilder;
}

/**
 * Check if an error is retryable (transient LLM output parsing issue)
 */
function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  
  const errorName = (error as Error).name || '';
  const errorMessage = (error as Error).message || '';
  
  // Check error name against known retryable errors
  if (RETRYABLE_ERROR_PATTERNS.some(name => errorName.includes(name))) {
    return true;
  }
  
  // Check for JSON parsing errors in the message
  if (errorMessage.includes('JSON parsing failed') || 
      errorMessage.includes('Invalid arguments for tool')) {
    return true;
  }
  
  // Check for cause chain (nested errors)
  const cause = (error as { cause?: unknown }).cause;
  if (cause) {
    return isRetryableError(cause);
  }
  
  return false;
}

/**
 * Calculate exponential backoff delay with jitter
 */
function getRetryDelay(attempt: number, retryConfig: ReturnType<typeof getRetryConfig>): number {
  const delay = Math.min(
    retryConfig.baseDelayMs * Math.pow(2, attempt),
    retryConfig.maxDelayMs
  );
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() - 0.5);
  return Math.round(delay + jitter);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface GenerateOptions {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  /** true = all tools, false = no tools. For pipeline builder step we pass only project tools and toolChoice: 'required'. */
  tools?: boolean;
  /** Force the model to call a tool (e.g. create_project). Used for builder step. */
  toolChoice?: "auto" | "required" | "none";
  /** When 'builder', only create_project, create_file, finalize_project are passed so the model is not distracted by web_search/calculator. */
  toolsFilter?: "all" | "builder";
}

/** Pipeline step names; each can use its own model (see config plannerModel, builderModel, verifierModel). */
export type PipelineStep = "planner" | "builder" | "verifier";

/**
 * LLM Client with direct OpenAI and Anthropic API support.
 * Supports a single primary provider for generate(), and per-step models for the pipeline via generateForStep().
 */
export class LLMClient {
  private readonly primaryProvider: LLMProvider;
  /** OpenAI provider (created when OPENAI_API_KEY is set). Used for models like gpt-*. */
  private readonly openaiProvider: LLMProvider | null;
  /** Anthropic provider (created when ANTHROPIC_API_KEY is set). Used for models like claude-*. */
  private readonly anthropicProvider: LLMProvider | null;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly config: ReturnType<typeof getConfig>;

  constructor() {
    const config = getConfig();
    this.config = config;

    const hasOpenAI = !!config.openaiApiKey?.trim();
    const hasAnthropic = !!config.anthropicApiKey?.trim();

    if (config.primaryProvider === "openai" && !hasOpenAI) {
      throw new Error(
        "OPENAI_API_KEY is required when PRIMARY_PROVIDER=openai. Set OPENAI_API_KEY in your environment."
      );
    }
    if (config.primaryProvider === "anthropic" && !hasAnthropic) {
      throw new Error(
        "ANTHROPIC_API_KEY is required when PRIMARY_PROVIDER=anthropic. Set ANTHROPIC_API_KEY in your environment."
      );
    }
    if (!hasOpenAI && !hasAnthropic) {
      throw new Error("At least one of OPENAI_API_KEY or ANTHROPIC_API_KEY is required.");
    }

    this.openaiProvider = hasOpenAI
      ? createOpenAIProvider({ apiKey: config.openaiApiKey, model: config.openaiModel })
      : null;
    this.anthropicProvider = hasAnthropic
      ? createAnthropicProvider({ apiKey: config.anthropicApiKey, model: config.anthropicModel })
      : null;

    this.primaryProvider =
      config.primaryProvider === "openai" ? this.openaiProvider! : this.anthropicProvider!;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;

    logger.debug(
      `LLM client: primary=${this.primaryProvider.name}, openai=${!!this.openaiProvider}, anthropic=${!!this.anthropicProvider}`
    );
  }

  /**
   * Resolve which provider to use for a given model ID (e.g. planner/builder/verifier models).
   * Convention: claude-* → Anthropic, gpt-* / o1-* → OpenAI.
   */
  getProviderForModel(modelId: string): LLMProvider {
    const id = modelId.toLowerCase();
    if (id.startsWith("gpt-") || id.startsWith("o1-")) {
      if (!this.openaiProvider) {
        throw new Error(
          `Model "${modelId}" requires OpenAI. Set OPENAI_API_KEY in your environment.`
        );
      }
      return this.openaiProvider;
    }
    if (id.startsWith("claude-")) {
      if (!this.anthropicProvider) {
        throw new Error(
          `Model "${modelId}" requires Anthropic. Set ANTHROPIC_API_KEY in your environment.`
        );
      }
      return this.anthropicProvider;
    }
    throw new Error(
      `Unknown model prefix for "${modelId}". Use gpt-* (OpenAI) or claude-* (Anthropic).`
    );
  }

  /** Return the configured model ID for a pipeline step (planner, builder, verifier). */
  getModelForStep(step: PipelineStep): string {
    switch (step) {
      case "planner":
        return this.config.plannerModel;
      case "builder":
        return this.config.builderModel;
      case "verifier":
        return this.config.verifierModel;
    }
  }

  /**
   * Get available tools based on configuration.
   * @param filter - 'all' (default) returns every enabled tool; 'builder' returns only create_project, create_file, finalize_project for the pipeline builder step.
   */
  private getTools(filter?: "all" | "builder"): Record<string, Tool> {
    const config = getConfig();
    const tools: Record<string, Tool> = {};

    if (config.tools.webSearchEnabled) {
      tools.web_search = tool({
        description:
          "Search the web for current information. Use this when you need up-to-date information, facts, news, prices, or data that might not be in your training data. Returns an array of search results with title, url, and snippet containing the relevant information.",
        inputSchema: zodSchema(z.object({
          query: z
            .string()
            .describe("The search query to look up on the web"),
        })),
        execute: async ({ query }: { query: string }): Promise<WebSearchResult[]> => {
          logger.tool("web_search", "start", `Query: ${query}`);
          try {
            const results = await webSearch(query);
            logger.tool("web_search", "success", `Found ${results.length} results`);
            // Log result snippets for debugging
            for (const r of results.slice(0, 2)) {
              logger.debug(`Search result: "${r.title}" - ${r.snippet.substring(0, 100)}...`);
            }
            return results;
          } catch (error) {
            logger.tool("web_search", "error", String(error));
            throw error;
          }
        },
      });
    }

    if (config.tools.calculatorEnabled) {
      tools.calculator = tool({
        description:
          "Perform mathematical calculations. Use this for any math operations, equations, or numerical computations.",
        inputSchema: zodSchema(z.object({
          expression: z
            .string()
            .describe(
              "The mathematical expression to evaluate (e.g., '2 + 2', 'sqrt(16)', 'sin(45)')"
            ),
        })),
        execute: async ({ expression }: { expression: string }): Promise<CalculatorResult> => {
          logger.tool("calculator", "start", `Expression: ${expression}`);
          try {
            const result = calculator(expression);
            logger.tool("calculator", "success", `Result: ${result.result}`);
            return result;
          } catch (error) {
            logger.tool("calculator", "error", String(error));
            throw error;
          }
        },
      });
    }

    if (config.tools.codeInterpreterEnabled) {
      tools.code_analysis = tool({
        description:
          "Analyze code snippets, explain code logic, identify bugs, or suggest improvements. This tool helps with code-related questions.",
        inputSchema: zodSchema(z.object({
          code: z.string().describe("The code snippet to analyze"),
          language: z
            .string()
            .optional()
            .describe("The programming language of the code"),
          task: z
            .enum(["explain", "debug", "improve", "review"])
            .describe("What to do with the code"),
        })),
        execute: async ({ code, language, task }: { code: string; language?: string; task: string }) => {
          logger.tool("code_analysis", "start", `Task: ${task}`);
          // This is a meta-tool - it returns structured data for the LLM to use
          return {
            code,
            language: language || "unknown",
            task,
            note: "Analyze this code and provide the requested information.",
          };
        },
      });

      // Batch project creation — preferred for pipeline builder step (one call, all files)
      tools.create_project = tool({
        description: `Create a complete project in one call: pass projectName and an array of { path, content } for every file. Use this when building a full web project (e.g. from a plan). All files are written and zipped in one step. Include index.html, styles/main.css, scripts/app.js, README.md as needed. Do NOT use for text-only requests.`,
        inputSchema: zodSchema(z.object({
          projectName: z.string().describe("Short slug for the project (e.g. 'landing-page', 'todo-app')"),
          files: z.array(z.object({
            path: z.string().describe("Relative path, e.g. 'index.html', 'styles/main.css'"),
            content: z.string().describe("Full file content"),
          })).describe("All project files; must include index.html and README.md (or README is auto-added)"),
        })),
        execute: async ({ projectName, files }: { projectName: string; files: ProjectFile[] }) => {
          logger.tool("create_project", "start", `${projectName} (${files?.length ?? 0} files)`);
          try {
            const builder = new ProjectBuilder(projectName);
            builder.createBatch(projectName, files);
            // Expose builder so the verifier can patch individual files via create_file
            activeProjectBuilder = builder;
            const result = await builder.createZip(`${projectName}.zip`);
            logger.tool("create_project", "success", `${result.zipPath} (${result.files.length} files)`);
            return {
              success: result.success,
              projectName,
              projectDir: result.projectDir,
              zipPath: result.zipPath,
              files: result.files,
              totalSize: result.totalSize,
              error: result.error,
            };
          } catch (error) {
            logger.tool("create_project", "error", String(error));
            throw error;
          }
        },
      });

      // Single-file creation — for verifier patches or legacy create_file-then-finalize flow
      tools.create_file = tool({
        description: `Create a single file for a deliverable code project. Prefer create_project when building a full project in one go. Use create_file for adding or patching one file (e.g. after review). Call finalize_project to package all files into a zip.`,
        inputSchema: zodSchema(z.object({
          path: z
            .string()
            .describe(
              "The file path relative to the project root (e.g., 'index.html', 'src/App.tsx', 'styles/main.css')"
            ),
          content: z
            .string()
            .describe("The complete content of the file"),
        })),
        execute: async ({ path, content }: { path: string; content: string }) => {
          logger.tool("create_file", "start", `Creating: ${path}`);
          try {
            // Initialize project builder if not exists
            if (!activeProjectBuilder) {
              activeProjectBuilder = new ProjectBuilder();
            }
            
            activeProjectBuilder.addFile(path, content);
            
            const files = activeProjectBuilder.getFiles();
            logger.tool("create_file", "success", `Created ${path}, total files: ${files.length}`);
            
            return {
              success: true,
              path,
              size: content.length,
              totalFiles: files.length,
              allFiles: files,
            };
          } catch (error) {
            logger.tool("create_file", "error", String(error));
            throw error;
          }
        },
      });

      tools.finalize_project = tool({
        description: `Package all files created with create_file into a downloadable zip. Call this after creating all project files. Only use when you've built a real code project.`,
        inputSchema: zodSchema(z.object({
          projectName: z
            .string()
            .describe("A descriptive name for the project (e.g., 'business-website', 'react-todo-app')"),
        })),
        execute: async ({ projectName }: { projectName: string }) => {
          logger.tool("finalize_project", "start", `Finalizing: ${projectName}`);
          try {
            if (!activeProjectBuilder) {
              throw new Error("No files have been created. Use create_file first.");
            }
            
            const result = await activeProjectBuilder.createZip(`${projectName}.zip`);
            logger.tool("finalize_project", "success", `Created ${result.zipPath} (${result.totalSize} bytes)`);
            
            return {
              success: result.success,
              projectName,
              zipPath: result.zipPath,
              files: result.files,
              totalSize: result.totalSize,
              error: result.error,
            };
          } catch (error) {
            logger.tool("finalize_project", "error", String(error));
            throw error;
          }
        },
      });
    }

    if (filter === "builder") {
      const builderToolNames = ["create_project", "create_file", "finalize_project"];
      const filtered: Record<string, Tool> = {};
      for (const name of builderToolNames) {
        if (tools[name]) filtered[name] = tools[name];
      }
      return filtered;
    }

    return tools;
  }

  /**
   * Generate a response for a pipeline step using that step's configured model (PLANNER_MODEL, BUILDER_MODEL, VERIFIER_MODEL).
   * Use this when implementing the planner → builder → verifier pipeline; the correct provider (OpenAI/Anthropic) is chosen from the model ID.
   */
  async generateForStep(
    step: PipelineStep,
    options: GenerateOptions
  ): Promise<LLMResponse> {
    // Reset builder only at pipeline start (planner); builder/verifier share the same project
    if (step === "planner") {
      activeProjectBuilder = null;
    }

    const model = this.getModelForStep(step);
    const provider = this.getProviderForModel(model);
    const toolsFilter = options.toolsFilter ?? (step === "builder" ? "builder" : "all");
    const tools = options.tools !== false ? this.getTools(toolsFilter) : undefined;
    const toolChoice =
      options.toolChoice ??
      (step === "builder" && tools?.create_project
        ? { type: "tool" as const, toolName: "create_project" }
        : undefined);
    return this.executeGenerationWithProvider(provider, model, {
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      maxTokens: options.maxTokens ?? this.maxTokens,
      temperature: options.temperature ?? this.temperature,
      tools,
      toolChoice,
    });
  }

  /**
   * Generate a response using the LLM with optional tool calling (primary provider, default model).
   */
  async generate(options: GenerateOptions): Promise<LLMResponse> {
    const {
      prompt,
      systemPrompt,
      maxTokens = this.maxTokens,
      temperature = this.temperature,
      tools: enableTools = true,
    } = options;

    logger.debug(`Generating response with provider: ${this.primaryProvider.name}`);

    // Reset project builder for each generation
    activeProjectBuilder = null;

    const tools = enableTools ? this.getTools() : undefined;
    const hasTools = tools && Object.keys(tools).length > 0;

    let lastError: unknown;
    let attempt = 0;
    const retryConfig = getRetryConfig();

    // Retry loop for recoverable errors
    while (attempt <= retryConfig.maxRetries) {
      try {
        const result = await this.executeGenerationWithProvider(
          this.primaryProvider,
          undefined,
          { prompt, systemPrompt, maxTokens, temperature, tools: hasTools ? tools : undefined }
        );
        
        return result;
      } catch (error) {
        lastError = error;
        
        if (isRetryableError(error) && attempt < retryConfig.maxRetries) {
          const delay = getRetryDelay(attempt, retryConfig);
          logger.warn(
            `LLM generation failed with retryable error (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}), ` +
            `retrying in ${delay}ms: ${(error as Error).message?.substring(0, 100)}`
          );
          
          // Reset project builder before retry
          activeProjectBuilder = null;
          
          await sleep(delay);
          attempt++;
          continue;
        }
        
        // Not retryable or exhausted retries - try fallback if tools were enabled
        if (hasTools && retryConfig.fallbackNoTools && attempt >= retryConfig.maxRetries && isRetryableError(error)) {
          logger.warn(
            `Exhausted ${retryConfig.maxRetries} retries for tool calling, attempting fallback without tools`
          );
          
          try {
            // Reset and try without tools
            activeProjectBuilder = null;
            const fallbackResult = await this.executeGenerationWithProvider(
              this.primaryProvider,
              undefined,
              {
                prompt: prompt + "\n\n[Note: Please provide a text response only, as tool execution is temporarily unavailable.]",
                systemPrompt,
                maxTokens,
                temperature,
                tools: undefined,
              }
            );
            
            logger.info("Fallback generation without tools succeeded");
            return fallbackResult;
          } catch (fallbackError) {
            logger.error("Fallback generation also failed:", fallbackError);
            // Throw the original error as it's more informative
            throw lastError;
          }
        }
        
        // Re-throw non-retryable errors immediately
        throw error;
      }
    }

    // Should not reach here, but just in case
    throw lastError;
  }

  /**
   * Execute the actual LLM generation (separated for retry logic).
   * Can use a specific provider and model (e.g. for pipeline steps) or the primary provider with default model.
   */
  private async executeGenerationWithProvider(
    provider: LLMProvider,
    modelOverride: string | undefined,
    params: {
      prompt: string;
      systemPrompt?: string;
      maxTokens: number;
      temperature: number;
      tools?: Record<string, Tool>;
      toolChoice?: "auto" | "required" | "none" | { type: "tool"; toolName: string };
    }
  ): Promise<LLMResponse> {
    const { prompt, systemPrompt, maxTokens, temperature, tools, toolChoice } = params;

    const result = await provider.generate({
      prompt,
      systemPrompt,
      maxTokens,
      temperature,
      tools,
      toolChoice,
      model: modelOverride,
    });

    const toolCalls = result.toolCalls;

    for (const tc of toolCalls ?? []) {
      if (tc.result) {
        const resultStr = JSON.stringify(tc.result);
        logger.debug(`Tool ${tc.name} result: ${resultStr.substring(0, 200)}...`);
      }
    }

    // Derive projectBuild from tool calls.
    // Prefer finalize_project (post-patch final zip) over create_project (initial batch zip).
    let projectBuild: ProjectBuildResult | undefined;

    const finalizeCall = (toolCalls ?? []).find((tc) => tc.name === "finalize_project");
    if (finalizeCall?.result) {
      const finalizeResult = finalizeCall.result as {
        success: boolean;
        projectName?: string;
        zipPath: string;
        files: string[];
        totalSize: number;
        error?: string;
      };
      const builder = getActiveBuilder();
      if (finalizeResult.success && builder) {
        projectBuild = {
          success: true,
          projectDir: builder.getProjectDir(),
          zipPath: finalizeResult.zipPath,
          files: finalizeResult.files,
          totalSize: finalizeResult.totalSize,
        };
      }
    }

    if (!projectBuild) {
      const createProjectCall = (toolCalls ?? []).find((tc) => tc.name === "create_project");
      if (createProjectCall?.result) {
        const r = createProjectCall.result as ProjectBuildResult & { projectName?: string };
        if (r.success && r.projectDir) {
          projectBuild = {
            success: true,
            projectDir: r.projectDir,
            zipPath: r.zipPath,
            files: r.files ?? [],
            totalSize: r.totalSize ?? 0,
            error: r.error,
          };
        }
      }
    }

    return {
      text: result.text,
      toolCalls: (toolCalls?.length ?? 0) > 0 ? toolCalls : undefined,
      usage: result.usage,
      finishReason: result.finishReason,
      projectBuild,
    };
  }
  
  /**
   * Get the active project builder (if any)
   */
  getActiveProjectBuilder(): ProjectBuilder | null {
    return activeProjectBuilder;
  }

  /**
   * Generate a response for a Seedstr job
   */
  async generateJobResponse(job: { prompt: string; budget: number }): Promise<string> {
    const systemPrompt = `You are an AI agent participating in the Seedstr marketplace. Your task is to provide the best possible response to job requests.

Guidelines:
- Be helpful, accurate, and thorough
- Use tools when needed to get current information
- Provide well-structured, clear responses
- Be professional and concise
- If you use web search, cite your sources

Job Budget: $${job.budget.toFixed(2)} USD
This indicates how much the requester values this task. Adjust your effort accordingly.`;

    const result = await this.generate({
      prompt: job.prompt,
      systemPrompt,
      tools: true,
    });

    return result.text;
  }
}

// Export a singleton instance
let llmClientInstance: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!llmClientInstance) {
    llmClientInstance = new LLMClient();
  }
  return llmClientInstance;
}

export default LLMClient;
