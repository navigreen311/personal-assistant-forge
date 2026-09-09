import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { CalendarAnalyticsService } from '@/modules/calendar/analytics.service';
import { analyticsSchema } from '@/modules/calendar/calendar.validation';

const analyticsService = new CalendarAnalyticsService();

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const { searchParams } = req.nextUrl;
      // `entityId` is not parsed off the query string any more. It used to be,
      // and `getAnalytics` used it unchecked -- so `?entityId=<someone else's>`
      // reported their meeting load, busiest day and attendee mix.
      const parsed = analyticsSchema.safeParse({
        startDate: searchParams.get('startDate'),
        endDate: searchParams.get('endDate'),
      });

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid analytics request', 400, {
          issues: parsed.error.issues,
        });
      }

      const analytics = await analyticsService.getAnalytics(
        session.userId,
        { start: parsed.data.startDate, end: parsed.data.endDate },
        entityId
      );

      return success(analytics);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to fetch analytics', 500);
    }
  });
}
