/**
 * Pipeline orchestrator — runs Planner → Builder → Verifier in sequence,
 * then zips the output and returns the final PipelineResult.
 *
 * Usage:
 *   import { runPipeline } from './pipeline/index.js';
 *   const result = await runPipeline({ jobPrompt, budget });
 */

import { buildProject } from "../tools/projectBuilder.js";
import { logger } from "../utils/logger.js";
import { runPlanner } from "./planner.js";
import { runBuilder } from "./builder.js";
import { runVerifier } from "./verifier.js";
import type {
  PipelineOptions,
  PipelineResult,
  StepTiming,
  StepUsage,
} from "./types.js";

/** Utility: run a function and return [result, durationMs]. */
async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = Date.now();
  const result = await fn();
  return [result, Date.now() - start];
}

/** Add two StepUsage objects together. */
function addUsage(a: StepUsage, b: StepUsage | undefined): StepUsage {
  if (!b) return a;
  return {
    promptTokens:     a.promptTokens     + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens:      a.totalTokens      + b.totalTokens,
  };
}

/**
 * Run the full Planner → Builder → Verifier pipeline for a Seedstr job.
 *
 * @returns PipelineResult — includes zipPath (code tasks) or textResponse (text tasks).
 */
export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { jobPrompt, budget = 0 } = options;
  const timings: StepTiming[] = [];
  let totalUsage: StepUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  logger.info(`Pipeline: starting for prompt="${jobPrompt.substring(0, 80)}..."`);

  // ─── Step 1: Planner ───────────────────────────────────────
  logger.info("Pipeline: [1/3] Planner");

  const [plannerResult, plannerMs] = await timed(() => runPlanner(jobPrompt, budget));

  timings.push({ step: "planner", durationMs: plannerMs });
  totalUsage = addUsage(totalUsage, plannerResult.usage);

  const { plan } = plannerResult;

  logger.info(
    `Pipeline: planner done in ${plannerMs}ms — mode=${plan.mode}, files=${plan.files.length}, complexity=${plan.complexityEstimate}`
  );

  // ─── Text-mode fast path ───────────────────────────────────
  if (plan.mode === "text") {
    logger.info("Pipeline: text task — skipping builder/verifier, generating response directly");

    const [buildResult, builderMs] = await timed(() => runBuilder(jobPrompt, plan));

    timings.push({ step: "builder", durationMs: builderMs });
    totalUsage = addUsage(totalUsage, buildResult.usage);

    logger.info(`Pipeline: text response generated in ${builderMs}ms`);
    logTimingSummary(timings);

    return {
      mode: "text",
      textResponse: buildResult.textResponse ?? "",
      timings,
      totalUsage,
    };
  }

  // ─── Step 2: Builder ───────────────────────────────────────
  logger.info(`Pipeline: [2/3] Builder — creating ${plan.files.length} file(s)`);

  const [buildResult, builderMs] = await timed(() => runBuilder(jobPrompt, plan));

  timings.push({ step: "builder", durationMs: builderMs });
  totalUsage = addUsage(totalUsage, buildResult.usage);

  logger.info(
    `Pipeline: builder done in ${builderMs}ms — ${buildResult.files.length} file(s) generated`
  );

  if (buildResult.files.length === 0) {
    // Builder produced nothing — return text response as fallback
    logger.warn("Pipeline: builder produced no files, falling back to text response");
    return {
      mode: "text",
      textResponse: buildResult.textResponse ?? "I was unable to generate the project files. Please try again.",
      timings,
      totalUsage,
    };
  }

  // ─── Step 3: Verifier ──────────────────────────────────────
  logger.info("Pipeline: [3/3] Verifier");

  const [verifyResult, verifierMs] = await timed(() =>
    runVerifier(jobPrompt, buildResult.files)
  );

  timings.push({ step: "verifier", durationMs: verifierMs });
  totalUsage = addUsage(totalUsage, verifyResult.usage);

  logger.info(
    `Pipeline: verifier done in ${verifierMs}ms — ` +
    `llmRan=${verifyResult.llmVerifierRan}, issues=${verifyResult.issuesFound.length}`
  );

  if (verifyResult.issuesFound.length > 0) {
    logger.debug("Pipeline: issues found and addressed:");
    for (const issue of verifyResult.issuesFound) {
      logger.debug(`  - ${issue}`);
    }
  }

  // ─── Zip the project ──────────────────────────────────────
  logger.info("Pipeline: zipping project...");

  const projectName = slugify(plan.taskSummary);
  const [buildOutput, zipMs] = await timed(() =>
    buildProject(projectName, verifyResult.files)
  );

  timings.push({ step: "zip", durationMs: zipMs });

  if (!buildOutput.success) {
    logger.error(`Pipeline: zip failed — ${buildOutput.error}`);
    return {
      mode: "text",
      textResponse: "The project was built but could not be packaged. Please try again.",
      timings,
      totalUsage,
    };
  }

  logger.info(
    `Pipeline: zip created in ${zipMs}ms — ${buildOutput.files.length} files, ` +
    `${(buildOutput.totalSize / 1024).toFixed(1)} KB`
  );

  logTimingSummary(timings);

  // Build a submission message
  const textResponse = buildSubmissionMessage(plan.taskSummary, buildOutput.files, verifyResult.issuesFound);

  return {
    mode: "code",
    textResponse,
    zipPath: buildOutput.zipPath,
    files: verifyResult.files,
    projectDir: buildOutput.projectDir,
    issuesFixed: verifyResult.issuesFound.length > 0 ? verifyResult.issuesFound : undefined,
    timings,
    totalUsage,
  };
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 40)
    .replace(/-$/, "");
}

function buildSubmissionMessage(
  taskSummary: string,
  files: string[],
  issuesFixed: string[]
): string {
  const lines: string[] = [
    `## ${taskSummary}`,
    "",
    "I've built your project and packaged it as a zip file. Here's what's included:",
    "",
    ...files.map((f) => `- \`${f}\``),
    "",
    "**To get started:** Extract the zip and open `index.html` in any modern browser. No installation or build step required.",
  ];

  if (issuesFixed.length > 0) {
    lines.push("", "**Quality checks:** The project was reviewed and the following issues were automatically corrected:");
    for (const issue of issuesFixed) {
      lines.push(`- ${issue}`);
    }
  }

  return lines.join("\n");
}

function logTimingSummary(timings: StepTiming[]): void {
  const total = timings.reduce((sum, t) => sum + t.durationMs, 0);
  const parts = timings.map((t) => `${t.step}=${t.durationMs}ms`).join(", ");
  logger.info(`Pipeline: total=${total}ms (${parts})`);
}

// Re-export types for consumers
export type { PipelineOptions, PipelineResult } from "./types.js";
