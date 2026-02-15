import type { UsageMetricType, WorkflowCostAttribution } from './types';
import { _getUsageRecords } from './usage-metering';

export async function attributeCostToWorkflow(
  workflowId: string,
  startDate: Date,
  endDate: Date
): Promise<WorkflowCostAttribution> {
  const records = _getUsageRecords().filter(
    r =>
      r.source === workflowId &&
      r.timestamp >= startDate &&
      r.timestamp <= endDate
  );

  const breakdownMap = new Map<UsageMetricType, { cost: number; amount: number }>();
  let totalCostUsd = 0;

  for (const record of records) {
    const existing = breakdownMap.get(record.metricType) ?? { cost: 0, amount: 0 };
    existing.cost += record.totalCost;
    existing.amount += record.amount;
    breakdownMap.set(record.metricType, existing);
    totalCostUsd += record.totalCost;
  }

  const breakdown = Array.from(breakdownMap.entries()).map(([metricType, data]) => ({
    metricType,
    cost: data.cost,
    amount: data.amount,
  }));

  // Count unique runs (group by day as proxy for runs)
  const uniqueDays = new Set(records.map(r => r.timestamp.toISOString().slice(0, 10)));
  const totalRuns = Math.max(uniqueDays.size, 1);

  return {
    workflowId,
    workflowName: `Workflow ${workflowId}`,
    totalCostUsd,
    costPerRun: totalRuns > 0 ? totalCostUsd / totalRuns : 0,
    totalRuns,
    breakdown,
    lastRunDate: records.length > 0
      ? records[records.length - 1].timestamp
      : new Date(),
  };
}

export async function getTopCostlyWorkflows(
  entityId: string,
  limit = 10
): Promise<WorkflowCostAttribution[]> {
  const records = _getUsageRecords().filter(r => {
    // Infer entity from source pattern or fall back to matching all
    return r.entityId === entityId;
  });

  // Group by source (workflow ID)
  const workflowCosts = new Map<string, number>();
  for (const record of records) {
    workflowCosts.set(record.source, (workflowCosts.get(record.source) ?? 0) + record.totalCost);
  }

  // Sort and get top N
  const topWorkflows = Array.from(workflowCosts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const attributions = await Promise.all(
    topWorkflows.map(([wfId]) => attributeCostToWorkflow(wfId, thirtyDaysAgo, now))
  );

  return attributions;
}

export async function getCostTimeline(
  entityId: string,
  days: number
): Promise<{ date: string; cost: number }[]> {
  const now = new Date();
  const records = _getUsageRecords().filter(r => r.entityId === entityId);

  const timeline: { date: string; cost: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);

    const dayCost = records
      .filter(r => r.timestamp.toISOString().slice(0, 10) === dateStr)
      .reduce((sum, r) => sum + r.totalCost, 0);

    timeline.push({ date: dateStr, cost: Math.round(dayCost * 100) / 100 });
  }

  return timeline;
}
