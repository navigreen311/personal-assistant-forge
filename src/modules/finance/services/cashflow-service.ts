import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
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

// --- Phase 3: Cash Flow Calculations ---

export async function getCashFlow(
  entityId: string,
  period: 'day' | 'week' | 'month',
  dateRange?: { start: Date; end: Date }
) {
  const now = new Date();
  const start = dateRange?.start ?? new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const end = dateRange?.end ?? now;

  const records = await prisma.financialRecord.findMany({
    where: {
      entityId,
      createdAt: { gte: start, lte: end },
      status: { not: 'CANCELLED' },
    },
    orderBy: { createdAt: 'asc' },
  });

  const incomeTypes = new Set(['INCOME', 'REVENUE', 'INVOICE', 'PAYMENT']);
  const expenseTypes = new Set(['EXPENSE', 'BILL']);

  const buckets = new Map<string, { income: number; expenses: number }>();

  for (const record of records) {
    const date = record.createdAt;
    let key: string;
    if (period === 'day') {
      key = date.toISOString().split('T')[0];
    } else if (period === 'week') {
      const d = new Date(date);
      d.setDate(d.getDate() - d.getDay());
      key = d.toISOString().split('T')[0];
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    const bucket = buckets.get(key) ?? { income: 0, expenses: 0 };
    if (incomeTypes.has(record.type)) {
      bucket.income = round2(bucket.income + record.amount);
    } else if (expenseTypes.has(record.type)) {
      bucket.expenses = round2(bucket.expenses + record.amount);
    }
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .map(([periodKey, data]) => ({
      period: periodKey,
      income: data.income,
      expenses: data.expenses,
      net: round2(data.income - data.expenses),
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

export async function getRunningBalance(
  entityId: string,
  dateRange?: { start: Date; end: Date }
) {
  const cashFlowData = await getCashFlow(entityId, 'day', dateRange);
  let balance = 0;

  return cashFlowData.map((entry) => {
    balance = round2(balance + entry.net);
    return { date: entry.period, balance };
  });
}

export async function projectCashFlow(entityId: string, forecastMonths: number) {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const records = await prisma.financialRecord.findMany({
    where: {
      entityId,
      createdAt: { gte: threeMonthsAgo, lte: now },
      status: { not: 'CANCELLED' },
    },
  });

  const incomeTypes = new Set(['INCOME', 'REVENUE', 'INVOICE', 'PAYMENT']);
  const expenseTypes = new Set(['EXPENSE', 'BILL']);

  const monthlyIncome: number[] = [];
  const monthlyExpenses: number[] = [];

  for (let i = 3; i >= 1; i--) {
    const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const monthRecords = records.filter(
      (r) => r.createdAt >= mStart && r.createdAt <= mEnd
    );
    monthlyIncome.push(round2(monthRecords.filter((r) => incomeTypes.has(r.type)).reduce((s, r) => s + r.amount, 0)));
    monthlyExpenses.push(round2(monthRecords.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0)));
  }

  const avgIncome = monthlyIncome.length === 0 ? 0 : round2(monthlyIncome.reduce((s, v) => s + v, 0) / monthlyIncome.length);
  const avgExpenses = monthlyExpenses.length === 0 ? 0 : round2(monthlyExpenses.reduce((s, v) => s + v, 0) / monthlyExpenses.length);
  const dataPoints = monthlyIncome.filter((v) => v > 0).length + monthlyExpenses.filter((v) => v > 0).length;
  const confidence = round2(Math.min(1, dataPoints / 6));

  const projections = [];
  for (let i = 1; i <= forecastMonths; i++) {
    const projDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    projections.push({
      month: `${projDate.getFullYear()}-${String(projDate.getMonth() + 1).padStart(2, '0')}`,
      projectedIncome: avgIncome,
      projectedExpenses: avgExpenses,
      projectedNet: round2(avgIncome - avgExpenses),
      confidence,
    });
  }

  return projections;
}

export async function identifyTrends(entityId: string) {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    const records = await prisma.financialRecord.findMany({
      where: {
        entityId,
        createdAt: { gte: sixMonthsAgo, lte: now },
        status: { not: 'CANCELLED' },
      },
    });

    const incomeTypes = new Set(['INCOME', 'REVENUE', 'INVOICE', 'PAYMENT']);
    const expenseTypes = new Set(['EXPENSE', 'BILL']);

    const monthlyData: Array<{ month: string; income: number; expenses: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const monthRecords = records.filter((r) => r.createdAt >= mStart && r.createdAt <= mEnd);
      monthlyData.push({
        month: `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`,
        income: round2(monthRecords.filter((r) => incomeTypes.has(r.type)).reduce((s, r) => s + r.amount, 0)),
        expenses: round2(monthRecords.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0)),
      });
    }

    const summary = monthlyData
      .map((m) => `${m.month}: income=$${m.income}, expenses=$${m.expenses}, net=$${round2(m.income - m.expenses)}`)
      .join('\n');

    const result = await generateJSON<{
      trends: string[];
      insights: string;
      riskFactors: string[];
    }>(
      `Analyze these monthly cash flow figures and identify trends.

${summary}

Return JSON with:
- trends: array of identified trends (growing income, seasonal patterns, expense spikes)
- insights: 2-3 sentence narrative summary
- riskFactors: array of risk factors`,
      {
        maxTokens: 512,
        temperature: 0.3,
        system: 'You are a financial analysis assistant. Identify cash flow trends from data.',
      }
    );

    return result;
  } catch {
    return {
      trends: ['Unable to analyze trends with AI'],
      insights: 'AI trend analysis unavailable. Review cash flow data manually.',
      riskFactors: [],
    };
  }
}

export async function getCashFlowSummary(entityId: string) {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const [currentRecords, prevRecords] = await Promise.all([
    prisma.financialRecord.findMany({
      where: { entityId, createdAt: { gte: currentMonthStart, lte: currentMonthEnd }, status: { not: 'CANCELLED' } },
    }),
    prisma.financialRecord.findMany({
      where: { entityId, createdAt: { gte: prevMonthStart, lte: prevMonthEnd }, status: { not: 'CANCELLED' } },
    }),
  ]);

  const incomeTypes = new Set(['INCOME', 'REVENUE', 'INVOICE', 'PAYMENT']);
  const expenseTypes = new Set(['EXPENSE', 'BILL']);

  const currentIncome = round2(currentRecords.filter((r) => incomeTypes.has(r.type)).reduce((s, r) => s + r.amount, 0));
  const currentExpenses = round2(currentRecords.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0));
  const currentNet = round2(currentIncome - currentExpenses);

  const prevIncome = round2(prevRecords.filter((r) => incomeTypes.has(r.type)).reduce((s, r) => s + r.amount, 0));
  const prevExpenses = round2(prevRecords.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0));
  const prevNet = round2(prevIncome - prevExpenses);

  const incomeChange = prevIncome === 0 ? (currentIncome === 0 ? 0 : 100) : round2(((currentIncome - prevIncome) / Math.abs(prevIncome)) * 100);
  const expenseChange = prevExpenses === 0 ? (currentExpenses === 0 ? 0 : 100) : round2(((currentExpenses - prevExpenses) / Math.abs(prevExpenses)) * 100);
  const netChange = prevNet === 0 ? (currentNet === 0 ? 0 : 100) : round2(((currentNet - prevNet) / Math.abs(prevNet)) * 100);

  return {
    income: currentIncome,
    expenses: currentExpenses,
    netCashFlow: currentNet,
    previousMonth: { income: prevIncome, expenses: prevExpenses, netCashFlow: prevNet },
    changes: { incomeChange, expenseChange, netChange },
  };
}

// --- AI-Enhanced Cash Flow Prediction ---

export async function forecastCashFlowWithAI(
  entityId: string,
  startingBalance: number,
  days: number
): Promise<{ prediction: string; riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'; suggestions: string[] }> {
  try {
    const forecast = await forecastCashFlow(entityId, startingBalance, days);
    const summary = forecast.summary;

    const result = await generateJSON<{
      prediction: string;
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      suggestions: string[];
    }>(
      `Analyze this cash flow forecast and provide strategic insights.

Starting balance: $${startingBalance}
30-day net: $${summary.thirtyDay.net}, end balance: $${summary.thirtyDay.endBalance}
60-day net: $${summary.sixtyDay.net}, end balance: $${summary.sixtyDay.endBalance}
90-day net: $${summary.ninetyDay.net}, end balance: $${summary.ninetyDay.endBalance}
Alerts: ${forecast.alerts.length > 0 ? forecast.alerts.join('; ') : 'None'}

Return JSON with:
- prediction: 1-2 sentence cashflow outlook
- riskLevel: LOW, MEDIUM, or HIGH based on trajectory
- suggestions: 2-3 actionable suggestions to optimize cash position`,
      {
        maxTokens: 512,
        temperature: 0.3,
        system: 'You are a financial analysis assistant. Provide practical, actionable cash flow insights.',
      }
    );

    return result;
  } catch {
    return {
      prediction: 'AI cash flow analysis unavailable.',
      riskLevel: 'MEDIUM',
      suggestions: ['Review cash flow projections manually.'],
    };
  }
}
