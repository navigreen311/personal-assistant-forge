/**
 * P-39 — every Anthropic call this platform makes, written to a durable row.
 *
 * ===========================================================================
 * WHY THIS FILE, AND NOT THE ONE THAT WAS ALREADY HERE
 * ===========================================================================
 *
 * There were two AI-usage implementations in this repository and neither was
 * connected to a single API call:
 *
 *   `lib/ai/usage.ts :: usageTracker`      `private records: UsageRecord[] = []`
 *                                          -- an in-memory array. Zero importers.
 *   `engines/cost/usage-metering.ts`       persists to the `UsageRecord` Prisma
 *                                          model, but only fires when something
 *                                          POSTs `/api/billing/usage`.
 *
 * That is Decision 2's shape for the third time this run --
 * `docs/parallel-build/decision-02-throttle.md`, including its amendment:
 * "Of the two implementations, one is in-memory ... and the other ... is
 * correct by construction. Neither is wired. Delete the first and WIRE THE
 * SECOND." P-37 applied it to `pluginStore` vs `PluginRecord`. This package
 * applies it here: `lib/ai/usage.ts` is deleted, and the AI client seam now
 * writes to the `UsageRecord` table that was built for exactly this -- its
 * `model` column is documented "AI model used (e.g. claude-sonnet-4-5-...)".
 *
 * Resurrecting the tracker would have given metering that resets on every
 * deploy, which is the direction that costs money: `subscriptions.ts` records
 * that its plan counters used to do precisely that -- "every restart handed
 * every entity its full plan allowance again".
 *
 * ===========================================================================
 * CO-TENANCY: THREE LEDGERS, ONE TABLE
 * ===========================================================================
 *
 * `UsageRecord` now carries three different kinds of row, and they must not sum
 * into each other or delete each other:
 *
 *   module = 'plan-meter'        `lib/integrations/payments/subscriptions.ts`
 *                                (P-33). `model` is a METRIC NAME, `inputTokens`
 *                                is a COUNT, `cost` is always 0. Its
 *                                `_resetStore()` issues
 *                                `deleteMany({ where: { module: 'plan-meter' }})`.
 *
 *   metadata.metricType set      `engines/cost/usage-metering.ts`. `model` is a
 *                                `UsageMetricType` ('TOKENS', 'VOICE_MINUTES', ...).
 *
 *   metadata.kind = 'ai-call'    this file. `model` is a real Anthropic model id.
 *
 * Separation is enforced from both sides and asserted in
 * `tests/db/ai-metering.test.ts`:
 *
 *   - `RESERVED_MODULES` below REFUSES a write whose `module` is `plan-meter`,
 *     so an AI row can never land inside the plan meter's namespace and can
 *     never be swept by its `deleteMany`.
 *   - `metadata.kind = 'ai-call'` marks ours positively, so a reader selects
 *     rather than guesses. `engines/cost/usage-metering.ts` was reading EVERY
 *     row for the entity and indexing `byMetric[row.model]` -- which throws a
 *     TypeError the moment a row's `model` is not one of the five metric names.
 *     That was already true of plan-meter rows before this package; it is fixed
 *     there as part of this change, because adding AI rows would otherwise take
 *     `GET /api/billing/usage` from latently broken to broken.
 *
 * ===========================================================================
 * METERING NEVER BREAKS THE CALL IT METERS
 * ===========================================================================
 *
 * `recordAiUsage` does not throw. A ledger write that can take down the product
 * path is a worse trade than a missing row, and a `UsageRecord.entityId` is a
 * foreign key -- a stale or absent entity id is a perfectly ordinary way for the
 * insert to fail. Every failure is reported through P-28's recorder
 * (`src/lib/observability`) with a low-cardinality fingerprint, so the gap shows
 * up as a counter an operator can read rather than as silence. The return value
 * says what happened, the seam ignores it, and the tests do not.
 */

import { prisma } from '@/lib/db';
import { report } from '@/lib/observability';
import { PRICING_AS_OF, isPriced, priceUsd } from './pricing';

/** `metadata.kind` on every row this module writes. The positive marker. */
export const AI_USAGE_KIND = 'ai-call';

/**
 * `UsageRecord.module` values this module refuses to write into.
 *
 * `plan-meter` is `subscriptions.ts`'s reserved namespace; a row of ours inside
 * it would be counted as a plan-limit reading (with a model id read as a metric
 * name and an input-token count read as a usage count) and deleted by that
 * module's `_resetStore()`.
 */
export const RESERVED_MODULES: readonly string[] = ['plan-meter'];

/** How a call ended. A failed call still produces a row -- it still happened. */
export type AiCallOutcome = 'ok' | 'error' | 'partial';

/**
 * Who a call belongs to.
 *
 * `entityId` is optional in the type and required in practice:
 * `UsageRecord.entityId` is a non-null foreign key, so a call with no entity in
 * scope cannot be written at all. Rather than invent one, `recordAiUsage`
 * returns `unattributed` and reports it -- see `reason` below.
 */
export interface AiCallAttribution {
  entityId?: string;
  userId?: string;
  /** Which module made the call, e.g. 'inbox', 'shadow-agent'. */
  module: string;
}

export interface RecordAiUsageParams {
  model: string;
  inputTokens: number;
  outputTokens: number;
  attribution: AiCallAttribution;
  outcome?: AiCallOutcome;
  /** Wall-clock duration of the API call, when the caller measured one. */
  durationMs?: number;
}

export type RecordAiUsageResult =
  | { recorded: true; id: string; priced: boolean; costUsd: number | null }
  | {
      recorded: false;
      /**
       * `unattributed`  no entityId in scope -- the FK makes a row impossible.
       * `reserved`      the caller asked for a reserved module namespace.
       * `write-failed`  the insert threw. Reported, not raised.
       */
      reason: 'unattributed' | 'reserved' | 'write-failed';
    };

/** The metadata shape this module writes. Read it back with `isAiUsageMetadata`. */
export interface AiUsageMetadata {
  kind: typeof AI_USAGE_KIND;
  /** False when the model had no list price. The cost column is then NOT a cost. */
  priced: boolean;
  /** The date of the price list that produced `cost`. Absent when unpriced. */
  pricedAsOf?: string;
  outcome: AiCallOutcome;
  durationMs?: number;
}

/**
 * A type guard rather than a cast.
 *
 * `metadata` is `Json?`, so every reader has to narrow it somehow, and the
 * readers in `engines/cost` do it with `as { ... }` -- which asserts the shape
 * of a row that may have been written by an entirely different ledger. This
 * checks instead.
 */
export function isAiUsageMetadata(value: unknown): value is AiUsageMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.kind === AI_USAGE_KIND &&
    typeof candidate.priced === 'boolean' &&
    typeof candidate.outcome === 'string'
  );
}

/**
 * Write one AI call to the ledger. Never throws.
 *
 * The row is written even when the model has no price: the token counts are
 * real and losing them would be the larger error. It is flagged `priced: false`
 * and `cost` is left at 0, which readers MUST NOT sum -- `summariseAiUsage`
 * below keeps unpriced rows out of the total and counts them separately, so a
 * total is never presented without the number of calls it could not price.
 * `cost` is `Float` and non-null in a frozen schema, so "absent" is not a value
 * this column can hold; `metadata.priced` is how absence is expressed.
 */
export async function recordAiUsage(
  params: RecordAiUsageParams,
): Promise<RecordAiUsageResult> {
  const { model, inputTokens, outputTokens, attribution } = params;
  const outcome: AiCallOutcome = params.outcome ?? 'ok';

  if (RESERVED_MODULES.includes(attribution.module)) {
    report({
      kind: 'manual',
      severity: 'error',
      message: `AI usage refused: module is a reserved UsageRecord namespace`,
      fingerprint: `ai_usage:reserved_module:${attribution.module}`,
    });
    return { recorded: false, reason: 'reserved' };
  }

  if (!attribution.entityId) {
    // Not a silent drop: UsageRecord.entityId is a non-null FK, so there is no
    // row to write, and a counter is the only honest record of the gap.
    report({
      kind: 'manual',
      severity: 'warning',
      message: 'AI call had no entity in scope; spend is unattributable',
      fingerprint: `ai_usage:unattributed:${attribution.module}`,
      context: { model, inputTokens, outputTokens },
    });
    return { recorded: false, reason: 'unattributed' };
  }

  const priced = isPriced(model);
  const costUsd = priceUsd(model, inputTokens, outputTokens);

  if (!priced) {
    // The rule from pricing.ts, made audible. An unpriced model must never
    // produce a number that looks priced -- so it produces a counter instead.
    report({
      kind: 'manual',
      severity: 'warning',
      message: `No list price for this model; usage recorded without a cost`,
      fingerprint: `ai_usage:unpriced_model:${model}`,
      context: { module: attribution.module, inputTokens, outputTokens },
    });
  }

  const metadata: AiUsageMetadata = {
    kind: AI_USAGE_KIND,
    priced,
    outcome,
    ...(priced ? { pricedAsOf: PRICING_AS_OF } : {}),
    ...(params.durationMs === undefined ? {} : { durationMs: params.durationMs }),
  };

  try {
    const row = await prisma.usageRecord.create({
      data: {
        entityId: attribution.entityId,
        userId: attribution.userId ?? null,
        model,
        inputTokens,
        outputTokens,
        cost: costUsd ?? 0,
        module: attribution.module,
        metadata,
      },
    });
    return { recorded: true, id: row.id, priced, costUsd };
  } catch (err) {
    // A billing ledger write must not take down the product path. The FK on
    // entityId alone makes this a routine failure, not an exotic one.
    report({
      kind: 'manual',
      severity: 'error',
      message: `AI usage row could not be written: ${err instanceof Error ? err.message : String(err)}`,
      fingerprint: `ai_usage:write_failed:${attribution.module}`,
      context: { model },
    });
    return { recorded: false, reason: 'write-failed' };
  }
}

/** What a period of AI spend cost, and what part of it could not be priced. */
export interface AiSpendSummary {
  /** Sum of `cost` over PRICED rows only. Unpriced rows are excluded, not zeroed. */
  costUsd: number;
  calls: number;
  pricedCalls: number;
  /** Calls whose model had no list price. Their spend is NOT in `costUsd`. */
  unpricedCalls: number;
  inputTokens: number;
  outputTokens: number;
  /** Tokens belonging to unpriced calls -- the size of what `costUsd` omits. */
  unpricedInputTokens: number;
  unpricedOutputTokens: number;
  /** False when `unpricedCalls > 0`: `costUsd` is then a floor, not a total. */
  complete: boolean;
  byModel: Record<string, { calls: number; costUsd: number; priced: boolean }>;
}

/**
 * Fold AI rows into a summary that cannot be mistaken for a finished number.
 *
 * `complete` is the load-bearing field. A caller that renders `costUsd` without
 * looking at `complete` reproduces the bug this package exists to remove, so
 * the flag is returned beside the figure rather than left to be derived.
 */
export function summariseAiUsage(
  rows: readonly {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    metadata: unknown;
  }[],
): AiSpendSummary {
  const summary: AiSpendSummary = {
    costUsd: 0,
    calls: 0,
    pricedCalls: 0,
    unpricedCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    unpricedInputTokens: 0,
    unpricedOutputTokens: 0,
    complete: true,
    byModel: {},
  };

  for (const row of rows) {
    if (!isAiUsageMetadata(row.metadata)) continue;

    summary.calls++;
    summary.inputTokens += row.inputTokens;
    summary.outputTokens += row.outputTokens;

    const bucket = summary.byModel[row.model] ?? {
      calls: 0,
      costUsd: 0,
      priced: row.metadata.priced,
    };
    bucket.calls++;

    if (row.metadata.priced) {
      summary.pricedCalls++;
      summary.costUsd += row.cost;
      bucket.costUsd += row.cost;
    } else {
      summary.unpricedCalls++;
      summary.unpricedInputTokens += row.inputTokens;
      summary.unpricedOutputTokens += row.outputTokens;
      bucket.priced = false;
    }

    summary.byModel[row.model] = bucket;
  }

  summary.costUsd = Number(summary.costUsd.toFixed(6));
  summary.complete = summary.unpricedCalls === 0;
  return summary;
}

/** AI spend for one entity over a period, read from the durable ledger. */
export async function getAiSpend(
  entityId: string,
  startDate: Date,
  endDate: Date,
): Promise<AiSpendSummary> {
  const rows = await prisma.usageRecord.findMany({
    where: { entityId, createdAt: { gte: startDate, lte: endDate } },
  });
  return summariseAiUsage(rows);
}
