import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { createExpense, listExpenses } from '@/modules/finance/services/expense-service';
import { withAuth } from '@/shared/middleware/auth';

const listQuerySchema = z.object({
  entityId: z.string().min(1),
  category: z.string().optional(),
  vendor: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const createSchema = z.object({
  entityId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(1).default('USD'),
  category: z.string().default(''),
  vendor: z.string().min(1),
  description: z.string().min(1),
  date: z.string().datetime(),
  receiptUrl: z.string().optional(),
  ocrData: z
    .object({
      extractedAmount: z.number(),
      extractedVendor: z.string(),
      extractedDate: z.string(),
      confidence: z.number(),
      rawText: z.string(),
    })
    .optional(),
  isRecurring: z.boolean().default(false),
  recurringFrequency: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']).optional(),
  tags: z.array(z.string()).default([]),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = listQuerySchema.safeParse(params);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId, category, vendor, startDate, endDate, page, pageSize } = parsed.data;
      const dateRange =
        startDate && endDate
          ? { start: new Date(startDate), end: new Date(endDate) }
          : undefined;

      const result = await listExpenses(entityId, { category, vendor, dateRange }, page, pageSize);
      return paginated(result.expenses, result.total, page, pageSize);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const data = parsed.data;
      const expense = await createExpense({
        ...data,
        date: new Date(data.date),
      });

      return success(expense, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
