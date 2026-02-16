import { prisma } from '@/lib/db';
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
