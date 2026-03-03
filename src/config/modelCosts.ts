/**
 * Centralized model pricing (per 1M tokens) for estimating spend.
 * Values are approximate and can be tuned without touching business logic.
 */
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4": { input: 3.0, output: 15.0 },
  "anthropic/claude-opus-4": { input: 15.0, output: 75.0 },
  "anthropic/claude-3.5-sonnet": { input: 3.0, output: 15.0 },
  "anthropic/claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "anthropic/claude-3.5-haiku": { input: 0.8, output: 4.0 },
  "anthropic/claude-3-opus": { input: 15.0, output: 75.0 },
  "openai/gpt-4-turbo": { input: 10.0, output: 30.0 },
  "openai/gpt-4o": { input: 5.0, output: 15.0 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "meta-llama/llama-3.1-405b-instruct": { input: 3.0, output: 3.0 },
  "meta-llama/llama-3.1-70b-instruct": { input: 0.5, output: 0.5 },
  "google/gemini-pro-1.5": { input: 2.5, output: 7.5 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "gpt-4o": { input: 5.0, output: 15.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "default": { input: 1.0, output: 3.0 },
};

/**
 * Estimate the cost of an LLM API call based on token usage
 * @param model - The model identifier
 * @param promptTokens - Number of prompt tokens
 * @param completionTokens - Number of completion tokens
 * @returns Estimated cost in USD
 */
export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  // Try exact match first, then remove provider prefix and try again
  let costs = MODEL_COSTS[model];
  if (!costs) {
    const simpleModel = model.replace(/^(anthropic|openai|google|meta)\//, "");
    costs = MODEL_COSTS[simpleModel] || MODEL_COSTS.default;
  }

  return (promptTokens / 1_000_000) * costs.input + (completionTokens / 1_000_000) * costs.output;
}

/**
 * Estimate token count for a given text
 * Uses a rough heuristic: ~1 token per 4 characters (varies by model)
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokenCount(text: string): number {
  // Approximate: ~4 characters per token is a good average across models
  // This is a conservative estimate (assumes some overhead)
  return Math.ceil(text.length / 4) * 1.1; // Add 10% margin for safety
}

/**
 * Estimate the total cost of a pipeline execution
 * Assumes: planner (prompt + 2000 tokens), builder (prompt + 3000 tokens), verifier (1000 + 1000)
 * @param jobPrompt - The job prompt
 * @param models - Model IDs for each pipeline step
 * @returns Estimated total cost in USD
 */
export function estimatePipelineCost(
  jobPrompt: string,
  models: {
    planner: string;
    builder: string;
    verifier: string;
  }
): number {
  // Estimate token usage for each step
  const promptTokens = estimateTokenCount(jobPrompt);

  // Planner: prompt + system + overhead, expects structured output
  const plannerInputTokens = promptTokens + estimateTokenCount("Return JSON plan") + 200;
  const plannerOutputTokens = 2000; // Typical plan size

  // Builder: plan + prompt + system, generates code
  const builderInputTokens = plannerOutputTokens + promptTokens + 300;
  const builderOutputTokens = 3000; // Typical code generation size

  // Verifier: generated files + system, structured validation
  const verifierInputTokens = builderOutputTokens + 500;
  const verifierOutputTokens = 1000; // Verification results

  const plannerCost = estimateCost(models.planner, plannerInputTokens, plannerOutputTokens);
  const builderCost = estimateCost(models.builder, builderInputTokens, builderOutputTokens);
  const verifierCost = estimateCost(models.verifier, verifierInputTokens, verifierOutputTokens);

  return plannerCost + builderCost + verifierCost;
}

/**
 * Check if a job budget is sufficient for the estimated pipeline cost
 * @param jobPrompt - The job prompt
 * @param jobBudget - Available budget in USD
 * @param models - Model IDs for pipeline steps
 * @param minMargin - Minimum margin to keep (default 0.10 = 10%)
 * @returns Object with isAffordable flag and breakdown
 */
export function checkBudgetSufficient(
  jobPrompt: string,
  jobBudget: number,
  models: { planner: string; builder: string; verifier: string },
  minMargin: number = 0.1
): {
  isAffordable: boolean;
  estimatedCost: number;
  budgetRemaining: number;
  marginPercentage: number;
  warningMessage?: string;
} {
  const estimatedCost = estimatePipelineCost(jobPrompt, models);
  const maxSpendable = jobBudget * (1 - minMargin);
  const budgetRemaining = jobBudget - estimatedCost;
  const marginPercentage = budgetRemaining > 0 ? (budgetRemaining / jobBudget) * 100 : 0;

  let warningMessage: string | undefined;
  if (budgetRemaining < 0) {
    warningMessage = `Budget insufficient: estimated cost $${estimatedCost.toFixed(4)} exceeds budget $${jobBudget.toFixed(
      2
    )}`;
  } else if (marginPercentage < minMargin * 100) {
    warningMessage = `Low margin: only ${marginPercentage.toFixed(1)}% margin remaining after estimated cost`;
  }

  return {
    isAffordable: estimatedCost <= maxSpendable,
    estimatedCost,
    budgetRemaining,
    marginPercentage,
    warningMessage,
  };
}
