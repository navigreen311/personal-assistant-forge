import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  property: z.string().min(1).optional(),
});

const safeQuery = async <T>(fn: () => Promise<T>, defaultVal: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return defaultVal;
  }
};

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }
      const { entityId, property } = parsed.data;

      // Build base filter for property queries
      const propertyWhere: Record<string, unknown> = {
        userId: session.userId,
      };
      if (entityId) {
        propertyWhere.entityId = entityId;
      }

      // Build base filter for maintenance task queries
      const taskWhere: Record<string, unknown> = {
        userId: session.userId,
      };
      if (property) {
        taskWhere.propertyId = property;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // --- Stats queries ---
      const propertiesCount = await safeQuery(
        () =>
          (prisma as any).property.count({
            where: propertyWhere,
          }),
        0
      );

      const upcomingMaintenance = await safeQuery(
        () =>
          (prisma as any).maintenanceTask.count({
            where: {
              ...taskWhere,
              status: { not: 'COMPLETED' },
              dueDate: { gte: today },
            },
          }),
        0
      );

      const overdueMaintenance = await safeQuery(
        () =>
          (prisma as any).maintenanceTask.count({
            where: {
              ...taskWhere,
              status: { not: 'COMPLETED' },
              dueDate: { lt: today },
            },
          }),
        0
      );

      const monthlyCost = await safeQuery(async () => {
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const result = await (prisma as any).maintenanceTask.aggregate({
          where: {
            ...taskWhere,
            status: 'COMPLETED',
            completedAt: { gte: firstOfMonth },
          },
          _sum: { cost: true },
        });
        return result._sum.cost ?? 0;
      }, 0);

      // --- Upcoming tasks ---
      const upcomingTasks = await safeQuery(async () => {
        const tasks = await (prisma as any).maintenanceTask.findMany({
          where: {
            ...taskWhere,
            status: { not: 'COMPLETED' },
            dueDate: { gte: today },
          },
          orderBy: { dueDate: 'asc' },
          take: 10,
          include: { property: true },
        });
        return tasks.map(
          (t: {
            id: string;
            title: string;
            property: { name: string } | null;
            dueDate: Date;
            provider: string | null;
            status: string;
          }) => ({
            id: t.id,
            task: t.title,
            property: t.property?.name ?? 'Unknown',
            dueDate: t.dueDate.toISOString(),
            provider: t.provider ?? null,
            status: t.status,
          })
        );
      }, [] as Array<{ id: string; task: string; property: string; dueDate: string; provider: string | null; status: string }>);

      // --- Recent activity ---
      const recentActivity = await safeQuery(async () => {
        const activities = await (prisma as any).maintenanceTask.findMany({
          where: {
            ...taskWhere,
            status: 'COMPLETED',
          },
          orderBy: { completedAt: 'desc' },
          take: 10,
          select: {
            completedAt: true,
            title: true,
            cost: true,
          },
        });
        return activities.map(
          (a: { completedAt: Date; title: string; cost: number | null }) => ({
            date: a.completedAt.toISOString(),
            description: a.title,
            cost: a.cost ?? null,
          })
        );
      }, [] as Array<{ date: string; description: string; cost: number | null }>);

      return success({
        stats: {
          properties: propertiesCount,
          upcomingMaintenance,
          overdueMaintenance,
          monthlyCost,
        },
        upcomingTasks,
        recentActivity,
      });
    } catch {
      // Outer catch: return safe defaults so the dashboard page never crashes
      return success({
        stats: {
          properties: 0,
          upcomingMaintenance: 0,
          overdueMaintenance: 0,
          monthlyCost: 0,
        },
        upcomingTasks: [],
        recentActivity: [],
      });
    }
  });
}
