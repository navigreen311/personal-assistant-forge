import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { calendarViewSchema, scheduleRequestSchema } from '@/modules/calendar/calendar.validation';

const schedulingService = new SchedulingService();

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = req.nextUrl;
      const parsed = calendarViewSchema.safeParse({
        viewMode: searchParams.get('viewMode') ?? 'week',
        date: searchParams.get('date') ?? new Date().toISOString(),
        entityId: searchParams.get('entityId') ?? undefined,
      });

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid query parameters', 400, {
          issues: parsed.error.issues,
        });
      }

      const data = await schedulingService.getCalendarViewData(
        session.userId,
        parsed.data.viewMode,
        parsed.data.date,
        parsed.data.entityId
      );

      return success(data);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to fetch calendar data', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const { selectedSlot, ...scheduleData } = body;

      const parsed = scheduleRequestSchema.safeParse(scheduleData);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid schedule request', 400, {
          issues: parsed.error.issues,
        });
      }

      if (!selectedSlot?.start || !selectedSlot?.end) {
        return error('VALIDATION_ERROR', 'selectedSlot with start and end is required', 400);
      }

      const event = await schedulingService.createEvent(
        parsed.data,
        { start: new Date(selectedSlot.start), end: new Date(selectedSlot.end) },
        session.userId
      );

      return success(event, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to create event', 500);
    }
  });
}
