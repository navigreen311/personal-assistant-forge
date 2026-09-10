import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import * as energyService from '@/modules/health/services/energy-service';

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0];
      const forecast = await energyService.forecastEnergy(entityId, session.userId, date);
      return success(forecast);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
