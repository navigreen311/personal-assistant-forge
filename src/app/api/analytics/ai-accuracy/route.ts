import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import {
  calculateAccuracyMetrics,
  getAccuracyTrend,
} from '@/modules/analytics/services/ai-accuracy-service';

const querySchema = z.object({
  entityId: z.string().min(1),
  periods: z.coerce.number().int().min(1).max(52).optional(),
  period: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      if (parsed.data.periods) {
        const trend = await getAccuracyTrend(
          parsed.data.entityId,
          parsed.data.periods
        );
        return success(trend);
      }

      const period = parsed.data.period ?? 'latest';
      const metrics = await calculateAccuracyMetrics(
        parsed.data.entityId,
        period
      );
      return success(metrics);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to get accuracy metrics', 500);
    }
  });
}
