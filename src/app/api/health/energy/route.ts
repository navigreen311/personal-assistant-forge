import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import * as energyService from '@/modules/health/services/energy-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get('userId');
    const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0];

    if (!userId) return error('MISSING_PARAM', 'userId is required', 400);

    const forecast = await energyService.forecastEnergy(userId, date);
    return success(forecast);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
