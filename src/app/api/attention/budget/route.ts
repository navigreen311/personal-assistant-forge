import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getBudget, consumeBudget, setBudget, resetBudget } from '@/modules/attention/services/attention-budget-service';

const setBudgetSchema = z.object({
  userId: z.string().min(1),
  dailyBudget: z.number().int().min(1).max(100),
});

const consumeBudgetSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().min(1).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return error('VALIDATION_ERROR', 'userId is required', 400);

    const budget = await getBudget(userId);
    return success(budget);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as string;

    if (action === 'consume') {
      const parsed = consumeBudgetSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);
      const result = await consumeBudget(parsed.data.userId, parsed.data.amount);
      return success(result);
    }

    if (action === 'reset') {
      if (!body.userId) return error('VALIDATION_ERROR', 'userId is required', 400);
      const budget = await resetBudget(body.userId);
      return success(budget);
    }

    // Default: set budget
    const parsed = setBudgetSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);
    const budget = await setBudget(parsed.data.userId, parsed.data.dailyBudget);
    return success(budget);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
