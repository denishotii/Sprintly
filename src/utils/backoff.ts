type ShouldRetry = (error: unknown, attempt: number) => boolean;
type OnRetry = (error: unknown, attempt: number, nextDelayMs: number) => void;

export interface BackoffOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  shouldRetry?: ShouldRetry;
  onRetry?: OnRetry;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function defaultShouldRetry(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  const isRetryableStatus = typeof status === "number" && (status === 429 || status >= 500);
  const message = (error as Error)?.message || "";
  const isNetworkish = /network|fetch failed|timeout/i.test(message);
  return isRetryableStatus || isNetworkish;
}

export async function withBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: BackoffOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 400,
    maxDelayMs = 4_000,
    jitter = true,
    shouldRetry = defaultShouldRetry,
    onRetry,
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
      if (!canRetry) break;

      const expDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitterAmount = jitter ? Math.random() * 100 : 0;
      const delay = expDelay + jitterAmount;
      onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
