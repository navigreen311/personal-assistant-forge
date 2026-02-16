import { prisma } from '@/lib/db';
import type { UsageMetricType, WorkflowCostAttribution } from './types';

export async function attributeCostToWorkflow(
  workflowId: string,
  startDate: Date,
  endDate: Date
): Promise<WorkflowCostAttribution> {
  const rows = await prisma.usageRecord.findMany({
    where: {
      module: workflowId,
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  const breakdownMap = new Map<UsageMetricType, { cost: number; amount: number }>();
  let totalCostUsd = 0;

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as { metricType?: string; amount?: number };
    const metricType = (meta.metricType ?? row.model) as UsageMetricType;
    const amount = meta.amount ?? 0;

    const existing = breakdownMap.get(metricType) ?? { cost: 0, amount: 0 };
    existing.cost += row.cost;
    existing.amount += amount;
    breakdownMap.set(metricType, existing);
    totalCostUsd += row.cost;
  }

  const breakdown = Array.from(breakdownMap.entries()).map(([metricType, data]) => ({
    metricType,
    cost: data.cost,
    amount: data.amount,
  }));

  // Count unique runs (group by day as proxy for runs)
  const uniqueDays = new Set(rows.map((r: { createdAt: Date }) => r.createdAt.toISOString().slice(0, 10)));
  const totalRuns = Math.max(uniqueDays.size, 1);

  return {
    workflowId,
    workflowName: `Workflow ${workflowId}`,
    totalCostUsd,
    costPerRun: totalRuns > 0 ? totalCostUsd / totalRuns : 0,
    totalRuns,
    breakdown,
    lastRunDate: rows.length > 0
      ? rows[rows.length - 1].createdAt
      : new Date(),
  };
}

export async function getTopCostlyWorkflows(
  entityId: string,
  limit = 10
): Promise<WorkflowCostAttribution[]> {
  const rows = await prisma.usageRecord.findMany({
    where: { entityId },
  });

  // Group by module (workflow ID)
  const workflowCosts = new Map<string, number>();
  for (const row of rows) {
    workflowCosts.set(row.module, (workflowCosts.get(row.module) ?? 0) + row.cost);
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
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0);

  const rows = await prisma.usageRecord.findMany({
    where: {
      entityId,
      createdAt: { gte: startDate },
    },
  });

  // Build a cost-per-day map
  const dayCostMap = new Map<string, number>();
  for (const row of rows) {
    const dateStr = row.createdAt.toISOString().slice(0, 10);
    dayCostMap.set(dateStr, (dayCostMap.get(dateStr) ?? 0) + row.cost);
  }

  const timeline: { date: string; cost: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    const cost = dayCostMap.get(dateStr) ?? 0;
    timeline.push({ date: dateStr, cost: Math.round(cost * 100) / 100 });
  }

  return timeline;
}
