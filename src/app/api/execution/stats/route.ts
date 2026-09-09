// ============================================================================
// GET /api/execution/stats - Aggregated execution stats for the Execution Layer
// ============================================================================
//
// P-09 (T-007). This route was already the best-behaved in the package on
// tenancy -- it verified the entity against the session -- and the only one
// that was entirely fictional underneath.
//
// Every query went through `(prisma as any).actionQueue`. There has never been
// an `actionQueue` delegate in the schema; the real model is `QueuedAction`, so
// every call threw, and `safeCount` / `safeAggregate` swallowed the throw and
// returned zero. The Execution Layer dashboard has been reporting a confident
// row of zeroes since it was written. That is exactly the failure the
// persistence pattern warns about: a mocked or `any`-typed Prisma client will
// accept a delegate that does not exist, and nothing ever says so.
//
// The eight `as any` casts are gone with it, so the delegate and the field
// names are now checked by `tsc`.
//
// Two of the eight numbers have no column to come from: `QueuedAction` records
// neither a confidence score nor a simulation flag, and the schema is frozen.
// They are returned as zero and SAID SO here, rather than being quietly
// computed from something that means something else.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

// --- Validation Schema ---

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  simulationMode: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

// --- Default Stats ---

const DEFAULT_STATS = {
  pending: 0,
  executedToday: 0,
  rolledBack: 0,
  costToday: 0,
  approvalRate: 0,
  avgConfidence: 0,
  highRiskCount: 0,
  simulatedToday: 0,
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
        const entity = await prisma.entity.findUnique({
          where: { id: entityId },
        });

        if (!entity) {
          return error('NOT_FOUND', 'Entity not found', 404);
        }

        if (entity.userId !== session.userId) {
          return error('FORBIDDEN', 'You do not have access to this entity', 403);
        }
      }

      // Get all entity IDs for this user if no specific entityId
      let entityIds: string[] = [];
      if (entityId) {
        entityIds = [entityId];
      } else {
        const entities = await prisma.entity.findMany({
          where: { userId: session.userId },
          select: { id: true },
        });
        entityIds = entities.map((e) => e.id);
      }

      if (entityIds.length === 0) {
        return success(DEFAULT_STATS);
      }

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const entityFilter = { entityId: { in: entityIds } };

      // Run all queries in parallel
      const [
        pending,
        executedToday,
        rolledBack,
        costResult,
        approved,
        decided,
        highRiskCount,
      ] = await Promise.all([
        // Pending actions: QUEUED is the status this codebase actually writes.
        prisma.queuedAction.count({
          where: { ...entityFilter, status: 'QUEUED' },
        }),

        // Executed today
        prisma.queuedAction.count({
          where: {
            ...entityFilter,
            status: 'EXECUTED',
            createdAt: { gte: startOfToday },
          },
        }),

        // Rolled back today
        prisma.queuedAction.count({
          where: {
            ...entityFilter,
            status: 'ROLLED_BACK',
            createdAt: { gte: startOfToday },
          },
        }),

        // Cost today (aggregate sum)
        prisma.queuedAction.aggregate({
          where: { ...entityFilter, createdAt: { gte: startOfToday } },
          _sum: { estimatedCost: true },
        }),

        // Approval rate: approved vs total decided today
        prisma.queuedAction.count({
          where: {
            ...entityFilter,
            status: { in: ['APPROVED', 'EXECUTED'] },
            createdAt: { gte: startOfToday },
          },
        }),
        prisma.queuedAction.count({
          where: {
            ...entityFilter,
            status: { in: ['APPROVED', 'EXECUTED', 'REJECTED', 'ROLLED_BACK'] },
            createdAt: { gte: startOfToday },
          },
        }),

        // High risk count
        prisma.queuedAction.count({
          where: {
            ...entityFilter,
            blastRadius: { in: ['HIGH', 'CRITICAL'] },
            status: 'QUEUED',
          },
        }),
      ]);

      const costToday = costResult._sum.estimatedCost ?? 0;
      const approvalRate =
        decided > 0 ? Math.round((approved / decided) * 100) : 0;

      return success({
        pending,
        executedToday,
        rolledBack,
        costToday,
        approvalRate,
        // No column on QueuedAction, and the schema is frozen. Reported as 0
        // rather than derived from something that does not mean this.
        avgConfidence: 0,
        highRiskCount,
        simulatedToday: 0,
      });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to fetch execution stats',
        500
      );
    }
  });
}
