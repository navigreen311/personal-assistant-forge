// ============================================================================
// Redis/BullMQ Connection
// Shared IORedis connection for all BullMQ queues and workers
// ============================================================================

import IORedis from 'ioredis';

/** Used when nothing else is configured. Unchanged: this is what deploys rely on. */
const DEFAULT_REDIS_URL = 'redis://localhost:6379';

/**
 * The value of `REDIS_URL` that means "this process has no Redis".
 *
 * ----------------------------------------------------------------------------
 * P-25: why an explicit way to say "no Redis" had to exist
 * ----------------------------------------------------------------------------
 *
 * `OfflineQueue` documents a fallback -- "falls back to in-memory storage when
 * Redis is unavailable" -- and `getBullQueue()` already implements its entry
 * point:
 *
 *     const redisUrl = getRedisUrl();
 *     if (!redisUrl) { this.redisAvailable = false; return null; }
 *
 * That branch was unreachable. `getRedisUrl()` could not return a falsy value:
 * an unset or empty `REDIS_URL` fell through `||` to the localhost default. So
 * the only way a process could express "there is no Redis here" was to point at
 * an address and let the TCP connection fail -- which is what CI's unit job
 * does, deliberately, and what every developer without a local Redis does by
 * accident.
 *
 * Reaching the fallback by failing a connection is not the same as not
 * connecting. It opens a socket per queue, per test file, per jest worker; it
 * starts an ioredis reconnect loop; and it makes an asynchronous `'error'`
 * event whose arrival time nobody controls. If that event lands after the code
 * under test has closed the queue, BullMQ has already dropped its forwarding
 * listener, and an `'error'` on an EventEmitter with no listener is an uncaught
 * exception that kills the jest worker -- reported against whichever test
 * happened to be running. That is a flake, in CI as much as anywhere, and it is
 * the same class of failure five agents reported in files they had not touched.
 *
 * `REDIS_URL=disabled` makes the documented state expressible: no URL, so no
 * Queue, so no socket, so no event to arrive late. `tests/helpers/redis.ts` sets
 * it for the unit suite. Production is untouched -- an unset `REDIS_URL` still
 * resolves to the localhost default exactly as before.
 */
const REDIS_DISABLED = 'disabled';

const REDIS_OPTIONS = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
} as const;

let connection: IORedis | null = null;

/**
 * The Redis URL for this process, or `''` when Redis is explicitly disabled.
 *
 * Read from the environment on every call rather than captured once at module
 * load. The old module-level constant froze the value at first import, so
 * nothing that ran after that -- a jest `globalSetup` handing this run its own
 * Redis database, a bootstrap that resolves configuration asynchronously --
 * could be honoured, and whether it was depended on module import order. Reading
 * per call costs one property access and removes the ordering question.
 */
export function getRedisUrl(): string {
  const configured = process.env.REDIS_URL?.trim();
  if (configured === REDIS_DISABLED) return '';
  return configured || DEFAULT_REDIS_URL;
}

/** Throw a clear error rather than connect to a default that was disabled. */
function requireRedisUrl(): string {
  const url = getRedisUrl();
  if (!url) {
    throw new Error(
      `REDIS_URL is set to "${REDIS_DISABLED}", so this process has no Redis. ` +
        'Callers that can degrade should check getRedisUrl() for an empty string ' +
        'and use their in-memory path instead of opening a connection.'
    );
  }
  return url;
}

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(requireRedisUrl(), REDIS_OPTIONS);
  }
  return connection;
}

export function createRedisConnection(): IORedis {
  return new IORedis(requireRedisUrl(), REDIS_OPTIONS);
}

export async function closeRedisConnection(): Promise<void> {
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
