import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getUnifiedDashboard } from '@/modules/finance/services/dashboard-service';
import { withAuth } from '@/shared/middleware/auth';

const querySchema = z.object({
  userId: z.string().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { userId, startDate, endDate } = parsed.data;
      const dashboard = await getUnifiedDashboard(userId, {
        start: new Date(startDate),
        end: new Date(endDate),
      });

      return success(dashboard);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
