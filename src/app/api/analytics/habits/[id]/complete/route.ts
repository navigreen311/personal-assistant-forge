import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { recordCompletion } from '@/modules/analytics/services/habit-tracking-service';

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  completed: z.boolean(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const habit = await recordCompletion(
      id,
      parsed.data.date,
      parsed.data.completed
    );
    return success(habit);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record completion';
    return error('INTERNAL_ERROR', message, 500);
  }
}
