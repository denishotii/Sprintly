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
import { cleanupBuilderExecution } from "../llm/client.js";
import type {
  PipelineOptions,
  PipelineResult,
  PlanResult,
  ProjectMode,
  StepTiming,
  StepUsage,
} from "./types.js";

/** Minimal plan for text-only tasks when we skip the planner (fast path). */
const SYNTHETIC_TEXT_PLAN: PlanResult = {
  mode: "text",
  taskSummary: "",
  techStack: {
    styling: "vanilla-css",
    interactivity: "none",
    dataStorage: "none",
    runtime: "browser",
    charts: false,
    icons: false,
  },
  files: [],
  designNotes: "",
  complexityEstimate: "low",
};

/**
 * Heuristic: prompt looks like a text-only request (copy, thread, blog, etc.) and NOT a code/build task.
 * When true, we skip the planner and go straight to the text model to save ~2–3s.
 *
 * Explicitly guards against Python, Node, React, and framework prompts being misclassified as text.
 */
function isLikelyTextOnlyPrompt(prompt: string): boolean {
  const p = prompt.trim().toLowerCase();
  const codeLike =
    /\b(build|create|make|generate|implement|develop|landing\s*page|website|web\s*page|app\s*(for|that|with)|portfolio\s*site|dashboard|\.html|react|vue|angular|svelte|next\.?js|nuxt|flask|django|fastapi|express|node\.?js|python|typescript|javascript|script|program|cli\b|api\b|endpoint|scrape|scraping|csv|json\s+file|parse|convert)\b/i.test(p);
  const textLike =
    /\b(write|thread|tweet|blog|post|email|copy|content|summary|summarize|explain|describe|haiku|essay|article|viral|poem|letter|caption|tagline|slogan)\b/i.test(p);
  return textLike && !codeLike;
}

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
  const { jobPrompt, budget = 0, onStepComplete, executionId } = options;
  const timings: StepTiming[] = [];
  let totalUsage: StepUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  logger.info(`Pipeline: starting for prompt="${jobPrompt.substring(0, 80)}..."`);

  try {
    // ─── Optional: skip planner for obvious text-only prompts (saves ~2–3s) ───
    let plan: PlanResult;

    if (isLikelyTextOnlyPrompt(jobPrompt)) {
      logger.info("Pipeline: text-like prompt — skipping planner (fast path)");
      plan = { ...SYNTHETIC_TEXT_PLAN, taskSummary: jobPrompt.substring(0, 120) };
      timings.push({ step: "planner", durationMs: 0 });
      onStepComplete?.("planner", { durationMs: 0 });
    } else {
      // ─── Step 1: Planner ───────────────────────────────────────
      logger.info("Pipeline: [1/3] Planner");
      const [plannerResult, plannerMs] = await timed(() => runPlanner(jobPrompt, budget));
      plan = plannerResult.plan;
      timings.push({ step: "planner", durationMs: plannerMs });
      totalUsage = addUsage(totalUsage, plannerResult.usage);
      onStepComplete?.("planner", { durationMs: plannerMs });
      logger.info(
        `Pipeline: planner done in ${plannerMs}ms — mode=${plan.mode}, files=${plan.files.length}, complexity=${plan.complexityEstimate}`
      );
    }

    // ─── Text-mode fast path ───────────────────────────────────
    if (plan.mode === "text") {
      logger.info("Pipeline: text task — skipping builder/verifier, generating response directly");

      const [buildResult, builderMs] = await timed(() => runBuilder(jobPrompt, plan));

      timings.push({ step: "builder", durationMs: builderMs });
      totalUsage = addUsage(totalUsage, buildResult.usage);
      onStepComplete?.("builder", { durationMs: builderMs });

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
    logger.info(`Pipeline: [2/3] Builder (${plan.mode}) — creating ${plan.files.length} file(s)`);

    const [buildResult, builderMs] = await timed(() => runBuilder(jobPrompt, plan));

    timings.push({ step: "builder", durationMs: builderMs });
    totalUsage = addUsage(totalUsage, buildResult.usage);
    onStepComplete?.("builder", { durationMs: builderMs, fileCount: buildResult.files.length });

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

    // ─── Step 3: Verifier (mode-aware) ─────────────────────────
    logger.info(`Pipeline: [3/3] Verifier (${plan.mode})`);

    const [verifyResult, verifierMs] = await timed(() =>
      runVerifier(jobPrompt, buildResult.files, plan.mode)
    );

    timings.push({ step: "verifier", durationMs: verifierMs });
    totalUsage = addUsage(totalUsage, verifyResult.usage);
    onStepComplete?.("verifier", {
      durationMs: verifierMs,
      issuesCount: verifyResult.issuesFound.length,
    });

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
    onStepComplete?.("zip", { durationMs: zipMs, fileCount: buildOutput.files?.length ?? 0 });

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
    const textResponse = buildSubmissionMessage(plan.mode, plan.taskSummary, buildOutput.files, verifyResult.issuesFound);

    return {
      mode: plan.mode,
      textResponse,
      zipPath: buildOutput.zipPath,
      files: verifyResult.files,
      projectDir: buildOutput.projectDir,
      issuesFixed: verifyResult.issuesFound.length > 0 ? verifyResult.issuesFound : undefined,
      timings,
      totalUsage,
    };
  } finally {
    // Cleanup builder execution context if executionId was provided
    if (executionId) {
      cleanupBuilderExecution(executionId);
      logger.debug(`Pipeline: cleaned up builder context for execution ${executionId}`);
    }
  }
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

/**
 * Build the human-readable submission message sent back to the Seedstr platform.
 * Run instructions are mode-aware so the customer knows exactly how to use their project.
 */
function buildSubmissionMessage(
  mode: ProjectMode,
  taskSummary: string,
  files: string[],
  issuesFixed: string[]
): string {
  const fileLines = files.map((f) => `- \`${f}\``);

  let runInstructions: string;
  switch (mode) {
    case "python":
      runInstructions =
        "**To get started:** Extract the zip.\n" +
        "1. Install dependencies: `pip install -r requirements.txt`\n" +
        "2. Run: `python main.py` (or `python app.py` if that's the entry point)";
      break;
    case "node":
      runInstructions =
        "**To get started:** Extract the zip.\n" +
        "1. Install dependencies: `npm install`\n" +
        "2. Run: `npm start`";
      break;
    default:
      // website, web-app, react-app
      runInstructions =
        "**To get started:** Extract the zip and open `index.html` in any modern browser. No installation or build step required.";
  }

  const lines: string[] = [
    `## ${taskSummary}`,
    "",
    "I've built your project and packaged it as a zip file. Here's what's included:",
    "",
    ...fileLines,
    "",
    runInstructions,
  ];

  if (issuesFixed.length > 0) {
    lines.push(
      "",
      "**Quality checks:** The project was reviewed and the following issues were automatically corrected:"
    );
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
