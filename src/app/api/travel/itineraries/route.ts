import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import * as itineraryService from '@/modules/travel/services/itinerary-service';

const createSchema = z.object({
  name: z.string().min(1),
  legs: z.array(z.object({
    order: z.number(),
    type: z.enum(['FLIGHT', 'HOTEL', 'CAR_RENTAL', 'TRAIN', 'TRANSFER', 'ACTIVITY']),
    departureLocation: z.string(),
    arrivalLocation: z.string(),
    departureTime: z.string().transform(s => new Date(s)),
    arrivalTime: z.string().transform(s => new Date(s)),
    timezone: z.string(),
    confirmationNumber: z.string().optional(),
    provider: z.string().optional(),
    costUsd: z.number(),
    status: z.enum(['BOOKED', 'PENDING', 'CANCELLED', 'COMPLETED']),
    notes: z.string().optional(),
  })),
  // Optional and still verified; see the tenancy pattern, section 1.
  entityId: z.string().min(1).optional(),
});

/**
 * Single-entity by choice (tenancy pattern section 5b). See the note on
 * `listItineraries` for why an itinerary belongs to an entity rather than to a
 * user across all of them.
 */
export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const status = req.nextUrl.searchParams.get('status') ?? undefined;
      const itineraries = await itineraryService.listItineraries(entityId, status);
      return success(itineraries);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const body = await req.json();
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const { name, legs } = parsed.data;
      const itinerary = await itineraryService.createItinerary(
        entityId,
        session.userId,
        name,
        legs
      );
      return success(itinerary, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
