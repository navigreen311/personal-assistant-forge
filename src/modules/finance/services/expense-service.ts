import { prisma } from '@/lib/db';
import type { Expense, ExpenseByCategory } from '@/modules/finance/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseExpenseFromRecord(record: {
  id: string;
  entityId: string;
  amount: number;
  currency: string;
  status: string;
  dueDate: Date | null;
  category: string;
  vendor: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Expense {
  const extended = record.description ? JSON.parse(record.description) : {};
  return {
    id: record.id,
    entityId: record.entityId,
    amount: record.amount,
    currency: record.currency,
    category: record.category,
    vendor: record.vendor ?? '',
    description: extended.expenseDescription ?? '',
    date: record.dueDate ?? record.createdAt,
    receiptUrl: extended.receiptUrl,
    ocrData: extended.ocrData,
    isRecurring: extended.isRecurring ?? false,
    recurringFrequency: extended.recurringFrequency,
    tags: extended.tags ?? [],
  };
}

export async function createExpense(data: Omit<Expense, 'id'>): Promise<Expense> {
  const category = data.category || categorizeExpense(data.description, data.vendor);

  const extended = {
    expenseDescription: data.description,
    receiptUrl: data.receiptUrl,
    ocrData: data.ocrData,
    isRecurring: data.isRecurring,
    recurringFrequency: data.recurringFrequency,
    tags: data.tags,
  };

  const record = await prisma.financialRecord.create({
    data: {
      entityId: data.entityId,
      type: 'EXPENSE',
      amount: round2(data.amount),
      currency: data.currency,
      status: 'PAID',
      dueDate: data.date,
      category,
      vendor: data.vendor,
      description: JSON.stringify(extended),
    },
  });

  return parseExpenseFromRecord(record);
}

export async function listExpenses(
  entityId: string,
  filters: {
    category?: string;
    vendor?: string;
    dateRange?: { start: Date; end: Date };
  },
  page: number,
  pageSize: number
): Promise<{ expenses: Expense[]; total: number }> {
  const where: Record<string, unknown> = {
    entityId,
    type: 'EXPENSE',
  };
  if (filters.category) where.category = filters.category;
  if (filters.vendor) where.vendor = filters.vendor;
  if (filters.dateRange) {
    where.dueDate = { gte: filters.dateRange.start, lte: filters.dateRange.end };
  }

  const [records, total] = await Promise.all([
    prisma.financialRecord.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.financialRecord.count({ where }),
  ]);

  return { expenses: records.map(parseExpenseFromRecord), total };
}

const CATEGORY_RULES: [RegExp, string][] = [
  [/software|saas|subscription|license/i, 'Software & SaaS'],
  [/office|supplies|stationery/i, 'Office Supplies'],
  [/travel|flight|hotel|airbnb|uber|lyft/i, 'Travel'],
  [/food|restaurant|meal|lunch|dinner|coffee/i, 'Meals & Entertainment'],
  [/rent|lease|coworking/i, 'Rent & Facilities'],
  [/marketing|ads|advertising|campaign/i, 'Marketing'],
  [/legal|attorney|lawyer|compliance/i, 'Legal & Professional'],
  [/accounting|bookkeep|tax/i, 'Accounting'],
  [/insurance|coverage|policy/i, 'Insurance'],
  [/payroll|salary|wages|contractor/i, 'Payroll & Contractors'],
  [/internet|phone|telecom|hosting|cloud|aws|gcp|azure/i, 'Technology & Infrastructure'],
  [/utility|electric|water|gas/i, 'Utilities'],
  [/shipping|freight|postage|fedex|ups/i, 'Shipping & Logistics'],
  [/training|education|course|conference/i, 'Training & Education'],
];

export function categorizeExpense(description: string, vendor: string): string {
  const text = `${description} ${vendor}`.toLowerCase();
  for (const [pattern, category] of CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  return 'General';
}

export async function getExpensesByCategory(
  entityId: string,
  period: { start: Date; end: Date }
): Promise<ExpenseByCategory[]> {
  const previousPeriodLength = period.end.getTime() - period.start.getTime();
  const previousStart = new Date(period.start.getTime() - previousPeriodLength);
  const previousEnd = new Date(period.start);

  const [currentRecords, previousRecords] = await Promise.all([
    prisma.financialRecord.findMany({
      where: {
        entityId,
        type: 'EXPENSE',
        createdAt: { gte: period.start, lte: period.end },
      },
    }),
    prisma.financialRecord.findMany({
      where: {
        entityId,
        type: 'EXPENSE',
        createdAt: { gte: previousStart, lte: previousEnd },
      },
    }),
  ]);

  const currentByCategory = new Map<string, { total: number; count: number }>();
  const previousByCategory = new Map<string, number>();

  for (const r of currentRecords) {
    const existing = currentByCategory.get(r.category) ?? { total: 0, count: 0 };
    existing.total = round2(existing.total + r.amount);
    existing.count++;
    currentByCategory.set(r.category, existing);
  }

  for (const r of previousRecords) {
    previousByCategory.set(r.category, round2((previousByCategory.get(r.category) ?? 0) + r.amount));
  }

  const grandTotal = round2(
    Array.from(currentByCategory.values()).reduce((s, c) => s + c.total, 0)
  );

  return Array.from(currentByCategory.entries()).map(([category, data]) => {
    const prevAmount = previousByCategory.get(category) ?? 0;
    const changePercent = prevAmount === 0
      ? (data.total === 0 ? 0 : 100)
      : round2(((data.total - prevAmount) / Math.abs(prevAmount)) * 100);

    let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
    if (changePercent > 5) trend = 'UP';
    else if (changePercent < -5) trend = 'DOWN';

    return {
      category,
      total: data.total,
      count: data.count,
      percentageOfTotal: grandTotal === 0 ? 0 : round2((data.total / grandTotal) * 100),
      trend,
      changePercent,
    };
  });
}

export async function detectDuplicates(expense: Partial<Expense>): Promise<Expense[]> {
  if (!expense.entityId || expense.amount === undefined || !expense.vendor) {
    return [];
  }

  const targetDate = expense.date ?? new Date();
  const threeDaysBefore = new Date(targetDate.getTime() - 3 * 24 * 60 * 60 * 1000);
  const threeDaysAfter = new Date(targetDate.getTime() + 3 * 24 * 60 * 60 * 1000);

  const records = await prisma.financialRecord.findMany({
    where: {
      entityId: expense.entityId,
      type: 'EXPENSE',
      amount: expense.amount,
      vendor: expense.vendor,
      dueDate: { gte: threeDaysBefore, lte: threeDaysAfter },
    },
  });

  return records.map(parseExpenseFromRecord);
}
