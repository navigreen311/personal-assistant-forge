import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { type VerifiedEntityId } from '@/shared/middleware/auth';
import {
  withAuditedEntityScope,
  withAuditedRoleEntityScope,
  type ResolveOwningEntity,
} from '@/modules/security/audit-wiring';
import { getTask, updateTask, deleteTask } from '@/modules/tasks/services/task-crud';
import type { AuthSession, UserRole } from '@/lib/auth/types';

const UpdateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: z.enum(['P0', 'P1', 'P2']).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  dependencies: z.array(z.string()).optional(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * A RESOURCE-SCOPED route: the entity is not in the request at all, it is a
 * property of the row being addressed.
 *
 * `withEntityScope` on its own resolves the entity from the query string, the
 * body, or the session's active entity -- none of which apply to
 * `GET /api/tasks/<id>`. Falling through to the session's active entity would
 * be wrong: it would answer about a task the caller never asked for, or 404 a
 * task they legitimately own in a different entity.
 *
 * So, in this order:
 *   1. `withAuth` -- authenticate first, so an anonymous caller never causes a
 *      database read and cannot use timing to probe which ids exist.
 *   2. look up which entity owns the row. Select the id ONLY; no task data
 *      crosses this boundary before ownership is proven.
 *   3. hand that entity to `withEntityScope` as its explicit third argument.
 *      It re-reads the entity and proves the caller owns it -- 403 if not.
 *
 * Do NOT skip step 3 and pass the looked-up `entityId` to the service
 * directly: it is a plain `string` and the service will not accept it. The
 * compile error is the mechanism working, not an obstacle to route around.
 *
 * This is the shape every `[id]` route in every module needs. Keep it local to
 * the route file (Next.js route files may only export HTTP handlers).
 *
 * P-27 (T-037). Those three steps, in that order, are now performed by the
 * audited wrappers in `audit-wiring.ts` -- the lookup is passed as the
 * `explicitEntityId` argument in its FUNCTION form, which those wrappers run
 * after the session is proved. So the ordering above is preserved exactly, and
 * one hash-chained `AuditLogEntry` is written around the whole thing.
 *
 * Every request to a task by id now leaves a row: the 401 for an anonymous
 * caller, the 403 for a role that may not write, the 404 for an id that does
 * not exist, and the success. All four were invisible before -- task routes
 * were not among the thirty files the audit log reached, although task creation
 * is the audit's own example of "the action". The row names the task, because
 * `resourceId` here is the path param; for the create in `../route.ts` it is
 * not known until after the write, and arrives through `report`.
 *
 * `roles` chooses the wrapper rather than being passed as an empty array,
 * because an empty list of permitted roles reads as "nobody" and would be a
 * dangerous thing to have mean "everybody". A read has no role requirement and
 * says so by using the wrapper that has no role check.
 *
 * Both wrappers authenticate before they authorise: `tests/db/rbac.test.ts`
 * asserts a session-less request gets 401 and not 403, and that ordering is the
 * assertion.
 */
const TASK_AUDIT = { resource: 'tasks', sensitivityLevel: 'INTERNAL' as const };

async function withTaskScope(
  request: NextRequest,
  taskId: string,
  roles: UserRole[] | null,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  const options = { ...TASK_AUDIT, resourceId: taskId, notFoundMessage: 'Task not found' };

  // Select the id ONLY: no task data crosses this boundary before ownership is
  // proven, and returning null is how "no such task" becomes an audited 404.
  const owningEntity: ResolveOwningEntity = async () => {
    const owner = await prisma.task.findUnique({
      where: { id: taskId },
      select: { entityId: true },
    });
    return owner?.entityId ?? null;
  };

  return roles === null
    ? withAuditedEntityScope(request, options, handler, owningEntity)
    : withAuditedRoleEntityScope(request, roles, options, handler, owningEntity);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withTaskScope(request, id, null, async (_req, _session, entityId) => {
    try {
      const task = await getTask(id, entityId);

      if (!task) {
        return error('NOT_FOUND', 'Task not found', 404);
      }

      return success(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get task';
      return error('GET_FAILED', message, 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withTaskScope(
    request,
    id,
    ['owner', 'admin', 'member'],
    async (req, session, entityId) => {
      try {
        const body = await req.json();
        const parsed = UpdateTaskSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const updates: Record<string, unknown> = { ...parsed.data };
        if (parsed.data.dueDate !== undefined) {
          updates.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined;
        }

        const task = await updateTask(
          id,
          updates as Parameters<typeof updateTask>[1],
          entityId,
          session.userId
        );
        return success(task);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update task';
        return error('UPDATE_FAILED', message, 500);
      }
    }
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withTaskScope(request, id, ['owner', 'admin'], async (_req, _session, entityId) => {
    try {
      await deleteTask(id, entityId);
      return success({ cancelled: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete task';
      return error('DELETE_FAILED', message, 500);
    }
  });
}
