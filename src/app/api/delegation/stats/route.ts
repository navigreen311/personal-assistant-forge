// ============================================================================
// GET /api/delegation/stats - Returns delegation statistics
// ============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

// --- Validation Schema ---

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
});

// --- Safe count wrapper ---

const safeCount = async (fn: () => Promise<number>): Promise<number> => {
  try {
    return await fn();
  } catch {
    return 0;
  }
};

// --- Handler ---

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId } = parsed.data;

      // Verify entity ownership if entityId is provided
      if (entityId) {
        const entity = await prisma.entity.findFirst({
          where: { id: entityId, userId: session.userId },
        });

        if (!entity) {
          return error('NOT_FOUND', 'Entity not found', 404);
        }
      }

      // Get all entity IDs for this user if no specific entityId
      let entityIds: string[] = [];
      if (entityId) {
        entityIds = [entityId];
      } else {
        try {
          const entities = await prisma.entity.findMany({
            where: { userId: session.userId },
            select: { id: true },
          });
          entityIds = entities.map((e) => e.id);
        } catch {
          return success({
            activeDelegated: 0,
            completedThisWeek: 0,
            timeSavedHours: 0,
            pendingApproval: 0,
          });
        }
      }

      if (entityIds.length === 0) {
        return success({
          activeDelegated: 0,
          completedThisWeek: 0,
          timeSavedHours: 0,
          pendingApproval: 0,
        });
      }

      const now = new Date();
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);

      const entityFilter =
        entityIds.length === 1
          ? { entityId: entityIds[0] }
          : { entityId: { in: entityIds } };

      // Run all queries in parallel
      const [activeDelegated, completedThisWeek, pendingApproval, timeSavedResult] =
        await Promise.all([
          // Active delegated tasks (in progress or not started)
          safeCount(() =>
            (prisma as any).delegationTask.count({
              where: {
                ...entityFilter,
                status: { in: ['IN_PROGRESS', 'NOT_STARTED'] },
              },
            })
          ),

          // Completed this week
          safeCount(() =>
            (prisma as any).delegationTask.count({
              where: {
                ...entityFilter,
                status: 'COMPLETED',
                createdAt: { gte: startOfWeek },
              },
            })
          ),

          // Pending approval
          safeCount(() =>
            (prisma as any).delegationTask.count({
              where: {
                ...entityFilter,
                status: 'WAITING_APPROVAL',
              },
            })
          ),

          // Time saved (sum of estimatedTime for completed tasks this week)
          (async (): Promise<number> => {
            try {
              const result = await (prisma as any).delegationTask.aggregate({
                where: {
                  ...entityFilter,
                  status: 'COMPLETED',
                  createdAt: { gte: startOfWeek },
                },
                _sum: { estimatedTime: true },
              });
              return result._sum?.estimatedTime ?? 0;
            } catch {
              return 0;
            }
          })(),
        ]);

      return success({
        activeDelegated,
        completedThisWeek,
        timeSavedHours: timeSavedResult,
        pendingApproval,
      });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to fetch delegation stats',
        500
      );
    }
  });
}
