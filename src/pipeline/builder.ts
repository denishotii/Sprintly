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
  assembleBuilderUserMessage,
} from "../prompts/index.js";
import { getFullDesignSystem } from "../templates/index.js";
import { logger } from "../utils/logger.js";
import type { PlanResult, BuildResult, StepUsage, ProjectMode } from "./types.js";
import type { ProjectFile } from "../tools/projectBuilder.js";

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

  // Code mode: generate files — use mode-specific system prompt (website, web-app, react-app, python, node)
  const systemPrompt = getBuilderPromptForMode(plan.mode);
  const userMessage = assembleBuilderUserMessage({ jobPrompt, plan });

  logger.debug(`Builder: mode=${plan.mode}, generating ${plan.files.length} files for "${plan.taskSummary}"`);

  const result = await llm.generateForStep("builder", {
    prompt: userMessage,
    systemPrompt,
    tools: true, // create_project, create_file, finalize_project are available
    maxTokens: 128000, // API max output (e.g. Opus 128K). Full create_project with many files needs headroom.
    temperature: 0.4, // Low-ish for consistent code, slight room for creativity
  });

  // Extract files from tool calls (mode-agnostic)
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

  // Inject design system CSS only for website and web-app (not react-app; they handle their own styling)
  injectDesignSystemCssIfNeeded(files, plan.mode);

  // Ensure README.md exists — content depends on mode (browser vs pip/npm)
  const hasReadme = files.some((f) => f.path.toLowerCase().replace(/\\/g, "/") === "readme.md");
  if (!hasReadme && files.length > 0) {
    logger.debug("Builder: auto-generating README.md (mode-aware)");
    files.push({
      path: "README.md",
      content: generateReadmeForMode(plan.mode, plan.taskSummary, files),
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
