// ============================================================================
// Retry Wrapper
// Exponential backoff with jitter for AI API calls.
// ============================================================================

export type AIErrorType =
  | 'rate-limit'
  | 'server-error'
  | 'bad-request'
  | 'auth-error'
  | 'timeout'
  | 'unknown';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: AIErrorType[];
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['rate-limit', 'server-error', 'timeout'],
};

/**
 * Classify an error from the Anthropic SDK into an AIErrorType.
 */
export function classifyError(error: unknown): AIErrorType {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const statusCode =
      (error as unknown as Record<string, unknown>).status ??
      (error as unknown as Record<string, unknown>).statusCode;

    if (
      statusCode === 429 ||
      message.includes('rate limit') ||
      message.includes('too many requests')
    ) {
      return 'rate-limit';
    }

    if (
      typeof statusCode === 'number' &&
      statusCode >= 500 &&
      statusCode < 600
    ) {
      return 'server-error';
    }

    if (statusCode === 401 || statusCode === 403) {
      return 'auth-error';
    }

    if (
      statusCode === 400 ||
      statusCode === 422 ||
      message.includes('invalid')
    ) {
      return 'bad-request';
    }

    if (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('etimedout')
    ) {
      return 'timeout';
    }
  }

  return 'unknown';
}

/**
 * Calculate delay for a given retry attempt with exponential backoff and jitter.
 */
export function calculateDelay(
  attempt: number,
  options: RetryOptions = {},
): number {
  const base = options.baseDelayMs ?? DEFAULT_OPTIONS.baseDelayMs;
  const max = options.maxDelayMs ?? DEFAULT_OPTIONS.maxDelayMs;
  const multiplier = options.backoffMultiplier ?? DEFAULT_OPTIONS.backoffMultiplier;

  const exponentialDelay = base * Math.pow(multiplier, attempt);
  const capped = Math.min(exponentialDelay, max);

  // Add jitter: random value between 0 and 25% of the calculated delay
  const jitter = Math.random() * capped * 0.25;

  return Math.floor(capped + jitter);
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract Retry-After header value from an error (in milliseconds).
 */
function getRetryAfterMs(error: unknown): number | undefined {
  const headers = (error as Record<string, unknown>)?.headers as
    | Record<string, string>
    | undefined;
  const retryAfter = headers?.['retry-after'];
  if (!retryAfter) return undefined;

  const seconds = Number(retryAfter);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  return undefined;
}

/**
 * Wrap an async function with retry logic.
 *
 * @throws The last error after exhausting all retries, augmented with retry context.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_OPTIONS.maxRetries;
  const retryableErrors =
    options.retryableErrors ?? DEFAULT_OPTIONS.retryableErrors;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        break;
      }

      const errorType = classifyError(error);

      // Only retry retryable error types
      if (!retryableErrors.includes(errorType)) {
        break;
      }

      // Calculate delay — use Retry-After header for rate limits if available
      let delayMs: number;
      if (errorType === 'rate-limit') {
        const retryAfterMs = getRetryAfterMs(error);
        delayMs = retryAfterMs ?? calculateDelay(attempt, options);
      } else {
        delayMs = calculateDelay(attempt, options);
      }

      // Call onRetry callback before waiting
      if (options.onRetry) {
        options.onRetry(error, attempt + 1, delayMs);
      }

      await sleep(delayMs);
    }
  }

  // Augment the error with retry context
  const errorType = classifyError(lastError);
  const retryError = new Error(
    `Failed after ${maxRetries} retries (error type: ${errorType}): ${lastError?.message}`,
  );
  retryError.cause = lastError;
  throw retryError;
}
