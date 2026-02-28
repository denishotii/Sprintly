/**
 * Verifier step — reviews and fixes generated files before submission.
 *
 * Two phases:
 *  1. Programmatic validation (fast, no LLM): checks structure, references, etc.
 *  2. LLM review (VERIFIER_MODEL): fixes any issues found in phase 1.
 *     Skipped entirely if phase 1 finds zero issues (speed optimisation — T8).
 */

import { getLLMClient } from "../llm/client.js";
import { VERIFIER_SYSTEM_PROMPT, assembleVerifierUserMessage } from "../prompts/index.js";
import { logger } from "../utils/logger.js";
import type { VerifyResult, VerifierOutput, ValidationReport, StepUsage } from "./types.js";
import type { ProjectFile } from "../tools/projectBuilder.js";

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

const CDN_PREFIXES = [
  "https://",
  "http://",
  "//cdn.",
  "//unpkg.",
  "//fonts.",
  "//cdnjs.",
  "//jsdelivr.",
];

function isCdnOrAbsolute(src: string): boolean {
  return (
    CDN_PREFIXES.some((p) => src.startsWith(p)) ||
    src.startsWith("data:") ||
    src.startsWith("blob:")
  );
}

function normalisePath(href: string): string {
  return href.replace(/^\.\//, "").replace(/\\/g, "/");
}

function extractAttrValues(html: string, pattern: RegExp): string[] {
  return [...html.matchAll(pattern)].map((m) => m[1]).filter(Boolean);
}

function hasSubstantiveContent(content: string, ext: "css" | "js"): boolean {
  let stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .trim();

  if (ext === "js") {
    stripped = stripped.replace(/^['"]use strict['"];?\s*/m, "").trim();
    stripped = stripped
      .replace(/document\.addEventListener\(['"]DOMContentLoaded['"],\s*\(\)\s*=>\s*\{\s*\}\s*\);?/g, "")
      .trim();
  }

  if (ext === "css") {
    stripped = stripped.replace(/@import[^;]+;/g, "").trim();
    stripped = stripped.replace(/:root\s*\{\s*\}/g, "").trim();
  }

  return stripped.length > 10;
}

// ─────────────────────────────────────────
// Phase 1 — Programmatic validation (T8)
// ─────────────────────────────────────────

export function validateFiles(files: ProjectFile[]): ValidationReport {
  const issues: string[] = [];
  const pathSet = new Set(files.map((f) => normalisePath(f.path)));
  const fileMap = new Map(files.map((f) => [normalisePath(f.path), f.content]));

  // 1. index.html exists
  if (!pathSet.has("index.html")) {
    issues.push("index.html is missing — project has no entry point");
  }

  // 2. README.md exists and has content
  const readmeKey = [...pathSet].find((p) => p.toLowerCase() === "readme.md");
  if (!readmeKey) {
    issues.push("README.md is missing");
  } else {
    const readmeContent = fileMap.get(readmeKey) ?? "";
    if (readmeContent.trim().length < 50) {
      issues.push("README.md exists but has very little content");
    }
  }

  // 3. No completely empty files
  for (const f of files) {
    if (f.content.trim().length === 0) {
      issues.push(`File is empty: ${f.path}`);
    }
  }

  // 4–11. HTML file checks
  for (const f of files) {
    if (!f.path.endsWith(".html")) continue;
    const html = f.content;
    const filePath = normalisePath(f.path);

    // 4. Basic HTML structure
    if (!html.includes("<!DOCTYPE html") && !html.includes("<!doctype html")) {
      issues.push(`${filePath}: missing <!DOCTYPE html>`);
    }
    if (!/<html[\s>]/i.test(html)) {
      issues.push(`${filePath}: missing <html> tag`);
    }
    if (!/<head[\s>]/i.test(html)) {
      issues.push(`${filePath}: missing <head> tag`);
    }
    if (!/<body[\s>]/i.test(html)) {
      issues.push(`${filePath}: missing <body> tag`);
    }

    // 5. Viewport meta tag
    if (!html.includes('name="viewport"') && !html.includes("name='viewport'")) {
      issues.push(`${filePath}: missing viewport meta tag (breaks mobile layout)`);
    }

    // 6. <link href> — local files must exist; CSS must have real content
    const linkHrefs = extractAttrValues(html, /<link\b[^>]+\bhref=["']([^"'#?]+)["']/gi);
    for (const href of linkHrefs) {
      if (isCdnOrAbsolute(href) || href.startsWith("#") || href.startsWith("mailto:")) continue;
      const norm = normalisePath(href);
      if (!pathSet.has(norm)) {
        issues.push(`${filePath}: <link> references missing file: ${href}`);
      } else if (norm.endsWith(".css")) {
        // 9. CSS must have substantive content
        const css = fileMap.get(norm) ?? "";
        if (!hasSubstantiveContent(css, "css")) {
          issues.push(`${filePath}: referenced CSS file is effectively empty: ${href}`);
        }
      }
    }

    // 7. <script src> — local files must exist; JS must have real content
    const scriptSrcs = extractAttrValues(html, /<script\b[^>]+\bsrc=["']([^"'#?]+)["']/gi);
    for (const src of scriptSrcs) {
      if (isCdnOrAbsolute(src)) continue;
      const norm = normalisePath(src);
      if (!pathSet.has(norm)) {
        issues.push(`${filePath}: <script> references missing file: ${src}`);
      } else {
        // 10. JS must have substantive content
        const js = fileMap.get(norm) ?? "";
        if (!hasSubstantiveContent(js, "js")) {
          issues.push(`${filePath}: referenced JS file is effectively empty: ${src}`);
        }
      }
    }

    // 8. <img src> — local files must exist
    const imgSrcs = extractAttrValues(html, /<img\b[^>]+\bsrc=["']([^"'#?]+)["']/gi);
    for (const src of imgSrcs) {
      if (isCdnOrAbsolute(src)) continue;
      const norm = normalisePath(src);
      if (!pathSet.has(norm)) {
        issues.push(
          `${filePath}: <img> references missing local file: ${src} — use a CSS gradient or inline SVG instead`
        );
      }
    }

    // 11. Alpine.js: x-data required when Alpine directives are used
    const alpineDirectives = /\b(x-show|x-if|x-for|x-model|x-text|x-html|x-bind|x-on|@click|@input|@change|@submit)\b/;
    if (alpineDirectives.test(html) && !html.includes("x-data")) {
      issues.push(
        `${filePath}: Alpine.js directives used but no x-data attribute found — ` +
        `elements with x-show/@click etc. need an x-data ancestor`
      );
    }
  }

  // 12. CSS url() references to local assets
  for (const f of files) {
    if (!f.path.endsWith(".css")) continue;
    const filePath = normalisePath(f.path);
    const urlRefs = extractAttrValues(f.content, /url\(["']?([^"')]+)["']?\)/gi);
    for (const ref of urlRefs) {
      if (isCdnOrAbsolute(ref) || ref.startsWith("data:") || ref.startsWith("#")) continue;
      const norm = normalisePath(ref);
      if (!pathSet.has(norm)) {
        issues.push(`${filePath}: CSS url() references missing local file: ${ref}`);
      }
    }
  }

  return { issues, passed: issues.length === 0 };
}

// ─────────────────────────────────────────
// Phase 2 — LLM review
// ─────────────────────────────────────────

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

function applyFixes(
  files: ProjectFile[],
  fixedFiles: { path: string; content: string }[]
): ProjectFile[] {
  const fileMap = new Map(files.map((f) => [normalisePath(f.path), f.content]));

  for (const fix of fixedFiles) {
    const path = normalisePath(fix.path);
    if (fileMap.has(path)) {
      logger.debug(`Verifier: patching existing file: ${path}`);
    } else {
      logger.debug(`Verifier: adding new file: ${path}`);
    }
    fileMap.set(path, fix.content);
  }

  return Array.from(fileMap.entries()).map(([path, content]) => ({ path, content }));
}

// ─────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────

export async function runVerifier(
  jobPrompt: string,
  files: ProjectFile[]
): Promise<VerifyResult> {
  // Phase 1 — programmatic validation
  const validation = validateFiles(files);

  if (validation.issues.length > 0) {
    logger.debug(`Verifier (pre-check): ${validation.issues.length} issue(s) found:`);
    for (const issue of validation.issues) {
      logger.debug(`  - ${issue}`);
    }
  } else {
    logger.debug("Verifier (pre-check): all checks passed — skipping LLM verifier (speed win)");
    return { files, issuesFound: [], llmVerifierRan: false };
  }

  // Phase 2 — LLM review (only when issues exist)
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
      tools: false,
      maxTokens: 8000,
      temperature: 0.1,
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
      logger.warn(
        `Verifier: failed to parse LLM JSON (${(parseErr as Error).message}) — keeping original files`
      );
      return { files, issuesFound: validation.issues, llmVerifierRan: true, usage };
    }

    if (verifierOutput.status === "fixed" && verifierOutput.fixedFiles.length > 0) {
      logger.debug(
        `Verifier: applying ${verifierOutput.fixedFiles.length} patch(es) ` +
        `addressing ${verifierOutput.issuesFound.length} LLM-reported issue(s)`
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
    return { files, issuesFound: validation.issues, llmVerifierRan: true, usage };

  } catch (err) {
    logger.error("Verifier: LLM call failed — keeping original files:", err);
    return { files, issuesFound: validation.issues, llmVerifierRan: true, usage };
  }
}
