import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { scheduleRequestSchema } from '@/modules/calendar/calendar.validation';

const schedulingService = new SchedulingService();

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const body = await req.json();
      const parsed = scheduleRequestSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid schedule request', 400, {
          issues: parsed.error.issues,
        });
      }

      // `entityId` spread LAST: it overwrites the caller's own value.
      const { entityId: _requested, ...draft } = parsed.data;

      const suggestions = await schedulingService.findAvailableSlots(
        { ...draft, entityId },
        session.userId,
        body.lookAheadDays
      );

      return success(suggestions);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to find available slots', 500);
    }
  });
}
