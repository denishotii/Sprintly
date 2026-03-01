/**
 * Pipeline type definitions for the Planner → Builder → Verifier pipeline.
 */

import type { ProjectFile } from "../tools/projectBuilder.js";

// ─────────────────────────────────────────
// Mode types
// ─────────────────────────────────────────

/**
 * All supported project modes.
 * - website:   Static landing pages, portfolios, marketing sites
 * - web-app:   Interactive browser apps (no framework, vanilla JS/Alpine)
 * - react-app: React/Vue apps loaded via CDN (no build step)
 * - python:    Python scripts, Flask/Django apps
 * - node:      Node.js scripts, Express APIs, CLI tools
 * - text:      Writing, summaries, analysis (no project files)
 */
export type ProjectMode = "website" | "web-app" | "react-app" | "python" | "node" | "text";

/** Modes that produce HTML output (browser-runnable). */
export const WEB_MODES: ProjectMode[] = ["website", "web-app", "react-app"];

/** Modes that produce server-side scripts. */
export const SCRIPT_MODES: ProjectMode[] = ["python", "node"];

// ─────────────────────────────────────────
// Planner
// ─────────────────────────────────────────

/** Tech stack choices output by the Planner. */
export interface PlanTechStack {
  styling: "tailwind" | "vanilla-css" | "both";
  interactivity: "none" | "vanilla-js" | "alpine" | "react" | "vue";
  dataStorage: "none" | "localstorage" | "json-file" | "sqlite" | "filesystem";
  runtime: "browser" | "python" | "node";
  charts: boolean;
  icons: boolean;
}

/** A single file entry in the plan. */
export interface PlanFile {
  path: string;
  description: string;
}

/** The structured JSON plan output by the Planner step. */
export interface PlanResult {
  mode: ProjectMode;
  taskSummary: string;
  techStack: PlanTechStack;
  files: PlanFile[];
  designNotes: string;
  complexityEstimate: "low" | "medium" | "high";
}

// ─────────────────────────────────────────
// Builder
// ─────────────────────────────────────────

/** The result of the Builder step — generated files ready to zip. */
export interface BuildResult {
  /** Files produced by the Builder (path + content). */
  files: ProjectFile[];
  /** Raw text response from the Builder (used for text-mode tasks). */
  textResponse?: string;
  /** Token usage for this step. */
  usage?: StepUsage;
}

// ─────────────────────────────────────────
// Verifier
// ─────────────────────────────────────────

/** A file that the Verifier corrected. */
export interface VerifierFixedFile {
  path: string;
  content: string;
}

/** The JSON structure the Verifier LLM returns. */
export interface VerifierOutput {
  status: "ok" | "fixed";
  issuesFound: string[];
  fixedFiles: VerifierFixedFile[];
}

/** The result of the Verifier step. */
export interface VerifyResult {
  /** Files after verification — may include Verifier patches merged in. */
  files: ProjectFile[];
  /** Issues detected (by programmatic check and/or LLM). */
  issuesFound: string[];
  /** Whether the LLM verifier was invoked (skipped if zero pre-check issues). */
  llmVerifierRan: boolean;
  /** Token usage for this step (undefined if LLM was skipped). */
  usage?: StepUsage;
}

// ─────────────────────────────────────────
// Validation (programmatic pre-check)
// ─────────────────────────────────────────

/** Result of the fast, non-LLM validation pass. */
export interface ValidationReport {
  issues: string[];
  passed: boolean;
}

// ─────────────────────────────────────────
// Pipeline orchestrator
// ─────────────────────────────────────────

/** Per-step token usage. */
export interface StepUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Timing info per pipeline step. */
export interface StepTiming {
  /** Step name. */
  step: "planner" | "builder" | "verifier" | "zip";
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

/** The final result returned by the pipeline orchestrator. */
export interface PipelineResult {
  /** Task mode — specific mode from ProjectMode. */
  mode: ProjectMode;

  /** Plain-text response (always set). For code tasks this is the submission message. */
  textResponse: string;

  /** Absolute path to the zip file (only set for non-text tasks). */
  zipPath?: string;

  /** All files that went into the zip (only set for non-text tasks). */
  files?: ProjectFile[];

  /** Absolute path to the temporary project directory (for cleanup). */
  projectDir?: string;

  /** Issues found and fixed by the verifier. */
  issuesFixed?: string[];

  /** Per-step timing breakdown. */
  timings: StepTiming[];

  /** Aggregated token usage across all steps. */
  totalUsage: StepUsage;
}

/** Step names for progress reporting. */
export type PipelineStepName = "planner" | "builder" | "verifier" | "zip";

/** Optional progress callback — invoked after each step completes (for TUI/events). */
export type PipelineStepCallback = (
  step: PipelineStepName,
  data: { durationMs: number; fileCount?: number; issuesCount?: number }
) => void;

/** Options for the pipeline orchestrator. */
export interface PipelineOptions {
  /** The raw job prompt from Seedstr. */
  jobPrompt: string;
  /** Job budget in USD (passed to the Planner for context). */
  budget?: number;
  /** Called after each step completes; use for progress events. */
  onStepComplete?: PipelineStepCallback;
}
