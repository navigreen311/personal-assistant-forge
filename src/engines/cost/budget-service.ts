import type { BudgetConfig, BudgetAlert } from './types';

// In-memory budget store (placeholder for database-backed storage)
const budgets = new Map<string, BudgetConfig>();

export async function setBudget(
  entityId: string,
  monthlyCapUsd: number,
  alertThresholds?: number[],
  overageBehavior?: string
): Promise<BudgetConfig> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const existing = budgets.get(entityId);
  const config: BudgetConfig = {
    entityId,
    monthlyCapUsd,
    alertThresholds: alertThresholds ?? [0.75, 0.90, 1.0],
    overageBehavior: (overageBehavior as BudgetConfig['overageBehavior']) ?? 'WARN',
    currentSpend: existing?.currentSpend ?? 0,
    periodStart: existing?.periodStart ?? periodStart,
    periodEnd: existing?.periodEnd ?? periodEnd,
  };

  budgets.set(entityId, config);
  return config;
}

export async function getBudget(entityId: string): Promise<BudgetConfig | null> {
  return budgets.get(entityId) ?? null;
}

export async function checkBudget(
  entityId: string,
  additionalCost: number
): Promise<{ allowed: boolean; alerts: BudgetAlert[]; remainingBudget: number }> {
  const budget = budgets.get(entityId);
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
  return result.alerts;
}

export async function resetBudgetPeriod(entityId: string): Promise<BudgetConfig> {
  const budget = budgets.get(entityId);
  if (!budget) {
    throw new Error(`No budget found for entity ${entityId}`);
  }

  const now = new Date();
  budget.currentSpend = 0;
  budget.periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  budget.periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  budgets.set(entityId, budget);
  return budget;
}

// Helper to add spend (used internally by metering integration)
export function addSpend(entityId: string, amount: number): void {
  const budget = budgets.get(entityId);
  if (budget) {
    budget.currentSpend += amount;
  }
}

// For testing: reset the in-memory store
export function _resetBudgetStore(): void {
  budgets.clear();
}
