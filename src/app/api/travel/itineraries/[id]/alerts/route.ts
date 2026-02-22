import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import * as flightMonitorService from '@/modules/travel/services/flight-monitor-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await params;
      const alerts = await flightMonitorService.checkFlightStatus(id);
      return success(alerts);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
