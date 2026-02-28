/**
 * Planner step — classifies the job and produces a structured JSON execution plan.
 * Uses the PLANNER_MODEL (fast, lightweight model).
 */

import { getLLMClient } from "../llm/client.js";
import { PLANNER_SYSTEM_PROMPT, assemblePlannerUserMessage } from "../prompts/index.js";
import { logger } from "../utils/logger.js";
import type { PlanResult, StepUsage } from "./types.js";

export interface PlannerResult {
  plan: PlanResult;
  usage?: StepUsage;
}

/**
 * Fallback plan used when JSON parsing fails — defaults to a generic code project.
 */
function fallbackPlan(jobPrompt: string): PlanResult {
  logger.warn("Planner: using fallback plan due to parse failure");
  return {
    mode: "code",
    taskSummary: jobPrompt.substring(0, 120),
    techStack: {
      styling: "tailwind",
      interactivity: "vanilla-js",
      dataStorage: "none",
      charts: false,
      icons: true,
    },
    files: [
      { path: "index.html",       description: "Main HTML entry point" },
      { path: "styles/main.css",  description: "Custom CSS and design tokens" },
      { path: "scripts/app.js",   description: "Application logic" },
      { path: "README.md",        description: "Project overview and usage instructions" },
    ],
    designNotes: "Use modern, clean design with a blue primary accent.",
    complexityEstimate: "medium",
  };
}

/**
 * Parse the LLM's JSON response into a PlanResult.
 * Strips markdown fences if present and validates required fields.
 */
function parsePlanResponse(raw: string): PlanResult {
  // Strip markdown code fences
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Partial<PlanResult>;

  // Validate required fields
  if (!parsed.mode || !["code", "text"].includes(parsed.mode)) {
    throw new Error(`Invalid mode: ${parsed.mode}`);
  }

  // Ensure files is always an array
  if (!Array.isArray(parsed.files)) {
    parsed.files = [];
  }

  // Ensure techStack exists
  if (!parsed.techStack) {
    parsed.techStack = {
      styling: "tailwind",
      interactivity: "vanilla-js",
      dataStorage: "none",
      charts: false,
      icons: false,
    };
  }

  // Ensure required index.html and README.md for code tasks
  if (parsed.mode === "code") {
    const paths = parsed.files.map((f) => f.path);
    if (!paths.includes("index.html")) {
      parsed.files.unshift({ path: "index.html", description: "Main HTML entry point" });
    }
    if (!paths.includes("styles/main.css")) {
      parsed.files.push({ path: "styles/main.css", description: "Stylesheet" });
    }
    if (!paths.includes("README.md")) {
      parsed.files.push({ path: "README.md", description: "Project overview" });
    }
  }

  return {
    mode: parsed.mode,
    taskSummary: parsed.taskSummary ?? "Build a web project",
    techStack: parsed.techStack,
    files: parsed.files,
    designNotes: parsed.designNotes ?? "",
    complexityEstimate: parsed.complexityEstimate ?? "medium",
  };
}

/**
 * Run the Planner step.
 * Sends the job prompt to the PLANNER_MODEL and returns a structured plan.
 */
export async function runPlanner(
  jobPrompt: string,
  budget: number = 0
): Promise<PlannerResult> {
  const llm = getLLMClient();

  const userMessage = assemblePlannerUserMessage({ jobPrompt, budget });

  logger.debug("Planner: sending request...");

  const result = await llm.generateForStep("planner", {
    prompt: userMessage,
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    tools: false, // Planner does not need tools
    maxTokens: 1024, // Plan is small — cap for speed
    temperature: 0.2, // Low temperature for consistent structured output
  });

  let plan: PlanResult;

  try {
    plan = parsePlanResponse(result.text);
    logger.debug(
      `Planner: mode=${plan.mode}, files=${plan.files.length}, complexity=${plan.complexityEstimate}`
    );
  } catch (err) {
    logger.warn(`Planner: failed to parse JSON response (${(err as Error).message}), using fallback`);
    plan = fallbackPlan(jobPrompt);
  }

  const usage: StepUsage | undefined = result.usage
    ? {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      }
    : undefined;

  return { plan, usage };
}
