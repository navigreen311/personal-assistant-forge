import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { CalendarAnalyticsService } from '@/modules/calendar/analytics.service';
import { analyticsSchema } from '@/modules/calendar/calendar.validation';

const analyticsService = new CalendarAnalyticsService();

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = req.nextUrl;
      const parsed = analyticsSchema.safeParse({
        startDate: searchParams.get('startDate'),
        endDate: searchParams.get('endDate'),
        entityId: searchParams.get('entityId') ?? undefined,
      });

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid analytics request', 400, {
          issues: parsed.error.issues,
        });
      }

      const analytics = await analyticsService.getAnalytics(
        session.userId,
        { start: parsed.data.startDate, end: parsed.data.endDate },
        parsed.data.entityId
      );

      return success(analytics);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to fetch analytics', 500);
    }
  });
}
