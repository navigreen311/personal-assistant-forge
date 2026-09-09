import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { scoreBatch, getDailyTop3 } from '@/modules/tasks/services/prioritization-engine';
import { prisma } from '@/lib/db';
import type { Task } from '@/shared/types';

const PrioritizeSchema = z.object({
  taskIds: z.array(z.string()).optional(),
  entityId: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = PrioritizeSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { taskIds } = parsed.data;

      // `entityId` here is the verified one, not `parsed.data.entityId`. The
      // caller-supplied id is never read.
      const where: Record<string, unknown> = {
        entityId,
        status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] },
      };

      if (taskIds && taskIds.length > 0) {
        where.id = { in: taskIds };
      }

      const tasks = await prisma.task.findMany({ where });

      const mappedTasks: Task[] = tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description ?? undefined,
        entityId: t.entityId,
        projectId: t.projectId ?? undefined,
        priority: t.priority as Task['priority'],
        status: t.status as Task['status'],
        dueDate: t.dueDate ?? undefined,
        dependencies: t.dependencies,
        assigneeId: t.assigneeId ?? undefined,
        createdFrom: t.createdFrom as Task['createdFrom'],
        tags: t.tags,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));

      const scores = await scoreBatch(mappedTasks, entityId);
      return success(scores);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to prioritize';
      return error('PRIORITIZE_FAILED', message, 500);
    }
  });
}

/**
 * The caller's own daily top 3.
 *
 * This route used to read BOTH halves of "whose day" off the query string:
 * `?userId=<anyone>&entityId=<anything>`. `userId` now comes from the session
 * and `entityId` from withEntityScope; a `userId` query parameter is ignored.
 *
 * Identity is never a request parameter. If a route needs to act for a
 * different user, that is an impersonation feature and needs its own
 * authorization -- it is not something a query string decides.
 */
export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, session, entityId) => {
    try {
      const result = await getDailyTop3(session.userId, entityId);
      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get daily top 3';
      return error('TOP3_FAILED', message, 500);
    }
  });
}
