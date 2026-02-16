import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getBudget, setBudget } from '@/engines/cost/budget-service';

const SetBudgetSchema = z.object({
  entityId: z.string().min(1),
  monthlyCapUsd: z.number().positive(),
  alertThresholds: z.array(z.number().min(0).max(1)).optional(),
  overageBehavior: z.enum(['BLOCK', 'WARN', 'ALLOW_WITH_APPROVAL']).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');

    if (!entityId) {
      return error('VALIDATION_ERROR', 'entityId query param required', 400);
    }

    const budget = await getBudget(entityId);
    if (!budget) {
      return error('NOT_FOUND', `No budget found for entity ${entityId}`, 404);
    }

    return success(budget);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to get budget', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = SetBudgetSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const budget = await setBudget(
      parsed.data.entityId,
      parsed.data.monthlyCapUsd,
      parsed.data.alertThresholds,
      parsed.data.overageBehavior
    );
    return success(budget, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to set budget', 500);
  }
}
