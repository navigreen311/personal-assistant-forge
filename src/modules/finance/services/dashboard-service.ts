import { prisma } from '@/lib/db';
import type { UnifiedDashboard, FinancialSummary, FinancialAlert } from '@/modules/finance/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getEntitySummary(
  entityId: string,
  period: { start: Date; end: Date }
): Promise<FinancialSummary> {
  const entity = await prisma.entity.findUniqueOrThrow({
    where: { id: entityId },
    select: { name: true },
  });

  const records = await prisma.financialRecord.findMany({
    where: {
      entityId,
      createdAt: { gte: period.start, lte: period.end },
      status: { not: 'CANCELLED' },
    },
  });

  const revenueTypes = new Set(['INVOICE', 'PAYMENT']);
  const expenseTypes = new Set(['EXPENSE', 'BILL']);

  const totalIncome = round2(
    records.filter((r) => revenueTypes.has(r.type)).reduce((s, r) => s + r.amount, 0)
  );
  const totalExpenses = round2(
    records.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0)
  );

  const pendingInvoices = records.filter(
    (r) => r.type === 'INVOICE' && r.status === 'PENDING'
  );
  const overdueBills = records.filter(
    (r) => (r.type === 'BILL' || r.type === 'INVOICE') && r.status === 'OVERDUE'
  );

  return {
    entityId,
    entityName: entity.name,
    totalIncome,
    totalExpenses,
    netCashFlow: round2(totalIncome - totalExpenses),
    pendingInvoices: pendingInvoices.length,
    pendingInvoiceAmount: round2(pendingInvoices.reduce((s, r) => s + r.amount, 0)),
    overdueBills: overdueBills.length,
    overdueBillAmount: round2(overdueBills.reduce((s, r) => s + r.amount, 0)),
    currency: 'USD',
  };
}

export async function generateAlerts(entityId: string): Promise<FinancialAlert[]> {
  const alerts: FinancialAlert[] = [];
  const now = new Date();

  // Check for overdue invoices
  const overdueInvoices = await prisma.financialRecord.findMany({
    where: {
      entityId,
      type: 'INVOICE',
      status: 'PENDING',
      dueDate: { lt: now },
    },
  });

  for (const inv of overdueInvoices) {
    alerts.push({
      id: crypto.randomUUID(),
      type: 'OVERDUE_INVOICE',
      severity: 'WARNING',
      message: `Invoice ${inv.id} is overdue (amount: $${inv.amount})`,
      entityId,
      relatedRecordId: inv.id,
      createdAt: now,
    });
  }

  // Check for overdue bills
  const overdueBills = await prisma.financialRecord.findMany({
    where: {
      entityId,
      type: 'BILL',
      status: 'PENDING',
      dueDate: { lt: now },
    },
  });

  for (const bill of overdueBills) {
    alerts.push({
      id: crypto.randomUUID(),
      type: 'OVERDUE_BILL',
      severity: 'CRITICAL',
      message: `Bill from ${bill.vendor ?? 'unknown'} is overdue (amount: $${bill.amount})`,
      entityId,
      relatedRecordId: bill.id,
      createdAt: now,
    });
  }

  // Check burn rate (high burn = last 3 months average expenses > income)
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const recentRecords = await prisma.financialRecord.findMany({
    where: {
      entityId,
      createdAt: { gte: threeMonthsAgo, lte: now },
      status: { not: 'CANCELLED' },
    },
  });

  const revenueTypes = new Set(['INVOICE', 'PAYMENT']);
  const expenseTypes = new Set(['EXPENSE', 'BILL']);
  const recentIncome = recentRecords.filter((r) => revenueTypes.has(r.type)).reduce((s, r) => s + r.amount, 0);
  const recentExpenses = recentRecords.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0);

  if (recentExpenses > recentIncome * 1.2) {
    alerts.push({
      id: crypto.randomUUID(),
      type: 'HIGH_BURN',
      severity: 'WARNING',
      message: `Expenses ($${round2(recentExpenses)}) exceed income ($${round2(recentIncome)}) by more than 20% over last 3 months`,
      entityId,
      createdAt: now,
    });
  }

  // Low cash: if net is negative
  const allRecords = await prisma.financialRecord.findMany({
    where: { entityId, status: { not: 'CANCELLED' } },
  });
  const totalIncome = allRecords.filter((r) => revenueTypes.has(r.type)).reduce((s, r) => s + r.amount, 0);
  const totalExpenses = allRecords.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0);
  if (totalIncome - totalExpenses < 0) {
    alerts.push({
      id: crypto.randomUUID(),
      type: 'LOW_CASH',
      severity: 'CRITICAL',
      message: `Estimated cash balance is negative: $${round2(totalIncome - totalExpenses)}`,
      entityId,
      createdAt: now,
    });
  }

  // Check upcoming renewals (next 30 days)
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const upcomingRenewals = await prisma.financialRecord.findMany({
    where: {
      entityId,
      type: 'BILL',
      dueDate: { gte: now, lte: thirtyDaysAhead },
    },
  });

  for (const renewal of upcomingRenewals) {
    alerts.push({
      id: crypto.randomUUID(),
      type: 'RENEWAL_DUE',
      severity: 'INFO',
      message: `Upcoming bill from ${renewal.vendor ?? 'unknown'}: $${renewal.amount} due ${renewal.dueDate?.toISOString().split('T')[0]}`,
      entityId,
      relatedRecordId: renewal.id,
      createdAt: now,
    });
  }

  return alerts;
}

// --- Phase 3: Dashboard Aggregation ---

export async function getDashboardData(entityId: string) {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const [currentRecords, prevRecords, pendingInvoices, budgets, recentTransactions] = await Promise.all([
    prisma.financialRecord.findMany({
      where: { entityId, createdAt: { gte: currentMonthStart, lte: currentMonthEnd }, status: { not: 'CANCELLED' } },
    }),
    prisma.financialRecord.findMany({
      where: { entityId, createdAt: { gte: prevMonthStart, lte: prevMonthEnd }, status: { not: 'CANCELLED' } },
    }),
    prisma.financialRecord.findMany({
      where: { entityId, type: 'INVOICE', status: { in: ['PENDING', 'OVERDUE'] } },
    }),
    prisma.budget.findMany({
      where: { entityId, status: 'active' },
    }),
    prisma.financialRecord.findMany({
      where: { entityId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  const revenueTypes = new Set(['INCOME', 'REVENUE', 'INVOICE', 'PAYMENT']);
  const expenseTypes = new Set(['EXPENSE', 'BILL']);

  const totalIncome = round2(currentRecords.filter((r) => revenueTypes.has(r.type)).reduce((s, r) => s + r.amount, 0));
  const totalExpenses = round2(currentRecords.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0));
  const netCashFlow = round2(totalIncome - totalExpenses);

  const prevIncome = round2(prevRecords.filter((r) => revenueTypes.has(r.type)).reduce((s, r) => s + r.amount, 0));
  const prevExpenses = round2(prevRecords.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0));
  const prevNet = round2(prevIncome - prevExpenses);

  const pendingAR = round2(pendingInvoices.reduce((s, r) => s + r.amount, 0));
  const overdueExpenses = currentRecords.filter(
    (r) => expenseTypes.has(r.type) && r.status === 'OVERDUE'
  );
  const overdueAP = round2(overdueExpenses.reduce((s, r) => s + r.amount, 0));

  const budgetUtilization = budgets.length === 0
    ? 0
    : round2(
        budgets.reduce((s, b) => s + (b.amount === 0 ? 0 : (b.spent / b.amount) * 100), 0) / budgets.length
      );

  const monthOverMonth = prevNet === 0
    ? (netCashFlow === 0 ? 0 : 100)
    : round2(((netCashFlow - prevNet) / Math.abs(prevNet)) * 100);

  return {
    totalIncome,
    totalExpenses,
    netCashFlow,
    pendingAR,
    overdueAP,
    budgetUtilization,
    recentTransactions,
    monthOverMonth,
  };
}

export async function getQuickStats(entityId: string) {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const records = await prisma.financialRecord.findMany({
    where: { entityId, createdAt: { gte: currentMonthStart, lte: currentMonthEnd }, status: { not: 'CANCELLED' } },
  });

  const revenueTypes = new Set(['INCOME', 'REVENUE', 'INVOICE', 'PAYMENT']);
  const expenseTypes = new Set(['EXPENSE', 'BILL']);

  return {
    totalIncome: round2(records.filter((r) => revenueTypes.has(r.type)).reduce((s, r) => s + r.amount, 0)),
    totalExpenses: round2(records.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0)),
    netCashFlow: round2(
      records.filter((r) => revenueTypes.has(r.type)).reduce((s, r) => s + r.amount, 0) -
      records.filter((r) => expenseTypes.has(r.type)).reduce((s, r) => s + r.amount, 0)
    ),
    transactionCount: records.length,
  };
}

export async function getAlerts(entityId: string) {
  return generateAlerts(entityId);
}

export async function getUnifiedDashboard(
  userId: string,
  period: { start: Date; end: Date }
): Promise<UnifiedDashboard> {
  const entities = await prisma.entity.findMany({
    where: { userId },
    select: { id: true },
  });

  const summariesAndAlerts = await Promise.all(
    entities.map(async (entity) => {
      const [summary, entityAlerts] = await Promise.all([
        getEntitySummary(entity.id, period),
        generateAlerts(entity.id),
      ]);
      return { summary, alerts: entityAlerts };
    })
  );

  const summaries = summariesAndAlerts.map((s) => s.summary);
  const alerts = summariesAndAlerts.flatMap((s) => s.alerts);

  const aggregated = {
    totalIncome: round2(summaries.reduce((s, sum) => s + sum.totalIncome, 0)),
    totalExpenses: round2(summaries.reduce((s, sum) => s + sum.totalExpenses, 0)),
    netCashFlow: round2(summaries.reduce((s, sum) => s + sum.netCashFlow, 0)),
    totalPendingAR: round2(summaries.reduce((s, sum) => s + sum.pendingInvoiceAmount, 0)),
    totalOverdueAP: round2(summaries.reduce((s, sum) => s + sum.overdueBillAmount, 0)),
  };

  return { summaries, aggregated, alerts, period };
}
