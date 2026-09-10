import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { getCallAnalytics } from '@/modules/analytics/services/call-analytics-service';

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const analytics = await getCallAnalytics(
        entityId,
        new Date(parsed.data.start),
        new Date(parsed.data.end)
      );
      return success(analytics);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to get call analytics', 500);
    }
  });
}
