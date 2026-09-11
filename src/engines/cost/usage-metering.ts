import { prisma } from '@/lib/db';
import { summariseAiUsage, type AiSpendSummary } from '@/lib/ai/metering';
import type { UsageMetricType, UsageRecord } from './types';

/**
 * P-39 — three ledgers share the `UsageRecord` table, and this one only owns
 * the rows it wrote.
 *
 * `getUsageSummary` and `getRealtimeUsage` both read EVERY row for the entity
 * and treat `metadata.metricType ?? row.model` as a `UsageMetricType`. That is
 * a cast, not a check, and `getUsageSummary` then indexes a fixed five-key
 * object with it:
 *
 *     byMetric[record.metricType].amount += record.amount;   // TypeError
 *
 * Any row whose model is not one of the five metric names takes that line to
 * `undefined.amount`. It was ALREADY reachable before this package:
 * `subscriptions.ts` (P-33) writes plan-meter rows into this table with
 * `model` set to a plan metric name, so an entity with a subscription meter and
 * a billing-usage read would 500 on `GET /api/billing/usage`. Nothing caught it
 * because the route swallows the throw into a generic INTERNAL_ERROR and no
 * test had both kinds of row in the table at once.
 *
 * P-39 adds a third kind -- AI calls, whose `model` is a real Anthropic model
 * id -- which would have made a latent break a certain one. So the fold now
 * SELECTS this module's own rows by the positive marker it writes
 * (`metadata.metricType`) rather than assuming every row is its own, and the AI
 * rows are summarised separately by their own owner and returned beside it.
 */
function ownMetricType(row: { model: string; metadata: unknown }): UsageMetricType | null {
  const meta =
    typeof row.metadata === 'object' && row.metadata !== null
      ? (row.metadata as Record<string, unknown>)
      : {};
  const candidate = typeof meta.metricType === 'string' ? meta.metricType : row.model;
  return isUsageMetricType(candidate) ? candidate : null;
}

function isUsageMetricType(value: string): value is UsageMetricType {
  return (
    value === 'TOKENS' ||
    value === 'VOICE_MINUTES' ||
    value === 'STORAGE_MB' ||
    value === 'WORKFLOW_RUNS' ||
    value === 'API_CALLS'
  );
}

const UNIT_COSTS: Record<UsageMetricType, number> = {
  TOKENS: 0.00001,
  VOICE_MINUTES: 0.05,
  STORAGE_MB: 0.01,
  WORKFLOW_RUNS: 0.10,
  API_CALLS: 0.001,
};

export function getUnitCost(metricType: UsageMetricType): number {
  return UNIT_COSTS[metricType];
}

export async function recordUsage(
  entityId: string,
  metricType: UsageMetricType,
  amount: number,
  source: string
): Promise<UsageRecord> {
  const unitCost = getUnitCost(metricType);
  const totalCost = amount * unitCost;

  const row = await prisma.usageRecord.create({
    data: {
      entityId,
      model: metricType,
      inputTokens: metricType === 'TOKENS' ? amount : 0,
      outputTokens: 0,
      cost: totalCost,
      module: source,
      metadata: { metricType, amount, unitCost },
    },
  });

  return {
    id: row.id,
    entityId: row.entityId,
    metricType: (row.metadata as { metricType: UsageMetricType })?.metricType ?? (row.model as UsageMetricType),
    amount: (row.metadata as { amount: number })?.amount ?? 0,
    unitCost: (row.metadata as { unitCost: number })?.unitCost ?? 0,
    totalCost: row.cost,
    source: row.module,
    timestamp: row.createdAt,
  };
}

// Helper to map a Prisma UsageRecord row → in-memory UsageRecord type
function toUsageRecord(row: {
  id: string;
  entityId: string;
  model: string;
  cost: number;
  module: string;
  createdAt: Date;
  metadata: unknown;
}): UsageRecord {
  const meta = (row.metadata ?? {}) as {
    metricType?: UsageMetricType;
    amount?: number;
    unitCost?: number;
  };

  return {
    id: row.id,
    entityId: row.entityId,
    metricType: (meta.metricType ?? row.model) as UsageMetricType,
    amount: meta.amount ?? 0,
    unitCost: meta.unitCost ?? 0,
    totalCost: row.cost,
    source: row.module,
    timestamp: row.createdAt,
  };
}

export async function getUsageSummary(
  entityId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  byMetric: Record<UsageMetricType, { amount: number; cost: number }>;
  totalCost: number;
  /**
   * P-39: AI model spend for the same window, read from the same table but
   * folded by its own owner. `ai.complete` is false when a call could not be
   * priced, in which case `ai.costUsd` is a floor and not a total.
   */
  ai: AiSpendSummary;
}> {
  const rows = await prisma.usageRecord.findMany({
    where: {
      entityId,
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  // P-39: this module's own rows only -- see `ownMetricType` above.
  const filtered: UsageRecord[] = rows.filter((row) => ownMetricType(row) !== null).map(toUsageRecord);
  const ai = summariseAiUsage(rows);

  const byMetric: Record<UsageMetricType, { amount: number; cost: number }> = {
    TOKENS: { amount: 0, cost: 0 },
    VOICE_MINUTES: { amount: 0, cost: 0 },
    STORAGE_MB: { amount: 0, cost: 0 },
    WORKFLOW_RUNS: { amount: 0, cost: 0 },
    API_CALLS: { amount: 0, cost: 0 },
  };

  let totalCost = 0;
  for (const record of filtered) {
    byMetric[record.metricType].amount += record.amount;
    byMetric[record.metricType].cost += record.totalCost;
    totalCost += record.totalCost;
  }

  return { byMetric, totalCost, ai };
}

/**
 * P-39 note, recorded rather than fixed: this function sums `cost` over EVERY
 * row for the entity, so it folds all three ledgers together. It does not
 * throw the way `getUsageSummary` did -- it accumulates into a Map rather than
 * indexing a fixed object -- but its `todaySpend`/`monthSpend` include
 * plan-meter rows (always 0) and AI rows, and an AI row whose model had no list
 * price contributes 0 as though the call were free. It has NO product caller
 * (only `tests/unit/engines/cost-usage-metering.test.ts` references it), so
 * changing its contract here would be changing an interface nothing uses;
 * whoever wires it should read AI spend through `getUsageSummary().ai`, which
 * carries `complete`.
 */
export async function getRealtimeUsage(entityId: string): Promise<{
  todaySpend: number;
  monthSpend: number;
  topSources: { source: string; cost: number }[];
}> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const monthRows = await prisma.usageRecord.findMany({
    where: {
      entityId,
      createdAt: { gte: startOfMonth },
    },
  });

  const entityRecords: UsageRecord[] = monthRows.map(toUsageRecord);

  const todaySpend = entityRecords
    .filter((r: UsageRecord) => r.timestamp >= startOfDay)
    .reduce((sum: number, r: UsageRecord) => sum + r.totalCost, 0);

  const monthSpend = entityRecords
    .reduce((sum: number, r: UsageRecord) => sum + r.totalCost, 0);

  const sourceCosts = new Map<string, number>();
  for (const record of entityRecords) {
    sourceCosts.set(record.source, (sourceCosts.get(record.source) ?? 0) + record.totalCost);
  }

  const topSources = Array.from(sourceCosts.entries())
    .map(([source, cost]) => ({ source, cost }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  return { todaySpend, monthSpend, topSources };
}

// For testing: reset the usage store
export async function _resetUsageStore(): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    await prisma.usageRecord.deleteMany();
  }
}

// For testing / cost-attribution: get all records
export async function _getUsageRecords(): Promise<UsageRecord[]> {
  const rows = await prisma.usageRecord.findMany();
  return rows.map(toUsageRecord);
}
