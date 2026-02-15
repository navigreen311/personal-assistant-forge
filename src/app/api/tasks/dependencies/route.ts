import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { buildDependencyGraph } from '@/modules/tasks/services/dependency-graph';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const projectId = params.get('projectId');

    if (!projectId) {
      return error('VALIDATION_ERROR', 'projectId is required', 400);
    }

    const graph = await buildDependencyGraph(projectId);
    return success(graph);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build dependency graph';
    return error('GRAPH_FAILED', message, 500);
  }
}
