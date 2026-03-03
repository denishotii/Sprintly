/**
 * Verifier step — reviews and fixes generated files before submission.
 *
 * Two phases:
 *  1. Programmatic validation (fast, no LLM): mode-specific structural checks.
 *  2. LLM review (VERIFIER_MODEL): fixes issues found in phase 1.
 *     Skipped entirely if phase 1 finds no issues (speed optimisation).
 */

import { getLLMClient } from "../llm/client.js";
import { getVerifierPrompt, assembleVerifierUserMessage } from "../prompts/index.js";
import { logger } from "../utils/logger.js";
import type { VerifyResult, VerifierOutput, ValidationReport, StepUsage, ProjectMode } from "./types.js";
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

// ── Web validation (website / web-app) ──────────────────────────────────────

function validateWebFiles(files: ProjectFile[], pathSet: Set<string>): string[] {
  const issues: string[] = [];

  // index.html must exist
  if (!pathSet.has("index.html")) {
    issues.push("index.html is missing — project has no entry point");
  }

  for (const f of files) {
    if (!f.path.endsWith(".html")) continue;
    const html = f.content;

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

    // Broken local <link href="...">
    const linkHrefs = [...html.matchAll(/\blink\b[^>]+\bhref=["']([^"']+)["']/gi)].map((m) => m[1]);
    for (const href of linkHrefs) {
      if (isCdnOrAbsolute(href) || href.startsWith("#") || href.startsWith("mailto:")) continue;
      const normalised = href.replace(/^\.\//, "");
      if (!pathSet.has(normalised)) {
        issues.push(`${f.path}: <link> references missing file: ${href}`);
      }
    }

    // Broken local <script src="...">
    const scriptSrcs = [...html.matchAll(/\bscript\b[^>]+\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]);
    for (const src of scriptSrcs) {
      if (isCdnOrAbsolute(src)) continue;
      const normalised = src.replace(/^\.\//, "");
      if (!pathSet.has(normalised)) {
        issues.push(`${f.path}: <script> references missing file: ${src}`);
      }
    }

    // Broken local <img src="...">
    const imgSrcs = [...html.matchAll(/\bimg\b[^>]+\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]);
    for (const src of imgSrcs) {
      if (isCdnOrAbsolute(src) || src.startsWith("data:")) continue;
      const normalised = src.replace(/^\.\//, "");
      if (!pathSet.has(normalised)) {
        issues.push(`${f.path}: <img> references missing file: ${src} (use a CSS gradient or SVG placeholder instead)`);
      }
    }
  }

  return issues;
}

// ── React validation ─────────────────────────────────────────────────────────

function validateReactFiles(files: ProjectFile[], pathSet: Set<string>): string[] {
  const issues: string[] = [];

  if (!pathSet.has("index.html")) {
    issues.push("index.html is missing — React app has no entry point");
  }

  const indexHtml = files.find((f) => f.path === "index.html");
  if (indexHtml) {
    const html = indexHtml.content;

    if (!html.includes("react@18") && !html.includes("react@")) {
      issues.push("index.html: React CDN script not found — add unpkg.com/react@18 script tag");
    }
    if (!html.includes("react-dom@18") && !html.includes("react-dom@")) {
      issues.push("index.html: ReactDOM CDN script not found — add unpkg.com/react-dom@18 script tag");
    }
    if (!html.includes("babel")) {
      issues.push("index.html: Babel Standalone CDN script not found — JSX requires @babel/standalone");
    }
    if (!html.includes('type="text/babel"') && !html.includes("type='text/babel'")) {
      issues.push("index.html: no <script type=\"text/babel\"> found — JSX must be in an inline babel script");
    }
    if (!html.includes('id="root"') && !html.includes("id='root'")) {
      issues.push("index.html: missing <div id=\"root\"> mount target");
    }
    if (html.includes("ReactDOM.render(")) {
      issues.push("index.html: deprecated ReactDOM.render() used — replace with ReactDOM.createRoot().render()");
    }
    // Reject loading app code via src= — causes blank page on file://
    const babelWithSrc = /<script[^>]*type\s*=\s*["']text\/babel["'][^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(html);
    if (babelWithSrc) {
      const src = babelWithSrc[1];
      if (!isCdnOrAbsolute(src)) {
        issues.push(
          "index.html: <script type=\"text/babel\" src=\"...\"> must NOT load a local file (scripts/app.jsx etc.) — it causes a blank page. Put all React code in an inline <script type=\"text/babel\"> block."
        );
      }
    }
    // Require that the app actually mounts (createRoot + render in inline babel script)
    if ((html.includes('type="text/babel"') || html.includes("type='text/babel'")) && !babelWithSrc) {
      if (!html.includes("createRoot") || !html.includes(".render(")) {
        issues.push("index.html: inline <script type=\"text/babel\"> must call ReactDOM.createRoot(...).render(<App />) to mount the app");
      }
    }
  }

  // Check for broken local script src= references (React scripts loaded via src= fail on file://)
  for (const f of files) {
    if (!f.path.endsWith(".html")) continue;
    const scriptSrcs = [...f.content.matchAll(/\bscript\b[^>]+\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]);
    for (const src of scriptSrcs) {
      if (isCdnOrAbsolute(src)) continue;
      const normalised = src.replace(/^\.\//, "");
      if (!pathSet.has(normalised)) {
        issues.push(`${f.path}: <script> references missing local file: ${src}`);
      }
    }
  }

  return issues;
}

// ── Python validation ────────────────────────────────────────────────────────

function validatePythonFiles(files: ProjectFile[], pathSet: Set<string>): string[] {
  const issues: string[] = [];

  // Entry point
  if (!pathSet.has("main.py") && !pathSet.has("app.py")) {
    issues.push("No Python entry point found — expected main.py or app.py");
  }

  // requirements.txt
  if (!pathSet.has("requirements.txt")) {
    issues.push("requirements.txt is missing — add all third-party pip dependencies");
  }

  // Basic syntax heuristic on Python files
  for (const f of files) {
    if (!f.path.endsWith(".py")) continue;
    const src = f.content;

    // Check for empty files
    if (src.trim().length === 0) {
      issues.push(`${f.path}: file is empty`);
      continue;
    }

    // def/class lines must end with a colon
    const defClassLines = src.split("\n").filter((l) => /^\s*(def |class )\w/.test(l));
    for (const line of defClassLines) {
      if (!line.trimEnd().endsWith(":")) {
        issues.push(`${f.path}: function/class definition missing colon: ${line.trim().substring(0, 60)}`);
      }
    }
  }

  return issues;
}

// ── Node validation ──────────────────────────────────────────────────────────

function validateNodeFiles(files: ProjectFile[], pathSet: Set<string>): string[] {
  const issues: string[] = [];

  // Entry point (index.js, app.js, or whatever package.json.main says)
  let expectedEntry = "index.js";
  const pkgFile = files.find((f) => f.path === "package.json");

  if (!pkgFile) {
    issues.push("package.json is missing — add it with name, version, main, scripts.start, dependencies");
  } else {
    let pkg: Record<string, unknown> = {};
    try {
      pkg = JSON.parse(pkgFile.content) as Record<string, unknown>;
    } catch {
      issues.push("package.json is invalid JSON — fix syntax errors");
    }

    if (!pkg.name)    issues.push("package.json: missing 'name' field");
    if (!pkg.version) issues.push("package.json: missing 'version' field");
    if (!pkg.scripts || !(pkg.scripts as Record<string, unknown>).start) {
      issues.push("package.json: missing scripts.start — add \"start\": \"node index.js\" (or equivalent)");
    }

    if (typeof pkg.main === "string") expectedEntry = pkg.main;
  }

  if (!pathSet.has(expectedEntry) && !pathSet.has("index.js") && !pathSet.has("app.js")) {
    issues.push(`No Node.js entry point found — expected ${expectedEntry}, index.js, or app.js`);
  }

  // Check for empty JS files
  for (const f of files) {
    if (!f.path.endsWith(".js") && !f.path.endsWith(".mjs")) continue;
    if (f.content.trim().length === 0) {
      issues.push(`${f.path}: file is empty`);
    }
  }

  return issues;
}

// ── Common checks (all modes) ────────────────────────────────────────────────

function validateCommon(files: ProjectFile[]): string[] {
  const issues: string[] = [];

  // README must exist and have content
  const readme = files.find((f) => f.path.toLowerCase().replace(/\\/g, "/") === "readme.md");
  if (!readme) {
    issues.push("README.md is missing");
  } else if (readme.content.trim().length < 50) {
    issues.push("README.md exists but has very little content");
  }

  // No completely empty files (skip binary/asset paths)
  for (const f of files) {
    const ext = f.path.split(".").pop()?.toLowerCase() ?? "";
    if (["png", "jpg", "jpeg", "gif", "svg", "ico", "woff", "woff2"].includes(ext)) continue;
    if (f.content.trim().length === 0) {
      issues.push(`File is empty: ${f.path}`);
    }
  }

  return issues;
}

// ── Public entry ─────────────────────────────────────────────────────────────

/**
 * Run fast programmatic checks on the generated files.
 * Mode-aware: HTML checks for web modes, Python checks for python, Node checks for node.
 */
export function validateFiles(files: ProjectFile[], mode: ProjectMode = "website"): ValidationReport {
  const pathSet = new Set(files.map((f) => f.path.replace(/\\/g, "/")));
  const issues: string[] = [];

  // Mode-specific checks
  switch (mode) {
    case "website":
    case "web-app":
      issues.push(...validateWebFiles(files, pathSet));
      break;
    case "react-app":
      issues.push(...validateReactFiles(files, pathSet));
      break;
    case "python":
      issues.push(...validatePythonFiles(files, pathSet));
      break;
    case "node":
      issues.push(...validateNodeFiles(files, pathSet));
      break;
    case "text":
      break; // Text mode produces no files — nothing to validate
  }

  // Common checks (README, empty files) applied to all file-producing modes
  if (mode !== "text") {
    issues.push(...validateCommon(files));
  }

  return { issues, passed: issues.length === 0 };
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
 * Overwrites existing files or adds new ones returned by the LLM.
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
 * Phase 1: fast programmatic checks (mode-aware).
 * Phase 2: LLM review with a mode-appropriate reviewer persona (only if phase 1 found issues).
 * Returns verified + patched file list.
 *
 * @param jobPrompt - original job prompt (context for the LLM reviewer)
 * @param files     - files produced by the Builder
 * @param mode      - project mode, determines which checks and reviewer prompt to use
 */
export async function runVerifier(
  jobPrompt: string,
  files: ProjectFile[],
  mode: ProjectMode = "website"
): Promise<VerifyResult> {
  // Phase 1 — programmatic validation (mode-aware)
  const validation = validateFiles(files, mode);

  if (validation.issues.length > 0) {
    logger.debug(`Verifier (pre-check): ${validation.issues.length} issue(s) in ${mode} mode:`);
    for (const issue of validation.issues) {
      logger.debug(`  - ${issue}`);
    }
  } else {
    logger.debug(`Verifier (pre-check): all ${mode} checks passed — skipping LLM verifier`);
  }

  // Phase 2 — LLM review (only if issues found)
  if (validation.passed) {
    return { files, issuesFound: [], llmVerifierRan: false };
  }

  logger.debug(`Verifier: invoking LLM for ${mode} fixes...`);
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
      systemPrompt: getVerifierPrompt(mode),
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
      return { files, issuesFound: validation.issues, llmVerifierRan: true, usage };
    }

    if (verifierOutput.status === "fixed" && verifierOutput.fixedFiles.length > 0) {
      logger.debug(
        `Verifier: applying ${verifierOutput.fixedFiles.length} fix(es) for ${verifierOutput.issuesFound.length} issue(s)`
      );
      return {
        files: applyFixes(files, verifierOutput.fixedFiles),
        issuesFound: [...validation.issues, ...verifierOutput.issuesFound],
        llmVerifierRan: true,
        usage,
      };
    }

    logger.debug("Verifier: LLM reported no additional fixes needed");
    return { files, issuesFound: validation.issues, llmVerifierRan: true, usage };

  } catch (err) {
    logger.error("Verifier: LLM call failed, keeping original files:", err);
    return { files, issuesFound: validation.issues, llmVerifierRan: true, usage };
  }
}
