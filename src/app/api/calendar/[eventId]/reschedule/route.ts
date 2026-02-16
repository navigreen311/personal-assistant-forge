import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { dragDropSchema } from '@/modules/calendar/calendar.validation';

const schedulingService = new SchedulingService();

function getCurrentUserId(): string {
  return 'stub-user-id';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const body = await req.json();

    const parsed = dragDropSchema.safeParse({ ...body, eventId });
    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid reschedule request', 400, {
        issues: parsed.error.issues,
      });
    }

    const userId = getCurrentUserId();
    const result = await schedulingService.rescheduleEvent(parsed.data, userId);

    return success(result);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to reschedule event', 500);
  }
}
