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

const VALID_MODES: ProjectMode[] = ["website", "web-app", "react-app", "python", "node", "text", "document"];

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
      ensure("index.html", "Entry point: CDN scripts + entire React app in one inline <script type=\"text/babel\"> block", true);
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
 * Attempt to repair truncated or malformed JSON.
 * Handles: unclosed strings, trailing commas, partial values, unbalanced brackets.
 * Falls back to progressive truncation when basic repair isn't enough.
 */
function repairJson(json: string): string {
  let cleaned = json.trim();

  // Remove markdown fences
  cleaned = cleaned.replace(/^```(?:json)?|```$/g, "").trim();

  // Fast path: already valid
  try { JSON.parse(cleaned); return cleaned; } catch {}

  // --- Step 1: Close any unclosed string (critical for truncated output) ---
  let inString = false;
  let isEscaped = false;
  for (let i = 0; i < cleaned.length; i++) {
    if (isEscaped) { isEscaped = false; continue; }
    if (cleaned[i] === "\\") { isEscaped = true; continue; }
    if (cleaned[i] === '"') inString = !inString;
  }
  if (inString) {
    if (isEscaped) cleaned += "n"; // complete a dangling backslash escape
    cleaned += '"';
  }

  // --- Step 2: Fix incomplete trailing tokens ---
  // Trailing colon without value → add placeholder
  cleaned = cleaned.replace(/:\s*$/, ': ""');
  // Partial boolean / null after colon → replace with null
  cleaned = cleaned.replace(/:\s*(?:tru|fals|nul)[a-z]*\s*$/i, ": null");
  // Trailing comma
  cleaned = cleaned.replace(/,\s*$/, "");

  // --- Step 3: Balance braces / brackets ---
  cleaned = balanceAndClean(cleaned);

  // Check if basic repair worked
  try { JSON.parse(cleaned); return cleaned; } catch {}

  // --- Step 4: Progressive truncation fallback ---
  return progressiveTruncationRepair(json.trim().replace(/^```(?:json)?|```$/g, "").trim());
}

/**
 * Balance braces/brackets and remove trailing commas before closers.
 */
function balanceAndClean(json: string): string {
  // Remove trailing commas before appending closers
  json = json.replace(/,\s*$/, "");

  const stack: string[] = [];
  let inString = false;
  let isEscaped = false;
  for (let i = 0; i < json.length; i++) {
    if (isEscaped) { isEscaped = false; continue; }
    if (json[i] === "\\") { isEscaped = true; continue; }
    if (json[i] === '"') { inString = !inString; continue; }
    if (!inString) {
      if (json[i] === "{") stack.push("}");
      else if (json[i] === "[") stack.push("]");
      else if (json[i] === "}" || json[i] === "]") {
        if (stack.length > 0 && stack[stack.length - 1] === json[i]) stack.pop();
      }
    }
  }
  while (stack.length > 0) json += stack.pop();

  // Clean trailing commas before closing brackets
  json = json.replace(/,\s*([\]}])/g, "$1");
  return json;
}

/**
 * Last-resort repair: walk backwards through structural safe-points
 * (positions after complete string values, closing brackets, or commas)
 * and try to produce valid JSON by truncating + re-balancing at each.
 */
function progressiveTruncationRepair(original: string): string {
  const safePoints: number[] = [];
  let inString = false;
  let isEscaped = false;
  for (let i = 0; i < original.length; i++) {
    if (isEscaped) { isEscaped = false; continue; }
    if (original[i] === "\\") { isEscaped = true; continue; }
    if (original[i] === '"') {
      inString = !inString;
      if (!inString) safePoints.push(i + 1); // right after closing quote
      continue;
    }
    if (!inString && (original[i] === "}" || original[i] === "]" || original[i] === ",")) {
      safePoints.push(i + 1);
    }
  }

  for (let si = safePoints.length - 1; si >= 0; si--) {
    let candidate = original.substring(0, safePoints[si]);
    candidate = candidate.replace(/,\s*$/, "");
    candidate = balanceAndClean(candidate);
    try { JSON.parse(candidate); return candidate; } catch {}
  }

  return original;
}

/**
 * Extract the first likely JSON object from a string.
 * Strategies:
 * 1. Markdown block
 * 2. "mode" key heuristic (most robust for this specific schema)
 * 3. Outermost curly braces
 */
function extractJson(raw: string): string {
  // 1. Try markdown block
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/i;
  const match = jsonBlockRegex.exec(raw);
  if (match) {
    return match[1].trim();
  }

  // 2. Heuristic: Find the object containing "mode": "..."
  // This avoids capturing the <thinking> block's braces or other noise.
  // We look for `{` followed eventually by `"mode"`
  const modeMatch = /\{\s*[\s\S]*?"mode"\s*:/i.exec(raw);
  if (modeMatch) {
    // Found the start of the real plan.
    // We take everything from this opening brace to the end of the string
    // and let repairJson handle truncation if needed.
    return raw.substring(modeMatch.index);
  }

  // 3. Fallback: find the first {
  const start = raw.indexOf("{");
  if (start !== -1) {
    return raw.substring(start);
  }

  return raw.trim();
}

/**
 * Parse the LLM's JSON response into a PlanResult.
 * Attempt repair if parsing fails.
 */
function parsePlanResponse(raw: string): PlanResult {
  const extracted = extractJson(raw);
  logger.info(`Planner raw response (first 100 chars): ${raw.substring(0, 100).replace(/\n/g, "\\n")}`);
  logger.info(`Planner extracted JSON (first 100 chars): ${extracted.substring(0, 100).replace(/\n/g, "\\n")}`);
  
  let parsed: Partial<PlanResult>;
  try {
    parsed = JSON.parse(extracted);
  } catch (err) {
    // First parse failed; try repairing
    const repaired = repairJson(extracted);
    try {
      parsed = JSON.parse(repaired);
      logger.debug("Planner: successfully repaired JSON response");
    } catch (err2) {
      // Repair failed; re-throw original error to trigger fallback plan
      throw err;
    }
  }

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

// Disable extended thinking for the planner — it just needs JSON output, not chain-of-thought.
// Claude 4+ models enable thinking by default in @ai-sdk/anthropic v3; without this the model
// spends all its token budget on thinking and returns empty text.
const PLANNER_PROVIDER_OPTIONS = {
  anthropic: { thinking: { type: "disabled" } },
} as Record<string, Record<string, unknown>>;

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

  let result = await llm.generateForStep("planner", {
    prompt: userMessage,
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    tools: false, // Planner outputs JSON directly
    maxTokens: 8192, // Allow ample room for JSON plan
    temperature: 0.4, // Allow slight creativity for vague prompts
    providerOptions: PLANNER_PROVIDER_OPTIONS,
  });

  // Resolve the best available text: prefer text, fall back to reasoning content
  let responseText = result.text?.trim() || "";

  // If text is empty, the model may have put everything into extended-thinking/reasoning
  if (!responseText && result.reasoning) {
    logger.warn(
      `Planner: text is empty but reasoning has ${result.reasoning.length} chars — extracting JSON from reasoning`
    );
    responseText = result.reasoning;
  }

  // Retry once if still empty
  if (!responseText) {
    logger.warn("Planner: received empty response, retrying with tools enabled (compatibility mode)");
    result = await llm.generateForStep("planner", {
      prompt: userMessage,
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      tools: true,
      toolChoice: "none",
      maxTokens: 8192,
      temperature: 0.5,
      providerOptions: PLANNER_PROVIDER_OPTIONS,
    });
    responseText = result.text?.trim() || result.reasoning || "";
  }

  if (result.finishReason === "length") {
    logger.warn("Planner: response was truncated (finishReason=length) — attempting repair of partial JSON");
  }

  let plan: PlanResult;

  try {
    plan = parsePlanResponse(responseText);
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
