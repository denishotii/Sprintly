import chalk from "chalk";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import ora from "ora";
import prompts from "prompts";
import { getConfig } from "../../config/index.js";
import { cleanupProject } from "../../tools/projectBuilder.js";
import { runPipeline } from "../../pipeline/index.js";
import { validateFiles } from "../../pipeline/verifier.js";
import { getTestPrompt, E2E_PROMPT_KEYS } from "./e2e-prompts.js";
import type { PipelineStepName } from "../../pipeline/types.js";
import type { Job, TokenUsage } from "../../types/index.js";

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4": { input: 3.0, output: 15.0 },
  "anthropic/claude-opus-4": { input: 15.0, output: 75.0 },
  "anthropic/claude-3.5-sonnet": { input: 3.0, output: 15.0 },
  "anthropic/claude-3-opus": { input: 15.0, output: 75.0 },
  "openai/gpt-4-turbo": { input: 10.0, output: 30.0 },
  "openai/gpt-4o": { input: 5.0, output: 15.0 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "meta-llama/llama-3.1-405b-instruct": { input: 3.0, output: 3.0 },
  "meta-llama/llama-3.1-70b-instruct": { input: 0.5, output: 0.5 },
  "google/gemini-pro-1.5": { input: 2.5, output: 7.5 },
  default: { input: 1.0, output: 3.0 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const costs = MODEL_COSTS[model] || MODEL_COSTS.default;
  return (promptTokens / 1_000_000) * costs.input + (completionTokens / 1_000_000) * costs.output;
}

const BUILDS_DIR = "builds";

function slugifyForFilename(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 36)
    .replace(/-$/, "") || "project";
}

/** Copy the built zip into project builds/ folder for easy review. Returns the path where it was saved. */
function copyZipToBuilds(sourceZipPath: string, prompt: string): string {
  const dir = join(process.cwd(), BUILDS_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const slug = slugifyForFilename(prompt);
  const timestamp = Date.now();
  const filename = `${timestamp}_${slug}.zip`;
  const destPath = join(dir, filename);
  copyFileSync(sourceZipPath, destPath);
  return destPath;
}

interface SimulateOptions {
  budget?: string;
  prompt?: string;
  jobType?: string;
  /** Predefined E2E test key (portfolio|taskapp|weather|landing|quiz). Runs pipeline and verifies zip structure. */
  test?: string;
}

export async function simulateCommand(options: SimulateOptions): Promise<void> {
  console.log(chalk.cyan("\n🧪 Job Simulation Mode\n"));
  console.log(chalk.gray("  Simulates a job from the Seedstr platform locally."));
  console.log(chalk.gray("  Your agent will process it exactly as it would a real job,"));
  console.log(chalk.gray("  but nothing is submitted to the platform.\n"));

  const config = getConfig();

  const hasLLMKey = !!(config.openaiApiKey?.trim() || config.anthropicApiKey?.trim());
  if (!hasLLMKey) {
    console.log(chalk.red("✗ At least one of OPENAI_API_KEY or ANTHROPIC_API_KEY is required in your .env file"));
    process.exit(1);
  }

  let budget = options.budget ? parseFloat(options.budget) : NaN;
  let prompt = options.prompt;
  const testKey = options.test;
  const jobType = (options.jobType?.toUpperCase() === "SWARM" ? "SWARM" : "STANDARD") as Job["jobType"];

  if (testKey) {
    const testPrompt = getTestPrompt(testKey);
    if (!testPrompt) {
      console.log(chalk.red(`Unknown test key: ${testKey}`));
      console.log(chalk.gray(`Available: ${E2E_PROMPT_KEYS.join(", ")}`));
      process.exit(1);
    }
    prompt = testPrompt;
    if (isNaN(budget)) budget = 5;
    console.log(chalk.cyan(`  E2E test: ${testKey} → "${prompt}"\n`));
  }

  if (isNaN(budget)) {
    const response = await prompts({
      type: "number",
      name: "budget",
      message: "Simulated job budget (USD):",
      initial: 5,
      min: 0.01,
      float: true,
    });
    budget = response.budget;
    if (budget === undefined) {
      console.log(chalk.gray("\nCancelled."));
      return;
    }
  }

  if (!prompt) {
    const response = await prompts({
      type: "text",
      name: "prompt",
      message: "Job prompt:",
      validate: (v: string) => v.trim().length > 0 || "Prompt cannot be empty",
    });
    prompt = response.prompt;
    if (!prompt) {
      console.log(chalk.gray("\nCancelled."));
      return;
    }
  }

  const isE2ETest = !!testKey;

  const fakeJob: Job = {
    id: `sim_${Date.now()}`,
    prompt,
    budget,
    status: "OPEN",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    responseCount: 0,
    routerVersion: 2,
    jobType,
    maxAgents: jobType === "SWARM" ? 3 : null,
    budgetPerAgent: jobType === "SWARM" ? budget / 3 : null,
    requiredSkills: [],
    minReputation: null,
  };

  console.log(chalk.cyan("─".repeat(60)));
  console.log(chalk.white("  Simulated Job"));
  console.log(chalk.cyan("─".repeat(60)));
  console.log(chalk.gray("  ID:       ") + chalk.white(fakeJob.id));
  console.log(chalk.gray("  Type:     ") + chalk.white(fakeJob.jobType));
  console.log(chalk.gray("  Budget:   ") + chalk.green(`$${budget.toFixed(2)}`));
  console.log(chalk.gray("  Model:    ") + chalk.white(config.model));
  console.log(chalk.gray("  Prompt:   ") + chalk.white(prompt.length > 80 ? prompt.substring(0, 80) + "..." : prompt));
  console.log(chalk.cyan("─".repeat(60)));

  const effectiveBudget =
    fakeJob.jobType === "SWARM" && fakeJob.budgetPerAgent ? fakeJob.budgetPerAgent : fakeJob.budget;

  const spinner = ora({
    text: "Running pipeline (Planner → Builder → Verifier)...",
    color: "cyan",
  }).start();

  const startTime = Date.now();
  const stepLabels: Record<PipelineStepName, string> = {
    planner: "Planner",
    builder: "Builder",
    verifier: "Verifier",
    zip: "Zipping",
  };

  try {
    const result = await runPipeline({
      jobPrompt: fakeJob.prompt,
      budget: effectiveBudget,
      onStepComplete: (step) => {
        spinner.text = `Pipeline: ${stepLabels[step]} done...`;
      },
    });

    const elapsedMs = Date.now() - startTime;
    const elapsed = (elapsedMs / 1000).toFixed(1);
    spinner.succeed(`Pipeline complete in ${elapsed}s`);

    // Token usage (same as runner: use builder model for cost)
    const modelForCost = config.builderModel || config.model;
    let usage: TokenUsage | undefined;
    if (
      result.totalUsage &&
      (result.totalUsage.promptTokens > 0 || result.totalUsage.completionTokens > 0)
    ) {
      const cost = estimateCost(
        modelForCost,
        result.totalUsage.promptTokens,
        result.totalUsage.completionTokens
      );
      usage = {
        promptTokens: result.totalUsage.promptTokens,
        completionTokens: result.totalUsage.completionTokens,
        totalTokens: result.totalUsage.totalTokens,
        estimatedCost: cost,
      };
    }

    // Pipeline timing summary
    if (result.timings?.length) {
      console.log(chalk.cyan("\n⏱  Pipeline steps:"));
      for (const t of result.timings) {
        console.log(chalk.gray(`  ${t.step}: ${t.durationMs}ms`));
      }
      console.log(chalk.gray(`  Total: ${elapsedMs}ms`));
    }

    // Project build info (code mode)
    if (result.mode === "code" && result.zipPath && result.projectDir && result.files) {
      const fileList = result.files.map((f) => f.path);
      const totalSize = result.files.reduce((sum, f) => sum + Buffer.byteLength(f.content, "utf-8"), 0);
      const savedPath = copyZipToBuilds(result.zipPath, prompt);
      console.log(chalk.cyan("\n📁 Project Built:"));
      console.log(chalk.gray(`  Zip:   ${result.zipPath}`));
      console.log(chalk.green(`  Saved: ${savedPath}`));
      console.log(chalk.gray(`  Files: ${fileList.join(", ")}`));
      console.log(chalk.gray(`  Size:  ${(totalSize / 1024).toFixed(1)} KB`));
      console.log(chalk.yellow(`\n  Project saved locally (not uploaded).`));
      console.log(chalk.gray(`  In production, this zip would be uploaded and submitted.`));

      // T12: verify zip structure (index.html, README, no broken refs)
      if (isE2ETest) {
        const validation = validateFiles(result.files);
        console.log(chalk.cyan("\n🔍 Structure verification:"));
        if (validation.passed) {
          console.log(chalk.green("  ✓ index.html present"));
          console.log(chalk.green("  ✓ README.md present with content"));
          console.log(chalk.green("  ✓ No empty files"));
          console.log(chalk.green("  ✓ HTML structure and local references OK"));
        } else {
          console.log(chalk.red("  Issues found:"));
          for (const issue of validation.issues) {
            console.log(chalk.red(`  • ${issue}`));
          }
        }
      }
    }

    // Token usage display
    if (usage) {
      console.log(chalk.cyan("\n📊 Token Usage:"));
      console.log(chalk.gray(`  Prompt:     `) + chalk.white(usage.promptTokens.toLocaleString()));
      console.log(chalk.gray(`  Completion: `) + chalk.white(usage.completionTokens.toLocaleString()));
      console.log(chalk.gray(`  Total:      `) + chalk.white(usage.totalTokens.toLocaleString()));
      console.log(chalk.gray(`  Est. Cost:  `) + chalk.yellow(`$${usage.estimatedCost.toFixed(4)}`));
    }

    // Response output
    console.log(chalk.cyan("\n" + "═".repeat(60)));
    console.log(chalk.cyan.bold("  Agent Response"));
    console.log(chalk.cyan("═".repeat(60)) + "\n");
    console.log(result.textResponse);
    console.log(chalk.cyan("\n" + "═".repeat(60)));

    // Summary
    console.log(chalk.green("\n✓ Simulation complete!"));
    console.log(chalk.gray("  Same pipeline as production; response would be submitted to Seedstr."));
    console.log(chalk.gray(`  Total response time: ${elapsed}s`));

    if (budget > 0 && usage) {
      const profitMargin = budget - usage.estimatedCost;
      console.log(
        chalk.gray("  Profit margin: ") +
          (profitMargin > 0
            ? chalk.green(`+$${profitMargin.toFixed(4)}`)
            : chalk.red(`-$${Math.abs(profitMargin).toFixed(4)}`)) +
          chalk.gray(` (job pays $${budget.toFixed(2)}, LLM cost ~$${usage.estimatedCost.toFixed(4)})`)
      );
    }

    // Cleanup project files if built
    if (result.mode === "code" && result.projectDir && result.zipPath) {
      const { confirm } = await prompts({
        type: "confirm",
        name: "confirm",
        message: "Clean up project build files?",
        initial: false,
      });
      if (confirm) {
        cleanupProject(result.projectDir, result.zipPath);
        console.log(chalk.gray("  Build files cleaned up."));
      }
    }
  } catch (error) {
    spinner.fail("Simulation failed");
    console.error(
      chalk.red("\nError:"),
      error instanceof Error ? error.message : "Unknown error"
    );
    if (error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}
