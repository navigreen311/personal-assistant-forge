import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { scoreBatch, getDailyTop3 } from '@/modules/tasks/services/prioritization-engine';
import { prisma } from '@/lib/db';
import type { Task } from '@/shared/types';

const PrioritizeSchema = z.object({
  taskIds: z.array(z.string()).optional(),
  entityId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = PrioritizeSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const { taskIds, entityId } = parsed.data;

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
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const userId = params.get('userId');
    const entityId = params.get('entityId');

    if (!userId || !entityId) {
      return error('VALIDATION_ERROR', 'userId and entityId are required', 400);
    }

    const result = await getDailyTop3(userId, entityId);
    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get daily top 3';
    return error('TOP3_FAILED', message, 500);
  }
}
