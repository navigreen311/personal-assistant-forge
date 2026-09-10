/**
 * Task CRUD -- the reference implementation of the P-00 tenancy pattern's
 * service half.
 *
 * ============================================================================
 * WHAT CHANGED AND WHY
 * ============================================================================
 *
 * Before P-04 this file contained ZERO references to `userId`. `createTask`
 * checked that the entity *existed*; it never checked the caller owned it. The
 * routes above it called `withAuth(request, async (req, _session) => ...)` and
 * then took `entityId` straight off the request body or query string, so an
 * authenticated user of entity A could create, read, update and delete tasks in
 * entity B by naming B's id.
 *
 * Two changes close it, and the second is the one that keeps it closed:
 *
 *  1. Every entity-scoped function takes a `VerifiedEntityId` -- a branded
 *     string that only `withEntityScope` can produce. A plain `string` is not
 *     assignable to it, so a future call site that passes a raw value off the
 *     request body FAILS TO COMPILE. Review missed this 149 times; `tsc` will
 *     not miss it once.
 *
 *  2. The verified id goes into the WHERE clause, it is not checked and then
 *     discarded. `findFirst({ where: { id, entityId } })` rather than
 *     `findUnique({ where: { id } })` followed by an `if`. A foreign row is
 *     not "found and rejected", it is simply not found -- so there is no
 *     ordering mistake available in which the check is skipped.
 *
 * See docs/parallel-build/tenancy-pattern.md.
 */

import { prisma } from '@/lib/db';
import { emitDomainEvent } from '@/lib/queue/domain-events';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { Task, Priority, TaskStatus } from '@/shared/types';
import type { TaskQueryFilters, TaskSortOptions } from '../types';

/** The fields a task is created from, minus the scope. */
interface TaskDraft {
  title: string;
  description?: string;
  projectId?: string;
  priority?: Priority;
  status?: TaskStatus;
  dueDate?: Date;
  dependencies?: string[];
  assigneeId?: string;
  tags?: string[];
  createdFrom?: { type: string; sourceId: string };
}

/**
 * Create a task in an entity the caller has been proven to own.
 *
 * `params.entityId` is a `VerifiedEntityId`, so the only way to reach this
 * function is through `withEntityScope`. `userId` is the authenticated caller,
 * carried for the audit trail and re-asserted against the entity's owner as
 * defence in depth -- if those two ever disagree the brand has been forged and
 * we want a loud failure, not a silent write.
 */
export async function createTask(
  params: TaskDraft & { entityId: VerifiedEntityId },
  userId: string
): Promise<Task> {
  const entity = await prisma.entity.findUnique({
    where: { id: params.entityId },
    select: { id: true, userId: true },
  });
  if (!entity) {
    throw new Error(`Entity not found: ${params.entityId}`);
  }
  if (entity.userId !== userId) {
    // Unreachable through withEntityScope. If it ever fires, the brand was
    // manufactured rather than earned.
    throw new Error('Entity does not belong to the authenticated user');
  }

  return insertTask(params, params.entityId);
}

/**
 * SYSTEM CONTEXT ONLY -- create a task with no HTTP request in play.
 *
 * ============================================================================
 * READ THIS BEFORE COPYING IT
 * ============================================================================
 *
 * `VerifiedEntityId` can only be minted by `withEntityScope`, which needs a
 * `NextRequest`. Trusted server-side code -- a worker, a cron job, a webhook
 * pipeline -- has no request and therefore cannot obtain one. The frozen
 * interface in `src/shared/middleware/auth.ts` offers no server-side
 * equivalent. That is a real gap; it is written up in
 * PARALLEL_BUILD_ESCALATION_P04.md, and this function is the interim answer,
 * not the pattern.
 *
 * It is safe ONLY because of the rule in its name: the `entityId` must have
 * been read off a database row (e.g. `calendarEvent.entityId`), never off a
 * request. There is no user to authorize, so the owner is resolved FROM the
 * entity rather than compared against a caller-supplied one.
 *
 * Its only caller today is `src/lib/shadow/meeting/processor.ts`. It is not
 * re-exported from `src/modules/tasks/index.ts`, so `grep -r
 * createTaskForEntityOwner` finds every use in one line. NEVER call it from a
 * route handler: a route has a request, and a request must use `createTask`.
 */
export async function createTaskForEntityOwner(
  params: TaskDraft & { entityId: string }
): Promise<Task> {
  const entity = await prisma.entity.findUnique({
    where: { id: params.entityId },
    select: { id: true },
  });
  if (!entity) {
    throw new Error(`Entity not found: ${params.entityId}`);
  }

  return insertTask(params, params.entityId);
}

/**
 * The shared write. Takes the scope as a plain string because both callers have
 * already established it -- one by proving ownership, one by reading it off a
 * row. Not exported: there is no third way in.
 *
 * ============================================================================
 * P-27 (T-036) -- AND THE ONE PLACE `task.created` IS PUBLISHED
 * ============================================================================
 *
 * The audit's scenario is "a workflow triggers on that task", and before this
 * package nothing connected the two: `Workflow.triggers` could say
 * `triggerType: 'EVENT'` and no code anywhere read it against a domain change.
 *
 * The publish is HERE, in the private write, and not in the route, for the
 * reason this function already exists. A route-level hook fires for
 * `POST /api/tasks` and for nothing else -- not the meeting processor's
 * `createTaskForEntityOwner`, not a future importer, not a webhook. The
 * `createTask` / `createTaskForEntityOwner` pair over one private `insertTask`
 * is this codebase's answer to "two callers, one truth", and an event that only
 * one of the two callers emits is exactly the half-connected seam P-20 found.
 * One write, one event, no way in that skips it.
 *
 * It is published AFTER the row is committed and its result is discarded. A
 * task that exists must not be reported as a failure because the notice about
 * it could not be queued -- see `emitDomainEvent`, which never throws.
 *
 * KNOWN, AND NOT GUARDED HERE: a workflow whose ACTION node creates a task
 * cannot re-trigger itself today, because `handleCreateTask` in
 * `action-handlers.ts` writes with `prisma.task.create` directly and never
 * reaches this function. That is an accident of a duplicate write path, not a
 * loop guard, and it is reported as a finding. If that handler is ever routed
 * through the service -- which it should be, it skips the project-scope check
 * this function does -- a cycle becomes reachable and needs a real guard.
 */
async function insertTask(params: TaskDraft, entityId: string): Promise<Task> {
  if (params.projectId) {
    // Scope the lookup rather than looking up and then comparing: a project in
    // another entity is simply not found.
    const project = await prisma.project.findFirst({
      where: { id: params.projectId, entityId },
      select: { id: true },
    });
    if (!project) {
      throw new Error(`Project not found: ${params.projectId}`);
    }
  }

  const task = await prisma.task.create({
    data: {
      title: params.title,
      entityId,
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

  await emitDomainEvent({
    entity: 'task',
    event: 'created',
    // Off the row that was just written, which is what makes it trustworthy
    // downstream: by the time an event exists, the write it describes has
    // already been authorised.
    entityId: task.entityId,
    recordId: task.id,
    payload: { title: task.title, priority: task.priority, status: task.status },
  });

  return mapPrismaTask(task);
}

/**
 * Read one task, scoped.
 *
 * `findFirst({ id, entityId })`, not `findUnique({ id })` plus a comparison:
 * a task in another entity does not exist as far as this caller is concerned.
 */
export async function getTask(
  taskId: string,
  entityId: VerifiedEntityId
): Promise<Task | null> {
  const task = await prisma.task.findFirst({ where: { id: taskId, entityId } });
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
  }>,
  entityId: VerifiedEntityId,
  userId: string
): Promise<Task> {
  const existing = await prisma.task.findFirst({ where: { id: taskId, entityId } });
  if (!existing) {
    throw new Error(`Task not found: ${taskId}`);
  }

  // Moving a task into a project only works within the same entity.
  if (updates.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: updates.projectId, entityId },
      select: { id: true },
    });
    if (!project) {
      throw new Error(`Project not found: ${updates.projectId}`);
    }
  }

  // Track deferral for procrastination detection
  if (updates.dueDate && existing.dueDate) {
    const newDate = new Date(updates.dueDate);
    const oldDate = new Date(existing.dueDate);
    if (newDate > oldDate) {
      await prisma.actionLog.create({
        data: {
          // The actor is the authenticated caller, not the literal 'SYSTEM'
          // this used to record for every human edit.
          actor: userId,
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

/**
 * Soft-delete (cancel) a task, scoped.
 *
 * `updateMany` rather than `update`, because `update` takes a unique WHERE and
 * cannot carry the entity. A zero count means the task is not in this entity --
 * indistinguishable, deliberately, from not existing.
 */
export async function deleteTask(
  taskId: string,
  entityId: VerifiedEntityId
): Promise<void> {
  const result = await prisma.task.updateMany({
    where: { id: taskId, entityId },
    data: { status: 'CANCELLED' },
  });
  if (result.count === 0) {
    throw new Error(`Task not found: ${taskId}`);
  }
}

/**
 * List tasks in one entity.
 *
 * The scope is the FIRST and a REQUIRED argument, and `filters` is a
 * `TaskQueryFilters` -- the same bag minus `entityId`. A route parses filters
 * wholesale out of the query string, so a tenancy field on that object would
 * hand the scope straight back to the caller.
 */
export async function listTasks(
  entityId: VerifiedEntityId,
  filters: TaskQueryFilters = {},
  sort?: TaskSortOptions,
  page = 1,
  pageSize = 20
): Promise<{ data: Task[]; total: number }> {
  const where = buildWhereClause(entityId, filters);

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

/**
 * Bulk update, scoped.
 *
 * A list endpoint that leaks rows and a bulk endpoint that writes rows are
 * different failures. This one used to accept an arbitrary array of task ids
 * and update every one of them; the entity in the WHERE clause now means ids
 * belonging to another tenant silently match nothing, and the returned count
 * tells the caller how many of their own tasks moved.
 */
export async function bulkUpdateTasks(
  taskIds: string[],
  updates: Partial<{
    status: TaskStatus;
    priority: Priority;
    assigneeId: string;
    projectId: string;
  }>,
  entityId: VerifiedEntityId
): Promise<{ updated: number }> {
  const result = await prisma.task.updateMany({
    where: { id: { in: taskIds }, entityId },
    data: updates,
  });
  return { updated: result.count };
}

export async function getTasksByProject(
  projectId: string,
  entityId: VerifiedEntityId,
  filters?: TaskQueryFilters
): Promise<Task[]> {
  const where = buildWhereClause(entityId, filters ?? {});
  const tasks = await prisma.task.findMany({
    where: { ...where, projectId },
    orderBy: { createdAt: 'desc' },
  });
  return tasks.map(mapPrismaTask);
}

export async function getOverdueTasks(entityId: VerifiedEntityId): Promise<Task[]> {
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

export async function getBlockedTasks(entityId: VerifiedEntityId): Promise<Task[]> {
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

/**
 * The scope is applied last and unconditionally, so no combination of filters
 * can widen it. It is a separate parameter rather than a filter field for the
 * same reason.
 */
function buildWhereClause(
  entityId: VerifiedEntityId,
  filters: TaskQueryFilters
): Record<string, unknown> {
  const where: Record<string, unknown> = {};

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

  where.entityId = entityId;

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
