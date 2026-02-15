import { prisma } from '@/lib/db';
import type {
  CashFlowProjection,
  CashFlowForecast,
  BurnRate,
  ScenarioModel,
  ScenarioAdjustment,
  Renewal,
} from '@/modules/finance/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function forecastCashFlow(
  entityId: string,
  startingBalance: number,
  days: number
): Promise<CashFlowForecast> {
  const now = new Date();
  const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // Get historical daily averages from last 90 days for baseline
  const historicalStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const historicalRecords = await prisma.financialRecord.findMany({
    where: {
      entityId,
      createdAt: { gte: historicalStart, lte: now },
      status: { not: 'CANCELLED' },
    },
  });

  const revenueTypes = new Set(['INVOICE', 'PAYMENT']);
  const expenseTypes = new Set(['EXPENSE', 'BILL']);

  const totalHistoricalDays = Math.max(1, Math.floor((now.getTime() - historicalStart.getTime()) / (1000 * 60 * 60 * 24)));
  const totalInflows = round2(historicalRecords.filter((r) => revenueTypes.has(r.type)).reduce((s, r) => s + r.amount, 0));
  const totalOutflows = round2(historicalRecords.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0));
  const dailyAvgInflow = round2(totalInflows / totalHistoricalDays);
  const dailyAvgOutflow = round2(totalOutflows / totalHistoricalDays);

  // Get scheduled items (pending invoices/bills with due dates)
  const scheduledItems = await prisma.financialRecord.findMany({
    where: {
      entityId,
      status: 'PENDING',
      dueDate: { gte: now, lte: endDate },
    },
  });

  const scheduledByDate = new Map<string, { inflows: { source: string; amount: number }[]; outflows: { source: string; amount: number }[] }>();
  for (const item of scheduledItems) {
    if (!item.dueDate) continue;
    const dateKey = item.dueDate.toISOString().split('T')[0];
    const entry = scheduledByDate.get(dateKey) ?? { inflows: [], outflows: [] };
    if (revenueTypes.has(item.type)) {
      entry.inflows.push({ source: item.vendor ?? item.category, amount: item.amount });
    } else if (expenseTypes.has(item.type)) {
      entry.outflows.push({ source: item.vendor ?? item.category, amount: item.amount });
    }
    scheduledByDate.set(dateKey, entry);
  }

  // Build daily projections
  const projections: CashFlowProjection[] = [];
  let runningBalance = round2(startingBalance);
  const alerts: string[] = [];

  for (let d = 1; d <= days; d++) {
    const date = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    const dateKey = date.toISOString().split('T')[0];
    const scheduled = scheduledByDate.get(dateKey);

    const scheduledInflow = round2(
      (scheduled?.inflows ?? []).reduce((s, i) => s + i.amount, 0)
    );
    const scheduledOutflow = round2(
      (scheduled?.outflows ?? []).reduce((s, o) => s + o.amount, 0)
    );

    const expectedInflows = round2(dailyAvgInflow + scheduledInflow);
    const expectedOutflows = round2(dailyAvgOutflow + scheduledOutflow);
    const netCashFlow = round2(expectedInflows - expectedOutflows);
    runningBalance = round2(runningBalance + netCashFlow);

    const inflowSources = [
      ...(scheduled?.inflows ?? []),
      { source: 'Historical Average', amount: dailyAvgInflow },
    ];
    const outflowSources = [
      ...(scheduled?.outflows ?? []),
      { source: 'Historical Average', amount: dailyAvgOutflow },
    ];

    projections.push({
      date,
      expectedInflows,
      expectedOutflows,
      netCashFlow,
      runningBalance,
      inflowSources,
      outflowSources,
    });

    if (runningBalance < 0) {
      const alertMsg = `Cash below $0 projected on ${dateKey}`;
      if (!alerts.includes(alertMsg)) alerts.push(alertMsg);
    }
  }

  const buildSummary = (daysRange: number) => {
    const slice = projections.slice(0, Math.min(daysRange, projections.length));
    const inflow = round2(slice.reduce((s, p) => s + p.expectedInflows, 0));
    const outflow = round2(slice.reduce((s, p) => s + p.expectedOutflows, 0));
    const net = round2(inflow - outflow);
    const endBalance = slice.length > 0 ? slice[slice.length - 1].runningBalance : startingBalance;
    return { inflow, outflow, net, endBalance };
  };

  return {
    entityId,
    startingBalance,
    projections,
    summary: {
      thirtyDay: buildSummary(30),
      sixtyDay: buildSummary(60),
      ninetyDay: buildSummary(90),
    },
    alerts,
  };
}

export async function calculateBurnRate(
  entityId: string,
  months: number
): Promise<BurnRate> {
  const entity = await prisma.entity.findUniqueOrThrow({
    where: { id: entityId },
    select: { name: true },
  });

  const now = new Date();
  const monthlyExpenses: number[] = [];

  for (let i = months; i >= 1; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

    const records = await prisma.financialRecord.findMany({
      where: {
        entityId,
        type: { in: ['EXPENSE', 'BILL'] },
        createdAt: { gte: start, lte: end },
        status: { not: 'CANCELLED' },
      },
    });

    monthlyExpenses.push(round2(records.reduce((s, r) => s + r.amount, 0)));
  }

  const monthlyBurn =
    monthlyExpenses.length === 0
      ? 0
      : round2(monthlyExpenses.reduce((s, v) => s + v, 0) / monthlyExpenses.length);

  // Estimate current balance from total income - total expenses
  const allRecords = await prisma.financialRecord.findMany({
    where: { entityId, status: { not: 'CANCELLED' } },
  });

  const revenueTypes = new Set(['INVOICE', 'PAYMENT']);
  const expenseTypes = new Set(['EXPENSE', 'BILL']);
  const totalIncome = round2(allRecords.filter((r) => revenueTypes.has(r.type)).reduce((s, r) => s + r.amount, 0));
  const totalExpenses = round2(allRecords.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0));
  const estimatedBalance = round2(totalIncome - totalExpenses);

  const runwayMonths = monthlyBurn === 0 ? Infinity : round2(Math.max(0, estimatedBalance / monthlyBurn));

  // Trend: compare first half vs second half of monthly expenses
  let trend: BurnRate['trend'] = 'STABLE';
  if (monthlyExpenses.length >= 2) {
    const mid = Math.floor(monthlyExpenses.length / 2);
    const first = monthlyExpenses.slice(0, mid);
    const second = monthlyExpenses.slice(mid);
    const avgFirst = first.reduce((s, v) => s + v, 0) / first.length;
    const avgSecond = second.reduce((s, v) => s + v, 0) / second.length;
    const change = avgFirst === 0 ? 0 : ((avgSecond - avgFirst) / avgFirst) * 100;
    if (change > 5) trend = 'INCREASING';
    else if (change < -5) trend = 'DECREASING';
  }

  const threshold = monthlyBurn * 1.2; // Alert if burn exceeds 120% of average

  return {
    entityId,
    entityName: entity.name,
    monthlyBurn,
    runwayMonths,
    trend,
    threshold,
    isAboveThreshold: monthlyBurn > threshold,
  };
}

export async function runScenario(
  entityId: string,
  scenario: Omit<ScenarioModel, 'id' | 'projectedImpact'>
): Promise<ScenarioModel> {
  const burnRate = await calculateBurnRate(entityId, 3);

  let monthlyRevenueChange = 0;
  let monthlyExpenseChange = 0;

  for (const adj of scenario.adjustments) {
    switch (adj.type) {
      case 'REVENUE_LOSS':
        monthlyRevenueChange = round2(monthlyRevenueChange - adj.monthlyAmount);
        break;
      case 'REVENUE_GAIN':
        monthlyRevenueChange = round2(monthlyRevenueChange + adj.monthlyAmount);
        break;
      case 'EXPENSE_INCREASE':
        monthlyExpenseChange = round2(monthlyExpenseChange + adj.monthlyAmount);
        break;
      case 'EXPENSE_DECREASE':
        monthlyExpenseChange = round2(monthlyExpenseChange - adj.monthlyAmount);
        break;
    }
  }

  const newBurnRate = round2(burnRate.monthlyBurn + monthlyExpenseChange - monthlyRevenueChange);

  // Recalculate balance
  const allRecords = await prisma.financialRecord.findMany({
    where: { entityId, status: { not: 'CANCELLED' } },
  });
  const revenueTypes = new Set(['INVOICE', 'PAYMENT']);
  const expenseTypes = new Set(['EXPENSE', 'BILL']);
  const totalIncome = allRecords.filter((r) => revenueTypes.has(r.type)).reduce((s, r) => s + r.amount, 0);
  const totalExpenses = allRecords.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0);
  const estimatedBalance = round2(totalIncome - totalExpenses);

  const newRunwayMonths = newBurnRate <= 0 ? Infinity : round2(Math.max(0, estimatedBalance / newBurnRate));

  const id = crypto.randomUUID();

  return {
    id,
    name: scenario.name,
    adjustments: scenario.adjustments,
    projectedImpact: {
      monthlyRevenueChange,
      monthlyExpenseChange,
      newBurnRate,
      newRunwayMonths,
    },
  };
}

export async function getRenewalRadar(
  entityId: string,
  daysAhead: number
): Promise<Renewal[]> {
  const now = new Date();
  const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const records = await prisma.financialRecord.findMany({
    where: {
      entityId,
      type: 'BILL',
      dueDate: { gte: now, lte: futureDate },
    },
    orderBy: { dueDate: 'asc' },
  });

  return records.map((record) => {
    const extended = record.description ? JSON.parse(record.description) : {};
    const nextRenewalDate = record.dueDate ?? futureDate;
    const daysUntilRenewal = Math.max(
      0,
      Math.floor((nextRenewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );

    return {
      id: record.id,
      name: extended.name ?? record.category,
      vendor: record.vendor ?? '',
      amount: record.amount,
      frequency: extended.frequency ?? 'MONTHLY',
      nextRenewalDate,
      daysUntilRenewal,
      autoRenew: extended.autoRenew ?? false,
      cancelDeadline: extended.cancelDeadline ? new Date(extended.cancelDeadline) : undefined,
    };
  });
}
