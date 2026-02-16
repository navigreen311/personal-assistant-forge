import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { scheduleRequestSchema } from '@/modules/calendar/calendar.validation';

const schedulingService = new SchedulingService();

function getCurrentUserId(): string {
  return 'stub-user-id';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = scheduleRequestSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid schedule request', 400, {
        issues: parsed.error.issues,
      });
    }

    const userId = getCurrentUserId();
    const suggestions = await schedulingService.findAvailableSlots(
      parsed.data,
      userId,
      body.lookAheadDays
    );

    return success(suggestions);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to find available slots', 500);
  }
}
