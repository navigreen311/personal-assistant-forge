import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = req.nextUrl;
      const entityId = searchParams.get('entityId');

      // Build entity filter: verify the user owns the entities being queried
      const entityWhere = entityId
        ? { id: entityId, userId: session.userId }
        : { userId: session.userId };

      const userEntities = await prisma.entity.findMany({
        where: entityWhere,
        select: { id: true },
      });

      if (entityId && userEntities.length === 0) {
        return error('FORBIDDEN', 'You do not have access to this entity', 403);
      }

      const entityIds = userEntities.map((e) => e.id);

      // Query decisions grouped by status
      const [activeCount, pendingCount, decidedCount, thisMonthCount] =
        await Promise.all([
          // active = status 'open' or 'in_review'
          prisma.decision.count({
            where: {
              entityId: { in: entityIds },
              status: { in: ['open', 'in_review'] },
            },
          }),
          // pending = status 'in_review' (awaiting input)
          prisma.decision.count({
            where: {
              entityId: { in: entityIds },
              status: 'in_review',
            },
          }),
          // decided = status 'decided'
          prisma.decision.count({
            where: {
              entityId: { in: entityIds },
              status: 'decided',
            },
          }),
          // thisMonth = decided this calendar month
          (() => {
            const now = new Date();
            const startOfMonth = new Date(
              now.getFullYear(),
              now.getMonth(),
              1
            );
            const startOfNextMonth = new Date(
              now.getFullYear(),
              now.getMonth() + 1,
              1
            );
            return prisma.decision.count({
              where: {
                entityId: { in: entityIds },
                status: 'decided',
                decidedAt: {
                  gte: startOfMonth,
                  lt: startOfNextMonth,
                },
              },
            });
          })(),
        ]);

      return success({
        active: activeCount,
        pending: pendingCount,
        decided: decidedCount,
        thisMonth: thisMonthCount,
      });
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to fetch decision stats', 500);
    }
  });
}
