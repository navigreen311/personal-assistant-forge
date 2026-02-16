import { prisma } from '@/lib/db';
import type { UsageMetricType, UsageRecord } from './types';

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
}> {
  const rows = await prisma.usageRecord.findMany({
    where: {
      entityId,
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  const filtered: UsageRecord[] = rows.map(toUsageRecord);

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

  return { byMetric, totalCost };
}

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
