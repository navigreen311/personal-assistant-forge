import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { getTask, updateTask, deleteTask } from '@/modules/tasks/services/task-crud';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { id } = await params;
      const task = await getTask(id);

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
  return withAuth(request, async (req, _session) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = UpdateTaskSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const updates: Record<string, unknown> = { ...parsed.data };
      if (parsed.data.dueDate !== undefined) {
        updates.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined;
      }

      const task = await updateTask(id, updates as Parameters<typeof updateTask>[1]);
      return success(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update task';
      return error('UPDATE_FAILED', message, 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { id } = await params;
      await deleteTask(id);
      return success({ cancelled: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete task';
      return error('DELETE_FAILED', message, 500);
    }
  });
}
