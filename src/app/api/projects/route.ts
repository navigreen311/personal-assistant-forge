import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error, paginated } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';


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
  entityId: z.string().min(1, 'entityId is required'),
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

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const searchParams = Object.fromEntries(req.nextUrl.searchParams);

      const parsed = listProjectsSchema.safeParse(searchParams);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid query parameters', 400, {
          issues: parsed.error.issues,
        });
      }

      const { entityId, search, health, status, sort, sortOrder, page, pageSize } = parsed.data;

      // Get all entity IDs belonging to the authenticated user
      const userEntities = await prisma.entity.findMany({
        where: { userId: session.userId },
        select: { id: true },
      });
      const userEntityIds = userEntities.map((e) => e.id);

      if (userEntityIds.length === 0) {
        return paginated([], 0, page, pageSize);
      }

      // Build where clause ensuring entities belong to user
      const where: Record<string, unknown> = {
        entityId: entityId
          ? { in: userEntityIds.includes(entityId) ? [entityId] : [] }
          : { in: userEntityIds },
      };

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
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();

      const parsed = createProjectSchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid project data', 400, {
          issues: parsed.error.issues,
        });
      }

      const data = parsed.data;

      // Verify entity belongs to user
      const entity = await prisma.entity.findUnique({
        where: { id: data.entityId },
      });

      if (!entity) {
        return error('NOT_FOUND', `Entity not found: ${data.entityId}`, 404);
      }

      if (entity.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this entity', 403);
      }

      const project = await prisma.project.create({
        data: {
          name: data.name,
          entityId: data.entityId,
          description: data.description,
          status: data.status,
          milestones: data.milestones,
        },
        include: {
          entity: { select: { id: true, name: true } },
        },
      });

      return success(project, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to create project', 500);
    }
  });
}
