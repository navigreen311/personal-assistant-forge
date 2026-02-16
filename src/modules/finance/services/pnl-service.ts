import { prisma } from '@/lib/db';
import type { ProfitAndLoss, PnLLineItem, PnLTrend } from '@/modules/finance/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function changePercent(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

export async function generatePnL(
  entityId: string,
  period: { start: Date; end: Date }
): Promise<ProfitAndLoss> {
  const entity = await prisma.entity.findUniqueOrThrow({
    where: { id: entityId },
    select: { name: true },
  });

  const periodLength = period.end.getTime() - period.start.getTime();
  const previousStart = new Date(period.start.getTime() - periodLength);
  const previousEnd = new Date(period.start);

  const [currentRecords, previousRecords] = await Promise.all([
    prisma.financialRecord.findMany({
      where: {
        entityId,
        createdAt: { gte: period.start, lte: period.end },
      },
    }),
    prisma.financialRecord.findMany({
      where: {
        entityId,
        createdAt: { gte: previousStart, lte: previousEnd },
      },
    }),
  ]);

  const revenueTypes = new Set(['INVOICE', 'PAYMENT']);
  const expenseTypes = new Set(['EXPENSE', 'BILL']);

  const groupByCategory = (
    records: typeof currentRecords,
    typeFilter: Set<string>
  ): Map<string, number> => {
    const map = new Map<string, number>();
    for (const r of records) {
      if (typeFilter.has(r.type) && r.status !== 'CANCELLED') {
        map.set(r.category, round2((map.get(r.category) ?? 0) + r.amount));
      }
    }
    return map;
  };

  const currentRevByCat = groupByCategory(currentRecords, revenueTypes);
  const previousRevByCat = groupByCategory(previousRecords, revenueTypes);
  const currentExpByCat = groupByCategory(currentRecords, expenseTypes);
  const previousExpByCat = groupByCategory(previousRecords, expenseTypes);

  const buildLineItems = (
    current: Map<string, number>,
    previous: Map<string, number>
  ): PnLLineItem[] => {
    const allCategories = new Set([...current.keys(), ...previous.keys()]);
    return Array.from(allCategories).map((category) => {
      const amount = round2(current.get(category) ?? 0);
      const prev = round2(previous.get(category) ?? 0);
      return {
        category,
        amount,
        previousPeriodAmount: prev,
        changePercent: changePercent(amount, prev),
      };
    });
  };

  const revenue = buildLineItems(currentRevByCat, previousRevByCat);
  const expenses = buildLineItems(currentExpByCat, previousExpByCat);

  const totalRevenue = round2(revenue.reduce((sum, r) => sum + r.amount, 0));
  const totalExpenses = round2(expenses.reduce((sum, e) => sum + e.amount, 0));
  const grossProfit = round2(totalRevenue - totalExpenses);
  const grossMargin = totalRevenue === 0 ? 0 : round2((grossProfit / totalRevenue) * 100);

  return {
    entityId,
    entityName: entity.name,
    period,
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    grossProfit,
    grossMargin,
    trends: [],
  };
}

export async function comparePeriods(
  entityId: string,
  period1: { start: Date; end: Date },
  period2: { start: Date; end: Date }
): Promise<{ period1: ProfitAndLoss; period2: ProfitAndLoss; changes: PnLLineItem[] }> {
  const [pnl1, pnl2] = await Promise.all([
    generatePnL(entityId, period1),
    generatePnL(entityId, period2),
  ]);

  const allCategories = new Set([
    ...pnl1.revenue.map((r) => r.category),
    ...pnl1.expenses.map((e) => e.category),
    ...pnl2.revenue.map((r) => r.category),
    ...pnl2.expenses.map((e) => e.category),
  ]);

  const changes: PnLLineItem[] = Array.from(allCategories).map((category) => {
    const p1Rev = pnl1.revenue.find((r) => r.category === category)?.amount ?? 0;
    const p1Exp = pnl1.expenses.find((e) => e.category === category)?.amount ?? 0;
    const p2Rev = pnl2.revenue.find((r) => r.category === category)?.amount ?? 0;
    const p2Exp = pnl2.expenses.find((e) => e.category === category)?.amount ?? 0;
    const p1Net = round2(p1Rev - p1Exp);
    const p2Net = round2(p2Rev - p2Exp);
    return {
      category,
      amount: p2Net,
      previousPeriodAmount: p1Net,
      changePercent: changePercent(p2Net, p1Net),
    };
  });

  return { period1: pnl1, period2: pnl2, changes };
}

export async function getTrends(
  entityId: string,
  months: number
): Promise<PnLTrend[]> {
  const now = new Date();
  const trends: PnLTrend[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

    const records = await prisma.financialRecord.findMany({
      where: {
        entityId,
        createdAt: { gte: start, lte: end },
        status: { not: 'CANCELLED' },
      },
    });

    const revenueTypes = new Set(['INVOICE', 'PAYMENT']);
    const expenseTypes = new Set(['EXPENSE', 'BILL']);

    const revenue = round2(
      records.filter((r) => revenueTypes.has(r.type)).reduce((s, r) => s + r.amount, 0)
    );
    const expenses = round2(
      records.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0)
    );

    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, '0');

    trends.push({
      period: `${year}-${month}`,
      revenue,
      expenses,
      profit: round2(revenue - expenses),
    });
  }

  return trends;
}

// --- Phase 3: Additional P&L Operations ---

export async function getMargins(
  entityId: string,
  dateRange?: { start: Date; end: Date }
) {
  const now = new Date();
  const period = dateRange ?? {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };

  const pnl = await generatePnL(entityId, period);

  return {
    grossMargin: pnl.grossMargin,
    operatingMargin: pnl.totalRevenue === 0
      ? 0
      : round2((pnl.grossProfit / pnl.totalRevenue) * 100),
    totalRevenue: pnl.totalRevenue,
    totalExpenses: pnl.totalExpenses,
    grossProfit: pnl.grossProfit,
    period,
  };
}

export async function getPnLTrend(
  entityId: string,
  periods: number
) {
  return getTrends(entityId, periods);
}

export async function comparePnL(
  entityId: string,
  period1: { start: Date; end: Date },
  period2: { start: Date; end: Date }
) {
  return comparePeriods(entityId, period1, period2);
}
