/**
 * P-28 — worker liveness.
 *
 * ============================================================================
 * THE QUESTION THIS ANSWERS
 * ============================================================================
 *
 * "Is anything consuming the queues right now?"
 *
 * Before P-11 the answer was permanently no and nobody knew: three worker
 * factories were written, typed, unit-tested and never called, `package.json`
 * pointed `npm run worker` at a file that did not exist, and
 * `POST /api/workflows/[id]/trigger` returned 200 for a job that would sit in
 * Redis forever. P-11 wrote the consumer. It did not make the ANSWER visible,
 * and the failure it fixed is one that recurs on its own: a worker container
 * that OOMs, a Redis credential that rotates, a deploy that scales the web tier
 * and forgets the worker tier. In every one of those the web process keeps
 * returning 200 to `enqueue`, exactly as it did when there was no worker at all.
 *
 * ============================================================================
 * MECHANISM, AND WHY REGISTRATION IS SEPARATE FROM THE HEARTBEAT
 * ============================================================================
 *
 * Two Redis keys per worker, and the split between them is the whole design:
 *
 *   paf:obs:workers            SET, no TTL   -- "this worker is expected here"
 *   paf:obs:worker:<name>      STRING, TTL   -- "this worker was alive recently"
 *
 * A heartbeat alone cannot distinguish "the worker died" from "no worker was
 * ever deployed", and those need opposite responses. With the set, a missing
 * heartbeat for a REGISTERED name is a real failure and is reported; a name
 * that was never registered produces no claim at all. That is why
 * `/api/health` reports `unknown` rather than `error` on a machine that has
 * simply never run a worker -- a health check that goes red on every developer
 * box is a health check people learn to ignore.
 *
 * Registration is removed on GRACEFUL shutdown only. A worker stopped on
 * purpose stops being expected; a worker that was SIGKILLed, OOMed or crashed
 * leaves its registration behind and its heartbeat expires, which is precisely
 * the state that should be loud.
 *
 * ============================================================================
 * REDIS, NOT THE RECORDER
 * ============================================================================
 *
 * This is the one piece of observability here that is NOT process-local, and it
 * has to be: the process asking the question (a web server serving
 * `/api/health`) is never the process that would answer it (a worker). Redis is
 * already a hard dependency of the queue these workers consume -- if it is gone
 * the workers are not running anyway, so nothing is being claimed on the
 * strength of infrastructure the platform did not already require.
 */

import { getRedisUrl, createRedisConnection } from '@/lib/queue/connection';
import { report, reportError } from './report';

const REGISTRY_KEY = 'paf:obs:workers';
const HEARTBEAT_PREFIX = 'paf:obs:worker:';

/** How often a worker says it is alive. */
export const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * How long a heartbeat is believed after it is written.
 *
 * Four intervals, not two. A worker running jobs at full concurrency can be
 * slow to get back to its timer, and a liveness check that reports a busy
 * worker as dead is worse than one that takes an extra thirty seconds to
 * report a dead one as dead: the first teaches people to distrust it.
 */
export const HEARTBEAT_TTL_SECONDS = Math.ceil((HEARTBEAT_INTERVAL_MS * 4) / 1000);

export type WorkerLiveness = 'up' | 'down';

export interface WorkerStatus {
  name: string;
  state: WorkerLiveness;
  /** Present when the worker has ever been seen by this Redis. */
  lastSeen: string | null;
  pid: number | null;
}

export interface WorkerHealth {
  /** 'unknown' means no worker has ever registered — nothing is being claimed. */
  status: 'ok' | 'degraded' | 'unknown';
  workers: WorkerStatus[];
  down: string[];
  /** Set when Redis could not be consulted; the answer is then not knowledge. */
  error: string | null;
}

interface HeartbeatHandle {
  stop: () => Promise<void>;
}

/**
 * Begin publishing heartbeats for the named workers. Call once, from the worker
 * process. Returns a handle whose `stop()` deregisters and closes the socket.
 *
 * Returns null when this process has no Redis (`REDIS_URL=disabled`), which is
 * the unit suite's configuration; see `src/lib/queue/connection.ts`.
 */
export function startHeartbeat(names: string[]): HeartbeatHandle | null {
  if (!getRedisUrl()) return null;

  const connection = createRedisConnection();
  const pid = typeof process !== 'undefined' ? process.pid : 0;

  const beat = async (): Promise<void> => {
    const payload = JSON.stringify({ pid, at: new Date().toISOString() });
    const pipeline = connection.pipeline();
    for (const name of names) {
      pipeline.sadd(REGISTRY_KEY, name);
      pipeline.set(`${HEARTBEAT_PREFIX}${name}`, payload, 'EX', HEARTBEAT_TTL_SECONDS);
    }
    await pipeline.exec();
  };

  const tick = (): void => {
    // Not `catch {}`. A worker that cannot write its heartbeat is a worker
    // whose liveness is about to read as `down` in /api/health, and the reason
    // belongs somewhere an operator can find it -- otherwise they debug a
    // worker that is in fact running fine and cannot reach Redis.
    void beat().catch((err: unknown) => {
      reportError(err, {
        kind: 'worker_error',
        severity: 'warning',
        fingerprint: 'worker:heartbeat-write',
        message: 'failed to write worker heartbeat',
      });
    });
  };

  tick();

  const timer = setInterval(tick, HEARTBEAT_INTERVAL_MS);
  // P-20 shipped a `setInterval` that was never unref'ed; every test passed and
  // the PROCESS never exited, which reads as a hang rather than a failure. A
  // heartbeat must never be the reason a process refuses to die.
  timer.unref();

  return {
    stop: async (): Promise<void> => {
      clearInterval(timer);
      try {
        const pipeline = connection.pipeline();
        for (const name of names) {
          pipeline.srem(REGISTRY_KEY, name);
          pipeline.del(`${HEARTBEAT_PREFIX}${name}`);
        }
        await pipeline.exec();
      } catch (err) {
        reportError(err, {
          kind: 'worker_error',
          severity: 'warning',
          fingerprint: 'worker:heartbeat-deregister',
          message: 'failed to deregister worker heartbeat',
        });
      } finally {
        connection.disconnect();
      }
    },
  };
}

/**
 * Read worker liveness. Called by `/api/health`.
 *
 * Opens and closes its own connection rather than using the shared singleton in
 * `connection.ts`: that singleton is the one BullMQ queues hold, and a health
 * check must not be able to leave it in a bad state or hold it open in a
 * process that never enqueues anything.
 *
 * `commandTimeout` is set because a health check that hangs is a health check
 * that turns one broken dependency into an unresponsive liveness probe, which
 * is how a degraded deploy becomes a full outage.
 */
export async function readWorkerHealth(): Promise<WorkerHealth> {
  if (!getRedisUrl()) {
    return { status: 'unknown', workers: [], down: [], error: null };
  }

  const connection = createRedisConnection();
  try {
    connection.options.commandTimeout = 2000;
    const names = (await connection.smembers(REGISTRY_KEY)).sort();
    if (names.length === 0) {
      return { status: 'unknown', workers: [], down: [], error: null };
    }

    const beats = await connection.mget(names.map((name) => `${HEARTBEAT_PREFIX}${name}`));

    const workers: WorkerStatus[] = names.map((name, index) => {
      const raw = beats[index];
      if (!raw) return { name, state: 'down', lastSeen: null, pid: null };
      const parsed = parseHeartbeat(raw);
      return { name, state: 'up', lastSeen: parsed.at, pid: parsed.pid };
    });

    const down = workers.filter((w) => w.state === 'down').map((w) => w.name);

    // Reported here rather than by the caller, so that every reader of worker
    // health produces the same event and a new caller cannot forget to. The
    // recorder deduplicates by fingerprint, so polling /api/health once a
    // second turns into one counter row per dead worker whose count climbs —
    // not one event per poll.
    for (const name of down) {
      report({
        kind: 'worker_error',
        severity: 'fatal',
        message:
          `worker "${name}" is registered but has not sent a heartbeat in ` +
          `${HEARTBEAT_TTL_SECONDS}s; jobs on this queue are being accepted and not consumed`,
        fingerprint: `worker:down:${name}`,
        context: { queue: name },
      });
    }

    return {
      status: down.length > 0 ? 'degraded' : 'ok',
      workers,
      down,
      error: null,
    };
  } catch (err) {
    // Reported, not swallowed: "the health check could not reach Redis" is
    // itself a finding, and returning `status: 'unknown'` with a null error
    // would be indistinguishable from "no workers are expected here".
    reportError(err, {
      kind: 'worker_error',
      severity: 'warning',
      fingerprint: 'worker:health-read',
      message: 'failed to read worker heartbeats',
    });
    return {
      status: 'unknown',
      workers: [],
      down: [],
      error: err instanceof Error ? err.message : 'unknown redis error',
    };
  } finally {
    connection.disconnect();
  }
}

function parseHeartbeat(raw: string): { at: string | null; pid: number | null } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const value = parsed as { at?: unknown; pid?: unknown };
      return {
        at: typeof value.at === 'string' ? value.at : null,
        pid: typeof value.pid === 'number' ? value.pid : null,
      };
    }
  } catch {
    // A malformed heartbeat still proves the worker wrote recently -- the key
    // had not expired. The timestamp is lost, the liveness fact is not, so this
    // degrades to `up` with a null lastSeen rather than reporting a failure
    // that did not happen.
  }
  return { at: null, pid: null };
}

/** Report that a worker process is going down. Called by scripts/worker.ts. */
export function reportWorkerShutdown(signal: string, exitCode: number): void {
  report({
    kind: 'worker_shutdown',
    severity: exitCode === 0 ? 'warning' : 'fatal',
    message: `worker process shutting down on ${signal} with exit code ${exitCode}`,
    fingerprint: `worker:shutdown:${signal}`,
    context: { signal, exitCode, pid: typeof process !== 'undefined' ? process.pid : 0 },
  });
}
