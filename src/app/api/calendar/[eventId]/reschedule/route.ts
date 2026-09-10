import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { dragDropSchema } from '@/modules/calendar/calendar.validation';
import type { AuthSession } from '@/lib/auth/types';

const schedulingService = new SchedulingService();

/**
 * Resource-scoped, exactly as in `../route.ts`. See the long note there for why
 * an `[eventId]` route cannot use `withEntityScope` on its own, and why this
 * block is duplicated per route file rather than shared (Next.js route files may
 * only export HTTP handlers).
 */
async function withEventScope(
  request: NextRequest,
  eventId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
      select: { entityId: true },
    });

    if (!owner) {
      return error('NOT_FOUND', 'Event not found', 404);
    }

    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEventScope(request, eventId, async (req, session, entityId) => {
      try {
        const body = await req.json();

        const parsed = dragDropSchema.safeParse({ ...body, eventId });
        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid reschedule request', 400, {
            issues: parsed.error.issues,
          });
        }

        // Before P-05 this handler was `withAuth(request, async (req, session))`
        // and `rescheduleEvent` wrote `update({ where: { id } })` -- no tenant in
        // the WHERE -- so a drag-and-drop naming any event id moved that meeting.
        const result = await schedulingService.rescheduleEvent(
          parsed.data,
          entityId,
          session.userId
        );

        return success(result);
      } catch (_err) {
        return error('INTERNAL_ERROR', 'Failed to reschedule event', 500);
      }
    })
  );
}
