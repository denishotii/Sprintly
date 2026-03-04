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
import { getFullDesignSystem } from "../templates/index.js";
import { logger } from "../utils/logger.js";
import { getConfig } from "../config/index.js";
import type { PlanResult, BuildResult, StepUsage, ProjectMode } from "./types.js";
import type { ProjectFile } from "../tools/projectBuilder.js";

// Disable extended thinking for the builder — Claude 4 models enable thinking by default
// in @ai-sdk/anthropic v3, which competes with tool-call arguments for token budget and
// can cause the model to call create_project with an empty files array.
const BUILDER_PROVIDER_OPTIONS = {
  anthropic: { thinking: { type: "disabled" } },
} as Record<string, Record<string, unknown>>;

/** Modes that receive design system CSS injection (base + components). React handles its own styling. */
const MODES_WITH_DESIGN_SYSTEM_CSS: ProjectMode[] = ["website", "web-app"];

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
      // Some models pass `files` as a JSON-encoded string instead of a proper array — parse it.
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
 * Try to parse a string as a files array.
 * Handles a common model bug where `files` is a JSON string containing Python triple-quote syntax,
 * e.g. `"content": """..."""` instead of a properly JSON-escaped string.
 */
function tryParseFilesFromString(str: string): { path: string; content: string }[] | null {
  // 1. Standard JSON.parse
  try {
    const result = JSON.parse(str);
    if (Array.isArray(result)) return result as { path: string; content: string }[];
  } catch { /* fall through */ }

  // 2. Repair Python triple-quote content values: "content": """..."""
  //    The lazy [\s\S]*? stops at the first bare """ (not backslash-escaped \"""),
  //    which should be the closing delimiter the model intended.
  try {
    const repaired = str.replace(
      /"content"\s*:\s*"""\n?([\s\S]*?)"""/g,
      (_match, rawContent: string) => {
        // Unescape \\" → " and \\\\ → \\ so JSON.stringify gets the real characters
        const content = rawContent.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        return `"content": ${JSON.stringify(content)}`;
      }
    );
    const result = JSON.parse(repaired);
    if (Array.isArray(result)) return result as { path: string; content: string }[];
  } catch { /* fall through */ }

  return null;
}

/** Match markdown fenced code blocks: optional language, then content until closing fence. */
const FENCED_BLOCK_REGEX = /```(\w*)\s*\n?([\s\S]*?)```/g;

/**
 * Fallback: extract project files from markdown code blocks in the model's text response.
 * Used when the model outputs code in the message body instead of via create_project.
 * Assigns paths from the plan when possible, otherwise mode-aware defaults.
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

  function defaultPathForBlock(lang: string, index: number, blockContent: string): string {
    if (plan.mode === "python") {
      if (index === 0) return "main.py";
      if (lang === "text" || lang === "txt" || looksLikeRequirements(blockContent)) return "requirements.txt";
      return `file${index + 1}.py`;
    }
    if (plan.mode === "node") {
      if (index === 0) return "index.js";
      if (lang === "json") return "package.json";
      return `file${index + 1}.js`;
    }
    if (plan.mode === "website" || plan.mode === "web-app") {
      if (index === 0 || lang === "html") return "index.html";
      if (lang === "css") return index === 1 ? "styles/main.css" : `styles/file${index}.css`;
      if (lang === "javascript" || lang === "js") return index === 1 ? "scripts/app.js" : `scripts/file${index}.js`;
      return index === 0 ? "index.html" : `file${index}.html`;
    }
    if (plan.mode === "react-app") return index === 0 ? "index.html" : `file${index}.html`;
    return planPaths[index] ?? `file${index + 1}.txt`;
  }

  for (let i = 0; i < blocks.length; i++) {
    const path = planPaths[i] ?? defaultPathForBlock(blocks[i].lang, i, blocks[i].content);
    const normalized = path.replace(/\\/g, "/");
    if (usedPaths.has(normalized)) continue;
    usedPaths.add(normalized);
    files.push({ path: normalized, content: blocks[i].content });
  }

  return files;
}

function looksLikeRequirements(content: string): boolean {
  const line = content.trim().split("\n")[0] ?? "";
  return /^[\w\-_.]+(\s*[=<>]=?\s*[\w.*]+)?\s*$/.test(line) && !line.includes("def ") && !line.includes("import ");
}

/**
 * Generate README content for auto-added README.md, based on project mode.
 * Ensures run instructions match how the project is executed (browser vs pip/npm).
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

/** Filename for grading-agent instructions (must be present in every code submission). */
export const AI_AGENT_INSTRUCTIONS_FILENAME = "AI_AGENT_INSTRUCTIONS.md";

/**
 * Build a compact "Project files" listing for the grading agent.
 * Excludes the instructions file itself and binary/asset extensions.
 */
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

/**
 * Generate AI_AGENT_INSTRUCTIONS.md for the grading/judging agent.
 *
 * Structure (kept short and scannable):
 *   1. What was implemented — one-line task summary
 *   2. Prerequisites        — runtime / browser requirements
 *   3. Setup                — install commands (where applicable)
 *   4. How to run           — the exact command(s) to start the project
 *   5. Project files        — every file in the submission
 *   6. Quick test           — concrete verification steps
 *
 * This file is read by the receiving agent before running the code.
 */
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
 * Mutates the files array in place: either prepends to existing styles/main.css or appends a new file.
 */
function injectDesignSystemCssIfNeeded(files: ProjectFile[], mode: ProjectMode): void {
  if (!MODES_WITH_DESIGN_SYSTEM_CSS.includes(mode)) return;

  const cssPath = "styles/main.css";
  const normalized = (p: string) => p.replace(/\\/g, "/").toLowerCase();
  const target = files.find((f) => normalized(f.path) === normalized(cssPath));

  const designSystem = getFullDesignSystem();

  if (target) {
    target.content = `${designSystem}\n\n/* ── Project styles ───────────────────────────────────────── */\n${target.content}`;
    logger.debug("Builder: prepended design system CSS to styles/main.css");
  } else {
    files.push({
      path: cssPath,
      content: `${designSystem}\n\n/* Project overrides */\n`,
    });
    logger.debug("Builder: added styles/main.css with design system (file was missing)");
  }
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

  // Document-mode tasks: generate a comprehensive markdown report and deliver it as a file.
  // The grading agent receives report.md + AI_AGENT_INSTRUCTIONS.md (auto-added below).
  if (plan.mode === "document") {
    logger.debug("Builder: document mode — generating markdown report");
    const result = await llm.generateForStep("textResponse", {
      prompt: jobPrompt,
      systemPrompt: DOCUMENT_WRITER_SYSTEM_PROMPT,
      tools: false,
      temperature: 0.5,
      maxTokens: 8000,
    });

    const reportFile: ProjectFile = {
      path: "report.md",
      content: result.text,
    };

    // AI_AGENT_INSTRUCTIONS.md is auto-added by the code below (files.length > 0).
    // We skip README.md for document mode — report.md IS the document.
    return {
      files: [reportFile],
      usage: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          }
        : undefined,
    };
  }

  // Code mode: generate files — use mode-specific system prompt (website, web-app, react-app, python, node)
  const systemPrompt = getBuilderPromptForMode(plan.mode);
  let userMessage = assembleBuilderUserMessage({ jobPrompt, plan });

  const config = getConfig();
  const builderMaxTokens = parseInt(process.env.BUILDER_MAX_TOKENS || "16000", 10);

  const builderOptions = {
    systemPrompt,
    tools: true as const,
    maxTokens: builderMaxTokens,
    temperature: 0.4,
    providerOptions: BUILDER_PROVIDER_OPTIONS,
  };

  logger.debug(`Builder: mode=${plan.mode}, generating ${plan.files.length} files for "${plan.taskSummary}"`);

  let result = await llm.generateForStep("builder", {
    prompt: userMessage,
    ...builderOptions,
  });
  let cumulativeUsage = result.usage;
  const firstResponseText = result.text ?? "";

  // Extract files from tool calls (mode-agnostic)
  let files: ProjectFile[] = [];

  if (result.toolCalls && result.toolCalls.length > 0) {
    files = extractFilesFromToolCalls(result.toolCalls);
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
  }

  // Retry once WITHOUT tools — ask for plain markdown code blocks instead.
  // This avoids the tool-call JSON serialisation bug where some models pass `files` as a
  // Python-syntax string rather than a proper JSON array, causing 0 files to be extracted.
  if (files.length === 0) {
    const noToolsNudge =
      "\n\n[Tool call produced no files. Output each file as a complete markdown code block instead — do NOT call any tools. Example format:\n\n```python\n# main.py\n(full file content here)\n```\n\nOutput ALL project files now as code blocks:]";
    logger.info("Builder: 0 files extracted — retrying without tools (code block fallback)");
    const retryResult = await llm.generateForStep("builder", {
      prompt: userMessage + noToolsNudge,
      systemPrompt,
      maxTokens: builderMaxTokens,
      temperature: 0.4,
      providerOptions: BUILDER_PROVIDER_OPTIONS,
      tools: false,
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
    if (retryResult.text?.trim()) {
      const retryFiles = parseCodeBlocksFromText(retryResult.text, plan);
      if (retryFiles.length > 0) {
        files = retryFiles;
        logger.info(`Builder: retry (no-tools) succeeded — ${files.length} file(s) from code blocks`);
      } else {
        logger.warn("Builder: retry (no-tools) returned text but no code blocks found");
      }
    }
  }

  // Last-resort fallback: parse code blocks from the model's text (first response, then retry)
  if (files.length === 0) {
    for (const text of [firstResponseText, result.text].filter(Boolean)) {
      const trimmed = (text as string).trim();
      if (!trimmed) continue;
      const fallbackFiles = parseCodeBlocksFromText(trimmed, plan);
      if (fallbackFiles.length > 0) {
        files = fallbackFiles;
        logger.info(
          `Builder: recovered ${files.length} file(s) from code blocks in text response (fallback for mystery prompts)`
        );
        break;
      }
    }
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

  // Inject design system CSS only for website and web-app (not react-app; they handle their own styling)
  injectDesignSystemCssIfNeeded(files, plan.mode);

  // Ensure README.md exists — content depends on mode (browser vs pip/npm).
  // Note: document mode returns early above, so this is only reached for code modes.
  const hasReadme = files.some((f) => f.path.toLowerCase().replace(/\\/g, "/") === "readme.md");
  if (!hasReadme && files.length > 0) {
    logger.debug("Builder: auto-generating README.md (mode-aware)");
    files.push({
      path: "README.md",
      content: generateReadmeForMode(plan.mode, plan.taskSummary, files),
    });
  }

  // Mandatory for grading agent: AI_AGENT_INSTRUCTIONS.md (short run + test instructions)
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
    // Overwrite with canonical content so format and length stay consistent for graders
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
  };
}
