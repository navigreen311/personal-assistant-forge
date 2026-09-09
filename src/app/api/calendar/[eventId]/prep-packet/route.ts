import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import { PrepPacketService } from '@/modules/calendar/prep.service';
import { prepPacketSchema } from '@/modules/calendar/calendar.validation';
import type { AuthSession } from '@/lib/auth/types';
import type { GeneratedPrepPacket } from '@/modules/calendar/calendar.types';

const prepService = new PrepPacketService();

/**
 * Resource-scoped, exactly as in `../route.ts`. See the long note there.
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
      // This is the highest-value read in the module: a prep packet holds the
      // attendees' relationship scores, the last five messages exchanged with
      // them, and their open tasks. The old handler discarded the session as
      // `_session` and read `findUnique({ where: { id: eventId } })`, so any
      // authenticated caller with an event id got another tenant's CRM.
      const event = await prisma.calendarEvent.findFirst({
        where: { id: eventId, entityId },
        select: { prepPacket: true },
      });

      if (!event) {
        return error('NOT_FOUND', 'Event not found', 404);
      }

      if (!event.prepPacket) {
        return error('NOT_FOUND', 'No prep packet generated yet', 404);
      }

      return success(event.prepPacket as unknown as GeneratedPrepPacket);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to fetch prep packet', 500);
    }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  return withEventScope(request, eventId, async (req, _session, entityId) => {
    try {
      const body = await req.json();

      const parsed = prepPacketSchema.safeParse({ ...body, eventId });
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid prep packet request', 400, {
          issues: parsed.error.issues,
        });
      }

      // `entityId` spread LAST: the body's own value is overwritten. It used to
      // be the WHERE clause of three separate lookups -- contacts, messages and
      // tasks -- under no ownership check at all.
      const { entityId: _requested, ...draft } = parsed.data;

      const packet = await prepService.generatePrepPacket({ ...draft, entityId });
      return success(packet, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to generate prep packet', 500);
    }
  });
}
