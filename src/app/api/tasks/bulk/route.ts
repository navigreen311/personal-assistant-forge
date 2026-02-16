import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { bulkUpdateTasks } from '@/modules/tasks/services/task-crud';

const BulkUpdateSchema = z.object({
  taskIds: z.array(z.string()).min(1),
  updates: z.object({
    status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']).optional(),
    priority: z.enum(['P0', 'P1', 'P2']).optional(),
    assigneeId: z.string().optional(),
    projectId: z.string().optional(),
  }),
});

export async function PATCH(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = BulkUpdateSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const result = await bulkUpdateTasks(parsed.data.taskIds, parsed.data.updates);
      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to bulk update';
      return error('BULK_UPDATE_FAILED', message, 500);
    }
  });
}
