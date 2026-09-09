import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { conflictCheckSchema } from '@/modules/calendar/calendar.validation';

const schedulingService = new SchedulingService();

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const body = await req.json();
      const parsed = conflictCheckSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid conflict check request', 400, {
          issues: parsed.error.issues,
        });
      }

      // The verified scope replaces `parsed.data.entityId`. `detectConflicts`
      // partitions the caller's own events into "this entity" and
      // "cross-entity", so an unverified value did not leak rows here -- but it
      // did decide which of the caller's events counted as CROSS_ENTITY, and
      // it is the only argument the service will now accept.
      const conflicts = await schedulingService.detectConflicts(
        entityId,
        { start: parsed.data.startTime, end: parsed.data.endTime },
        session.userId,
        parsed.data.excludeEventId
      );

      return success(conflicts);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to check conflicts', 500);
    }
  });
}
