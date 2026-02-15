import type { AttentionBudget } from '../types';

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

export { budgetStore };
