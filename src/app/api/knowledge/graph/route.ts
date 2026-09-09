import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { buildGraph } from '@/modules/knowledge/services/graph-service';
import { withEntityScope } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      const graph = await buildGraph(entityId);
      return success(graph);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to build knowledge graph', 500);
    }
  });
}
