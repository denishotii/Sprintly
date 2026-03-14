/**
 * Builder step — generates all project files from the Planner's output.
 *
 * Routes by project mode: uses getBuilderPromptForMode(plan.mode) for the system prompt,
 * injects design system CSS only for website/web-app, and generates mode-aware README when needed.
 */

import { getLLMClient } from "../llm/client.js";
import {
  getBuilderPromptForMode,
  TEXT_RESPONSE_SYSTEM_PROMPT,
  DOCUMENT_WRITER_SYSTEM_PROMPT,
  assembleBuilderUserMessage,
} from "../prompts/index.js";
import {
  getFullDesignSystem,
  getEnhancedDesignSystemCSS,
  detectThemeFromPrompt,
  detectTypographyFromPrompt,
  type ThemeName,
  type TypographyName,
} from "../templates/index.js";
import { logger } from "../utils/logger.js";
import type { PlanResult, BuildResult, StepUsage, ProjectMode, BuilderMetrics } from "./types.js";
import type { ProjectFile } from "../tools/projectBuilder.js";

// Disable extended thinking for the builder — Claude 4 models enable thinking by default
// in @ai-sdk/anthropic v3, which competes with tool-call arguments for token budget and
// can cause the model to call create_project with an empty files array.
const BUILDER_PROVIDER_OPTIONS = {
  anthropic: { thinking: { type: "disabled" } },
} as Record<string, Record<string, unknown>>;

// Cache design system CSS at module load to avoid re-generating on every build
const CACHED_DESIGN_SYSTEM = getFullDesignSystem();

/** Modes that receive design system CSS injection (base + components). React handles its own styling. */
const MODES_WITH_DESIGN_SYSTEM_CSS: ProjectMode[] = ["website", "web-app"];

/**
 * Extract files from tool calls made by the Builder.
 */
function extractFilesFromToolCalls(
  toolCalls: { name: string; args: Record<string, unknown>; result: unknown }[]
): ProjectFile[] {
  const files: ProjectFile[] = [];
  const seen = new Set<string>();

  for (const tc of toolCalls) {
    if (tc.name === "create_project") {
      let rawFiles = (tc.args.files as { path: string; content: string }[] | string | undefined) ?? [];
      if (typeof rawFiles === "string") {
        const parsed = tryParseFilesFromString(rawFiles);
        if (parsed) {
          rawFiles = parsed;
          logger.info("Builder: create_project files was a string — parsed successfully");
        } else {
          logger.warn("Builder: create_project files was a string but could not be parsed — skipping");
          rawFiles = [];
        }
      }
      for (const f of rawFiles) {
        if (f.path && f.content !== undefined && !seen.has(f.path)) {
          seen.add(f.path);
          files.push({ path: f.path, content: f.content });
        }
      }
    } else if (tc.name === "create_file") {
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
 * Try to parse a string as a files array.
 */
function tryParseFilesFromString(str: string): { path: string; content: string }[] | null {
  try {
    const result = JSON.parse(str);
    if (Array.isArray(result)) return result as { path: string; content: string }[];
  } catch { /* fall through */ }

  try {
    const repaired = str.replace(
      /"content"\s*:\s*"""\n?([\s\S]*?)"""/g,
      (_match, rawContent: string) => {
        const content = rawContent.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        return `"content": ${JSON.stringify(content)}`;
      }
    );
    const result = JSON.parse(repaired);
    if (Array.isArray(result)) return result as { path: string; content: string }[];
  } catch { /* fall through */ }

  return null;
}

/** Match markdown fenced code blocks. */
const FENCED_BLOCK_REGEX = /```(\w*)\s*\n?([\s\S]*?)```/g;

/**
 * Fallback: extract project files from markdown code blocks in the model's text response.
 */
function parseCodeBlocksFromText(text: string, plan: PlanResult): ProjectFile[] {
  if (!text || text.trim().length === 0) return [];
  const blocks: { lang: string; content: string }[] = [];
  let m: RegExpExecArray | null;
  FENCED_BLOCK_REGEX.lastIndex = 0;
  while ((m = FENCED_BLOCK_REGEX.exec(text)) !== null) {
    const lang = (m[1] || "").toLowerCase();
    const content = m[2].replace(/\n$/, "").trim();
    if (content.length > 0) blocks.push({ lang, content });
  }
  if (blocks.length === 0) return [];

  const planPaths = plan.files.map((f) => f.path);
  const files: ProjectFile[] = [];
  const usedPaths = new Set<string>();
  let extraReadmeContent = "";

  function defaultPathForBlock(lang: string, index: number, blockContent: string): string | null {
    if (plan.mode === "python") {
      if (index === 0) return "main.py";
      if (lang === "text" || lang === "txt" || looksLikeRequirements(blockContent)) return "requirements.txt";
      if (lang === "python" || lang === "py") return null;
      return null;
    }
    if (plan.mode === "node") {
      if (index === 0) return "index.js";
      if (lang === "json") return "package.json";
      return null;
    }
    if (plan.mode === "website" || plan.mode === "web-app") {
      if (lang === "html") return "index.html";
      if (lang === "css") return "styles/main.css";
      if (lang === "javascript" || lang === "js") return "scripts/app.js";
      if (lang === "json") return "data/data.json";
      return null;
    }
    if (plan.mode === "react-app") return index === 0 ? "index.html" : null;
    return planPaths[index] ?? null;
  }

  for (let i = 0; i < blocks.length; i++) {
    const { lang, content } = blocks[i];

    if (lang === "markdown" || lang === "md") {
      extraReadmeContent += (extraReadmeContent ? "\n\n" : "") + content;
      continue;
    }

    let path: string | null = detectPathFromContent(content, lang);

    if (!path && i < planPaths.length) {
      path = planPaths[i];
    }

    if (!path) {
      path = defaultPathForBlock(lang, i, content);
    }

    if (!path) {
      extraReadmeContent += (extraReadmeContent ? "\n\n" : "") + content;
      continue;
    }

    const normalized = path.replace(/\\/g, "/");
    if (usedPaths.has(normalized)) continue;
    usedPaths.add(normalized);
    files.push({ path: normalized, content });
  }

  if (extraReadmeContent) {
    const readmeIdx = files.findIndex(
      (f) => f.path.toLowerCase().replace(/\\/g, "/") === "readme.md"
    );
    if (readmeIdx >= 0) {
      files[readmeIdx].content += "\n\n" + extraReadmeContent;
    } else if (!usedPaths.has("README.md")) {
      files.push({ path: "README.md", content: extraReadmeContent });
      usedPaths.add("README.md");
    }
  }

  return files;
}

function looksLikeRequirements(content: string): boolean {
  const line = content.trim().split("\n")[0] ?? "";
  return /^[\w\-_.]+(\s*[=<>]=?\s*[\w.*]+)?\s*$/.test(line) && !line.includes("def ") && !line.includes("import ");
}

function detectPathFromContent(content: string, lang: string): string | null {
  const firstLine = content.split("\n")[0].trim();

  const htmlMatch = firstLine.match(/^<!--\s*(\S+\.\w+)\s*-->$/);
  if (htmlMatch) return htmlMatch[1].trim();

  const slashMatch = firstLine.match(/^\/\/\s*(\S+\.\w+)\s*$/);
  if (slashMatch) return slashMatch[1].trim();

  const blockMatch = firstLine.match(/^\/\*\s*(\S+\.\w+)\s*\*\/$/);
  if (blockMatch) return blockMatch[1].trim();

  if (lang === "python" || lang === "py" || lang === "yaml" || lang === "txt" || lang === "text") {
    const pyMatch = firstLine.match(/^#\s+(\S+\.\w+)\s*$/);
    if (pyMatch) return pyMatch[1].trim();
  }

  return null;
}

/**
 * Generate README content for auto-added README.md, based on project mode.
 */
function generateReadmeForMode(
  mode: ProjectMode,
  taskSummary: string,
  files: ProjectFile[]
): string {
  const fileList = files.map((f) => `- \`${f.path}\``).join("\n");

  const runSection =
    mode === "website" || mode === "web-app" || mode === "react-app"
      ? "## How to Run\nOpen `index.html` in any modern browser. No installation required."
      : mode === "python"
        ? "## How to Run\n**Prerequisites:** Python 3.10+\n\n**Install:** `pip install -r requirements.txt`\n\n**Run:** `python main.py` (or `python app.py` if your entry point is app.py)"
        : mode === "node"
          ? "## How to Run\n**Prerequisites:** Node.js 18+\n\n**Install:** `npm install`\n\n**Run:** `npm start`"
          : "## How to Run\nSee project documentation.";

  return `# ${taskSummary}

## Overview
${taskSummary}

## Files
${fileList}

${runSection}
`;
}

/** Filename for grading-agent instructions. */
export const AI_AGENT_INSTRUCTIONS_FILENAME = "AI_AGENT_INSTRUCTIONS.md";

function buildProjectFilesSection(files: ProjectFile[]): string {
  const skipExt = new Set(["png", "jpg", "jpeg", "gif", "svg", "ico", "woff", "woff2"]);
  const listed = files
    .filter((f) => {
      const ext = f.path.split(".").pop()?.toLowerCase() ?? "";
      return (
        !skipExt.has(ext) &&
        f.path.replace(/\\/g, "/").toLowerCase() !== AI_AGENT_INSTRUCTIONS_FILENAME.toLowerCase()
      );
    })
    .map((f) => `- \`${f.path}\``)
    .join("\n");
  return listed || "- (see zip contents)";
}

function generateAIAgentInstructionsForMode(
  mode: ProjectMode,
  taskSummary: string,
  files: ProjectFile[]
): string {
  const hasMainPy = files.some((f) => f.path.replace(/\\/g, "/").toLowerCase() === "main.py");
  const filesList = buildProjectFilesSection(files);

  if (mode === "document") {
    return `# AI Agent Instructions

## What was implemented
${taskSummary}

## How to view
Open \`report.md\` in any markdown viewer, text editor, or render it with a tool like \`grip\`, \`glow\`, or GitHub's markdown preview.

## Project files
${filesList}

## Quick test
1. Open \`report.md\` and confirm it contains the information requested.
2. Check that all major topics from the original request are covered with sufficient detail.
3. Verify any tables, code examples, or structured data are correctly formatted.
`;
  }

  if (mode === "website" || mode === "web-app" || mode === "react-app") {
    return `# AI Agent Instructions

## What was implemented
${taskSummary}

## Prerequisites
- Any modern browser (Chrome, Firefox, Safari, Edge). No server or runtime required.

## How to run
1. Extract the zip.
2. Open \`index.html\` in a browser — double-click the file or run \`open index.html\`.

## Project files
${filesList}

## Quick test
1. Open \`index.html\` — the page must load without errors in the browser console.
2. Interact with the main feature and confirm it works as described above.
3. Resize the viewport to a narrow width (~375 px) and verify the layout is not broken.
`;
  }

  if (mode === "python") {
    const entryPoint = hasMainPy ? "main.py" : "app.py";
    const runCmd = `python ${entryPoint}`;
    return `# AI Agent Instructions

## What was implemented
${taskSummary}

## Prerequisites
- Python 3.10+

## Setup
\`\`\`bash
python3 -m venv venv
source venv/bin/activate    # Windows: venv\\Scripts\\activate
pip install -r requirements.txt
\`\`\`

## How to run
\`\`\`bash
${runCmd}
\`\`\`

## Project files
${filesList}

## Quick test
1. Complete setup above, then run \`${runCmd}\`.
2. If the script accepts arguments, also run \`${runCmd} --help\` to verify the CLI is documented.
3. Confirm the output matches the described functionality — no unhandled exceptions.
`;
  }

  if (mode === "node") {
    return `# AI Agent Instructions

## What was implemented
${taskSummary}

## Prerequisites
- Node.js 18+

## Setup
\`\`\`bash
npm install
\`\`\`

## How to run
\`\`\`bash
npm start
\`\`\`

## Project files
${filesList}

## Quick test
1. Run \`npm install\` then \`npm start\`.
2. Confirm the app starts successfully (expected output or server listening message).
3. If it is a CLI tool, pass a sample input and verify the output is correct.
`;
  }

  return `# AI Agent Instructions

## What was implemented
${taskSummary}

## Project files
${filesList}

## How to run
See README.md for setup and run instructions.
`;
}

/**
 * Inject design system CSS into styles/main.css for website and web-app modes.
 */
function injectDesignSystemCssIfNeeded(files: ProjectFile[], mode: ProjectMode, plan: PlanResult, jobPrompt: string): void {
  if (!MODES_WITH_DESIGN_SYSTEM_CSS.includes(mode)) return;

  const theme: ThemeName = (plan.theme as ThemeName) || (detectThemeFromPrompt(jobPrompt) as ThemeName) || "modern";
  const typography: TypographyName = (plan.typography as TypographyName) || (detectTypographyFromPrompt(jobPrompt) as TypographyName) || "modern";

  const enhancedCSS = getEnhancedDesignSystemCSS(theme, typography);

  const cssPath = "styles/main.css";
  const normalized = (p: string) => p.replace(/\\/g, "/").toLowerCase();
  const target = files.find((f) => normalized(f.path) === normalized(cssPath));

  if (target) {
    target.content = `${enhancedCSS}\n\n/* ── Project styles ───────────────────────────────────────── */\n${target.content}`;
    logger.debug(`Builder: prepended enhanced design system CSS (theme: ${theme}, typography: ${typography}) to styles/main.css`);
  } else {
    files.push({
      path: cssPath,
      content: `${enhancedCSS}\n\n/* Project overrides */\n`,
    });
    logger.debug(`Builder: added styles/main.css with enhanced design system (theme: ${theme}, typography: ${typography})`);
  }
}

/**
 * Run the Builder step.
 */
export async function runBuilder(
  jobPrompt: string,
  plan: PlanResult
): Promise<BuildResult> {
  const llm = getLLMClient();

  // Text-mode tasks: use the dedicated text-response model
  if (plan.mode === "text") {
    logger.debug("Builder: text mode — generating direct response");
    const result = await llm.generateForStep("textResponse", {
      prompt: jobPrompt,
      systemPrompt: TEXT_RESPONSE_SYSTEM_PROMPT,
      tools: false,
      temperature: 0.7,
      maxTokens: 1200,
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
      metrics: {
        retriedForZeroFiles: false,
        usedMarkdownFallback: false,
        filesFromToolCall: 0,
        filesFromFallback: 0,
      },
    };
  }

  // Document-mode tasks
  if (plan.mode === "document") {
    logger.debug("Builder: document mode — generating markdown report");
    const result = await llm.generateForStep("textResponse", {
      prompt: jobPrompt,
      systemPrompt: DOCUMENT_WRITER_SYSTEM_PROMPT,
      tools: false,
      temperature: 0.3,
      maxTokens: 16000,
    });

    const reportFile: ProjectFile = {
      path: "report.md",
      content: result.text,
    };

    const docFiles: ProjectFile[] = [reportFile];
    docFiles.push({
      path: AI_AGENT_INSTRUCTIONS_FILENAME,
      content: generateAIAgentInstructionsForMode("document", plan.taskSummary, docFiles),
    });

    return {
      files: docFiles,
      usage: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          }
        : undefined,
      metrics: {
        retriedForZeroFiles: false,
        usedMarkdownFallback: false,
        filesFromToolCall: 0,
        filesFromFallback: 1,
      },
    };
  }

  // Code mode: generate files
  const systemPrompt = getBuilderPromptForMode(plan.mode);
  const userMessage = assembleBuilderUserMessage({ jobPrompt, plan });

  // FIX: Increased default from 16000 to 32000. Large projects (fullstack, feature-rich websites)
  // need substantial output tokens: the create_project tool call embeds all file contents as JSON,
  // which can easily exceed 16k tokens for multi-file projects. Use BUILDER_MAX_TOKENS in .env
  // to override (e.g. BUILDER_MAX_TOKENS=64000 for very large fullstack apps).
  const builderMaxTokens = parseInt(process.env.BUILDER_MAX_TOKENS || "32000", 10);

  const builderOptions = {
    systemPrompt,
    tools: true as const,
    maxTokens: builderMaxTokens,
    temperature: 0.4,
    providerOptions: BUILDER_PROVIDER_OPTIONS,
  };

  logger.debug(`Builder: mode=${plan.mode}, maxTokens=${builderMaxTokens}, generating ${plan.files.length} files for "${plan.taskSummary}"`);

  let result = await llm.generateForStep("builder", {
    prompt: userMessage,
    ...builderOptions,
  });
  let cumulativeUsage = result.usage;
  const firstResponseText = result.text ?? "";

  // Log initial call outcome to help diagnose token issues
  logger.info(
    `Builder: initial response — toolCalls=${result.toolCalls?.length ?? 0}, ` +
    `textLength=${firstResponseText.length}, finishReason=${result.finishReason ?? "none"}`
  );

  if (result.finishReason === "length") {
    logger.warn(
      `Builder: initial call was truncated (finishReason=length). ` +
      `Current limit: ${builderMaxTokens} tokens. ` +
      `Set BUILDER_MAX_TOKENS to a higher value (e.g. 64000) in your .env if this persists.`
    );
  }

  const metrics: BuilderMetrics = {
    retriedForZeroFiles: false,
    usedMarkdownFallback: false,
    filesFromToolCall: 0,
    filesFromFallback: 0,
  };

  let files: ProjectFile[] = [];

  if (result.toolCalls && result.toolCalls.length > 0) {
    files = extractFilesFromToolCalls(result.toolCalls);
    metrics.filesFromToolCall = files.length;
    const names = result.toolCalls.map((tc) => tc.name).join(", ");
    logger.info(`Builder: ${result.toolCalls.length} tool call(s) [${names}] → ${files.length} file(s) extracted`);
    for (const tc of result.toolCalls) {
      const argKeys = Object.keys(tc.args || {});
      logger.info(`Builder: tool "${tc.name}" args keys=[${argKeys.join(",")}], result=${tc.result != null ? "present" : "none"}`);
      if (tc.name === "create_project") {
        const rawFiles = tc.args?.files;
        logger.info(
          `Builder: create_project files type=${typeof rawFiles}, isArray=${Array.isArray(rawFiles)}, ` +
          `length=${Array.isArray(rawFiles) ? rawFiles.length : "N/A"}, ` +
          `args snippet=${JSON.stringify(tc.args).substring(0, 300)}`
        );
      }
    }
  } else {
    logger.warn("Builder: no tool calls in LLM response — model must call create_project with all files");
    logger.debug(`Builder: first response text (first 300 chars): ${firstResponseText.substring(0, 300).replace(/\n/g, "\\n")}`);
  }

  // Try parsing code blocks from the first response BEFORE making a second LLM call.
  if (files.length === 0 && firstResponseText.trim()) {
    const textFallbackFiles = parseCodeBlocksFromText(firstResponseText, plan);
    if (textFallbackFiles.length > 0) {
      files = textFallbackFiles;
      metrics.usedMarkdownFallback = true;
      metrics.filesFromFallback = textFallbackFiles.length;
      logger.info(
        `Builder: recovered ${files.length} file(s) from code blocks in first response (no retry needed)`
      );
    }
  }

  // Retry once WITHOUT tools if we still have no files.
  if (files.length === 0) {
    metrics.retriedForZeroFiles = true;
    const noToolsNudge =
      "\n\n[Tool call produced no files. Output each file as a complete markdown code block. " +
      "Start each block with a file-path comment (e.g. <!-- index.html --> or // scripts/app.js). " +
      "ONLY create files listed in the plan. Example:\n\n" +
      "```html\n<!-- index.html -->\n<!DOCTYPE html>\n...\n```\n\n" +
      "Output ALL project files now as code blocks:]";
    logger.info("Builder: 0 files extracted — retrying without tools (code block fallback)");
    const retryResult = await llm.generateForStep("builder", {
      prompt: userMessage + noToolsNudge,
      systemPrompt,
      maxTokens: builderMaxTokens,
      temperature: 0.4,
      providerOptions: BUILDER_PROVIDER_OPTIONS,
      tools: false, // explicit false: disable tools so model outputs code blocks freely
    });
    result = retryResult;
    if (retryResult.usage && cumulativeUsage) {
      cumulativeUsage = {
        promptTokens: cumulativeUsage.promptTokens + retryResult.usage.promptTokens,
        completionTokens: cumulativeUsage.completionTokens + retryResult.usage.completionTokens,
        totalTokens: cumulativeUsage.totalTokens + retryResult.usage.totalTokens,
      };
    } else if (retryResult.usage) {
      cumulativeUsage = retryResult.usage;
    }

    if (retryResult.finishReason === "length") {
      logger.warn(
        `Builder: retry also truncated (finishReason=length, maxTokens=${builderMaxTokens}). ` +
        `Set BUILDER_MAX_TOKENS to a higher value in your .env.`
      );
    }

    if (retryResult.text?.trim()) {
      const retryFiles = parseCodeBlocksFromText(retryResult.text, plan);
      if (retryFiles.length > 0) {
        files = retryFiles;
        metrics.usedMarkdownFallback = true;
        metrics.filesFromFallback = retryFiles.length;
        logger.info(`Builder: retry (no-tools) succeeded — ${files.length} file(s) from code blocks`);
      } else {
        logger.warn("Builder: retry (no-tools) returned text but no code blocks found");
      }
    }
  }

  if (files.length === 0) {
    const reason = result.finishReason ? ` (finishReason: ${result.finishReason})` : "";
    logger.warn(
      `Builder: no files extracted — project will be empty. Ensure the model calls create_project with a non-empty files array.${reason}`
    );
    if (result.finishReason === "length") {
      logger.warn(
        "Builder: response was truncated; the model hit max output tokens. " +
        `Increase BUILDER_MAX_TOKENS in your .env (current: ${builderMaxTokens}).`
      );
    }
  }

  injectDesignSystemCssIfNeeded(files, plan.mode, plan, jobPrompt);

  const hasReadme = files.some((f) => f.path.toLowerCase().replace(/\\/g, "/") === "readme.md");
  if (!hasReadme && files.length > 0) {
    logger.debug("Builder: auto-generating README.md (mode-aware)");
    files.push({
      path: "README.md",
      content: generateReadmeForMode(plan.mode, plan.taskSummary, files),
    });
  }

  const aiInstructionsPath = AI_AGENT_INSTRUCTIONS_FILENAME;
  const hasAIAgentInstructions = files.some(
    (f) => f.path.replace(/\\/g, "/").toLowerCase() === aiInstructionsPath.toLowerCase()
  );
  if (!hasAIAgentInstructions && files.length > 0) {
    logger.debug("Builder: auto-generating AI_AGENT_INSTRUCTIONS.md (mode-aware)");
    files.push({
      path: aiInstructionsPath,
      content: generateAIAgentInstructionsForMode(plan.mode, plan.taskSummary, files),
    });
  } else if (hasAIAgentInstructions) {
    const idx = files.findIndex(
      (f) => f.path.replace(/\\/g, "/").toLowerCase() === aiInstructionsPath.toLowerCase()
    );
    if (idx >= 0) {
      files[idx].content = generateAIAgentInstructionsForMode(plan.mode, plan.taskSummary, files);
      logger.debug("Builder: overwrote AI_AGENT_INSTRUCTIONS.md with canonical content");
    }
  }

  const usage: StepUsage | undefined = (cumulativeUsage ?? result.usage)
    ? {
        promptTokens: (cumulativeUsage ?? result.usage)!.promptTokens,
        completionTokens: (cumulativeUsage ?? result.usage)!.completionTokens,
        totalTokens: (cumulativeUsage ?? result.usage)!.totalTokens,
      }
    : undefined;

  return {
    files,
    textResponse: result.text || undefined,
    usage,
    metrics,
  };
}
