import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { buildGraph } from '@/modules/knowledge/services/graph-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const entityId = searchParams.get('entityId');

    if (!entityId) {
      return error('VALIDATION_ERROR', 'entityId is required', 400);
    }

    const graph = await buildGraph(entityId);
    return success(graph);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to build knowledge graph', 500);
  }
}
