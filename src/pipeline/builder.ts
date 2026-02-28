/**
 * Builder step — generates all project files from the Planner's output.
 * Uses the BUILDER_MODEL (highest quality model for code generation).
 */

import { getLLMClient } from "../llm/client.js";
import { BUILDER_SYSTEM_PROMPT, assembleBuilderUserMessage } from "../prompts/index.js";
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

  // Text-mode tasks: just return the raw LLM response
  if (plan.mode === "text") {
    logger.debug("Builder: text mode — generating direct response");
    const result = await llm.generateForStep("builder", {
      prompt: jobPrompt,
      systemPrompt: "You are a helpful AI assistant. Respond clearly and thoroughly to the user's request.",
      tools: false,
      temperature: 0.7,
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
  const userMessage = assembleBuilderUserMessage({ jobPrompt, plan });

  logger.debug(`Builder: generating ${plan.files.length} files for "${plan.taskSummary}"`);

  const result = await llm.generateForStep("builder", {
    prompt: userMessage,
    systemPrompt: BUILDER_SYSTEM_PROMPT,
    tools: true, // create_project, create_file, finalize_project are available
    maxTokens: 16000, // Large output — multi-file projects can be big
    temperature: 0.4, // Low-ish for consistent code, slight room for creativity
  });

  // Extract files from tool calls first
  let files: ProjectFile[] = [];

  if (result.toolCalls && result.toolCalls.length > 0) {
    files = extractFilesFromToolCalls(result.toolCalls);
    logger.debug(`Builder: extracted ${files.length} file(s) from tool calls`);
  }

  // If no files came from tools, the LLM may have output raw code in text.
  // We don't try to parse free-form text into files — log a warning and continue.
  if (files.length === 0) {
    logger.warn("Builder: no files extracted from tool calls — project will be empty");
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
