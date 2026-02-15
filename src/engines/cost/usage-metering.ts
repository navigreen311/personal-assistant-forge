import type { UsageMetricType, UsageRecord } from './types';
const uuidv4 = () => crypto.randomUUID();

// In-memory usage store (placeholder for database-backed storage)
const usageRecords: UsageRecord[] = [];

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
  const record: UsageRecord = {
    id: uuidv4(),
    entityId,
    metricType,
    amount,
    unitCost,
    totalCost: amount * unitCost,
    source,
    timestamp: new Date(),
  };
  usageRecords.push(record);
  return record;
}

export async function getUsageSummary(
  entityId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  byMetric: Record<UsageMetricType, { amount: number; cost: number }>;
  totalCost: number;
}> {
  const filtered = usageRecords.filter(
    r => r.entityId === entityId && r.timestamp >= startDate && r.timestamp <= endDate
  );

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

  const entityRecords = usageRecords.filter(r => r.entityId === entityId);

  const todaySpend = entityRecords
    .filter(r => r.timestamp >= startOfDay)
    .reduce((sum, r) => sum + r.totalCost, 0);

  const monthSpend = entityRecords
    .filter(r => r.timestamp >= startOfMonth)
    .reduce((sum, r) => sum + r.totalCost, 0);

  const sourceCosts = new Map<string, number>();
  for (const record of entityRecords.filter(r => r.timestamp >= startOfMonth)) {
    sourceCosts.set(record.source, (sourceCosts.get(record.source) ?? 0) + record.totalCost);
  }

  const topSources = Array.from(sourceCosts.entries())
    .map(([source, cost]) => ({ source, cost }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  return { todaySpend, monthSpend, topSources };
}

// For testing: reset the in-memory store
export function _resetUsageStore(): void {
  usageRecords.length = 0;
}

// For testing: get all records
export function _getUsageRecords(): UsageRecord[] {
  return usageRecords;
}
