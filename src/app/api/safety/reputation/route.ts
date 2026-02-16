import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { getReputationDashboard } from '@/engines/trust-safety/reputation-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');

    if (!entityId) {
      return error('VALIDATION_ERROR', 'entityId query param required', 400);
    }

    const dashboard = await getReputationDashboard(entityId);
    return success(dashboard);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to get reputation dashboard', 500);
  }
}
