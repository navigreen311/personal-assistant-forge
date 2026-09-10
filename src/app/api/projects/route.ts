import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error, paginated } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, withRole } from '@/shared/middleware/auth';
import { createProject } from '@/modules/tasks/services/project-crud';

const listProjectsSchema = z.object({
  entityId: z.string().optional(),
  search: z.string().optional(),
  health: z.enum(['GREEN', 'YELLOW', 'RED']).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']).optional(),
  sort: z.enum(['name', 'createdAt', 'updatedAt', 'status', 'health']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const createProjectSchema = z.object({
  name: z.string().min(1, 'name is required'),
  entityId: z.string().min(1, 'entityId is required').optional(),
  description: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']).default('TODO'),
  milestones: z.array(z.object({
    id: z.string(),
    title: z.string(),
    dueDate: z.string(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']).default('TODO'),
  })).default([]),
  targetDate: z.string().datetime().optional(),
  tags: z.array(z.string()).default([]),
});

/**
 * List projects.
 *
 * This route was already one of the three in the module that used
 * `session.userId` -- but it hand-rolled the check: fetch every entity the user
 * owns, then intersect. That is correct today and correct only as long as
 * whoever edits it next remembers the intersection.
 *
 * A cross-entity list is a real product shape, so the scope here is genuinely
 * "all of the caller's entities" rather than one verified entity. Two cases,
 * kept explicit:
 *
 *   - `?entityId=` supplied -> withEntityScope proves that one entity, 403 if
 *     it is not theirs. The list is that entity's projects.
 *   - nothing supplied      -> the union of the caller's own entities, derived
 *     from `session.userId`. Never from anything in the request.
 *
 * The second case cannot use withEntityScope (there is no single entity to
 * verify), so it uses withAuth -- and it uses the session, which is the rule.
 * `withAuth` with a discarded `_session` is the anti-pattern, not `withAuth`.
 */
export async function GET(request: NextRequest) {
  const requestedEntityId = request.nextUrl.searchParams.get('entityId');

  if (requestedEntityId) {
    return withEntityScope(request, async (req, _session, entityId) =>
      listProjectsForEntities(req, [entityId])
    );
  }

  return withAuth(request, async (req, session) => {
    const userEntities = await prisma.entity.findMany({
      where: { userId: session.userId },
      select: { id: true },
    });
    return listProjectsForEntities(req, userEntities.map((e) => e.id));
  });
}

/**
 * The shared body of GET. `entityIds` has already been established as entities
 * the caller owns; nothing below re-derives it from the request.
 */
async function listProjectsForEntities(
  req: NextRequest,
  entityIds: string[]
): Promise<Response> {
  try {
    const searchParams = Object.fromEntries(req.nextUrl.searchParams);

    const parsed = listProjectsSchema.safeParse(searchParams);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid query parameters', 400, {
        issues: parsed.error.issues,
      });
    }

    const { search, health, status, sort, sortOrder, page, pageSize } = parsed.data;

    if (entityIds.length === 0) {
      return paginated([], 0, page, pageSize);
    }

    const where: Record<string, unknown> = { entityId: { in: entityIds } };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (health) where.health = health;
    if (status) where.status = status;

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          entity: { select: { id: true, name: true } },
          _count: { select: { tasks: true } },
          tasks: { select: { status: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [sort]: sortOrder },
      }),
      prisma.project.count({ where }),
    ]);

    // Transform to include task counts
    const projectsWithCounts = projects.map((project) => {
      const { tasks, _count, ...rest } = project;
      return {
        ...rest,
        taskCounts: {
          total: _count.tasks,
          completed: tasks.filter((t) => t.status === 'DONE').length,
        },
      };
    });

    return paginated(projectsWithCounts, total, page, pageSize);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to list projects', 500);
  }
}

/**
 * Create a project.
 *
 * The hand-rolled "fetch the entity, compare userId, 403" block that used to
 * live here is gone -- not because it was wrong, but because withEntityScope
 * does exactly that, in one place, for all ten packages. Twelve correct
 * hand-rolled copies are eleven chances to drift.
 */
export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, session, entityId) => {
      try {
        const body = await req.json();

        const parsed = createProjectSchema.safeParse(body);
        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid project data', 400, {
            issues: parsed.error.issues,
          });
        }

        const data = parsed.data;

        const project = await createProject(
          {
            name: data.name,
            entityId,
            description: data.description,
            // The wire format carries `dueDate` as an ISO string; Milestone
            // wants a Date. Before P-04 this object went straight to Prisma as
            // untyped JSON, so the mismatch was invisible.
            milestones: data.milestones.map((m) => ({ ...m, dueDate: new Date(m.dueDate) })),
            status: data.status,
          },
          session.userId
        );

        const entity = await prisma.entity.findUnique({
          where: { id: entityId },
          select: { id: true, name: true },
        });

        return success({ ...project, entity }, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to create project', 500);
      }
    })
  );
}
