// ============================================================================
// GET /api/execution/stats - Aggregated execution stats for the Execution Layer
// ============================================================================

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

// --- Safe count wrapper ---

async function safeCount(
  queryFn: () => Promise<number>
): Promise<number> {
  try {
    return await queryFn();
  } catch {
    return 0;
  }
}

async function safeAggregate<T>(
  queryFn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await queryFn();
  } catch {
    return fallback;
  }
}

// --- Handler ---

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId, simulationMode } = parsed.data;

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
        try {
          const entities = await prisma.entity.findMany({
            where: { userId: session.userId },
            select: { id: true },
          });
          entityIds = entities.map((e) => e.id);
        } catch {
          return success(DEFAULT_STATS);
        }
      }

      if (entityIds.length === 0) {
        return success(DEFAULT_STATS);
      }

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const entityFilter = entityIds.length === 1
        ? { entityId: entityIds[0] }
        : { entityId: { in: entityIds } };

      const simulationFilter = simulationMode !== undefined
        ? { simulationMode }
        : {};

      // Run all queries in parallel
      const [
        pending,
        executedToday,
        rolledBack,
        costResult,
        simulatedToday,
        approvalData,
        confidenceResult,
        highRiskCount,
      ] = await Promise.all([
        // Pending actions
        safeCount(() =>
          (prisma as any).actionQueue.count({
            where: {
              ...entityFilter,
              ...simulationFilter,
              status: 'PENDING_APPROVAL',
            },
          })
        ),

        // Executed today
        safeCount(() =>
          (prisma as any).actionQueue.count({
            where: {
              ...entityFilter,
              ...simulationFilter,
              status: 'EXECUTED',
              createdAt: { gte: startOfToday },
            },
          })
        ),

        // Rolled back today
        safeCount(() =>
          (prisma as any).actionQueue.count({
            where: {
              ...entityFilter,
              ...simulationFilter,
              status: 'ROLLED_BACK',
              createdAt: { gte: startOfToday },
            },
          })
        ),

        // Cost today (aggregate sum)
        safeAggregate(
          () =>
            (prisma as any).actionQueue.aggregate({
              where: {
                ...entityFilter,
                ...simulationFilter,
                createdAt: { gte: startOfToday },
              },
              _sum: { estimatedCost: true },
            }),
          { _sum: { estimatedCost: null } }
        ),

        // Simulated today
        safeCount(() =>
          (prisma as any).actionQueue.count({
            where: {
              ...entityFilter,
              simulationMode: true,
              createdAt: { gte: startOfToday },
            },
          })
        ),

        // Approval rate: approved vs total decided today
        safeAggregate(
          async () => {
            const [approved, total] = await Promise.all([
              (prisma as any).actionQueue.count({
                where: {
                  ...entityFilter,
                  ...simulationFilter,
                  status: { in: ['APPROVED', 'EXECUTED'] },
                  createdAt: { gte: startOfToday },
                },
              }),
              (prisma as any).actionQueue.count({
                where: {
                  ...entityFilter,
                  ...simulationFilter,
                  status: { in: ['APPROVED', 'EXECUTED', 'REJECTED', 'ROLLED_BACK'] },
                  createdAt: { gte: startOfToday },
                },
              }),
            ]);
            return { approved, total };
          },
          { approved: 0, total: 0 }
        ),

        // Average confidence
        safeAggregate(
          () =>
            (prisma as any).actionQueue.aggregate({
              where: {
                ...entityFilter,
                ...simulationFilter,
                createdAt: { gte: startOfToday },
              },
              _avg: { confidence: true },
            }),
          { _avg: { confidence: null } }
        ),

        // High risk count
        safeCount(() =>
          (prisma as any).actionQueue.count({
            where: {
              ...entityFilter,
              ...simulationFilter,
              blastRadius: { in: ['HIGH', 'CRITICAL'] },
              status: 'PENDING_APPROVAL',
            },
          })
        ),
      ]);

      const costToday = costResult._sum?.estimatedCost ?? 0;
      const approvalRate =
        approvalData.total > 0
          ? Math.round((approvalData.approved / approvalData.total) * 100)
          : 0;
      const avgConfidence = confidenceResult._avg?.confidence ?? 0;

      return success({
        pending,
        executedToday,
        rolledBack,
        costToday,
        approvalRate,
        avgConfidence,
        highRiskCount,
        simulatedToday,
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
