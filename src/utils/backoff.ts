/**
 * General-purpose exponential backoff utility.
 *
 * Designed to replace the inline retry logic in llm/client.ts while
 * preserving all existing behavior:
 *   - Retries on LLM tool-argument parsing errors (InvalidToolArgumentsError, JSONParseError)
 *   - Retries on HTTP 429 / 5xx / network failures (for API client use)
 *   - Exponential backoff with ±25% jitter (matches existing client.ts jitter formula)
 *   - Optional fallback function when all retries are exhausted (replaces fallbackNoTools logic)
 *   - Defaults match LLM_RETRY_* config defaults (maxAttempts=3, base=1000ms, max=10000ms)
 */

type ShouldRetry = (error: unknown, attempt: number) => boolean;
type OnRetry = (error: unknown, attempt: number, nextDelayMs: number) => void;

export interface BackoffOptions<T = unknown> {
  maxAttempts?: number;       // default: 3  (matches LLM_RETRY_MAX_ATTEMPTS default)
  baseDelayMs?: number;       // default: 1000 (matches LLM_RETRY_BASE_DELAY_MS default)
  maxDelayMs?: number;        // default: 10000 (matches LLM_RETRY_MAX_DELAY_MS default)
  jitter?: boolean;           // default: true — ±25% jitter (matches client.ts formula)
  shouldRetry?: ShouldRetry;  // default: isLLMToolError (safe for LLM client use)
  onRetry?: OnRetry;
  /**
   * Called once when all retry attempts are exhausted and the error is still retryable.
   * Use this for the "fallbackNoTools" case: re-run the generation without tools.
   * If this throws or is not provided, the last error is re-thrown.
   */
  fallback?: () => Promise<T>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─────────────────────────────────────────
// Error classifiers
// ─────────────────────────────────────────

/** Patterns from llm/client.ts RETRYABLE_ERROR_PATTERNS — LLM tool argument parsing failures. */
const LLM_RETRYABLE_PATTERNS = [
  "InvalidToolArgumentsError",
  "AI_InvalidToolArgumentsError",
  "JSONParseError",
  "AI_JSONParseError",
];

/**
 * Matches the isRetryableError() logic in llm/client.ts exactly.
 * Checks error name, message keywords, and walks the cause chain.
 */
export function isLLMToolError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const name = (error as Error).name ?? "";
  const message = (error as Error).message ?? "";

  if (LLM_RETRYABLE_PATTERNS.some((p) => name.includes(p))) return true;
  if (
    message.includes("JSON parsing failed") ||
    message.includes("Invalid arguments for tool")
  )
    return true;

  // Walk cause chain (AI SDK wraps errors)
  const cause = (error as { cause?: unknown }).cause;
  if (cause) return isLLMToolError(cause);

  return false;
}

/**
 * Retries on HTTP 429, 5xx, or network-ish errors.
 * Useful for the API client (SeedstrClient) rather than the LLM client.
 */
export function isHttpError(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  const isRetryableStatus =
    typeof status === "number" && (status === 429 || status >= 500);
  const message = (error as Error)?.message ?? "";
  const isNetworkish = /network|fetch failed|timeout/i.test(message);
  return isRetryableStatus || isNetworkish;
}

// ─────────────────────────────────────────
// Core utility
// ─────────────────────────────────────────

/**
 * Run `operation` with exponential backoff retries.
 *
 * @example — LLM client (replaces inline retry loop in llm/client.ts)
 * ```ts
 * const result = await withBackoff(
 *   () => provider.generate(params),
 *   {
 *     maxAttempts: config.llmRetryMaxAttempts,
 *     baseDelayMs: config.llmRetryBaseDelayMs,
 *     maxDelayMs:  config.llmRetryMaxDelayMs,
 *     shouldRetry: isLLMToolError,
 *     onRetry: (err, attempt, delay) =>
 *       logger.warn(`LLM retry ${attempt}, next in ${delay}ms: ${(err as Error).message}`),
 *     fallback: config.llmRetryFallbackNoTools
 *       ? () => provider.generate({ ...params, tools: undefined })
 *       : undefined,
 *   }
 * );
 * ```
 *
 * @example — API client (SeedstrClient)
 * ```ts
 * const data = await withBackoff(() => fetch(url, opts), {
 *   shouldRetry: isHttpError,
 * });
 * ```
 */
export async function withBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: BackoffOptions<T> = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1_000,
    maxDelayMs = 10_000,
    jitter = true,
    shouldRetry = isLLMToolError,
    onRetry,
    fallback,
  } = options;

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    try {
      attempt++;
      return await operation(attempt);
    } catch (error) {
      lastError = error;

      const canRetry = attempt < maxAttempts && shouldRetry(error, attempt);
      if (!canRetry) {
        // Not retryable — throw immediately, don't try fallback
        throw error;
      }

      // Exponential delay with ±25% jitter — matches getRetryDelay() in llm/client.ts
      const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      const jitterAmount = jitter ? expDelay * 0.25 * (Math.random() - 0.5) : 0;
      const delay = Math.round(expDelay + jitterAmount);

      onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }

  // All retries exhausted on a retryable error — try fallback if provided
  if (fallback) {
    return fallback();
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
