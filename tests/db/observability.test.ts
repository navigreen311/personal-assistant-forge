/**
 * P-28 (T-013 / T-025) — proof against a real Postgres, a real Redis, and the
 * real generated Prisma client.
 *
 * ============================================================================
 * WHY THIS SUITE AND NOT THE UNIT LANE
 * ============================================================================
 *
 * The unit lane proves the mechanisms against stand-ins. That is worth having
 * and it is not the claim being made. The claim is that when a route in THIS
 * platform queries a table that is not there, a number moves — and the only way
 * that claim can be checked is with a client that was generated from
 * `schema.prisma`, a database that really is missing the table, and the actual
 * route module.
 *
 * `jest.mock('@/lib/db')` is what made the ten historical bugs invisible: a
 * mocked delegate returns whatever the test told it to, so it proves the
 * delegate exists. Nothing in this file mocks anything.
 *
 * Run:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paf_p28 \
 *     npm run test:db -- observability
 */

import { Prisma } from '@prisma/client';

import { prisma, setupTestDatabase } from '../helpers/db';
import type { PrismaTransactionClient } from '@/lib/db/helpers';
import { createTenant } from '../helpers/factories';
import { requestAs, anonymousRequest, readJson } from '../helpers/session';
import { recorder } from '@/lib/observability/recorder';
import { GET as observabilityGET } from '@/app/api/admin/observability/route';
import { GET as healthGET } from '@/app/api/health/route';
import {
  startHeartbeat,
  readWorkerHealth,
  HEARTBEAT_TTL_SECONDS,
} from '@/lib/observability/worker-health';
import { getRedisUrl, createRedisConnection } from '@/lib/queue/connection';

setupTestDatabase();

beforeEach(() => {
  recorder.reset();
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. The instrumented client is the one the platform imports
// ---------------------------------------------------------------------------

describe('the exported client is instrumented', () => {
  it('still behaves like a Prisma client for ordinary work', async () => {
    const tenant = await createTenant();
    const found = await prisma.user.findUnique({ where: { id: tenant.user.id } });
    expect(found?.id).toBe(tenant.user.id);
    // A successful query reports nothing. An observability layer that emitted
    // on the happy path would drown the failing path it exists to surface.
    expect(recorder.recentEvents()).toHaveLength(0);
  });

  it('still runs interactive transactions, and still rolls them back', async () => {
    // The instrumentation wraps the client in a Proxy and applies a query
    // extension. Both are capable of breaking `$transaction` in ways no unit
    // test with a stand-in would show: a Proxy does not forward private-field
    // access, and a query extension sits between the client and the batching
    // layer. Atomicity is the property that would be lost silently.
    const tenant = await createTenant();
    const before = await prisma.entity.count();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.entity.create({
          data: { userId: tenant.user.id, name: 'rolled back', type: 'PERSONAL' },
        });
        throw new Error('abort');
      })
    ).rejects.toThrow('abort');

    expect(await prisma.entity.count()).toBe(before);
  });

  it('still runs a batched $transaction array', async () => {
    const tenant = await createTenant();
    const [users, entities] = await prisma.$transaction([
      prisma.user.count(),
      prisma.entity.count({ where: { userId: tenant.user.id } }),
    ]);
    expect(users).toBeGreaterThan(0);
    expect(entities).toBe(1);
  });

  it('still runs raw queries', async () => {
    await expect(prisma.$queryRaw`SELECT 1 as one`).resolves.toEqual([{ one: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// 2. THE HEADLINE: a query against a table that is not there is COUNTED
// ---------------------------------------------------------------------------

/**
 * Run `fn` against a database in which `table` does not exist, then put it back.
 *
 * The first draft of this file simply ran `DROP TABLE "ActionLog" CASCADE` and
 * moved on. Nineteen of twenty-four cases then failed — not on the assertion
 * but in `resetDatabase()`, which truncates every table and cannot truncate one
 * that is gone. Worth recording, because it is the same class of mistake this
 * package is about: a destructive step whose consequence surfaced somewhere
 * other than where it was caused.
 *
 * Postgres DDL is transactional, so the drop and the failing query both happen
 * inside a transaction that is always rolled back. The database is identical
 * afterwards whether the assertions passed, failed, or threw.
 */
const ROLLBACK = Symbol('rollback');

async function withMissingTable<T>(
  table: string,
  fn: (tx: PrismaTransactionClient) => Promise<T>
): Promise<T> {
  let captured: T;
  await prisma
    .$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DROP TABLE "${table}" CASCADE`);
      captured = await fn(tx);
      throw ROLLBACK;
    })
    .catch((err: unknown) => {
      if (err !== ROLLBACK) throw err;
    });
  return captured!;
}

describe('a failing query is counted even when the caller swallows it', () => {
  it('counts a missing table and rethrows the original error', async () => {
    // This is `/api/attention/insights`, reproduced against a real database:
    // the model exists in the client, the table does not exist in the database.
    // Before P-28 this produced a swallowed TypeError and a 200 with a
    // hardcoded default, and no signal of any kind.
    const servedDefault = await withMissingTable('ActionLog', async (tx) => {
      try {
        await tx.actionLog.findMany({ take: 1 });
        return 0;
      } catch {
        // The bare catch, exactly as 553 places in `src` have it.
        return 100;
      }
    });

    // Behaviour is UNCHANGED — the caller still swallows and still defaults.
    expect(servedDefault).toBe(100);

    // But the failure is now on the record, at `fatal`, because a missing
    // table cannot be transient.
    const counter = recorder
      .snapshot()
      .counters.find((c) => c.fingerprint.startsWith('prisma:ActionLog.findMany'));
    expect(counter).toBeDefined();
    expect(counter?.severity).toBe('fatal');
    expect(counter?.count).toBe(1);
    expect(recorder.countOver('prisma_query_error', 15)).toBe(1);
  });

  it('counts once per failure, so the rate reflects real traffic', async () => {
    // Twelve SEPARATE transactions, not twelve queries in one. The first
    // failing statement aborts a Postgres transaction, so every later query in
    // it fails with 25P02 ("current transaction is aborted") instead of the
    // 42P01 under test -- which would produce a second fingerprint and prove
    // the opposite of what this case is about.
    for (let i = 0; i < 12; i += 1) {
      await withMissingTable('ActionLog', async (tx) => {
        await tx.actionLog.findMany({ take: 1 }).catch(() => undefined);
      });
    }
    // One counter row, count 12 — a route hit twelve times, not twelve problems.
    const rows = recorder
      .snapshot()
      .counters.filter((c) => c.fingerprint.startsWith('prisma:ActionLog'));
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(12);
    expect(recorder.countOver('prisma_query_error', 15)).toBe(12);
  });

  it('records no query arguments, so a counter cannot leak a tenant', async () => {
    await withMissingTable('ActionLog', async (tx) => {
      await tx.actionLog
        .findMany({ where: { actor: 'secret-actor-value-should-not-appear' } })
        .catch(() => undefined);
    });

    expect(JSON.stringify(recorder.snapshot())).not.toContain('secret-actor-value');
  });

  it('grades a unique-constraint race below a schema fault', async () => {
    const tenant = await createTenant();
    // Duplicate email: the ordinary outcome of an upsert race, which
    // src/lib/shadow/vaf-config.ts catches deliberately. Counting it at `error`
    // would pin any alert threshold permanently above zero.
    await expect(
      prisma.user.create({
        data: {
          email: tenant.user.email,
          name: 'dup',
          timezone: 'America/Chicago',
          preferences: {},
        },
      })
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    const counter = recorder
      .snapshot()
      .counters.find((c) => c.fingerprint.startsWith('prisma:User.create'));
    expect(counter?.fingerprint).toContain('P2002');
    expect(counter?.severity).toBe('warning');
  });

  it('counts a raw query failure too, where there is no model', async () => {
    await prisma.$queryRawUnsafe('SELECT * FROM "NoSuchTableAnywhere"').catch(() => undefined);
    const counter = recorder
      .snapshot()
      .counters.find((c) => c.fingerprint.startsWith('prisma:$queryRawUnsafe'));
    expect(counter).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. A phantom delegate, against the real generated client
// ---------------------------------------------------------------------------

describe('a phantom delegate on the real client', () => {
  it('is reported, and still returns undefined', () => {
    const asRecord = prisma as unknown as Record<string, unknown>;

    // `attentionEvent` is not a model in schema.prisma. This is the exact read
    // that `/api/attention/insights` performed.
    expect(asRecord.attentionEvent).toBeUndefined();

    const counter = recorder
      .snapshot()
      .counters.find((c) => c.fingerprint === 'phantom-delegate:attentionEvent');
    expect(counter).toBeDefined();
    expect(counter?.severity).toBe('fatal');
  });

  it('does not fire for the 75 delegates that do exist', () => {
    for (const model of Prisma.dmmf.datamodel.models) {
      const name = model.name.charAt(0).toLowerCase() + model.name.slice(1);
      expect((prisma as unknown as Record<string, unknown>)[name]).toBeDefined();
    }
    expect(recorder.snapshot().totals.phantom_delegate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. The inspection endpoint
// ---------------------------------------------------------------------------

describe('GET /api/admin/observability', () => {
  it('refuses an anonymous caller', async () => {
    const res = await observabilityGET(anonymousRequest('/api/admin/observability'));
    expect(res.status).toBe(401);
  });

  it('refuses a member and a viewer', async () => {
    for (const role of ['member', 'viewer'] as const) {
      const tenant = await createTenant({ role });
      const res = await observabilityGET(requestAs(tenant, '/api/admin/observability'));
      // Operational data includes messages and stacks produced while serving
      // some tenant's request. Scrubbing reduces that exposure; the role gate
      // is the control.
      expect(res.status).toBe(403);
    }
  });

  it('serves an owner the counters, with NO Sentry configured', async () => {
    delete process.env.SENTRY_DSN;
    await withMissingTable('ActionLog', async (tx) => {
      await tx.actionLog.findMany({ take: 1 }).catch(() => undefined);
    });

    const tenant = await createTenant({ role: 'owner' });
    const res = await observabilityGET(requestAs(tenant, '/api/admin/observability'));
    expect(res.status).toBe(200);

    const body = await readJson<{
      success: boolean;
      data: {
        sentry: { configured: boolean; sent: number; failed: number };
        counters: { fingerprint: string; count: number }[];
        rates: { last15Minutes: Record<string, number> };
        limits: { ringCapacity: number };
        recent: { kind: string }[];
      };
    }>(res);

    // THIS is the no-vendor-account claim, checked: Sentry is off and the
    // operator still gets the failure, grouped, counted and inspectable.
    expect(body.data.sentry.configured).toBe(false);
    expect(body.data.counters.some((c) => c.fingerprint.startsWith('prisma:ActionLog'))).toBe(true);
    expect(body.data.rates.last15Minutes.prisma_query_error).toBeGreaterThan(0);
    expect(body.data.recent.some((e) => e.kind === 'prisma_query_error')).toBe(true);
    expect(body.data.limits.ringCapacity).toBeGreaterThan(0);
  });

  it('never returns the DSN, even when one is configured', async () => {
    process.env.SENTRY_DSN = 'https://supersecretkey@o1.ingest.sentry.io/5';
    try {
      const tenant = await createTenant({ role: 'admin' });
      const res = await observabilityGET(requestAs(tenant, '/api/admin/observability'));
      const raw = await res.text();
      expect(raw).not.toContain('supersecretkey');
    } finally {
      delete process.env.SENTRY_DSN;
    }
  });

  it('caps `limit` at the ring capacity rather than trusting the caller', async () => {
    const tenant = await createTenant({ role: 'owner' });
    const res = await observabilityGET(
      requestAs(tenant, '/api/admin/observability?limit=999999')
    );
    const body = await readJson<{ data: { limits: { returned: number; ringCapacity: number } } }>(
      res
    );
    expect(body.data.limits.returned).toBeLessThanOrEqual(body.data.limits.ringCapacity);
  });
});

// ---------------------------------------------------------------------------
// 5. /api/health — counts, not detail; and worker liveness
// ---------------------------------------------------------------------------

interface HealthBody {
  status: string;
  checks: {
    database: { status: string };
    workers: { status: string; expected: number; up: number; down: string[] };
  };
  errors: { last15Minutes: Record<string, number>; total: number; windowMinutes: number };
}

describe('GET /api/health', () => {
  it('reports error counts', async () => {
    await withMissingTable('ActionLog', async (tx) => {
      await tx.actionLog.findMany({ take: 1 }).catch(() => undefined);
    });

    const body = await readJson<HealthBody>(await healthGET());
    expect(body.checks.database.status).toBe('ok');
    expect(body.errors.windowMinutes).toBe(15);
    expect(body.errors.last15Minutes.prisma_query_error).toBeGreaterThan(0);
    expect(body.errors.total).toBeGreaterThan(0);
  });

  it('leaks no error detail on this unauthenticated route', async () => {
    await withMissingTable('ActionLog', async (tx) => {
      await tx.actionLog.findMany({ take: 1 }).catch(() => undefined);
    });

    // `src/middleware.ts` exempts /api/health from auth, so this body is
    // world-readable. A fingerprint like `prisma:ActionLog.findMany:P2021`
    // tells an anonymous caller which tables exist and which are broken.
    const raw = await (await healthGET()).text();
    expect(raw).toContain('prisma_query_error'); // the count
    expect(raw).not.toContain('ActionLog'); // never the detail
    expect(raw).not.toContain('P2021');
    expect(raw).not.toContain('fingerprint');
  });
});

// ---------------------------------------------------------------------------
// 6. Worker liveness against the real Redis this lane provisions
// ---------------------------------------------------------------------------

describe('worker liveness', () => {
  const QUEUES = ['obs-test-queue-a', 'obs-test-queue-b'];

  afterEach(async () => {
    if (!getRedisUrl()) return;
    const connection = createRedisConnection();
    try {
      await connection.srem('paf:obs:workers', ...QUEUES);
      await connection.del(...QUEUES.map((q) => `paf:obs:worker:${q}`));
    } finally {
      connection.disconnect();
    }
  });

  it('has a real Redis in this lane', () => {
    // Guards every case below from passing vacuously via the no-Redis branch.
    expect(getRedisUrl()).not.toBe('');
  });

  it('reports `unknown` when no worker has ever registered', async () => {
    const health = await readWorkerHealth();
    expect(health.workers.filter((w) => QUEUES.includes(w.name))).toHaveLength(0);
  });

  it('reports a heartbeating worker as up', async () => {
    const handle = startHeartbeat(QUEUES);
    expect(handle).not.toBeNull();
    await settle();

    const health = await readWorkerHealth();
    const mine = health.workers.filter((w) => QUEUES.includes(w.name));
    expect(mine).toHaveLength(2);
    expect(mine.every((w) => w.state === 'up')).toBe(true);
    expect(mine[0].pid).toBe(process.pid);

    await handle!.stop();
  });

  it('reports a worker that DIED as down, and says so loudly', async () => {
    // The scenario: a worker container OOMs. It never deregisters, so it is
    // still expected; its heartbeat expires, so it is not alive. From the web
    // tier this was previously indistinguishable from a healthy worker,
    // because `enqueue` returns 200 either way.
    const handle = startHeartbeat(QUEUES);
    await settle();
    await handle!.stop();

    // Simulate the unclean death: the registration survives, the heartbeat
    // does not. `stop()` above removed both, so put the registration back.
    const connection = createRedisConnection();
    try {
      await connection.sadd('paf:obs:workers', ...QUEUES);
    } finally {
      connection.disconnect();
    }

    recorder.reset();
    const health = await readWorkerHealth();

    expect(health.status).toBe('degraded');
    expect(health.down).toEqual(expect.arrayContaining(QUEUES));

    const counter = recorder
      .snapshot()
      .counters.find((c) => c.fingerprint === `worker:down:${QUEUES[0]}`);
    expect(counter?.severity).toBe('fatal');
    expect(counter?.lastMessage).toContain('accepted and not consumed');

    // And /api/health says it too, without going 503 — a dead background tier
    // must not pull every web replica out of the load balancer at once.
    const body = await readJson<HealthBody>(await healthGET());
    expect(body.checks.workers.status).toBe('degraded');
    expect(body.checks.workers.down).toEqual(expect.arrayContaining(QUEUES));
    expect(body.status).toBe('ok');
  });

  it('deregisters on a clean shutdown, so a rolling restart is not an outage', async () => {
    const handle = startHeartbeat(QUEUES);
    await settle();
    await handle!.stop();

    const health = await readWorkerHealth();
    expect(health.workers.filter((w) => QUEUES.includes(w.name))).toHaveLength(0);
    expect(health.down).not.toEqual(expect.arrayContaining(QUEUES));
  });

  it('sets a TTL on the heartbeat so a stopped process expires on its own', async () => {
    const handle = startHeartbeat(QUEUES);
    await settle();

    const connection = createRedisConnection();
    try {
      const ttl = await connection.ttl(`paf:obs:worker:${QUEUES[0]}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(HEARTBEAT_TTL_SECONDS);
    } finally {
      connection.disconnect();
      await handle!.stop();
    }
  });
});

/** The heartbeat's first write is fire-and-forget; let it land. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 250));
}
