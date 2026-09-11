/**
 * P-39 — the row exists, and it is still there after the process restarts.
 *
 * ============================================================================
 * WHY THIS FILE IS THE DELIVERABLE AND THE UNIT TESTS ARE NOT
 * ============================================================================
 *
 * `tests/unit/ai/client-metering.test.ts` proves the seam CALLS the recorder.
 * That is a claim about a function, and this repository has been burned by
 * exactly that distinction more than once: `lib/ai/usage.ts` had 21 passing
 * assertions and zero importers, and P-38's whole instrument exists because
 * "correct, tested, type-checked, lint-clean code that never ran" shipped
 * twice.
 *
 * So the claim this file makes is about a ROW: a call made through
 * `lib/ai/client.ts` puts a `UsageRecord` in Postgres, with the right model,
 * token counts, module and entity, and that row is still readable after
 * `jest.resetModules()` has thrown away every module-level object the process
 * held -- read back through a SECOND `PrismaClient` that the pre-restart code
 * never touched, which is a different process's view of the same row. The idiom
 * is `tests/db/restart-survivability.test.ts`'s; the subject is new.
 *
 * That is the discriminator between the two implementations this package chose
 * between. An in-memory `usageTracker` passes every assertion about a return
 * value and fails every assertion in this file.
 *
 * ============================================================================
 * THE ANTHROPIC SDK IS MOCKED AT THE PACKAGE BOUNDARY
 * ============================================================================
 *
 * `jest.mock('@anthropic-ai/sdk')`, not `jest.mock('@/lib/ai')`. Mocking the
 * seam would replace the code under test. Nothing here opens a socket to
 * Anthropic; every real call would cost the owner money.
 *
 * Requires a real Postgres. No skip.
 */

const messagesCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: class MockAnthropic {
    messages = {
      create: (...args: unknown[]) => messagesCreate(...args),
      stream: jest.fn(),
    };
  },
}));

import { PrismaClient } from '@prisma/client';

import { db, setupTestDatabase } from '../helpers/db';
import { createTenant, type Tenant } from '../helpers/factories';
import { generateText } from '@/lib/ai/client';
import { recordAiUsage } from '@/lib/ai/metering';
import { classifyIntent } from '@/modules/shadow/agent/intent-classifier';
import {
  createSubscription,
  recordUsage as recordPlanUsage,
  getUsageSummary as getPlanMeters,
  _resetStore as resetSubscriptionStore,
} from '@/lib/integrations/payments/subscriptions';
import { getUsageSummary as getCostSummary } from '@/engines/cost/usage-metering';
import type { AgentContext } from '@/modules/shadow/types';

setupTestDatabase();
jest.setTimeout(120_000);

/** `UsageRecord.module` reserved by `subscriptions.ts`. Duplicated on purpose. */
const PLAN_METER_MODULE = 'plan-meter';

const reply = (text: string, model: string, input: number, output: number) => ({
  model,
  content: [{ type: 'text', text }],
  usage: { input_tokens: input, output_tokens: output },
});

/** A second client — a different process's view of the same rows. */
async function withSecondClient<T>(fn: (client: PrismaClient) => Promise<T>): Promise<T> {
  const client = new PrismaClient();
  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

function agentContext(tenant: Tenant): AgentContext {
  return {
    sessionId: 'session-p39',
    user: {
      id: tenant.user.id,
      name: tenant.user.name ?? 'Test',
      email: tenant.user.email,
      preferences: {},
      timezone: 'UTC',
    },
    activeEntity: {
      id: tenant.entity.id,
      name: tenant.entity.name,
      type: tenant.entity.type,
      complianceProfile: [],
    },
    recentMessages: [],
    recentActions: [],
    timeOfDay: 'morning',
    dayOfWeek: 'Monday',
    channel: 'web',
  };
}

let tenant: Tenant;

beforeEach(async () => {
  messagesCreate.mockReset();
  tenant = await createTenant();
});

describe('P-39: an AI call through the seam becomes a durable row', () => {
  it('writes the model, token counts, module and entity — and the row OUTLIVES a restart', async () => {
    messagesCreate.mockResolvedValue(reply('hello', 'claude-sonnet-4-6', 1000, 500));

    const text = await generateText('summarise this', {
      entityId: tenant.entity.id,
      userId: tenant.user.id,
      module: 'inbox',
    });
    expect(text).toBe('hello');

    // NEAR SIDE — the row is in Postgres, not in a process-local array.
    const near = await db.usageRecord.findMany({ where: { entityId: tenant.entity.id } });
    expect(near).toHaveLength(1);
    expect(near[0].model).toBe('claude-sonnet-4-6');
    expect(near[0].inputTokens).toBe(1000);
    expect(near[0].outputTokens).toBe(500);
    expect(near[0].module).toBe('inbox');
    expect(near[0].userId).toBe(tenant.user.id);
    // 1000/1e6*3 + 500/1e6*15
    expect(near[0].cost).toBeCloseTo(0.0105, 6);

    // THE RESTART — every module-level object the process held is dropped.
    // An in-memory tracker does not come back from this. A table does.
    const rowId = near[0].id;
    jest.resetModules();

    // FAR SIDE — read through a client the pre-restart code never touched, so
    // the value cannot be coming from a cache or a module-level Map.
    const far = await withSecondClient((client) =>
      client.usageRecord.findUnique({ where: { id: rowId } })
    );
    expect(far).not.toBeNull();
    expect(far?.model).toBe('claude-sonnet-4-6');
    expect(far?.inputTokens).toBe(1000);
    expect(far?.outputTokens).toBe(500);
    expect(far?.module).toBe('inbox');
    expect(far?.entityId).toBe(tenant.entity.id);
  });

  it('meters the Shadow agent path, which used to hold the raw client', async () => {
    // `intent-classifier.ts` called `anthropic.messages.create` directly --
    // one of three files that did, between them the agent's entire model path.
    // The lint rule added by this package makes that import an error; this
    // proves the replacement actually meters rather than merely compiling.
    messagesCreate.mockResolvedValue(
      reply(
        '{"primaryIntent":"read_data","confidence":0.9,"entities":{},"reasoning":"x"}',
        'claude-sonnet-4-6',
        321,
        45
      )
    );

    await classifyIntent('what is on my calendar', agentContext(tenant));

    const rows = await db.usageRecord.findMany({ where: { entityId: tenant.entity.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].module).toBe('shadow-intent-classifier');
    expect(rows[0].inputTokens).toBe(321);
    expect(rows[0].outputTokens).toBe(45);
    expect(rows[0].userId).toBe(tenant.user.id);
  });

  it('records an unpriced model without producing a number that looks priced', async () => {
    messagesCreate.mockResolvedValue(reply('x', 'claude-sonnet-4-5', 1_000_000, 1_000_000));

    await generateText('hi', { entityId: tenant.entity.id, module: 'inbox' });

    const rows = await db.usageRecord.findMany({ where: { entityId: tenant.entity.id } });
    expect(rows).toHaveLength(1);
    // The tokens are real and are kept; the cost column is not a cost.
    expect(rows[0].inputTokens).toBe(1_000_000);
    expect(rows[0].metadata).toMatchObject({ kind: 'ai-call', priced: false });

    // And the reader refuses to present the period as a finished figure.
    const summary = await getCostSummary(
      tenant.entity.id,
      new Date(Date.now() - 60_000),
      new Date(Date.now() + 60_000)
    );
    expect(summary.ai.unpricedCalls).toBe(1);
    expect(summary.ai.costUsd).toBe(0);
    expect(summary.ai.complete).toBe(false);
    expect(summary.ai.unpricedInputTokens).toBe(1_000_000);
  });
});

describe('P-39: the AI ledger and the plan meter share a table and do not touch', () => {
  async function givenAnAiRowAndAPlanMeterRow() {
    messagesCreate.mockResolvedValue(reply('hello', 'claude-sonnet-4-6', 100, 50));
    await generateText('hi', { entityId: tenant.entity.id, module: 'inbox' });

    await createSubscription({
      userId: tenant.user.id,
      entityId: tenant.entity.id,
      planId: 'plan_starter',
    });
    await recordPlanUsage({ entityId: tenant.entity.id, metric: 'apiCallsPerMonth', count: 7 });

    // Assert the fixture, or the separation tests below become vacuous: with no
    // AI row in the table, "the plan meter does not count AI rows" passes for
    // the wrong reason. Checked here once rather than in each case.
    const seeded = await db.usageRecord.findMany({ orderBy: { module: 'asc' } });
    expect(seeded.map((r) => r.module)).toEqual(['inbox', PLAN_METER_MODULE]);
  }

  it('the plan meter does not count AI rows as plan usage', async () => {
    // `loadMeters` folds `row.inputTokens` by `row.model` over
    // `module = 'plan-meter'`. If an AI row landed in that namespace, 100 input
    // tokens would be read as 100 API calls against the plan limit and
    // `claude-sonnet-4-6` would appear as a metric name.
    await givenAnAiRowAndAPlanMeterRow();

    const meters = await getPlanMeters(tenant.entity.id);
    expect(meters.map((m) => m.metric)).toEqual(['apiCallsPerMonth']);
    expect(meters[0].count).toBe(7);
  });

  it("the plan meter's deleteMany does not sweep AI rows away", async () => {
    // `_resetStore()` issues `deleteMany({ where: { module: 'plan-meter' } })`.
    // Its own comment says the cost engine's rows "are not ours to delete"; this
    // asserts that, now that a third ledger is in the table.
    await givenAnAiRowAndAPlanMeterRow();
    expect(await db.usageRecord.count()).toBe(2);

    await resetSubscriptionStore();

    const left = await db.usageRecord.findMany();
    expect(left).toHaveLength(1);
    expect(left[0].module).toBe('inbox');
    expect(left[0].model).toBe('claude-sonnet-4-6');
    expect(await db.usageRecord.count({ where: { module: PLAN_METER_MODULE } })).toBe(0);
  });

  it('refuses to write an AI row into the plan meter namespace at all', async () => {
    // The separation is enforced at the write, not only hoped for at the read.
    const result = await recordAiUsage({
      model: 'claude-sonnet-4-6',
      inputTokens: 10,
      outputTokens: 10,
      attribution: { entityId: tenant.entity.id, module: PLAN_METER_MODULE },
    });
    expect(result).toEqual({ recorded: false, reason: 'reserved' });
    expect(await db.usageRecord.count()).toBe(0);
  });

  it('the cost engine summarises its own rows without choking on the other two', async () => {
    // REGRESSION, and it predates this package. `getUsageSummary` indexed a
    // fixed five-key object with `metadata.metricType ?? row.model`, so ANY row
    // whose model is not one of the five metric names took it to
    // `undefined.amount`. Plan-meter rows already had that shape, so
    // `GET /api/billing/usage` would 500 for any entity with a subscription
    // meter -- swallowed into a generic INTERNAL_ERROR, and invisible because
    // no test had put two kinds of row in the table at once. This test does.
    await givenAnAiRowAndAPlanMeterRow();

    const summary = await getCostSummary(
      tenant.entity.id,
      new Date(Date.now() - 60_000),
      new Date(Date.now() + 60_000)
    );

    // Neither foreign ledger leaks into this module's own metric buckets.
    expect(summary.byMetric.TOKENS).toEqual({ amount: 0, cost: 0 });
    expect(summary.byMetric.API_CALLS).toEqual({ amount: 0, cost: 0 });
    expect(summary.totalCost).toBe(0);

    // ...and the AI spend is reported beside them, complete and priced.
    expect(summary.ai.calls).toBe(1);
    expect(summary.ai.complete).toBe(true);
    expect(summary.ai.costUsd).toBeCloseTo(0.00105, 6);
    expect(summary.ai.byModel['claude-sonnet-4-6'].calls).toBe(1);
  });
});
