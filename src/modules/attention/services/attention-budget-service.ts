import type { AttentionBudget } from '../types';

function getPrisma() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/lib/db').prisma;
}

const budgetStore = new Map<string, AttentionBudget>();

function getDefaultBudget(userId: string): AttentionBudget {
  const resetAt = new Date();
  resetAt.setHours(24, 0, 0, 0);
  return {
    userId,
    dailyBudget: 10,
    usedToday: 0,
    remaining: 10,
    resetAt,
  };
}

function checkAndReset(budget: AttentionBudget): AttentionBudget {
  if (new Date() >= budget.resetAt) {
    budget.usedToday = 0;
    budget.remaining = budget.dailyBudget;
    const resetAt = new Date();
    resetAt.setHours(24, 0, 0, 0);
    budget.resetAt = resetAt;
  }
  return budget;
}

export async function getBudget(userId: string): Promise<AttentionBudget> {
  let budget = budgetStore.get(userId);
  if (!budget) {
    budget = getDefaultBudget(userId);
    budgetStore.set(userId, budget);
  }
  return checkAndReset(budget);
}

export async function consumeBudget(
  userId: string,
  amount = 1
): Promise<{ allowed: boolean; budget: AttentionBudget }> {
  const budget = await getBudget(userId);
  if (budget.remaining < amount) {
    return { allowed: false, budget };
  }
  budget.usedToday += amount;
  budget.remaining = budget.dailyBudget - budget.usedToday;
  budgetStore.set(userId, budget);
  return { allowed: true, budget };
}

export async function setBudget(userId: string, dailyBudget: number): Promise<AttentionBudget> {
  const budget = await getBudget(userId);
  budget.dailyBudget = dailyBudget;
  budget.remaining = Math.max(0, dailyBudget - budget.usedToday);
  budgetStore.set(userId, budget);
  return budget;
}

export async function resetBudget(userId: string): Promise<AttentionBudget> {
  const budget = await getBudget(userId);
  budget.usedToday = 0;
  budget.remaining = budget.dailyBudget;
  const resetAt = new Date();
  resetAt.setHours(24, 0, 0, 0);
  budget.resetAt = resetAt;
  budgetStore.set(userId, budget);
  return budget;
}

export async function deductBudget(
  userId: string,
  amount: number,
  reason: string
): Promise<{ allowed: boolean; overBudget: boolean; budget: AttentionBudget }> {
  const budget = await getBudget(userId);
  const overBudget = budget.remaining <= 0;

  budget.usedToday += amount;
  budget.remaining = budget.dailyBudget - budget.usedToday;
  budgetStore.set(userId, budget);

  // Log deduction
  try {
    await getPrisma().actionLog.create({
      data: {
        actor: userId,
        actorId: userId,
        actionType: 'BUDGET_DEDUCTION',
        target: userId,
        reason: `${reason} (amount: ${amount})`,
        blastRadius: 'LOW',
        reversible: false,
        status: overBudget ? 'OVER_BUDGET' : 'COMPLETED',
      },
    });
  } catch {
    // Best-effort logging
  }

  return {
    allowed: !overBudget,
    overBudget,
    budget,
  };
}

export async function setBudgetLimit(userId: string, dailyLimit: number): Promise<AttentionBudget> {
  return setBudget(userId, dailyLimit);
}

export async function getBudgetHistory(
  userId: string,
  days: number
): Promise<Array<{ reason: string; timestamp: Date; status: string }>> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    const logs = await getPrisma().actionLog.findMany({
      where: {
        actorId: userId,
        actionType: 'BUDGET_DEDUCTION',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
    });

    return logs.map((log: { reason: string; timestamp: Date; status: string }) => ({
      reason: log.reason,
      timestamp: log.timestamp,
      status: log.status,
    }));
  } catch {
    return [];
  }
}

export async function isLowBudget(
  userId: string,
  threshold = 0.2
): Promise<{ isLow: boolean; remaining: number }> {
  const budget = await getBudget(userId);
  const ratio = budget.dailyBudget > 0 ? budget.remaining / budget.dailyBudget : 0;
  return {
    isLow: ratio <= threshold,
    remaining: budget.remaining,
  };
}

export { budgetStore };
