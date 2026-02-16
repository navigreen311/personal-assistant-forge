import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import * as itineraryService from '@/modules/travel/services/itinerary-service';

const createSchema = z.object({
  userId: z.string().min(1),
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
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get('userId');
    const status = searchParams.get('status') ?? undefined;

    if (!userId) return error('MISSING_PARAM', 'userId is required', 400);

    const itineraries = await itineraryService.listItineraries(userId, status);
    return success(itineraries);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const { userId, name, legs } = parsed.data;
    const itinerary = await itineraryService.createItinerary(userId, name, legs);
    return success(itinerary, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
