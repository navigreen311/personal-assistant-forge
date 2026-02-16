import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { reviewEntry } from '@/modules/decisions/services/decision-journal';

const ReviewSchema = z.object({
  actualOutcomes: z.array(z.string()).min(1),
  status: z.enum(['REVIEWED_CORRECT', 'REVIEWED_INCORRECT', 'REVIEWED_MIXED']),
  lessonsLearned: z.string().min(1),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = ReviewSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const entry = await reviewEntry(
        id,
        parsed.data.actualOutcomes,
        parsed.data.status,
        parsed.data.lessonsLearned
      );

      return success(entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to review journal entry';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
