import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import * as itineraryService from '@/modules/travel/services/itinerary-service';
import { prisma } from '@/lib/db';

const updateItinerarySchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  notes: z.string().optional(),
  legs: z.array(z.object({
    id: z.string().min(1),
    order: z.number().optional(),
    type: z.enum(['FLIGHT', 'HOTEL', 'CAR_RENTAL', 'TRAIN', 'TRANSFER', 'ACTIVITY']).optional(),
    departureLocation: z.string().optional(),
    arrivalLocation: z.string().optional(),
    departureTime: z.string().transform(s => new Date(s)).optional(),
    arrivalTime: z.string().transform(s => new Date(s)).optional(),
    timezone: z.string().optional(),
    confirmationNumber: z.string().optional(),
    provider: z.string().optional(),
    costUsd: z.number().optional(),
    status: z.enum(['BOOKED', 'PENDING', 'CANCELLED', 'COMPLETED']).optional(),
    notes: z.string().optional(),
  })).optional(),
});

/**
 * Tenancy pattern, section 4: on a `[id]` route the entity is a property of the
 * row, not of the request. `withEntityScope` resolves from query, body or the
 * session's active entity -- none of which say anything about *this* itinerary,
 * so falling through to the session default would answer about a thing the
 * caller never asked for.
 *
 * Authenticate first so an anonymous caller never reaches the database, then
 * read the owning entity off one of the itinerary's CalendarEvent rows and hand
 * it to `withEntityScope`, which proves the caller owns it.
 *
 * This block is deliberately local to the route file: Next.js route files may
 * export only HTTP handlers, so it cannot be extracted into a shared helper
 * beside them.
 */
async function withItineraryScope(
  request: NextRequest,
  itineraryId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.calendarEvent.findFirst({
      where: { prepPacket: { path: ['itineraryId'], equals: itineraryId } },
      // The entity id ONLY -- no itinerary data crosses this line.
      select: { entityId: true },
    });
    if (!owner) return error('NOT_FOUND', 'Itinerary not found', 404);
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withItineraryScope(request, id, async (_req, _session, entityId) => {
    try {
      const itinerary = await itineraryService.getItinerary(entityId, id);
      if (!itinerary) return error('NOT_FOUND', 'Itinerary not found', 404);
      return success(itinerary);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withItineraryScope(request, id, async (req, _session, entityId) => {
    try {
      const itinerary = await itineraryService.getItinerary(entityId, id);
      if (!itinerary) return error('NOT_FOUND', 'Itinerary not found', 404);

      const body = await req.json();
      const parsed = updateItinerarySchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const updates = parsed.data;

      // Update itinerary-level metadata on all associated CalendarEvents
      const events = await prisma.calendarEvent.findMany({
        where: {
          entityId,
          prepPacket: {
            path: ['itineraryId'],
            equals: id,
          },
        },
      });

      for (const event of events) {
        const existingMeta = event.prepPacket as Record<string, unknown>;
        const metaUpdates: Record<string, unknown> = {};
        if (updates.name !== undefined) metaUpdates.itineraryName = updates.name;
        if (updates.status !== undefined) metaUpdates.itineraryStatus = updates.status;
        if (updates.notes !== undefined) metaUpdates.itineraryNotes = updates.notes;

        if (Object.keys(metaUpdates).length > 0) {
          const merged = { ...existingMeta, ...metaUpdates };
          // updateMany, not update: update takes a unique WHERE and cannot carry
          // the entity.
          await prisma.calendarEvent.updateMany({
            where: { id: event.id, entityId },
            data: {
              prepPacket: merged as Parameters<typeof prisma.calendarEvent.update>[0]['data']['prepPacket'],
            },
          });
        }
      }

      // Update individual legs if provided
      if (updates.legs) {
        for (const legUpdate of updates.legs) {
          const { id: legId, ...legFields } = legUpdate;
          await itineraryService.updateLeg(entityId, id, legId, legFields);
        }
      }

      const updated = await itineraryService.getItinerary(entityId, id);
      return success(updated);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withItineraryScope(request, id, async (_req, _session, entityId) => {
    try {
      const itinerary = await itineraryService.getItinerary(entityId, id);
      if (!itinerary) return error('NOT_FOUND', 'Itinerary not found', 404);

      // deleteMany with the scope in the WHERE, so a foreign row cannot be
      // reached even if an id were guessed.
      const removed = await prisma.calendarEvent.deleteMany({
        where: {
          entityId,
          prepPacket: {
            path: ['itineraryId'],
            equals: id,
          },
        },
      });

      return success({ id, deleted: true, events: removed.count });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
