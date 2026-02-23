// ============================================================================
// Shadow Voice Agent — Failover Manager
// Three-tier failover: primary -> fallback -> emergency.
// Handles timeouts, errors, and tracks which provider succeeded.
// Used for STT, TTS, LLM, and any other critical service.
// ============================================================================

// --- Types ---

export interface FailoverParams<T> {
  /** Service name for logging/metrics (e.g., 'stt', 'tts', 'llm') */
  service: string;
  /** Primary provider function */
  primary: () => Promise<T>;
  /** Fallback provider function (tried if primary fails) */
  fallback: () => Promise<T>;
  /** Emergency/last-resort provider function (tried if fallback fails) */
  emergency: () => Promise<T>;
  /** Timeout in milliseconds. If primary exceeds this, we try fallback. */
  timeoutMs: number;
}

export interface FailoverResult<T> {
  result: T;
  provider: 'primary' | 'fallback' | 'emergency';
  latencyMs: number;
}

// --- Helpers ---

/**
 * Execute a function with a timeout. Rejects if the function
 * does not resolve within the specified time.
 */
function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    fn()
      .then((result) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

// --- Failover Manager ---

export class FailoverManager {
  /**
   * Execute a service call with three-tier failover.
   *
   * Flow:
   * 1. Try primary with timeout
   * 2. If primary fails/times out, try fallback with same timeout
   * 3. If fallback fails/times out, try emergency with 2x timeout
   * 4. If all fail, throw the emergency error
   *
   * @returns The result, which provider succeeded, and total latency
   */
  async executeWithFailover<T>(params: FailoverParams<T>): Promise<FailoverResult<T>> {
    const { primary, fallback, emergency, timeoutMs } = params;
    const overallStart = Date.now();

    // --- Try primary ---
    try {
      const result = await withTimeout(primary, timeoutMs);
      return {
        result,
        provider: 'primary',
        latencyMs: Date.now() - overallStart,
      };
    } catch {
      // Primary failed, continue to fallback
    }

    // --- Try fallback ---
    try {
      const result = await withTimeout(fallback, timeoutMs);
      return {
        result,
        provider: 'fallback',
        latencyMs: Date.now() - overallStart,
      };
    } catch {
      // Fallback failed, continue to emergency
    }

    // --- Try emergency (with 2x timeout as last resort) ---
    try {
      const result = await withTimeout(emergency, timeoutMs * 2);
      return {
        result,
        provider: 'emergency',
        latencyMs: Date.now() - overallStart,
      };
    } catch (err) {
      // All providers failed — throw
      const message =
        err instanceof Error ? err.message : 'All failover providers failed';
      throw new Error(
        `[FailoverManager] All providers failed for service "${params.service}": ${message}`,
      );
    }
  }
}

// Singleton export
export const failoverManager = new FailoverManager();
