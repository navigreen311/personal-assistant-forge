import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { scheduleRequestSchema } from '@/modules/calendar/calendar.validation';

const schedulingService = new SchedulingService();

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = scheduleRequestSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid schedule request', 400, {
          issues: parsed.error.issues,
        });
      }

      const suggestions = await schedulingService.findAvailableSlots(
        parsed.data,
        session.userId,
        body.lookAheadDays
      );

      return success(suggestions);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to find available slots', 500);
    }
  });
}
