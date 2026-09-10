import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import { getTask, updateTask, deleteTask } from '@/modules/tasks/services/task-crud';
import type { AuthSession } from '@/lib/auth/types';

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
 */
async function withTaskScope(
  request: NextRequest,
  taskId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  // The session is used -- by withEntityScope, which authenticates again inside.
  // That is one extra token decrypt and one indexed lookup, and it is worth it
  // to keep the ownership check in exactly one place for all ten packages.
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.task.findUnique({
      where: { id: taskId },
      select: { entityId: true },
    });

    if (!owner) {
      return error('NOT_FOUND', 'Task not found', 404);
    }

    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withTaskScope(request, id, async (_req, _session, entityId) => {
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

  return withRole(request, ['owner', 'admin', 'member'], () =>
    withTaskScope(request, id, async (req, session, entityId) => {
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
    })
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withRole(request, ['owner', 'admin'], () =>
    withTaskScope(request, id, async (_req, _session, entityId) => {
      try {
        await deleteTask(id, entityId);
        return success({ cancelled: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete task';
        return error('DELETE_FAILED', message, 500);
      }
    })
  );
}
