import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { CalendarAnalyticsService } from '@/modules/calendar/analytics.service';
import { analyticsSchema } from '@/modules/calendar/calendar.validation';

const analyticsService = new CalendarAnalyticsService();

function getCurrentUserId(): string {
  return 'stub-user-id';
}

export async function GET(req: NextRequest) {
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

    const userId = getCurrentUserId();
    const analytics = await analyticsService.getAnalytics(
      userId,
      { start: parsed.data.startDate, end: parsed.data.endDate },
      parsed.data.entityId
    );

    return success(analytics);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to fetch analytics', 500);
  }
}
