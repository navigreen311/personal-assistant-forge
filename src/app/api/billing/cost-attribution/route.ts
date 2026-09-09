import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { getTopCostlyWorkflows } from '@/engines/cost/cost-attribution';

/** An AGGREGATE: spend per workflow, summed across usage rows. */
export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = new URL(req.url);
      const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 10;
      const attributions = await getTopCostlyWorkflows(entityId, limit);
      return success(attributions);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to get cost attribution', 500);
    }
  });
}
