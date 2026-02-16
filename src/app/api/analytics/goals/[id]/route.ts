import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  updateGoalProgress,
  completeGoal,
} from '@/modules/analytics/services/goal-tracking-service';

const putBodySchema = z.object({
  action: z.enum(['update_progress', 'complete']),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const goal = await updateGoalProgress(id);
    return success(goal);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Goal not found';
    return error('NOT_FOUND', message, 404);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = putBodySchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    let goal;
    if (parsed.data.action === 'complete') {
      goal = await completeGoal(id);
    } else {
      goal = await updateGoalProgress(id);
    }

    return success(goal);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update goal';
    return error('INTERNAL_ERROR', message, 500);
  }
}
