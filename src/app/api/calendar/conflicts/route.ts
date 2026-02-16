import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { conflictCheckSchema } from '@/modules/calendar/calendar.validation';

const schedulingService = new SchedulingService();

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = conflictCheckSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid conflict check request', 400, {
          issues: parsed.error.issues,
        });
      }

      const conflicts = await schedulingService.detectConflicts(
        parsed.data.entityId,
        { start: parsed.data.startTime, end: parsed.data.endTime },
        session.userId,
        parsed.data.excludeEventId
      );

      return success(conflicts);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to check conflicts', 500);
    }
  });
}
