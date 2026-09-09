import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

/**
 * This handler read `(prisma as any).property` and `(prisma as any).maintenanceTask`
 * -- neither model is in the schema -- inside a `safeQuery` that swallowed the
 * resulting TypeError and returned 0. Every stat was therefore always zero, and
 * an outer catch turned any real failure into the same zeros. A dashboard that
 * cannot tell "you have no overdue maintenance" from "the query is broken" is
 * worse than one that errors.
 *
 * It now reads `Document` (type PROPERTY) and `Task` (tagged maintenance), which
 * are the rows the household module actually writes, and reports failure as
 * failure.
 *
 * `?entityId=` was previously taken straight off the query string and merged
 * into the WHERE beside `userId`. It is now resolved and ownership-checked by
 * `withEntityScope` before the handler runs.
 */

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  property: z.string().min(1).optional(),
});

interface MaintenanceMeta {
  estimatedCostUsd?: number;
  assignedProviderId?: string;
}

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const [propertiesCount, maintenance] = await Promise.all([
        prisma.document.count({
          where: { entityId, type: 'PROPERTY', deletedAt: null },
        }),
        prisma.task.findMany({
          where: { entityId, tags: { has: 'maintenance' }, deletedAt: null },
          orderBy: { dueDate: 'asc' },
          select: {
            id: true,
            title: true,
            status: true,
            dueDate: true,
            updatedAt: true,
            createdFrom: true,
          },
        }),
      ]);

      const open = maintenance.filter((t) => t.status !== 'DONE');
      const completed = maintenance.filter((t) => t.status === 'DONE');

      const upcoming = open.filter((t) => t.dueDate !== null && t.dueDate >= today);
      const overdue = open.filter((t) => t.dueDate !== null && t.dueDate < today);

      const costOf = (createdFrom: unknown): number =>
        ((createdFrom ?? {}) as MaintenanceMeta).estimatedCostUsd ?? 0;

      const monthlyCost = completed
        .filter((t) => t.updatedAt >= firstOfMonth)
        .reduce((sum, t) => sum + costOf(t.createdFrom), 0);

      return success({
        stats: {
          properties: propertiesCount,
          upcomingMaintenance: upcoming.length,
          overdueMaintenance: overdue.length,
          monthlyCost,
        },
        upcomingTasks: upcoming.slice(0, 10).map((t) => ({
          id: t.id,
          task: t.title,
          dueDate: t.dueDate?.toISOString() ?? null,
          provider: ((t.createdFrom ?? {}) as MaintenanceMeta).assignedProviderId ?? null,
          status: t.dueDate !== null && t.dueDate < today ? 'OVERDUE' : 'UPCOMING',
        })),
        recentActivity: completed
          .slice()
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, 10)
          .map((t) => ({
            date: t.updatedAt.toISOString(),
            description: t.title,
            cost: costOf(t.createdFrom) || null,
          })),
      });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
