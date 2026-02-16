import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  calculateProductivityScore,
  getProductivityTrend,
} from '@/modules/analytics/services/productivity-scoring';

const querySchema = z.object({
  userId: z.string().min(1),
  days: z.coerce.number().int().min(1).max(365).optional(),
  date: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = querySchema.safeParse(params);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    if (parsed.data.days) {
      const scores = await getProductivityTrend(
        parsed.data.userId,
        parsed.data.days
      );
      return success(scores);
    }

    const date =
      parsed.data.date ?? new Date().toISOString().split('T')[0];
    const score = await calculateProductivityScore(
      parsed.data.userId,
      date
    );
    return success(score);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to calculate productivity', 500);
  }
}
