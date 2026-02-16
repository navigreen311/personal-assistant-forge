import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import * as vehicleService from '@/modules/household/services/vehicle-service';

const addVehicleSchema = z.object({
  userId: z.string().min(1),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number(),
  vin: z.string().optional(),
  mileage: z.number(),
  nextServiceDate: z.string().transform(s => new Date(s)).optional(),
  nextServiceType: z.string().optional(),
  insuranceExpiry: z.string().transform(s => new Date(s)).optional(),
  registrationExpiry: z.string().transform(s => new Date(s)).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return error('MISSING_PARAM', 'userId is required', 400);

    const vehicles = await vehicleService.getVehicles(userId);
    return success(vehicles);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = addVehicleSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const vehicle = await vehicleService.addVehicle(parsed.data.userId, parsed.data);
    return success(vehicle, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
