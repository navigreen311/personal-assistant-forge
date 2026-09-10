import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

/**
 * A GENUINE CROSS-ENTITY ROLLUP (tenancy-pattern.md sec.5b): with no entityId this
 * counts documents across every entity the caller owns, which is what the
 * documents dashboard shows. It therefore keeps withAuth and proves the scope
 * as a SET, rather than narrowing to the session's active entity.
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = new URL(req.url);
      const entityId = searchParams.get('entityId');

      // Find all entities belonging to this user
      const entityWhere: Record<string, unknown> = { userId: session.userId };
      if (entityId) {
        entityWhere.id = entityId;
      }

      const entities = await prisma.entity.findMany({
        where: entityWhere,
        select: { id: true },
      });

      // A caller naming an entity they do not own gets an explicit 403 rather
      // than a silently zeroed rollup.
      if (entityId && entities.length === 0) {
        return error('FORBIDDEN', 'You do not have access to this entity', 403);
      }

      const entityIds = entities.map((e) => e.id);

      if (entityIds.length === 0) {
        return success({
          total: 0,
          drafts: 0,
          pendingReview: 0,
          signed: 0,
        });
      }

      const baseWhere = {
        entityId: { in: entityIds },
        deletedAt: null,
      };

      const [total, drafts, pendingReview, signed] = await Promise.all([
        prisma.document.count({ where: baseWhere }),
        prisma.document.count({ where: { ...baseWhere, status: 'DRAFT' } }),
        prisma.document.count({ where: { ...baseWhere, status: 'ACTIVE' } }),
        prisma.document.count({ where: { ...baseWhere, status: 'ARCHIVED' } }),
      ]);

      return success({
        total,
        drafts,
        pendingReview,
        signed,
      });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to fetch document stats',
        500
      );
    }
  });
}
