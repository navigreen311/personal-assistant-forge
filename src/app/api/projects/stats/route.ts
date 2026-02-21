import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';


export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const entityId = req.nextUrl.searchParams.get('entityId') ?? undefined;

      // Get all entity IDs belonging to the authenticated user
      const userEntities = await prisma.entity.findMany({
        where: { userId: session.userId },
        select: { id: true },
      });
      const userEntityIds = userEntities.map((e) => e.id);

      // If entityId filter provided, verify it belongs to user
      if (entityId && !userEntityIds.includes(entityId)) {
        return error('FORBIDDEN', 'You do not have access to this entity', 403);
      }

      const entityFilter = entityId ? [entityId] : userEntityIds;

      if (entityFilter.length === 0) {
        return success({ total: 0, onTrack: 0, atRisk: 0, completed: 0 });
      }

      const [total, onTrack, atRisk, completed] = await Promise.all([
        prisma.project.count({
          where: { entityId: { in: entityFilter } },
        }),
        prisma.project.count({
          where: { entityId: { in: entityFilter }, health: 'GREEN' },
        }),
        prisma.project.count({
          where: { entityId: { in: entityFilter }, health: { in: ['YELLOW', 'RED'] } },
        }),
        prisma.project.count({
          where: { entityId: { in: entityFilter }, status: 'DONE' },
        }),
      ]);

      return success({ total, onTrack, atRisk, completed });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to get project stats', 500);
    }
  });
}
