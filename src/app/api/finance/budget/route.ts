import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { createBudget } from '@/modules/finance/services/budget-service';
import { withAuth } from '@/shared/middleware/auth';
import type { Budget } from '@/modules/finance/types';

const listQuerySchema = z.object({
  entityId: z.string().min(1),
});

const categorySchema = z.object({
  category: z.string().min(1),
  budgeted: z.number().min(0),
  spent: z.number().min(0).default(0),
  remaining: z.number().default(0),
  percentUsed: z.number().default(0),
  forecast: z.number().default(0),
  alert: z.enum(['ON_TRACK', 'WARNING', 'OVER_BUDGET']).nullable().default(null),
});

const createSchema = z.object({
  entityId: z.string().min(1),
  name: z.string().min(1),
  period: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  categories: z.array(categorySchema).min(1),
  totalBudgeted: z.number().min(0),
  status: z.enum(['ACTIVE', 'DRAFT', 'CLOSED']).default('DRAFT'),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = listQuerySchema.safeParse(params);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const docs = await prisma.document.findMany({
        where: { entityId: parsed.data.entityId, type: 'REPORT' },
        orderBy: { createdAt: 'desc' },
      });

      const budgets: Budget[] = docs
        .map((doc) => {
          try {
            const data = doc.content ? JSON.parse(doc.content) : null;
            if (!data?.periodStart) return null;
            return {
              id: doc.id,
              entityId: doc.entityId,
              name: doc.title,
              period: { start: new Date(data.periodStart), end: new Date(data.periodEnd) },
              categories: data.categories ?? [],
              totalBudgeted: data.totalBudgeted ?? 0,
              totalSpent: data.totalSpent ?? 0,
              remainingBudget: data.remainingBudget ?? 0,
              status: data.status ?? 'DRAFT',
            } as Budget;
          } catch {
            return null;
          }
        })
        .filter((b): b is Budget => b !== null);

      return success(budgets);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const data = parsed.data;
      const budget = await createBudget({
        ...data,
        period: {
          start: new Date(data.period.start),
          end: new Date(data.period.end),
        },
      });

      return success(budget, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
