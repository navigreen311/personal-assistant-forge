import { classifyError, calculateDelay, withRetry } from '@/lib/ai/retry';

describe('Retry Logic', () => {
  describe('classifyError', () => {
    it('should classify 429 status as rate-limit', () => {
      const error = Object.assign(new Error('Too many requests'), {
        status: 429,
      });
      expect(classifyError(error)).toBe('rate-limit');
    });

    it('should classify rate limit message as rate-limit', () => {
      const error = new Error('Rate limit exceeded');
      expect(classifyError(error)).toBe('rate-limit');
    });

    it('should classify 500 status as server-error', () => {
      const error = Object.assign(new Error('Internal server error'), {
        status: 500,
      });
      expect(classifyError(error)).toBe('server-error');
    });

    it('should classify 503 status as server-error', () => {
      const error = Object.assign(new Error('Service unavailable'), {
        status: 503,
      });
      expect(classifyError(error)).toBe('server-error');
    });

    it('should classify 401 status as auth-error', () => {
      const error = Object.assign(new Error('Unauthorized'), { status: 401 });
      expect(classifyError(error)).toBe('auth-error');
    });

    it('should classify 400 status as bad-request', () => {
      const error = Object.assign(new Error('Bad request'), { status: 400 });
      expect(classifyError(error)).toBe('bad-request');
    });

    it('should classify timeout message as timeout', () => {
      const error = new Error('Request timed out');
      expect(classifyError(error)).toBe('timeout');
    });

    it('should classify ETIMEDOUT message as timeout', () => {
      const error = new Error('connect ETIMEDOUT');
      expect(classifyError(error)).toBe('timeout');
    });

    it('should classify unknown errors as unknown', () => {
      const error = new Error('Something unexpected');
      expect(classifyError(error)).toBe('unknown');
    });

    it('should handle non-Error objects', () => {
      expect(classifyError('string error')).toBe('unknown');
      expect(classifyError(42)).toBe('unknown');
      expect(classifyError(null)).toBe('unknown');
      expect(classifyError(undefined)).toBe('unknown');
    });
  });

  describe('calculateDelay', () => {
    it('should return baseDelayMs for attempt 0', () => {
      const delay = calculateDelay(0, {
        baseDelayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 30000,
      });

      // Base delay is 1000, plus up to 25% jitter (0-250), so 1000-1250
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(1250);
    });

    it('should increase exponentially with each attempt', () => {
      // With deterministic-enough testing we can verify the trend
      const delays: number[] = [];
      for (let i = 0; i < 4; i++) {
        // Take multiple samples to get the base trend
        const samples = Array.from({ length: 20 }, () =>
          calculateDelay(i, {
            baseDelayMs: 1000,
            backoffMultiplier: 2,
            maxDelayMs: 100000,
          }),
        );
        // Minimum should follow exponential pattern (ignoring jitter)
        delays.push(Math.min(...samples));
      }

      // Each minimum should be >= base * multiplier^attempt
      expect(delays[0]).toBeGreaterThanOrEqual(1000); // 1000 * 2^0
      expect(delays[1]).toBeGreaterThanOrEqual(2000); // 1000 * 2^1
      expect(delays[2]).toBeGreaterThanOrEqual(4000); // 1000 * 2^2
      expect(delays[3]).toBeGreaterThanOrEqual(8000); // 1000 * 2^3
    });

    it('should not exceed maxDelayMs', () => {
      const delay = calculateDelay(10, {
        baseDelayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 5000,
      });

      // Max is 5000 + up to 25% jitter = 6250
      expect(delay).toBeLessThanOrEqual(6250);
    });

    it('should include jitter (result varies between calls)', () => {
      const results = new Set<number>();
      for (let i = 0; i < 20; i++) {
        results.add(calculateDelay(1, { baseDelayMs: 1000, maxDelayMs: 30000 }));
      }
      // With jitter, we should get multiple distinct values
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('withRetry', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return result on first success', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on rate-limit error', async () => {
      const rateLimitError = Object.assign(
        new Error('Too many requests'),
        { status: 429 },
      );
      const fn = jest
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue('success');

      const promise = withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 100,
      });

      // Advance timers to allow the retry delay to resolve
      await jest.advanceTimersByTimeAsync(30000);
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on server-error', async () => {
      const serverError = Object.assign(
        new Error('Internal server error'),
        { status: 500 },
      );
      const fn = jest
        .fn()
        .mockRejectedValueOnce(serverError)
        .mockResolvedValue('recovered');

      const promise = withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 100,
      });

      await jest.advanceTimersByTimeAsync(30000);
      const result = await promise;

      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should NOT retry on bad-request error', async () => {
      const badRequestError = Object.assign(
        new Error('Bad request'),
        { status: 400 },
      );
      const fn = jest.fn().mockRejectedValue(badRequestError);

      await expect(
        withRetry(fn, { maxRetries: 3, baseDelayMs: 100 }),
      ).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on auth-error', async () => {
      const authError = Object.assign(
        new Error('Unauthorized'),
        { status: 401 },
      );
      const fn = jest.fn().mockRejectedValue(authError);

      await expect(
        withRetry(fn, { maxRetries: 3, baseDelayMs: 100 }),
      ).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should stop retrying after maxRetries', async () => {
      const serverError = Object.assign(
        new Error('Server error'),
        { status: 500 },
      );
      const fn = jest.fn().mockRejectedValue(serverError);

      const promise = withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 100,
      });

      // Attach the assertion before advancing timers to avoid unhandled rejection
      const assertion = expect(promise).rejects.toThrow(/Failed after 2 retries/);
      await jest.advanceTimersByTimeAsync(60000);
      await assertion;

      // 1 initial + 2 retries = 3 calls total
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should call onRetry callback before each retry', async () => {
      const serverError = Object.assign(
        new Error('Server error'),
        { status: 500 },
      );
      const fn = jest
        .fn()
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockResolvedValue('success');

      const onRetry = jest.fn();

      const promise = withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 100,
        onRetry,
      });

      await jest.advanceTimersByTimeAsync(60000);
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      // First retry: attempt 1
      expect(onRetry.mock.calls[0][1]).toBe(1);
      // Second retry: attempt 2
      expect(onRetry.mock.calls[1][1]).toBe(2);
    });

    it('should throw the last error after exhausting retries', async () => {
      const serverError = Object.assign(
        new Error('Persistent server error'),
        { status: 500 },
      );
      const fn = jest.fn().mockRejectedValue(serverError);

      const promise = withRetry(fn, {
        maxRetries: 1,
        baseDelayMs: 100,
      });

      // Attach the assertion before advancing timers to avoid unhandled rejection
      const assertion = expect(promise).rejects.toThrow(/Failed after 1 retries/);
      await jest.advanceTimersByTimeAsync(60000);
      await assertion;

      // Verify the original error message is included
      const fn2 = jest.fn().mockRejectedValue(serverError);
      const promise2 = withRetry(fn2, { maxRetries: 1, baseDelayMs: 100 });
      const assertion2 = expect(promise2).rejects.toThrow(/Persistent server error/);
      await jest.advanceTimersByTimeAsync(60000);
      await assertion2;
    });

    it('should respect custom retryableErrors option', async () => {
      const unknownError = new Error('Something weird');
      const fn = jest
        .fn()
        .mockRejectedValueOnce(unknownError)
        .mockResolvedValue('success');

      const promise = withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 100,
        retryableErrors: ['unknown'],
      });

      await jest.advanceTimersByTimeAsync(30000);
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
