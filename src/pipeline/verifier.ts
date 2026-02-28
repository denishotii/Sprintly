/**
 * Verifier step — reviews and fixes generated files before submission.
 *
 * Two phases:
 *  1. Programmatic validation (fast, no LLM): checks structure, references, etc.
 *  2. LLM review (VERIFIER_MODEL): fixes any issues found in phase 1.
 *     Skipped entirely if phase 1 finds no issues (speed optimisation).
 */

import { getLLMClient } from "../llm/client.js";
import { VERIFIER_SYSTEM_PROMPT, assembleVerifierUserMessage } from "../prompts/index.js";
import { logger } from "../utils/logger.js";
import type { VerifyResult, VerifierOutput, ValidationReport, StepUsage } from "./types.js";
import type { ProjectFile } from "../tools/projectBuilder.js";

// ─────────────────────────────────────────
// Phase 1 — Programmatic validation
// ─────────────────────────────────────────

const CDN_PREFIXES = [
  "https://",
  "http://",
  "//cdn.",
  "//unpkg.",
  "//fonts.",
];

function isCdnOrAbsolute(src: string): boolean {
  return CDN_PREFIXES.some((p) => src.startsWith(p)) || src.startsWith("data:");
}

/**
 * Run fast programmatic checks on the generated files.
 * Returns a list of human-readable issue strings.
 */
export function validateFiles(files: ProjectFile[]): ValidationReport {
  const issues: string[] = [];
  const pathSet = new Set(files.map((f) => f.path.replace(/\\/g, "/")));

  // 1. index.html must exist
  if (!pathSet.has("index.html")) {
    issues.push("index.html is missing — project has no entry point");
  }

  // 2. README.md must exist and have content
  const readme = files.find((f) => f.path.toLowerCase() === "readme.md");
  if (!readme) {
    issues.push("README.md is missing");
  } else if (readme.content.trim().length < 50) {
    issues.push("README.md exists but has very little content");
  }

  // 3. No empty files
  for (const f of files) {
    if (f.content.trim().length === 0) {
      issues.push(`File is empty: ${f.path}`);
    }
  }

  // 4. HTML files — check structure and local references
  for (const f of files) {
    if (!f.path.endsWith(".html")) continue;

    const html = f.content;

    // Basic structure
    if (!html.includes("<!DOCTYPE html") && !html.includes("<!doctype html")) {
      issues.push(`${f.path}: missing <!DOCTYPE html>`);
    }
    if (!html.includes("<html")) {
      issues.push(`${f.path}: missing <html> tag`);
    }
    if (!html.includes("<head")) {
      issues.push(`${f.path}: missing <head> tag`);
    }
    if (!html.includes("<body")) {
      issues.push(`${f.path}: missing <body> tag`);
    }
    if (!html.includes('name="viewport"') && !html.includes("name='viewport'")) {
      issues.push(`${f.path}: missing viewport meta tag (breaks mobile layout)`);
    }

    // Check <link href="...">
    const linkHrefs = [...html.matchAll(/\blink\b[^>]+\bhref=["']([^"']+)["']/gi)].map(
      (m) => m[1]
    );
    for (const href of linkHrefs) {
      if (isCdnOrAbsolute(href) || href.startsWith("#") || href.startsWith("mailto:")) continue;
      // Normalise path (relative to project root)
      const normalised = href.replace(/^\.\//, "");
      if (!pathSet.has(normalised)) {
        issues.push(`${f.path}: <link> references missing file: ${href}`);
      }
    }

    // Check <script src="...">
    const scriptSrcs = [...html.matchAll(/\bscript\b[^>]+\bsrc=["']([^"']+)["']/gi)].map(
      (m) => m[1]
    );
    for (const src of scriptSrcs) {
      if (isCdnOrAbsolute(src)) continue;
      const normalised = src.replace(/^\.\//, "");
      if (!pathSet.has(normalised)) {
        issues.push(`${f.path}: <script> references missing file: ${src}`);
      }
    }

    // Check <img src="..."> — only local files
    const imgSrcs = [...html.matchAll(/\bimg\b[^>]+\bsrc=["']([^"']+)["']/gi)].map(
      (m) => m[1]
    );
    for (const src of imgSrcs) {
      if (isCdnOrAbsolute(src) || src.startsWith("data:")) continue;
      const normalised = src.replace(/^\.\//, "");
      if (!pathSet.has(normalised)) {
        issues.push(`${f.path}: <img> references missing file: ${src} (use a CSS gradient or SVG placeholder instead)`);
      }
    }
  }

  return {
    issues,
    passed: issues.length === 0,
  };
}

// ─────────────────────────────────────────
// Phase 2 — LLM review
// ─────────────────────────────────────────

/**
 * Parse the verifier LLM JSON response.
 * Handles markdown fences and malformed output gracefully.
 */
function parseVerifierResponse(raw: string): VerifierOutput {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Partial<VerifierOutput>;

  return {
    status: parsed.status === "fixed" ? "fixed" : "ok",
    issuesFound: Array.isArray(parsed.issuesFound) ? parsed.issuesFound : [],
    fixedFiles: Array.isArray(parsed.fixedFiles) ? parsed.fixedFiles : [],
  };
}

/**
 * Apply verifier patches to the file list.
 * Overwrites existing files or adds new ones.
 */
function applyFixes(
  files: ProjectFile[],
  fixedFiles: { path: string; content: string }[]
): ProjectFile[] {
  const fileMap = new Map(files.map((f) => [f.path, f.content]));

  for (const fix of fixedFiles) {
    const path = fix.path.replace(/\\/g, "/");
    if (fileMap.has(path)) {
      logger.debug(`Verifier: patching existing file: ${path}`);
    } else {
      logger.debug(`Verifier: adding new file: ${path}`);
    }
    fileMap.set(path, fix.content);
  }

  return Array.from(fileMap.entries()).map(([path, content]) => ({ path, content }));
}

/**
 * Run the Verifier step.
 *
 * Phase 1: fast programmatic checks.
 * Phase 2: LLM review (only if phase 1 found issues).
 * Returns verified + patched file list.
 */
export async function runVerifier(
  jobPrompt: string,
  files: ProjectFile[]
): Promise<VerifyResult> {
  // Phase 1 — programmatic validation
  const validation = validateFiles(files);

  if (validation.issues.length > 0) {
    logger.debug(`Verifier (pre-check): found ${validation.issues.length} issue(s):`);
    for (const issue of validation.issues) {
      logger.debug(`  - ${issue}`);
    }
  } else {
    logger.debug("Verifier (pre-check): all checks passed — skipping LLM verifier");
  }

  // Phase 2 — LLM review (only if issues found)
  if (validation.passed) {
    return {
      files,
      issuesFound: [],
      llmVerifierRan: false,
    };
  }

  logger.debug("Verifier: invoking LLM for fixes...");
  const llm = getLLMClient();

  const userMessage = assembleVerifierUserMessage({
    jobPrompt,
    files,
    validationReport: validation.issues,
  });

  let usage: StepUsage | undefined;

  try {
    const result = await llm.generateForStep("verifier", {
      prompt: userMessage,
      systemPrompt: VERIFIER_SYSTEM_PROMPT,
      tools: false, // Verifier outputs JSON directly
      maxTokens: 8000,
      temperature: 0.1, // Very low — we want deterministic fixes
    });

    usage = result.usage
      ? {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
        }
      : undefined;

    let verifierOutput: VerifierOutput;

    try {
      verifierOutput = parseVerifierResponse(result.text);
    } catch (parseErr) {
      logger.warn(`Verifier: failed to parse LLM JSON (${(parseErr as Error).message}) — keeping original files`);
      return {
        files,
        issuesFound: validation.issues,
        llmVerifierRan: true,
        usage,
      };
    }

    if (verifierOutput.status === "fixed" && verifierOutput.fixedFiles.length > 0) {
      logger.debug(
        `Verifier: applying ${verifierOutput.fixedFiles.length} fix(es) for ${verifierOutput.issuesFound.length} issue(s)`
      );
      const patchedFiles = applyFixes(files, verifierOutput.fixedFiles);
      return {
        files: patchedFiles,
        issuesFound: [...validation.issues, ...verifierOutput.issuesFound],
        llmVerifierRan: true,
        usage,
      };
    }

    logger.debug("Verifier: LLM reported no additional fixes needed");
    return {
      files,
      issuesFound: validation.issues,
      llmVerifierRan: true,
      usage,
    };
  } catch (err) {
    logger.error("Verifier: LLM call failed, keeping original files:", err);
    return {
      files,
      issuesFound: validation.issues,
      llmVerifierRan: true,
      usage,
    };
  }
}
