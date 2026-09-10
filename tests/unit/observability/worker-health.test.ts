/**
 * P-28 — worker liveness: the no-Redis degradation path.
 *
 * The unit lane deliberately has no Redis (`jest.config.ts` sets
 * `REDIS_URL=disabled` via `tests/helpers/redis.ts`, and CI gives the unit job
 * no Redis service, both for reasons written out at length in those files). So
 * this file proves the branch that matters on a machine with no Redis: it must
 * open no socket and must claim nothing.
 *
 * `tests/db/observability.test.ts` proves the real round trip against the Redis
 * the db lane provisions.
 */

import {
  startHeartbeat,
  readWorkerHealth,
  reportWorkerShutdown,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TTL_SECONDS,
} from '@/lib/observability/worker-health';
import { recorder } from '@/lib/observability/recorder';

beforeEach(() => {
  recorder.reset();
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  recorder.reset();
  jest.restoreAllMocks();
});

describe('heartbeat constants', () => {
  it('believes a heartbeat for four intervals, not two', () => {
    // A liveness check that reports a BUSY worker as dead is worse than one
    // that takes an extra thirty seconds to report a dead one: the first
    // teaches people to distrust it.
    expect(HEARTBEAT_TTL_SECONDS).toBe((HEARTBEAT_INTERVAL_MS * 4) / 1000);
    expect(HEARTBEAT_INTERVAL_MS).toBeLessThan(HEARTBEAT_TTL_SECONDS * 1000);
  });
});

describe('with REDIS_URL=disabled', () => {
  it('is the configuration this lane actually runs in', () => {
    // If this ever stops being true, the two assertions below become vacuous.
    expect(process.env.REDIS_URL).toBe('disabled');
  });

  it('startHeartbeat opens no connection and returns null', () => {
    expect(startHeartbeat(['pa-forge-jobs'])).toBeNull();
  });

  it('readWorkerHealth reports `unknown`, not `ok` and not `degraded`', async () => {
    const health = await readWorkerHealth();
    // `unknown` is the honest answer: nothing has registered, so nothing is
    // missing. Reporting `ok` would be a claim, and reporting `degraded` would
    // make /api/health red on every developer machine — the surest way to
    // teach people to ignore it.
    expect(health).toEqual({ status: 'unknown', workers: [], down: [], error: null });
  });

  it('reports nothing, because nothing failed', async () => {
    await readWorkerHealth();
    expect(recorder.recentEvents()).toHaveLength(0);
  });
});

describe('reportWorkerShutdown', () => {
  it('grades a clean shutdown below a crash', () => {
    reportWorkerShutdown('SIGTERM', 0);
    reportWorkerShutdown('uncaughtException', 1);

    const counters = recorder.snapshot().counters;
    const clean = counters.find((c) => c.fingerprint === 'worker:shutdown:SIGTERM');
    const crash = counters.find((c) => c.fingerprint === 'worker:shutdown:uncaughtException');

    // A rolling deploy sends SIGTERM to every worker; if that were `fatal`,
    // every deploy would page someone.
    expect(clean?.severity).toBe('warning');
    expect(crash?.severity).toBe('fatal');
  });

  it('records the signal and exit code as context', () => {
    reportWorkerShutdown('SIGKILL', 137);
    const event = recorder.recentEvents()[0];
    expect(event.kind).toBe('worker_shutdown');
    expect(event.context.signal).toBe('SIGKILL');
    expect(event.context.exitCode).toBe(137);
  });
});
