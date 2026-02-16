import { prisma } from '@/lib/db';
import type { LLMCostDashboard } from '../types';

const DEFAULT_BUDGET_CAP = 500; // $500/month default

export async function getCostDashboard(
  entityId: string,
  period: string
): Promise<LLMCostDashboard> {
  // Parse period to date range
  const { startDate, endDate } = parsePeriodRange(period);

  // Get action logs with costs for this entity
  const actionLogs = await prisma.actionLog.findMany({
    where: {
      actor: 'AI',
      timestamp: { gte: startDate, lte: endDate },
    },
  });

  // Aggregate by feature (actionType)
  const featureMap = new Map<string, { cost: number; tokenCount: number }>();

  for (const log of actionLogs) {
    const feature = log.actionType;
    const cost = log.cost ?? 0;
    const existing = featureMap.get(feature) ?? { cost: 0, tokenCount: 0 };
    existing.cost += cost;
    // Estimate token count from cost (rough: $0.01 per 1K tokens)
    existing.tokenCount += Math.round(cost * 100000);
    featureMap.set(feature, existing);
  }

  const byFeature = Array.from(featureMap.entries()).map(
    ([feature, data]) => ({
      feature,
      cost: Math.round(data.cost * 100) / 100,
      tokenCount: data.tokenCount,
    })
  );

  const totalCostUsd =
    Math.round(byFeature.reduce((sum, f) => sum + f.cost, 0) * 100) / 100;

  // Calculate projected month-end spend
  const now = new Date();
  const daysInPeriod = Math.max(
    1,
    (endDate.getTime() - startDate.getTime()) / 86400000
  );
  const daysElapsed = Math.max(
    1,
    (now.getTime() - startDate.getTime()) / 86400000
  );
  const dailyBurn = totalCostUsd / daysElapsed;
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();
  const projectedMonthEnd = Math.round(dailyBurn * daysInMonth * 100) / 100;

  const percentUsed =
    Math.round((totalCostUsd / DEFAULT_BUDGET_CAP) * 10000) / 100;

  const alerts = getCostAlerts_internal(
    totalCostUsd,
    DEFAULT_BUDGET_CAP,
    projectedMonthEnd,
    byFeature
  );

  return {
    entityId,
    period,
    totalCostUsd,
    byFeature,
    budgetCapUsd: DEFAULT_BUDGET_CAP,
    percentUsed,
    projectedMonthEnd,
    alerts,
  };
}

export async function getCostAlerts(entityId: string): Promise<string[]> {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dashboard = await getCostDashboard(entityId, period);
  return dashboard.alerts;
}

function getCostAlerts_internal(
  totalCost: number,
  budgetCap: number,
  projected: number,
  byFeature: { feature: string; cost: number; tokenCount: number }[]
): string[] {
  const alerts: string[] = [];

  if (totalCost >= budgetCap) {
    alerts.push(`Budget exceeded: $${totalCost} spent of $${budgetCap} cap`);
  } else if (totalCost >= budgetCap * 0.8) {
    alerts.push(
      `Approaching budget limit: $${totalCost} of $${budgetCap} (${Math.round((totalCost / budgetCap) * 100)}%)`
    );
  }

  if (projected > budgetCap * 1.2) {
    alerts.push(
      `Projected month-end spend ($${projected}) exceeds budget by ${Math.round(((projected - budgetCap) / budgetCap) * 100)}%`
    );
  }

  // Flag features consuming > 40% of budget
  for (const feature of byFeature) {
    if (feature.cost > totalCost * 0.4 && totalCost > 0) {
      alerts.push(
        `Feature "${feature.feature}" consuming ${Math.round((feature.cost / totalCost) * 100)}% of total spend`
      );
    }
  }

  return alerts;
}

function parsePeriodRange(period: string): {
  startDate: Date;
  endDate: Date;
} {
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = parseInt(monthMatch[1]);
    const month = parseInt(monthMatch[2]) - 1;
    return {
      startDate: new Date(year, month, 1),
      endDate: new Date(year, month + 1, 0, 23, 59, 59, 999),
    };
  }

  // Default to current month
  const now = new Date();
  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), 1),
    endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}
