import { prisma } from '@/lib/db';
import type { Task, Priority, TaskStatus } from '@/shared/types';
import type { TaskFilters, TaskSortOptions } from '../types';

export async function createTask(params: {
  title: string;
  entityId: string;
  description?: string;
  projectId?: string;
  priority?: Priority;
  status?: TaskStatus;
  dueDate?: Date;
  dependencies?: string[];
  assigneeId?: string;
  tags?: string[];
  createdFrom?: { type: string; sourceId: string };
}): Promise<Task> {
  const entity = await prisma.entity.findUnique({ where: { id: params.entityId } });
  if (!entity) {
    throw new Error(`Entity not found: ${params.entityId}`);
  }

  if (params.projectId) {
    const project = await prisma.project.findUnique({ where: { id: params.projectId } });
    if (!project) {
      throw new Error(`Project not found: ${params.projectId}`);
    }
    if (project.entityId !== params.entityId) {
      throw new Error('Project does not belong to the specified entity');
    }
  }

  const task = await prisma.task.create({
    data: {
      title: params.title,
      entityId: params.entityId,
      description: params.description ?? null,
      projectId: params.projectId ?? null,
      priority: params.priority ?? 'P1',
      status: params.status ?? 'TODO',
      dueDate: params.dueDate ?? null,
      dependencies: params.dependencies ?? [],
      assigneeId: params.assigneeId ?? null,
      tags: params.tags ?? [],
      createdFrom: params.createdFrom ? JSON.parse(JSON.stringify(params.createdFrom)) : undefined,
    },
  });

  return mapPrismaTask(task);
}

export async function getTask(taskId: string): Promise<Task | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  return task ? mapPrismaTask(task) : null;
}

export async function updateTask(
  taskId: string,
  updates: Partial<{
    title: string;
    description: string;
    priority: Priority;
    status: TaskStatus;
    dueDate: Date;
    dependencies: string[];
    assigneeId: string;
    projectId: string;
    tags: string[];
  }>
): Promise<Task> {
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) {
    throw new Error(`Task not found: ${taskId}`);
  }

  // Track deferral for procrastination detection
  if (updates.dueDate && existing.dueDate) {
    const newDate = new Date(updates.dueDate);
    const oldDate = new Date(existing.dueDate);
    if (newDate > oldDate) {
      await prisma.actionLog.create({
        data: {
          actor: 'SYSTEM',
          actionType: 'TASK_DEFERRED',
          target: taskId,
          reason: `Due date moved from ${oldDate.toISOString()} to ${newDate.toISOString()}`,
          blastRadius: 'LOW',
          reversible: true,
        },
      });
    }
  }

  const data: Record<string, unknown> = {};
  if (updates.title !== undefined) data.title = updates.title;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.priority !== undefined) data.priority = updates.priority;
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.dueDate !== undefined) data.dueDate = updates.dueDate;
  if (updates.dependencies !== undefined) data.dependencies = updates.dependencies;
  if (updates.assigneeId !== undefined) data.assigneeId = updates.assigneeId;
  if (updates.projectId !== undefined) data.projectId = updates.projectId;
  if (updates.tags !== undefined) data.tags = updates.tags;

  const task = await prisma.task.update({
    where: { id: taskId },
    data,
  });

  return mapPrismaTask(task);
}

export async function deleteTask(taskId: string): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: { status: 'CANCELLED' },
  });
}

export async function listTasks(
  filters: TaskFilters,
  sort?: TaskSortOptions,
  page = 1,
  pageSize = 20
): Promise<{ data: Task[]; total: number }> {
  const where = buildWhereClause(filters);

  const orderBy: Record<string, string> = {};
  if (sort) {
    orderBy[sort.field] = sort.direction;
  } else {
    orderBy.createdAt = 'desc';
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.task.count({ where }),
  ]);

  return { data: tasks.map(mapPrismaTask), total };
}

export async function bulkUpdateTasks(
  taskIds: string[],
  updates: Partial<{
    status: TaskStatus;
    priority: Priority;
    assigneeId: string;
    projectId: string;
  }>
): Promise<{ updated: number }> {
  const result = await prisma.task.updateMany({
    where: { id: { in: taskIds } },
    data: updates,
  });
  return { updated: result.count };
}

export async function getTasksByProject(
  projectId: string,
  filters?: TaskFilters
): Promise<Task[]> {
  const baseWhere = filters ? buildWhereClause(filters) : {};
  const tasks = await prisma.task.findMany({
    where: { ...baseWhere, projectId },
    orderBy: { createdAt: 'desc' },
  });
  return tasks.map(mapPrismaTask);
}

export async function getOverdueTasks(entityId: string): Promise<Task[]> {
  const tasks = await prisma.task.findMany({
    where: {
      entityId,
      dueDate: { lt: new Date() },
      status: { notIn: ['DONE', 'CANCELLED'] },
    },
    orderBy: { dueDate: 'asc' },
  });
  return tasks.map(mapPrismaTask);
}

export async function getBlockedTasks(entityId: string): Promise<Task[]> {
  const tasks = await prisma.task.findMany({
    where: {
      entityId,
      status: 'BLOCKED',
    },
    orderBy: { priority: 'asc' },
  });
  return tasks.map(mapPrismaTask);
}

// --- Helpers ---

function buildWhereClause(filters: TaskFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.assigneeId) where.assigneeId = filters.assigneeId;

  if (filters.status) {
    where.status = Array.isArray(filters.status)
      ? { in: filters.status }
      : filters.status;
  }

  if (filters.priority) {
    where.priority = Array.isArray(filters.priority)
      ? { in: filters.priority }
      : filters.priority;
  }

  if (filters.tags && filters.tags.length > 0) {
    where.tags = { hasSome: filters.tags };
  }

  if (filters.search) {
    where.title = { contains: filters.search, mode: 'insensitive' };
  }

  if (filters.dueDateRange) {
    const dateFilter: Record<string, Date> = {};
    if (filters.dueDateRange.from) dateFilter.gte = filters.dueDateRange.from;
    if (filters.dueDateRange.to) dateFilter.lte = filters.dueDateRange.to;
    where.dueDate = dateFilter;
  }

  if (filters.hasNoDueDate) {
    where.dueDate = null;
  }

  if (filters.isOverdue) {
    where.dueDate = { lt: new Date() };
    where.status = { notIn: ['DONE', 'CANCELLED'] };
  }

  if (filters.isBlocked) {
    where.status = 'BLOCKED';
  }

  return where;
}

function mapPrismaTask(task: {
  id: string;
  title: string;
  description: string | null;
  entityId: string;
  projectId: string | null;
  priority: string;
  status: string;
  dueDate: Date | null;
  dependencies: string[];
  assigneeId: string | null;
  createdFrom: unknown;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}): Task {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? undefined,
    entityId: task.entityId,
    projectId: task.projectId ?? undefined,
    priority: task.priority as Priority,
    status: task.status as TaskStatus,
    dueDate: task.dueDate ?? undefined,
    dependencies: task.dependencies,
    assigneeId: task.assigneeId ?? undefined,
    createdFrom: task.createdFrom as Task['createdFrom'],
    tags: task.tags,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
