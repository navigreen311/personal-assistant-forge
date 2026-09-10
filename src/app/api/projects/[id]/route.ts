import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import { getProject, updateProject } from '@/modules/tasks/services/project-crud';
import type { AuthSession } from '@/lib/auth/types';

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']).optional(),
  health: z.enum(['GREEN', 'YELLOW', 'RED']).optional(),
  milestones: z.array(z.object({
    id: z.string(),
    title: z.string(),
    dueDate: z.string(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']).default('TODO'),
  })).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Resource-scoped, exactly as in `/api/tasks/[id]`. See the long comment there
 * for why the order is authenticate -> resolve owner -> withEntityScope, and
 * why the resolved id must go through withEntityScope rather than straight to
 * a service.
 *
 * These three routes DID already check ownership by hand
 * (`project.entity.userId !== session.userId`). They still needed changing:
 * three correct copies of a check is three places for it to drift, and the
 * fourth route added next year is the one that forgets. The check now happens
 * once, in the frozen middleware, and the services below it cannot be called
 * without its result.
 */
async function withProjectScope(
  request: NextRequest,
  projectId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.project.findUnique({
      where: { id: projectId },
      select: { entityId: true },
    });

    if (!owner) {
      return error('NOT_FOUND', `Project not found: ${projectId}`, 404);
    }

    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return withProjectScope(request, id, async (_req, _session, entityId) => {
    try {
      const project = await getProject(id, entityId);
      if (!project) {
        return error('NOT_FOUND', `Project not found: ${id}`, 404);
      }

      const [entity, tasks] = await Promise.all([
        prisma.entity.findUnique({
          where: { id: entityId },
          select: { id: true, name: true },
        }),
        prisma.task.findMany({
          where: { projectId: id, entityId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            assigneeId: true,
            tags: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);

      return success({
        ...project,
        entity,
        tasks,
        taskCounts: {
          total: tasks.length,
          completed: tasks.filter((t) => t.status === 'DONE').length,
        },
      });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to get project', 500);
    }
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return withRole(request, ['owner', 'admin', 'member'], () =>
    withProjectScope(request, id, async (req, _session, entityId) => {
      try {
        const body = await req.json();

        const parsed = updateProjectSchema.safeParse(body);
        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid request body', 400, {
            issues: parsed.error.issues,
          });
        }

        const updated = await updateProject(
          id,
          {
            ...parsed.data,
            milestones: parsed.data.milestones?.map((m) => ({
              ...m,
              dueDate: new Date(m.dueDate),
            })),
          },
          entityId
        );

        const entity = await prisma.entity.findUnique({
          where: { id: entityId },
          select: { id: true, name: true },
        });

        return success({ ...updated, entity });
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to update project', 500);
      }
    })
  );
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return withRole(request, ['owner', 'admin'], () =>
    withProjectScope(request, id, async (_req, _session, entityId) => {
      try {
        // A hard delete, as before -- but `deleteMany` rather than `delete`,
        // because `delete` takes a unique WHERE and cannot carry the entity.
        // A zero count is "not in this entity", indistinguishable from absent.
        const result = await prisma.project.deleteMany({ where: { id, entityId } });
        if (result.count === 0) {
          return error('NOT_FOUND', `Project not found: ${id}`, 404);
        }
        return success({ deleted: true });
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to delete project', 500);
      }
    })
  );
}
