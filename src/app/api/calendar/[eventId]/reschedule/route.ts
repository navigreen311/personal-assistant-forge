import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { dragDropSchema } from '@/modules/calendar/calendar.validation';

const schedulingService = new SchedulingService();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { eventId } = await params;
      const body = await req.json();

      const parsed = dragDropSchema.safeParse({ ...body, eventId });
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid reschedule request', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = await schedulingService.rescheduleEvent(parsed.data, session.userId);

      return success(result);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to reschedule event', 500);
    }
  });
}
