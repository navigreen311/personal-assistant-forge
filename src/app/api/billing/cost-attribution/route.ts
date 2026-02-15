import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { getTopCostlyWorkflows } from '@/engines/cost/cost-attribution';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');

    if (!entityId) {
      return error('VALIDATION_ERROR', 'entityId query param required', 400);
    }

    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 10;
    const attributions = await getTopCostlyWorkflows(entityId, limit);
    return success(attributions);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to get cost attribution', 500);
  }
}
