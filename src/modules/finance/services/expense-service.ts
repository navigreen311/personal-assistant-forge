import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
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
  if (!expense.entityId) {
    return [];
  }

  // Build a flexible query: match on any combination of available fields
  const where: Record<string, unknown> = {
    entityId: expense.entityId,
    type: 'EXPENSE',
    status: { not: 'CANCELLED' },
  };

  // Exact amount match when provided
  if (expense.amount !== undefined) {
    where.amount = expense.amount;
  }

  // Vendor match when provided
  if (expense.vendor) {
    where.vendor = expense.vendor;
  }

  // Date proximity window: look within +/- 3 days of target date
  const targetDate = expense.date ?? new Date();
  const threeDaysBefore = new Date(targetDate.getTime() - 3 * 24 * 60 * 60 * 1000);
  const threeDaysAfter = new Date(targetDate.getTime() + 3 * 24 * 60 * 60 * 1000);
  where.OR = [
    { dueDate: { gte: threeDaysBefore, lte: threeDaysAfter } },
    { createdAt: { gte: threeDaysBefore, lte: threeDaysAfter } },
  ];

  // If we have neither amount nor vendor, require at least a category match
  if (expense.amount === undefined && !expense.vendor) {
    if (expense.category) {
      where.category = expense.category;
    } else {
      return [];
    }
  }

  const records = await prisma.financialRecord.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Exclude the expense itself if it has an ID
  const filtered = expense.id
    ? records.filter((r) => r.id !== expense.id)
    : records;

  return filtered.map(parseExpenseFromRecord);
}

// --- Phase 3: Additional Expense Operations ---

export async function getExpense(expenseId: string): Promise<Expense | null> {
  const record = await prisma.financialRecord.findUnique({ where: { id: expenseId } });
  if (!record || record.type !== 'EXPENSE') return null;
  return parseExpenseFromRecord(record);
}

export async function updateExpense(
  expenseId: string,
  updates: Partial<Pick<Expense, 'amount' | 'category' | 'vendor' | 'description' | 'date' | 'currency'>>
) {
  const record = await prisma.financialRecord.findUniqueOrThrow({ where: { id: expenseId } });
  const extended = record.description ? JSON.parse(record.description) : {};

  const data: Record<string, unknown> = {};
  if (updates.amount !== undefined) data.amount = round2(updates.amount);
  if (updates.category !== undefined) data.category = updates.category;
  if (updates.vendor !== undefined) data.vendor = updates.vendor;
  if (updates.currency !== undefined) data.currency = updates.currency;
  if (updates.date !== undefined) data.dueDate = updates.date;
  if (updates.description !== undefined) {
    extended.expenseDescription = updates.description;
    data.description = JSON.stringify(extended);
  }

  const updated = await prisma.financialRecord.update({
    where: { id: expenseId },
    data,
  });

  return parseExpenseFromRecord(updated);
}

export async function deleteExpense(expenseId: string) {
  return prisma.financialRecord.update({
    where: { id: expenseId },
    data: { status: 'CANCELLED' },
  });
}

export async function categorizeExpenseWithAI(expenseId: string) {
  try {
    const record = await prisma.financialRecord.findUniqueOrThrow({ where: { id: expenseId } });
    const extended = record.description ? JSON.parse(record.description) : {};

    const result = await generateJSON<{ suggestedCategory: string; confidence: number }>(
      `Categorize this expense:
Vendor: ${record.vendor ?? 'Unknown'}
Description: ${extended.expenseDescription ?? 'None'}
Amount: $${record.amount}
Current category: ${record.category}

Return JSON with:
- suggestedCategory: the best category for this expense
- confidence: 0-1 confidence score`,
      {
        maxTokens: 128,
        temperature: 0.2,
        system: 'You are an expense categorization assistant. Suggest a single category.',
      }
    );

    return result;
  } catch {
    return { suggestedCategory: 'General', confidence: 0 };
  }
}

export async function getRecurringExpenses(entityId: string) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const records = await prisma.financialRecord.findMany({
    where: {
      entityId,
      type: 'EXPENSE',
      createdAt: { gte: sixMonthsAgo },
      status: { not: 'CANCELLED' },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Group by vendor
  const vendorGroups = new Map<string, Array<{ amount: number; date: Date }>>();
  for (const r of records) {
    if (!r.vendor) continue;
    const group = vendorGroups.get(r.vendor) ?? [];
    group.push({ amount: r.amount, date: r.createdAt });
    vendorGroups.set(r.vendor, group);
  }

  const recurring: Array<{
    vendor: string;
    averageAmount: number;
    frequency: string;
    occurrences: number;
  }> = [];

  for (const [vendor, entries] of vendorGroups) {
    if (entries.length < 2) continue;

    // Check if amounts are similar (within 20% tolerance)
    const amounts = entries.map((e) => e.amount);
    const avgAmount = round2(amounts.reduce((s, a) => s + a, 0) / amounts.length);
    const allSimilar = amounts.every((a) => Math.abs(a - avgAmount) / avgAmount < 0.2);

    if (!allSimilar) continue;

    // Check frequency by looking at intervals between entries
    const intervals: number[] = [];
    for (let i = 1; i < entries.length; i++) {
      const daysBetween = Math.round(
        (entries[i].date.getTime() - entries[i - 1].date.getTime()) / (1000 * 60 * 60 * 24)
      );
      intervals.push(daysBetween);
    }

    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    let frequency = 'irregular';
    if (avgInterval >= 25 && avgInterval <= 35) frequency = 'monthly';
    else if (avgInterval >= 6 && avgInterval <= 8) frequency = 'weekly';
    else if (avgInterval >= 85 && avgInterval <= 95) frequency = 'quarterly';
    else if (avgInterval >= 355 && avgInterval <= 375) frequency = 'annual';

    if (frequency !== 'irregular') {
      recurring.push({ vendor, averageAmount: avgAmount, frequency, occurrences: entries.length });
    }
  }

  return recurring;
}

export async function getExpenseTotals(
  entityId: string,
  dateRange?: { start: Date; end: Date }
) {
  const where: Record<string, unknown> = {
    entityId,
    type: 'EXPENSE',
    status: { not: 'CANCELLED' },
  };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }

  const records = await prisma.financialRecord.findMany({ where });
  const amounts = records.map((r) => r.amount);

  if (amounts.length === 0) {
    return { total: 0, average: 0, largest: 0, smallest: 0, count: 0 };
  }

  return {
    total: round2(amounts.reduce((s, a) => s + a, 0)),
    average: round2(amounts.reduce((s, a) => s + a, 0) / amounts.length),
    largest: round2(Math.max(...amounts)),
    smallest: round2(Math.min(...amounts)),
    count: amounts.length,
  };
}
