/**
 * Builder step — generates all project files from the Planner's output.
 * Uses the BUILDER_MODEL (default: Claude Sonnet — best design implementation in practice).
 */

import { getConfig } from "../config/index.js";
import { getLLMClient } from "../llm/client.js";
import { BUILDER_SYSTEM_PROMPT, TEXT_RESPONSE_SYSTEM_PROMPT, assembleBuilderUserMessage } from "../prompts/index.js";
import { getFullDesignSystem } from "../templates/index.js";
import { logger } from "../utils/logger.js";
import type { PlanResult, BuildResult, StepUsage } from "./types.js";
import type { ProjectFile } from "../tools/projectBuilder.js";

/**
 * Extract files from tool calls made by the Builder.
 *
 * The Builder uses create_project (batch) or create_file (individual) tools.
 * This function normalises both into a flat ProjectFile[].
 */
function extractFilesFromToolCalls(
  toolCalls: { name: string; args: Record<string, unknown>; result: unknown }[]
): ProjectFile[] {
  const files: ProjectFile[] = [];
  const seen = new Set<string>();

  for (const tc of toolCalls) {
    if (tc.name === "create_project") {
      // Batch tool: { projectName, files: [{ path, content }] }
      const rawFiles = (tc.args.files as { path: string; content: string }[] | undefined) ?? [];
      for (const f of rawFiles) {
        if (f.path && f.content !== undefined && !seen.has(f.path)) {
          seen.add(f.path);
          files.push({ path: f.path, content: f.content });
        }
      }
    } else if (tc.name === "create_file") {
      // Individual tool: { path, content }
      const path = tc.args.path as string | undefined;
      const content = tc.args.content as string | undefined;
      if (path && content !== undefined && !seen.has(path)) {
        seen.add(path);
        files.push({ path, content });
      }
    }
  }

  return files;
}

/**
 * Auto-generate a README.md if the Builder didn't include one.
 */
function generateReadme(taskSummary: string, files: ProjectFile[]): string {
  const fileList = files
    .map((f) => `- \`${f.path}\``)
    .join("\n");

  return `# ${taskSummary}

## Overview
${taskSummary}

## Files
${fileList}

## How to Run
Open \`index.html\` in any modern browser. No installation required.

## Tech
Built with HTML, CSS, and JavaScript. All dependencies loaded via CDN.
`;
}

/**
 * Run the Builder step.
 *
 * Sends the job prompt + plan to the BUILDER_MODEL.
 * Collects all generated files from tool calls (create_project / create_file).
 * Falls back to parsing the text response if no tool calls were made.
 */
export async function runBuilder(
  jobPrompt: string,
  plan: PlanResult
): Promise<BuildResult> {
  const llm = getLLMClient();

  // Text-mode tasks: use the dedicated text-response model (faster, cheaper)
  if (plan.mode === "text") {
    logger.debug("Builder: text mode — generating direct response");
    const result = await llm.generateForStep("textResponse", {
      prompt: jobPrompt,
      systemPrompt: TEXT_RESPONSE_SYSTEM_PROMPT,
      tools: false,
      temperature: 0.7,
      maxTokens: 1200, // Tighter cap for ~5–6 tweet threads; keeps latency down with gpt-4o
    });

    return {
      files: [],
      textResponse: result.text,
      usage: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          }
        : undefined,
    };
  }

  // Code mode: generate files
  const config = getConfig();
  const userMessage = assembleBuilderUserMessage({ jobPrompt, plan });

  const complexity = plan.complexityEstimate ?? "medium";
  const step = "builder"; // Always use Sonnet for best quality
  const maxTokens =
    complexity === "low"    ? config.builderLowMaxTokens :
    complexity === "medium" ? config.builderMediumMaxTokens :
    config.builderMaxTokens;

  logger.debug(`Builder: complexity=${complexity} → step=${step}, maxTokens=${maxTokens}, files=${plan.files.length}`);

  const result = await llm.generateForStep(step, {
    prompt: userMessage,
    systemPrompt: BUILDER_SYSTEM_PROMPT,
    tools: true, // create_project, create_file, finalize_project are available
    maxTokens,
    temperature: 0.4, // Low-ish for consistent code, slight room for creativity
  });

  // Extract files from tool calls first
  let files: ProjectFile[] = [];

  if (result.toolCalls && result.toolCalls.length > 0) {
    files = extractFilesFromToolCalls(result.toolCalls);
    const names = result.toolCalls.map((tc) => tc.name).join(", ");
    logger.debug(`Builder: ${result.toolCalls.length} tool call(s) [${names}] → ${files.length} file(s) extracted`);
    for (const tc of result.toolCalls) {
      if (tc.name === "create_project") {
        const rawFiles = (tc.args?.files as unknown[]) ?? [];
        logger.debug(`Builder: create_project args.files.length=${rawFiles.length}`);
      }
    }
  } else {
    logger.warn("Builder: no tool calls in LLM response — model must call create_project with all files");
  }

  if (files.length === 0) {
    const reason = result.finishReason ? ` (finishReason: ${result.finishReason})` : "";
    logger.warn(
      `Builder: no files extracted — project will be empty. Ensure the model calls create_project with a non-empty files array.${reason}`
    );
    if (result.finishReason === "length") {
      logger.warn("Builder: response was truncated; the model hit max output tokens. Output may need more headroom.");
    }
  }

  // Always inject the full design system CSS (provides .btn, .card, .nav, .hero, etc.)
  // This is pre-built — the builder should NOT be writing CSS from scratch.
  if (files.length > 0) {
    const cssIndex = files.findIndex((f) => f.path === "styles/main.css");
    if (cssIndex === -1) {
      // Builder didn't write CSS — inject design system as the sole stylesheet
      files.push({ path: "styles/main.css", content: getFullDesignSystem() });
      logger.debug("Builder: auto-injected design system CSS (styles/main.css)");
    } else {
      // Builder wrote custom CSS — prepend design system so builder's rules win
      files[cssIndex].content = getFullDesignSystem(files[cssIndex].content);
      logger.debug("Builder: prepended design system to existing styles/main.css");
    }
  }

  // Ensure README.md exists
  const hasReadme = files.some((f) => f.path.toLowerCase() === "readme.md");
  if (!hasReadme && files.length > 0) {
    logger.debug("Builder: auto-generating README.md");
    files.push({
      path: "README.md",
      content: generateReadme(plan.taskSummary, files),
    });
  }

  const usage: StepUsage | undefined = result.usage
    ? {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      }
    : undefined;

  return {
    files,
    textResponse: result.text || undefined,
    usage,
  };
}
