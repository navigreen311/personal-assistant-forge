import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { CalendarAnalyticsService } from '@/modules/calendar/analytics.service';
import { analyticsSchema } from '@/modules/calendar/calendar.validation';

const analyticsService = new CalendarAnalyticsService();

function getCurrentUserId(): string {
  return 'stub-user-id';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = analyticsSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid optimization request', 400, {
        issues: parsed.error.issues,
      });
    }

    const userId = getCurrentUserId();
    const analytics = await analyticsService.getAnalytics(
      userId,
      { start: parsed.data.startDate, end: parsed.data.endDate },
      parsed.data.entityId
    );

    return success(analytics.suggestions);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to generate optimization suggestions', 500);
  }
}
