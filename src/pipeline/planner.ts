/**
 * Planner step — classifies the job and produces a structured JSON execution plan.
 * Uses the PLANNER_MODEL (default: Claude Opus for best planning and design concept).
 */

import { getLLMClient } from "../llm/client.js";
import { PLANNER_SYSTEM_PROMPT, assemblePlannerUserMessage } from "../prompts/index.js";
import { logger } from "../utils/logger.js";
import type { PlanResult, ProjectMode, StepUsage } from "./types.js";

export interface PlannerResult {
  plan: PlanResult;
  usage?: StepUsage;
}

const VALID_MODES: ProjectMode[] = ["website", "web-app", "react-app", "python", "node", "text"];

// ─────────────────────────────────────────
// Prompt-based mode detection (for fallback)
// ─────────────────────────────────────────

/**
 * Detect likely project mode from the raw job prompt when JSON parsing fails.
 * Priority order: python > node > react-app > web-app > website (default).
 */
function detectModeFromPrompt(prompt: string): ProjectMode {
  const p = prompt.toLowerCase();
  if (/\b(python|flask|django|fastapi|pip|\.py\b|pandas|numpy|scrape|scraping)\b/.test(p)) return "python";
  if (/\b(node\.?js|express|npm|cli\b|\.js\s+server|typescript\s+server|ts-node)\b/.test(p)) return "node";
  if (/\b(react|vue|angular|next\.?js|nuxt|svelte|jsx|tsx)\b/.test(p)) return "react-app";
  if (/\b(dashboard|calculator|quiz|task\s*manager|kanban|game|app\s+that|app\s+with)\b/.test(p)) return "web-app";
  return "website";
}

/**
 * Return a mode-appropriate fallback plan when the LLM's JSON is unparseable.
 * Routes by prompt keyword detection so the pipeline stays on the right track.
 */
function fallbackPlan(jobPrompt: string): PlanResult {
  logger.warn("Planner: using fallback plan due to parse failure");

  const mode = detectModeFromPrompt(jobPrompt);
  const summary = jobPrompt.substring(0, 120);

  switch (mode) {
    case "python":
      return {
        mode: "python",
        taskSummary: summary,
        techStack: { styling: "vanilla-css", interactivity: "none", dataStorage: "none", runtime: "python", charts: false, icons: false },
        files: [
          { path: "main.py",           description: "Main entry point" },
          { path: "requirements.txt",  description: "Python dependencies" },
          { path: "README.md",         description: "Setup and usage instructions" },
        ],
        designNotes: "",
        complexityEstimate: "medium",
      };

    case "node":
      return {
        mode: "node",
        taskSummary: summary,
        techStack: { styling: "vanilla-css", interactivity: "none", dataStorage: "none", runtime: "node", charts: false, icons: false },
        files: [
          { path: "index.js",     description: "Main entry point" },
          { path: "package.json", description: "Package manifest" },
          { path: "README.md",    description: "Setup and usage instructions" },
        ],
        designNotes: "",
        complexityEstimate: "medium",
      };

    case "react-app":
      return {
        mode: "react-app",
        taskSummary: summary,
        techStack: { styling: "tailwind", interactivity: "react", dataStorage: "none", runtime: "browser", charts: false, icons: false },
        files: [
          { path: "index.html",       description: "Entry point loading React via CDN" },
          { path: "scripts/app.jsx",  description: "React components (inline in index.html)" },
          { path: "README.md",        description: "Project overview" },
        ],
        designNotes: "Use modern, clean design with a blue primary accent.",
        complexityEstimate: "medium",
      };

    case "web-app":
      return {
        mode: "web-app",
        taskSummary: summary,
        techStack: { styling: "tailwind", interactivity: "vanilla-js", dataStorage: "none", runtime: "browser", charts: false, icons: true },
        files: [
          { path: "index.html",      description: "Main HTML entry point" },
          { path: "styles/main.css", description: "Custom CSS and design tokens" },
          { path: "scripts/app.js",  description: "Application logic" },
          { path: "README.md",       description: "Project overview and usage instructions" },
        ],
        designNotes: "Use modern, clean design with a blue primary accent.",
        complexityEstimate: "medium",
      };

    default: // website
      return {
        mode: "website",
        taskSummary: summary,
        techStack: { styling: "tailwind", interactivity: "vanilla-js", dataStorage: "none", runtime: "browser", charts: false, icons: true },
        files: [
          { path: "index.html",      description: "Main HTML entry point" },
          { path: "styles/main.css", description: "Custom CSS and design tokens" },
          { path: "scripts/app.js",  description: "Application logic" },
          { path: "README.md",       description: "Project overview and usage instructions" },
        ],
        designNotes: "Use modern, clean design with a blue primary accent.",
        complexityEstimate: "medium",
      };
  }
}

// ─────────────────────────────────────────
// File list enforcement per mode
// ─────────────────────────────────────────

/**
 * Ensure the file list from the LLM includes required files for each mode.
 * Guards against missing entry points, manifests, and docs.
 */
function enforceRequiredFiles(
  files: { path: string; description: string }[],
  mode: ProjectMode
): void {
  const paths = new Set(files.map((f) => f.path));

  const ensure = (path: string, description: string, prepend = false) => {
    if (!paths.has(path)) {
      if (prepend) {
        files.unshift({ path, description });
      } else {
        files.push({ path, description });
      }
      paths.add(path);
    }
  };

  switch (mode) {
    case "website":
    case "web-app":
      ensure("index.html",      "Main HTML entry point", true);
      ensure("styles/main.css", "Stylesheet");
      ensure("README.md",       "Project overview");
      break;

    case "react-app":
      ensure("index.html", "Entry point loading React 18, ReactDOM, and Babel via CDN", true);
      ensure("README.md",  "Project overview — open index.html in any browser");
      break;

    case "python": {
      // Ensure an entry point exists (main.py preferred, app.py also valid)
      const hasEntry = paths.has("main.py") || paths.has("app.py");
      if (!hasEntry) ensure("main.py", "Main entry point with if __name__ == '__main__' guard", true);
      ensure("requirements.txt", "Third-party Python dependencies");
      ensure("README.md",        "Setup, install, and run instructions");
      break;
    }

    case "node": {
      // Ensure an entry point exists (index.js preferred, app.js also valid)
      const hasEntry = paths.has("index.js") || paths.has("app.js") || paths.has("index.ts") || paths.has("app.ts");
      if (!hasEntry) ensure("index.js", "Main entry point", true);
      ensure("package.json", "Package manifest with name, version, main, scripts.start, dependencies");
      ensure("README.md",    "Setup, install, and run instructions");
      break;
    }

    case "text":
      // Text mode: no files required
      break;
  }
}

// ─────────────────────────────────────────
// JSON response parser
// ─────────────────────────────────────────

/**
 * Parse the LLM's JSON response into a PlanResult.
 * Strips markdown fences if present and validates/normalises required fields.
 */
function parsePlanResponse(raw: string): PlanResult {
  // Strip markdown code fences
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Partial<PlanResult>;

  // Validate mode
  if (!parsed.mode || !VALID_MODES.includes(parsed.mode)) {
    throw new Error(`Invalid mode: ${String(parsed.mode)}`);
  }

  // Ensure files is always an array
  if (!Array.isArray(parsed.files)) {
    parsed.files = [];
  }

  // Ensure techStack exists with all required fields
  if (!parsed.techStack) {
    parsed.techStack = {
      styling: "tailwind",
      interactivity: "vanilla-js",
      dataStorage: "none",
      runtime: "browser",
      charts: false,
      icons: false,
    };
  } else if (!parsed.techStack.runtime) {
    // Infer runtime from mode if the LLM omitted it
    parsed.techStack.runtime =
      parsed.mode === "python" ? "python" :
      parsed.mode === "node"   ? "node"   :
                                 "browser";
  }

  // Enforce required files per mode (guards against LLM omissions)
  enforceRequiredFiles(parsed.files, parsed.mode);

  return {
    mode: parsed.mode,
    taskSummary: parsed.taskSummary ?? "Build a project",
    techStack: parsed.techStack,
    files: parsed.files,
    designNotes: parsed.designNotes ?? "",
    complexityEstimate: parsed.complexityEstimate ?? "medium",
  };
}

// ─────────────────────────────────────────
// Public API
// ─────────────────────────────────────────

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
    tools: false, // Planner outputs JSON directly, no tools needed
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
