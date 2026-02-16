import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import type { Budget, BudgetCategory, BudgetForecast } from '@/modules/finance/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseBudgetFromDocument(doc: {
  id: string;
  entityId: string;
  title: string;
  content: string | null;
}): Budget {
  const data = doc.content ? JSON.parse(doc.content) : {};
  return {
    id: doc.id,
    entityId: doc.entityId,
    name: doc.title,
    period: {
      start: new Date(data.periodStart),
      end: new Date(data.periodEnd),
    },
    categories: data.categories ?? [],
    totalBudgeted: data.totalBudgeted ?? 0,
    totalSpent: data.totalSpent ?? 0,
    remainingBudget: data.remainingBudget ?? 0,
    status: data.status ?? 'DRAFT',
  };
}

export async function createBudget(
  data: Omit<Budget, 'id' | 'totalSpent' | 'remainingBudget'>
): Promise<Budget> {
  const totalBudgeted = round2(
    data.categories.reduce((sum, cat) => sum + cat.budgeted, 0)
  );

  const categories: BudgetCategory[] = data.categories.map((cat) => ({
    ...cat,
    spent: 0,
    remaining: cat.budgeted,
    percentUsed: 0,
    forecast: 0,
    alert: null,
  }));

  const content = {
    periodStart: data.period.start.toISOString(),
    periodEnd: data.period.end.toISOString(),
    categories,
    totalBudgeted,
    totalSpent: 0,
    remainingBudget: totalBudgeted,
    status: data.status,
  };

  const doc = await prisma.document.create({
    data: {
      title: data.name,
      entityId: data.entityId,
      type: 'REPORT',
      content: JSON.stringify(content),
      status: 'DRAFT',
    },
  });

  return {
    id: doc.id,
    entityId: data.entityId,
    name: data.name,
    period: data.period,
    categories,
    totalBudgeted,
    totalSpent: 0,
    remainingBudget: totalBudgeted,
    status: data.status,
  };
}

export async function getBudgetWithActuals(id: string): Promise<Budget> {
  const doc = await prisma.document.findUniqueOrThrow({ where: { id } });
  const budget = parseBudgetFromDocument(doc);

  const expenses = await prisma.financialRecord.findMany({
    where: {
      entityId: budget.entityId,
      type: 'EXPENSE',
      createdAt: { gte: budget.period.start, lte: budget.period.end },
    },
  });

  const spentByCategory = new Map<string, number>();
  for (const exp of expenses) {
    spentByCategory.set(
      exp.category,
      round2((spentByCategory.get(exp.category) ?? 0) + exp.amount)
    );
  }

  const categories: BudgetCategory[] = budget.categories.map((cat) => {
    const spent = round2(spentByCategory.get(cat.category) ?? 0);
    const remaining = round2(cat.budgeted - spent);
    const percentUsed = cat.budgeted === 0 ? 0 : round2((spent / cat.budgeted) * 100);

    let alert: BudgetCategory['alert'] = 'ON_TRACK';
    if (percentUsed >= 100) alert = 'OVER_BUDGET';
    else if (percentUsed >= 80) alert = 'WARNING';

    return {
      category: cat.category,
      budgeted: cat.budgeted,
      spent,
      remaining,
      percentUsed,
      forecast: cat.forecast,
      alert,
    };
  });

  const totalSpent = round2(categories.reduce((sum, c) => sum + c.spent, 0));
  const remainingBudget = round2(budget.totalBudgeted - totalSpent);

  return {
    ...budget,
    categories,
    totalSpent,
    remainingBudget,
  };
}

export async function forecastSpending(
  entityId: string,
  category: string,
  months: number
): Promise<BudgetForecast> {
  const now = new Date();
  const monthlyTotals: number[] = [];

  for (let i = months; i >= 1; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

    const records = await prisma.financialRecord.findMany({
      where: {
        entityId,
        type: 'EXPENSE',
        category,
        createdAt: { gte: start, lte: end },
      },
    });

    const total = round2(records.reduce((sum, r) => sum + r.amount, 0));
    monthlyTotals.push(total);
  }

  const historicalMonthlyAvg =
    monthlyTotals.length === 0
      ? 0
      : round2(monthlyTotals.reduce((s, v) => s + v, 0) / monthlyTotals.length);

  // Current month's spend so far
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentRecords = await prisma.financialRecord.findMany({
    where: {
      entityId,
      type: 'EXPENSE',
      category,
      createdAt: { gte: currentMonthStart, lte: now },
    },
  });
  const currentMonthSpend = round2(
    currentRecords.reduce((sum, r) => sum + r.amount, 0)
  );

  // Days elapsed / remaining this month
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayElapsed = now.getDate();
  const projectedMonthEnd =
    dayElapsed === 0
      ? historicalMonthlyAvg
      : round2((currentMonthSpend / dayElapsed) * daysInMonth);

  const projectedQuarterEnd = round2(projectedMonthEnd * 3);

  // Trend detection: compare last half vs first half
  let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
  if (monthlyTotals.length >= 2) {
    const mid = Math.floor(monthlyTotals.length / 2);
    const firstHalf = monthlyTotals.slice(0, mid);
    const secondHalf = monthlyTotals.slice(mid);
    const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    const change = avgFirst === 0 ? 0 : ((avgSecond - avgFirst) / avgFirst) * 100;
    if (change > 5) trend = 'UP';
    else if (change < -5) trend = 'DOWN';
  }

  // Confidence based on data points
  const confidence = Math.min(1, round2(monthlyTotals.length / 6));

  return {
    category,
    historicalMonthlyAvg,
    projectedMonthEnd,
    projectedQuarterEnd,
    confidence,
    trend,
  };
}

export async function checkBudgetAlerts(budgetId: string): Promise<BudgetCategory[]> {
  const budget = await getBudgetWithActuals(budgetId);
  return budget.categories.filter(
    (cat) => cat.percentUsed >= 80
  );
}

// --- AI-Enhanced Budget Analysis ---

export async function analyzeBudgetWithAI(
  budgetId: string
): Promise<{ analysis: string; recommendations: string[]; riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' }> {
  try {
    const budget = await getBudgetWithActuals(budgetId);

    const categorySummary = budget.categories
      .map((c) => `${c.category}: $${c.spent}/$${c.budgeted} (${c.percentUsed}% used, ${c.alert})`)
      .join('\n');

    const result = await generateJSON<{
      analysis: string;
      recommendations: string[];
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    }>(
      `Analyze this budget and provide strategic insights.

Budget: ${budget.name}
Period: ${budget.period.start.toISOString().split('T')[0]} to ${budget.period.end.toISOString().split('T')[0]}
Total budgeted: $${budget.totalBudgeted}
Total spent: $${budget.totalSpent}
Remaining: $${budget.remainingBudget}

Categories:
${categorySummary}

Return JSON with:
- analysis: 2-3 sentence budget health assessment
- recommendations: array of 2-3 actionable suggestions
- riskLevel: LOW, MEDIUM, or HIGH based on spending patterns`,
      {
        maxTokens: 512,
        temperature: 0.3,
        system: 'You are a financial planning assistant. Provide practical, data-driven budget analysis.',
      }
    );

    return result;
  } catch {
    return {
      analysis: 'AI budget analysis unavailable.',
      recommendations: ['Review budget categories manually for overspending.'],
      riskLevel: 'MEDIUM',
    };
  }
}

// --- Phase 3: Budget CRUD via Budget Prisma model ---

export interface BudgetInput {
  name: string;
  amount: number;
  period: string;
  category: string;
  startDate?: Date;
  endDate?: Date;
  alerts?: Array<{ threshold: number; type: 'percentage' | 'absolute'; notified: boolean }>;
  notes?: string;
}

export async function createBudgetRecord(
  entityId: string,
  budget: BudgetInput
) {
  return prisma.budget.create({
    data: {
      entityId,
      name: budget.name,
      amount: budget.amount,
      spent: 0,
      period: budget.period,
      category: budget.category,
      startDate: budget.startDate,
      endDate: budget.endDate,
      alerts: budget.alerts ?? [],
      notes: budget.notes,
      status: 'active',
    },
  });
}

export async function getBudgets(
  entityId: string,
  filters?: { status?: string; category?: string; period?: string }
) {
  const where: Record<string, unknown> = { entityId };
  if (filters?.status) where.status = filters.status;
  if (filters?.category) where.category = filters.category;
  if (filters?.period) where.period = filters.period;

  return prisma.budget.findMany({ where, orderBy: { createdAt: 'desc' } });
}

export async function getBudget(budgetId: string) {
  return prisma.budget.findUnique({ where: { id: budgetId } });
}

export async function updateBudget(
  budgetId: string,
  updates: Partial<BudgetInput>
) {
  const data: Record<string, unknown> = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.amount !== undefined) data.amount = updates.amount;
  if (updates.period !== undefined) data.period = updates.period;
  if (updates.category !== undefined) data.category = updates.category;
  if (updates.startDate !== undefined) data.startDate = updates.startDate;
  if (updates.endDate !== undefined) data.endDate = updates.endDate;
  if (updates.alerts !== undefined) data.alerts = updates.alerts;
  if (updates.notes !== undefined) data.notes = updates.notes;

  return prisma.budget.update({ where: { id: budgetId }, data });
}

export async function deleteBudget(budgetId: string) {
  return prisma.budget.update({
    where: { id: budgetId },
    data: { status: 'closed' },
  });
}

export async function recordSpending(
  budgetId: string,
  amount: number,
  description?: string
) {
  const budget = await prisma.budget.findUniqueOrThrow({ where: { id: budgetId } });
  const newSpent = round2(budget.spent + amount);
  const alerts = (budget.alerts as Array<{ threshold: number; type: string; notified: boolean }>) ?? [];
  const triggeredAlerts: Array<{ threshold: number; type: string; triggered: boolean; message: string }> = [];

  for (const alert of alerts) {
    const thresholdValue = alert.type === 'percentage'
      ? (alert.threshold / 100) * budget.amount
      : alert.threshold;

    if (newSpent >= thresholdValue && budget.spent < thresholdValue && !alert.notified) {
      alert.notified = true;
      triggeredAlerts.push({
        threshold: alert.threshold,
        type: alert.type,
        triggered: true,
        message: `Budget "${budget.name}" crossed ${alert.threshold}${alert.type === 'percentage' ? '%' : ''} threshold${description ? ` — ${description}` : ''}`,
      });
    }
  }

  const newStatus = newSpent >= budget.amount ? 'exhausted' : budget.status;

  await prisma.budget.update({
    where: { id: budgetId },
    data: { spent: newSpent, alerts, status: newStatus },
  });

  return { spent: newSpent, status: newStatus, triggeredAlerts };
}

export async function checkThresholds(budgetId: string) {
  const budget = await prisma.budget.findUniqueOrThrow({ where: { id: budgetId } });
  const alerts = (budget.alerts as Array<{ threshold: number; type: string; notified: boolean }>) ?? [];
  const utilization = budget.amount === 0 ? 0 : round2((budget.spent / budget.amount) * 100);

  return {
    alerts: alerts.map((alert) => {
      const thresholdValue = alert.type === 'percentage'
        ? (alert.threshold / 100) * budget.amount
        : alert.threshold;
      const triggered = budget.spent >= thresholdValue;

      return {
        threshold: alert.threshold,
        type: alert.type,
        triggered,
        message: triggered
          ? `Spending ($${budget.spent}) has reached ${alert.threshold}${alert.type === 'percentage' ? '%' : ''} threshold`
          : `Spending ($${budget.spent}) is below ${alert.threshold}${alert.type === 'percentage' ? '%' : ''} threshold`,
      };
    }),
    utilization,
  };
}

export async function getBudgetUtilization(entityId: string) {
  const budgets = await prisma.budget.findMany({
    where: { entityId, status: 'active' },
  });

  return budgets
    .map((b) => ({
      id: b.id,
      name: b.name,
      category: b.category,
      amount: b.amount,
      spent: b.spent,
      utilization: b.amount === 0 ? 0 : round2((b.spent / b.amount) * 100),
    }))
    .sort((a, b) => b.utilization - a.utilization);
}

export async function suggestBudgetAdjustments(entityId: string) {
  try {
    const budgets = await prisma.budget.findMany({
      where: { entityId, status: 'active' },
    });

    const summary = budgets
      .map((b) => {
        const util = b.amount === 0 ? 0 : round2((b.spent / b.amount) * 100);
        return `${b.name} (${b.category}): $${b.spent}/$${b.amount} (${util}% used, period: ${b.period})`;
      })
      .join('\n');

    const result = await generateJSON<{
      suggestions: Array<{
        budgetName: string;
        action: 'increase' | 'decrease' | 'create' | 'merge';
        reason: string;
        suggestedAmount?: number;
      }>;
    }>(
      `Analyze these budget spending patterns and suggest adjustments.

Budgets:
${summary}

Return JSON with:
- suggestions: array of objects with { budgetName, action (increase/decrease/create/merge), reason, suggestedAmount? }`,
      {
        maxTokens: 512,
        temperature: 0.3,
        system: 'You are a financial planning assistant. Suggest practical budget adjustments based on spending data.',
      }
    );

    return result;
  } catch {
    return {
      suggestions: [{ budgetName: 'General', action: 'increase' as const, reason: 'AI analysis unavailable. Review budgets manually.' }],
    };
  }
}
