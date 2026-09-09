import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import {
  calculateAccuracyMetrics,
  getAccuracyTrend,
} from '@/modules/analytics/services/ai-accuracy-service';

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  periods: z.coerce.number().int().min(1).max(52).optional(),
  period: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      if (parsed.data.periods) {
        const trend = await getAccuracyTrend(
          entityId,
          parsed.data.periods
        );
        return success(trend);
      }

      const period = parsed.data.period ?? 'latest';
      const metrics = await calculateAccuracyMetrics(
        entityId,
        period
      );
      return success(metrics);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to get accuracy metrics', 500);
    }
  });
}
