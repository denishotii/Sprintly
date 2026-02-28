export { PLANNER_SYSTEM_PROMPT } from "./planner.js";
export { BUILDER_SYSTEM_PROMPT } from "./builder.js";
export { VERIFIER_SYSTEM_PROMPT } from "./verifier.js";
export {
  TECH_STACK_RULES,
  DESIGN_DEFAULTS,
  OUTPUT_STRUCTURE,
  HTML_QUALITY_RULES,
  CDN_URLS,
} from "./shared.js";

// Import the concrete PlanTechStack type so BuilderContext stays type-safe
import type { PlanTechStack } from "../pipeline/types.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface PlannerContext {
  jobPrompt: string;
  budget: number;
}

export interface BuilderContext {
  jobPrompt: string;
  plan: {
    taskSummary: string;
    techStack: PlanTechStack;          // was: Record<string, unknown>
    files: { path: string; description: string }[];
    designNotes: string;
    complexityEstimate: string;
  };
}

export interface VerifierContext {
  jobPrompt: string;
  files: { path: string; content: string }[];
  validationReport?: string[];
}

// ─────────────────────────────────────────────────────────────
// Prompt assembly helpers
// ─────────────────────────────────────────────────────────────

/**
 * Assemble the user message for the Planner step.
 * The system prompt is static; this is the per-job user turn.
 */
export function assemblePlannerUserMessage(ctx: PlannerContext): string {
  return [
    `Job Budget: $${ctx.budget.toFixed(2)} USD`,
    ``,
    `Job Prompt:`,
    `"""`,
    ctx.jobPrompt.trim(),
    `"""`,
    ``,
    `Output your JSON plan now.`,
  ].join("\n");
}

/**
 * Assemble the user message for the Builder step.
 * Includes the original job prompt + the structured plan from the Planner.
 */
export function assembleBuilderUserMessage(ctx: BuilderContext): string {
  const fileList = ctx.plan.files
    .map((f) => `  - ${f.path}: ${f.description}`)
    .join("\n");

  return [
    `## Original Job Request`,
    `"""`,
    ctx.jobPrompt.trim(),
    `"""`,
    ``,
    `## Execution Plan`,
    `Task: ${ctx.plan.taskSummary}`,
    `Complexity: ${ctx.plan.complexityEstimate}`,
    ``,
    `Tech Stack:`,
    `  Styling: ${ctx.plan.techStack.styling}`,
    `  Interactivity: ${ctx.plan.techStack.interactivity}`,
    `  Data Storage: ${ctx.plan.techStack.dataStorage}`,
    `  Charts: ${ctx.plan.techStack.charts}`,
    `  Icons: ${ctx.plan.techStack.icons}`,
    ``,
    `Design Notes: ${ctx.plan.designNotes || "None specified — use good defaults"}`,
    ``,
    `## Files to Create`,
    fileList,
    ``,
    `Build every file listed above with complete, production-quality content.`,
    `Call create_project once with ALL files. No placeholders. No TODOs.`,
  ].join("\n");
}

/**
 * Assemble the user message for the Verifier step.
 * Includes validation pre-check results (if any) + all file contents.
 */
export function assembleVerifierUserMessage(ctx: VerifierContext): string {
  const fileSections = ctx.files
    .map(
      (f) =>
        `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``
    )
    .join("\n\n");

  const validationSection =
    ctx.validationReport && ctx.validationReport.length > 0
      ? [
          `## Pre-Check Issues Found`,
          `The following issues were detected by automated validation:`,
          ctx.validationReport.map((issue) => `- ${issue}`).join("\n"),
          ``,
        ].join("\n")
      : `## Pre-Check\nNo automated issues detected. Do a thorough manual review.\n\n`;

  return [
    `## Project Files to Review`,
    ``,
    `Original job: "${ctx.jobPrompt.trim()}"`,
    ``,
    validationSection,
    `## File Contents`,
    ``,
    fileSections,
    ``,
    `Review all files carefully and output your JSON response now.`,
  ].join("\n");
}
