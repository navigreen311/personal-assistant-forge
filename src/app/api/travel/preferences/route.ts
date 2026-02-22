import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import * as preferencesService from '@/modules/travel/services/preferences-service';

const updateSchema = z.object({
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
  // Extended preferences fields
  homeAirport: z.string().optional(),
  seatPreference: z.string().optional(),
  cabinClass: z.string().optional(),
  dietaryNeeds: z.string().optional(),
  tsaPrecheck: z.string().optional(),
  globalEntry: z.string().optional(),
  passportExpiry: z.string().optional(),
  driversLicenseExpiry: z.string().optional(),
  defaultTripType: z.enum(['Business', 'Personal']).optional(),
  defaultEntity: z.string().optional(),
  autoPackingList: z.boolean().optional(),
  autoExpenseCategory: z.boolean().optional(),
  monitorFlightStatus: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const prefs = await preferencesService.getPreferences(session.userId);
      return success(prefs);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = updateSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const prefs = await preferencesService.updatePreferences(session.userId, parsed.data);
      return success(prefs);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
