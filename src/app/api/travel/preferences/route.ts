import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import * as preferencesService from '@/modules/travel/services/preferences-service';

const updateSchema = z.object({
  userId: z.string().min(1),
  airlines: z.array(z.object({
    name: z.string(),
    loyaltyNumber: z.string().optional(),
    seatPreference: z.string(),
    class: z.string(),
  })).optional(),
  hotels: z.array(z.object({
    chain: z.string(),
    loyaltyNumber: z.string().optional(),
    roomType: z.string(),
  })).optional(),
  dietary: z.array(z.string()).optional(),
  budgetPerDayUsd: z.number().optional(),
  preferredAirports: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return error('MISSING_PARAM', 'userId is required', 400);

    const prefs = await preferencesService.getPreferences(userId);
    return success(prefs);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const { userId, ...updates } = parsed.data;
    const prefs = await preferencesService.updatePreferences(userId, updates);
    return success(prefs);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
