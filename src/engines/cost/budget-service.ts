import { generateText } from '@/lib/ai';
import { prisma } from '@/lib/db';
import type { BudgetConfig, BudgetAlert } from './types';

// Helper to map Prisma Budget row → BudgetConfig
function toBudgetConfig(row: {
  entityId: string;
  amount: number;
  spent: number;
  startDate: Date | null;
  endDate: Date | null;
  alerts: unknown;
}): BudgetConfig {
  const alertsData = (row.alerts ?? {}) as {
    alertThresholds?: number[];
    overageBehavior?: string;
  };

  const now = new Date();
  return {
    entityId: row.entityId,
    monthlyCapUsd: row.amount,
    alertThresholds: alertsData.alertThresholds ?? [0.75, 0.90, 1.0],
    overageBehavior:
      (alertsData.overageBehavior as BudgetConfig['overageBehavior']) ?? 'WARN',
    currentSpend: row.spent,
    periodStart: row.startDate ?? new Date(now.getFullYear(), now.getMonth(), 1),
    periodEnd:
      row.endDate ??
      new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };
}

export async function setBudget(
  entityId: string,
  monthlyCapUsd: number,
  alertThresholds?: number[],
  overageBehavior?: string
): Promise<BudgetConfig> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const thresholds = alertThresholds ?? [0.75, 0.90, 1.0];
  const behavior = overageBehavior ?? 'WARN';

  // Check for an existing active AI budget to preserve currentSpend
  const existing = await prisma.budget.findFirst({
    where: { entityId, category: 'ai', status: 'active' },
  });

  const row = await prisma.budget.upsert({
    where: { id: existing?.id ?? '' },
    create: {
      entityId,
      name: 'AI Budget',
      amount: monthlyCapUsd,
      spent: 0,
      period: 'monthly',
      category: 'ai',
      startDate: periodStart,
      endDate: periodEnd,
      alerts: { alertThresholds: thresholds, overageBehavior: behavior },
      status: 'active',
    },
    update: {
      amount: monthlyCapUsd,
      alerts: { alertThresholds: thresholds, overageBehavior: behavior },
    },
  });

  return toBudgetConfig(row);
}

export async function getBudget(entityId: string): Promise<BudgetConfig | null> {
  const row = await prisma.budget.findFirst({
    where: { entityId, category: 'ai', status: 'active' },
  });
  return row ? toBudgetConfig(row) : null;
}

export async function checkBudget(
  entityId: string,
  additionalCost: number
): Promise<{ allowed: boolean; alerts: BudgetAlert[]; remainingBudget: number }> {
  const budget = await getBudget(entityId);
  if (!budget) {
    return { allowed: true, alerts: [], remainingBudget: Infinity };
  }

  const projectedSpend = budget.currentSpend + additionalCost;
  const percentUsed = projectedSpend / budget.monthlyCapUsd;
  const remainingBudget = Math.max(0, budget.monthlyCapUsd - projectedSpend);

  const alerts: BudgetAlert[] = [];
  for (const threshold of budget.alertThresholds) {
    if (percentUsed >= threshold) {
      alerts.push({
        entityId,
        threshold,
        currentSpend: projectedSpend,
        monthlyCapUsd: budget.monthlyCapUsd,
        percentUsed: Math.round(percentUsed * 100) / 100,
        message: `Budget ${Math.round(threshold * 100)}% threshold reached: $${projectedSpend.toFixed(2)} of $${budget.monthlyCapUsd.toFixed(2)} used.`,
        triggeredAt: new Date(),
      });
    }
  }

  let allowed = true;
  if (projectedSpend > budget.monthlyCapUsd) {
    if (budget.overageBehavior === 'BLOCK') {
      allowed = false;
    }
  }

  return { allowed, alerts, remainingBudget };
}

export async function getBudgetAlerts(entityId: string): Promise<BudgetAlert[]> {
  const result = await checkBudget(entityId, 0);
  const budget = await getBudget(entityId);

  // Enhance alert messages with AI-generated recommendations
  if (result.alerts.length > 0 && budget) {
    try {
      const aiMessage = await generateText(
        `Provide a concise budget optimization recommendation for this entity.

Current spending: $${budget.currentSpend.toFixed(2)}
Monthly cap: $${budget.monthlyCapUsd.toFixed(2)}
Percent used: ${Math.round((budget.currentSpend / budget.monthlyCapUsd) * 100)}%
Remaining budget: $${result.remainingBudget.toFixed(2)}
Overage behavior: ${budget.overageBehavior}
Alerts triggered: ${result.alerts.length}

Write a brief, actionable recommendation (1-2 sentences) on how to optimize spending.`,
        { temperature: 0.5 }
      );

      // Enhance the last alert with AI recommendation
      const lastAlert = result.alerts[result.alerts.length - 1];
      lastAlert.message = `${lastAlert.message} Recommendation: ${aiMessage}`;
    } catch {
      // Keep original alert messages on AI failure
    }
  }

  return result.alerts;
}

export async function resetBudgetPeriod(entityId: string): Promise<BudgetConfig> {
  const existing = await prisma.budget.findFirst({
    where: { entityId, category: 'ai', status: 'active' },
  });

  if (!existing) {
    throw new Error(`No budget found for entity ${entityId}`);
  }

  const now = new Date();
  const row = await prisma.budget.update({
    where: { id: existing.id },
    data: {
      spent: 0,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
    },
  });

  return toBudgetConfig(row);
}

// Helper to add spend (used internally by metering integration)
export async function addSpend(entityId: string, amount: number): Promise<void> {
  const existing = await prisma.budget.findFirst({
    where: { entityId, category: 'ai', status: 'active' },
  });

  if (existing) {
    await prisma.budget.update({
      where: { id: existing.id },
      data: { spent: existing.spent + amount },
    });
  }
}

// For testing: reset the budget store
export async function _resetBudgetStore(): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    await prisma.budget.deleteMany();
  }
}
