import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope } from '@/shared/middleware/auth';
import { buildDependencyGraph } from '@/modules/tasks/services/dependency-graph';

/**
 * Resource-scoped, like `/api/tasks/[id]`: the entity is a property of the
 * project the graph is being built for, not something the caller states.
 * Authenticate, resolve the owning entity from the project row (id only), then
 * let withEntityScope prove ownership of THAT entity.
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (authedReq) => {
    const projectId = authedReq.nextUrl.searchParams.get('projectId');

    if (!projectId) {
      return error('VALIDATION_ERROR', 'projectId is required', 400);
    }

    const owner = await prisma.project.findUnique({
      where: { id: projectId },
      select: { entityId: true },
    });

    if (!owner) {
      return error('NOT_FOUND', 'Project not found', 404);
    }

    return withEntityScope(
      authedReq,
      async (_req, _session, entityId) => {
        try {
          const graph = await buildDependencyGraph(projectId, entityId);
          return success(graph);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Failed to build dependency graph';
          return error('GRAPH_FAILED', message, 500);
        }
      },
      owner.entityId
    );
  });
}
