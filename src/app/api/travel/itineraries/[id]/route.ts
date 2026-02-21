import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const itinerary = await itineraryService.getItinerary(id);
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
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const itinerary = await itineraryService.getItinerary(id);
      if (!itinerary) return error('NOT_FOUND', 'Itinerary not found', 404);

      const body = await req.json();
      const parsed = updateItinerarySchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const updates = parsed.data;

      // Update itinerary-level metadata on all associated CalendarEvents
      const events = await prisma.calendarEvent.findMany({
        where: {
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
          await prisma.calendarEvent.update({
            where: { id: event.id },
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
          await itineraryService.updateLeg(id, legId, legFields);
        }
      }

      const updated = await itineraryService.getItinerary(id);
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
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const itinerary = await itineraryService.getItinerary(id);
      if (!itinerary) return error('NOT_FOUND', 'Itinerary not found', 404);

      // Delete all CalendarEvents associated with this itinerary
      const events = await prisma.calendarEvent.findMany({
        where: {
          prepPacket: {
            path: ['itineraryId'],
            equals: id,
          },
        },
      });

      for (const event of events) {
        await prisma.calendarEvent.delete({ where: { id: event.id } });
      }

      return success({ id, deleted: true });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
