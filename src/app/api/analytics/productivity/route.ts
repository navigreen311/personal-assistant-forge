import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import {
  calculateProductivityScore,
  getProductivityTrend,
} from '@/modules/analytics/services/productivity-scoring';

const querySchema = z.object({
  userId: z.string().min(1).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  date: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const userId = parsed.data.userId ?? session.userId;

      if (parsed.data.days) {
        const scores = await getProductivityTrend(userId, parsed.data.days);
        return success(scores);
      }

      const date =
        parsed.data.date ?? new Date().toISOString().split('T')[0];
      const score = await calculateProductivityScore(userId, date);
      return success(score);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to calculate productivity', 500);
    }
  });
}
