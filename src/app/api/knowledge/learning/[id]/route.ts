import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { updateProgress } from '@/modules/knowledge/services/learning-tracker';

const updateProgressSchema = z.object({
  progress: z.number().min(0).max(100),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateProgressSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const item = await updateProgress(id, parsed.data.progress);
    return success(item);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update learning progress';
    if (message.includes('not found')) {
      return error('NOT_FOUND', message, 404);
    }
    return error('INTERNAL_ERROR', message, 500);
  }
}
