import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';


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

export async function GET(request: NextRequest, context: RouteContext) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await context.params;

      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          entity: { select: { id: true, name: true, userId: true } },
          tasks: {
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
          },
        },
      });

      if (!project) {
        return error('NOT_FOUND', `Project not found: ${id}`, 404);
      }

      // Verify the project's entity belongs to the authenticated user
      if (project.entity.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this project', 403);
      }

      // Remove userId from entity before returning
      const { entity, ...rest } = project;
      const { userId: _userId, ...entityData } = entity;

      return success({
        ...rest,
        entity: entityData,
        taskCounts: {
          total: project.tasks.length,
          completed: project.tasks.filter((t) => t.status === 'DONE').length,
        },
      });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to get project', 500);
    }
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await context.params;
      const body = await req.json();

      const parsed = updateProjectSchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const existing = await prisma.project.findUnique({
        where: { id },
        include: { entity: { select: { userId: true } } },
      });

      if (!existing) {
        return error('NOT_FOUND', `Project not found: ${id}`, 404);
      }

      if (existing.entity.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this project', 403);
      }

      const data = parsed.data;
      const updateData: Record<string, unknown> = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.health !== undefined) updateData.health = data.health;
      if (data.milestones !== undefined) updateData.milestones = data.milestones;

      const updated = await prisma.project.update({
        where: { id },
        data: updateData,
        include: {
          entity: { select: { id: true, name: true } },
        },
      });

      return success(updated);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to update project', 500);
    }
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await context.params;

      const existing = await prisma.project.findUnique({
        where: { id },
        include: { entity: { select: { userId: true } } },
      });

      if (!existing) {
        return error('NOT_FOUND', `Project not found: ${id}`, 404);
      }

      if (existing.entity.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this project', 403);
      }

      await prisma.project.delete({ where: { id } });

      return success({ deleted: true });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to delete project', 500);
    }
  });
}
