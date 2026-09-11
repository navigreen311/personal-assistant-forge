/**
 * P-39 — the ledger writer, at unit granularity.
 *
 * The claim that matters ("a call through the seam leaves a durable row that
 * survives a restart") is proved against a real Postgres in
 * `tests/db/ai-metering.test.ts`, because a mocked Prisma cannot observe a row.
 * What IS worth proving here is the behaviour that has to hold before the row
 * is ever attempted: the reserved-namespace refusal, the unattributed path, the
 * unpriced-model path, and the promise that a failing ledger write does not
 * take down the call it was measuring.
 */

import {
  RESERVED_MODULES,
  isAiUsageMetadata,
  recordAiUsage,
  summariseAiUsage,
} from '@/lib/ai/metering';

jest.mock('@/lib/db', () => ({
  prisma: { usageRecord: { create: jest.fn(), findMany: jest.fn() } },
}));

import { prisma } from '@/lib/db';

const create = prisma.usageRecord.create as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  create.mockResolvedValue({ id: 'row-1' });
});

describe('P-39: recordAiUsage', () => {
  it('writes the model, the token counts, the module and the entity', async () => {
    const result = await recordAiUsage({
      model: 'claude-sonnet-4-6',
      inputTokens: 1200,
      outputTokens: 340,
      attribution: { entityId: 'entity-1', userId: 'user-1', module: 'inbox' },
    });

    expect(result).toEqual({ recorded: true, id: 'row-1', priced: true, costUsd: 0.00870 });
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.entityId).toBe('entity-1');
    expect(data.userId).toBe('user-1');
    expect(data.model).toBe('claude-sonnet-4-6');
    expect(data.inputTokens).toBe(1200);
    expect(data.outputTokens).toBe(340);
    expect(data.module).toBe('inbox');
    // 1200/1e6*3 + 340/1e6*15 = 0.0036 + 0.0051
    expect(data.cost).toBeCloseTo(0.0087, 6);
    expect(data.metadata.kind).toBe('ai-call');
    expect(data.metadata.priced).toBe(true);
    expect(data.metadata.pricedAsOf).toBeTruthy();
  });

  it('refuses the plan-meter namespace rather than writing into it', async () => {
    // `subscriptions.ts` owns `module = 'plan-meter'`: it reads `model` as a
    // metric name, `inputTokens` as a count, and DELETES every row in that
    // namespace in `_resetStore()`. A row of ours there would be miscounted and
    // then swept.
    expect(RESERVED_MODULES).toContain('plan-meter');
    const result = await recordAiUsage({
      model: 'claude-sonnet-4-6',
      inputTokens: 10,
      outputTokens: 10,
      attribution: { entityId: 'entity-1', module: 'plan-meter' },
    });
    expect(result).toEqual({ recorded: false, reason: 'reserved' });
    expect(create).not.toHaveBeenCalled();
  });

  it('does not invent an entity when there is none — it reports instead', async () => {
    // `UsageRecord.entityId` is a non-null FK. Fabricating one to make the
    // insert succeed would produce a complete ledger that is wrong, which is
    // the failure mode this package exists to remove.
    const result = await recordAiUsage({
      model: 'claude-sonnet-4-6',
      inputTokens: 10,
      outputTokens: 10,
      attribution: { module: 'inbox' },
    });
    expect(result).toEqual({ recorded: false, reason: 'unattributed' });
    expect(create).not.toHaveBeenCalled();
  });

  it('records an unpriced model WITHOUT a cost that looks like a cost', async () => {
    const result = await recordAiUsage({
      model: 'some-future-model',
      inputTokens: 999_999,
      outputTokens: 999_999,
      attribution: { entityId: 'entity-1', module: 'inbox' },
    });

    expect(result).toEqual({ recorded: true, id: 'row-1', priced: false, costUsd: null });
    const data = create.mock.calls[0][0].data;
    // The tokens are real and are kept.
    expect(data.inputTokens).toBe(999_999);
    expect(data.outputTokens).toBe(999_999);
    // `cost` is Float and non-null in a frozen schema, so absence is expressed
    // in metadata. The flag is what keeps the 0 out of every total.
    expect(data.metadata.priced).toBe(false);
    expect(data.metadata.pricedAsOf).toBeUndefined();
  });

  it('does not throw when the ledger write fails — the AI call still returns', async () => {
    // A foreign key on entityId makes this a routine failure, not an exotic
    // one. Metering that can 500 the product path is worse than a missing row.
    create.mockRejectedValueOnce(new Error('FK violation on entityId'));
    await expect(
      recordAiUsage({
        model: 'claude-sonnet-4-6',
        inputTokens: 1,
        outputTokens: 1,
        attribution: { entityId: 'ghost', module: 'inbox' },
      })
    ).resolves.toEqual({ recorded: false, reason: 'write-failed' });
  });

  it('records a failed call as a row with zero tokens, not as silence', async () => {
    await recordAiUsage({
      model: 'claude-sonnet-4-6',
      inputTokens: 0,
      outputTokens: 0,
      attribution: { entityId: 'entity-1', module: 'inbox' },
      outcome: 'error',
    });
    expect(create.mock.calls[0][0].data.metadata.outcome).toBe('error');
  });
});

describe('P-39: summariseAiUsage never presents an incomplete total as a total', () => {
  const aiRow = (over: Partial<{ model: string; cost: number; priced: boolean; inputTokens: number; outputTokens: number }> = {}) => ({
    model: over.model ?? 'claude-sonnet-4-6',
    inputTokens: over.inputTokens ?? 100,
    outputTokens: over.outputTokens ?? 50,
    cost: over.cost ?? 0.001,
    metadata: { kind: 'ai-call', priced: over.priced ?? true, outcome: 'ok' },
  });

  it('sums priced rows and flags itself complete', () => {
    const s = summariseAiUsage([aiRow({ cost: 0.002 }), aiRow({ cost: 0.003 })]);
    expect(s.calls).toBe(2);
    expect(s.costUsd).toBeCloseTo(0.005, 6);
    expect(s.complete).toBe(true);
    expect(s.unpricedCalls).toBe(0);
  });

  it('excludes an unpriced row from the cost and says the total is incomplete', () => {
    const s = summariseAiUsage([
      aiRow({ cost: 0.002 }),
      aiRow({ model: 'mystery', priced: false, cost: 0, inputTokens: 900, outputTokens: 400 }),
    ]);
    expect(s.costUsd).toBeCloseTo(0.002, 6);
    expect(s.unpricedCalls).toBe(1);
    // The size of what the total omits is reported, not just its existence.
    expect(s.unpricedInputTokens).toBe(900);
    expect(s.unpricedOutputTokens).toBe(400);
    expect(s.complete).toBe(false);
    expect(s.byModel.mystery.priced).toBe(false);
  });

  it('ignores rows written by the other two ledgers in the same table', () => {
    // A plan-meter row (`module: 'plan-meter'`, model is a metric name) and a
    // cost-engine row (`metadata.metricType`) must not be folded in as AI spend.
    const s = summariseAiUsage([
      aiRow({ cost: 0.002 }),
      { model: 'apiCallsPerMonth', inputTokens: 7, outputTokens: 0, cost: 0, metadata: { metric: 'apiCallsPerMonth', count: 7 } },
      { model: 'TOKENS', inputTokens: 5000, outputTokens: 0, cost: 0.05, metadata: { metricType: 'TOKENS', amount: 5000, unitCost: 0.00001 } },
    ]);
    expect(s.calls).toBe(1);
    expect(s.costUsd).toBeCloseTo(0.002, 6);
    expect(s.inputTokens).toBe(100);
  });
});

describe('P-39: isAiUsageMetadata is a check, not a cast', () => {
  it('rejects the metadata shapes the other two ledgers write', () => {
    expect(isAiUsageMetadata({ metricType: 'TOKENS', amount: 1, unitCost: 1 })).toBe(false);
    expect(isAiUsageMetadata({ metric: 'contacts', count: 3 })).toBe(false);
    expect(isAiUsageMetadata(null)).toBe(false);
    expect(isAiUsageMetadata(undefined)).toBe(false);
    expect(isAiUsageMetadata('ai-call')).toBe(false);
    expect(isAiUsageMetadata({ kind: 'ai-call' })).toBe(false);
  });

  it('accepts what recordAiUsage writes', () => {
    expect(isAiUsageMetadata({ kind: 'ai-call', priced: true, outcome: 'ok' })).toBe(true);
  });
});
