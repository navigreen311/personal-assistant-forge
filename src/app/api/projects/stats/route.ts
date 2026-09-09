import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope } from '@/shared/middleware/auth';

/**
 * Project counters, for one entity or across all of the caller's entities.
 *
 * Same two-case shape as `GET /api/projects`, for the same reason: a
 * cross-entity roll-up has no single entity for withEntityScope to verify, so
 * the union is derived from `session.userId` and never from the request.
 *
 * Note what changed even though this route was already checking ownership: it
 * used to answer a foreign `?entityId=` with a 403 assembled by hand, after
 * loading every entity the user owns. It now gets the same 403 from the frozen
 * middleware, with the same code and message as every other route in the
 * system. Consistent refusals matter -- a route that refuses differently is a
 * route an attacker can use to tell "exists but not yours" from "does not
 * exist".
 */
export async function GET(request: NextRequest) {
  const requestedEntityId = request.nextUrl.searchParams.get('entityId');

  if (requestedEntityId) {
    return withEntityScope(request, async (_req, _session, entityId) =>
      projectStatsFor([entityId])
    );
  }

  return withAuth(request, async (_req, session) => {
    const userEntities = await prisma.entity.findMany({
      where: { userId: session.userId },
      select: { id: true },
    });
    return projectStatsFor(userEntities.map((e) => e.id));
  });
}

async function projectStatsFor(entityIds: string[]): Promise<Response> {
  try {
    if (entityIds.length === 0) {
      return success({ total: 0, onTrack: 0, atRisk: 0, completed: 0 });
    }

    const [total, onTrack, atRisk, completed] = await Promise.all([
      prisma.project.count({
        where: { entityId: { in: entityIds } },
      }),
      prisma.project.count({
        where: { entityId: { in: entityIds }, health: 'GREEN' },
      }),
      prisma.project.count({
        where: { entityId: { in: entityIds }, health: { in: ['YELLOW', 'RED'] } },
      }),
      prisma.project.count({
        where: { entityId: { in: entityIds }, status: 'DONE' },
      }),
    ]);

    return success({ total, onTrack, atRisk, completed });
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to get project stats', 500);
  }
}
