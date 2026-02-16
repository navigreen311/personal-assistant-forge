import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { getBudget, consumeBudget, setBudget, resetBudget } from '@/modules/attention/services/attention-budget-service';

const setBudgetSchema = z.object({
  dailyBudget: z.number().int().min(1).max(100),
});

const consumeBudgetSchema = z.object({
  amount: z.number().int().min(1).optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const budget = await getBudget(session.userId);
      return success(budget);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const action = body.action as string;

      if (action === 'consume') {
        const parsed = consumeBudgetSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);
        const result = await consumeBudget(session.userId, parsed.data.amount);
        return success(result);
      }

      if (action === 'reset') {
        const budget = await resetBudget(session.userId);
        return success(budget);
      }

      // Default: set budget
      const parsed = setBudgetSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);
      const budget = await setBudget(session.userId, parsed.data.dailyBudget);
      return success(budget);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
