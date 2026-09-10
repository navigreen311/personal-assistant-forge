import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { eventUpdateSchema } from '@/modules/calendar/calendar.validation';
import type { AuthSession } from '@/lib/auth/types';
import type { CalendarEvent } from '@/shared/types';

const schedulingService = new SchedulingService();

/**
 * A RESOURCE-SCOPED route: the entity is not in the request at all, it is a
 * property of the row being addressed.
 *
 * `withEntityScope` on its own resolves the entity from the query string, the
 * body, or the session's active entity -- none of which apply to
 * `GET /api/calendar/<eventId>`. Falling through to the session's active entity
 * would be wrong: it would answer about an event the caller never asked for, or
 * 404 an event they legitimately own in a different entity.
 *
 * So, in this order:
 *   1. `withAuth` -- authenticate first, so an anonymous caller never causes a
 *      database read and cannot use timing to probe which event ids exist.
 *   2. look up which entity owns the row. Select the id ONLY; no event data
 *      crosses this boundary before ownership is proven.
 *   3. hand that entity to `withEntityScope` as its explicit third argument. It
 *      re-reads the entity and proves the caller owns it -- 403 if not.
 *
 * Do NOT skip step 3 and pass the looked-up `entityId` to the service directly:
 * it is a plain `string` and the service will not accept it. The compile error
 * is the mechanism working.
 *
 * Kept local to the route file because Next.js route files may only export HTTP
 * handlers. See docs/parallel-build/tenancy-pattern.md section 4.
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  return withEventScope(request, eventId, async (_req, _session, entityId) => {
    try {
      // Scoped read. The old handler was `withAuth(request, async (_req,
      // _session) => ...)` followed by `findUnique({ where: { id: eventId } })`
      // -- any authenticated caller who knew an id read any tenant's meeting,
      // including its notes and its prep packet.
      const event = await prisma.calendarEvent.findFirst({
        where: { id: eventId, entityId },
      });

      if (!event) {
        return error('NOT_FOUND', 'Event not found', 404);
      }

      const result: CalendarEvent = {
        id: event.id,
        title: event.title,
        entityId: event.entityId,
        participantIds: event.participantIds,
        startTime: event.startTime,
        endTime: event.endTime,
        bufferBefore: event.bufferBefore ?? undefined,
        bufferAfter: event.bufferAfter ?? undefined,
        prepPacket: event.prepPacket as unknown as CalendarEvent['prepPacket'],
        meetingNotes: event.meetingNotes ?? undefined,
        recurrence: event.recurrence ?? undefined,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      };

      return success(result);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to fetch event', 500);
    }
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEventScope(request, eventId, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = eventUpdateSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid event update', 400, {
            issues: parsed.error.issues,
          });
        }

        const event = await schedulingService.updateEvent(eventId, parsed.data, entityId);
        return success(event);
      } catch (_err) {
        return error('INTERNAL_ERROR', 'Failed to update event', 500);
      }
    })
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEventScope(request, eventId, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = eventUpdateSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid event update', 400, {
            issues: parsed.error.issues,
          });
        }

        // The old handler ran an unscoped `findUnique` here purely to turn a
        // missing row into a 404. `withEventScope` already does that, and
        // `updateEvent` scopes the write itself, so the extra read is gone.
        const event = await schedulingService.updateEvent(eventId, parsed.data, entityId);
        return success(event);
      } catch (_err) {
        return error('INTERNAL_ERROR', 'Failed to update event', 500);
      }
    })
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  return withRole(request, ['owner', 'admin'], () =>
    withEventScope(request, eventId, async (_req, _session, entityId) => {
      try {
        await schedulingService.deleteEvent(eventId, entityId);
        return success({ deleted: true });
      } catch (_err) {
        return error('INTERNAL_ERROR', 'Failed to delete event', 500);
      }
    })
  );
}
