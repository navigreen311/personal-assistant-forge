import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { CalendarAnalyticsService } from '@/modules/calendar/analytics.service';
import { analyticsSchema } from '@/modules/calendar/calendar.validation';

const analyticsService = new CalendarAnalyticsService();

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const body = await req.json();
      const parsed = analyticsSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid optimization request', 400, {
          issues: parsed.error.issues,
        });
      }

      // `parsed.data.entityId` is a plain string off the body and is
      // deliberately ignored; the verified scope is the only one used.
      const analytics = await analyticsService.getAnalytics(
        session.userId,
        { start: parsed.data.startDate, end: parsed.data.endDate },
        entityId
      );

      return success(analytics.suggestions);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to generate optimization suggestions', 500);
    }
  });
}
