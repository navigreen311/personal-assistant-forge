import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
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

/**
 * Bulk update, scoped.
 *
 * This one used to take an arbitrary array of task ids and update every one of
 * them, with no entity anywhere in the request. `withEntityScope` resolves the
 * scope from `?entityId=`, `entityId` in the body, or the session's active
 * entity, and `bulkUpdateTasks` puts it in the WHERE clause -- so ids belonging
 * to another tenant match nothing rather than being written. The returned
 * `updated` count tells the caller how many of their OWN tasks moved, which is
 * also the honest answer to "did my request apply".
 */
export async function PATCH(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = BulkUpdateSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const result = await bulkUpdateTasks(
        parsed.data.taskIds,
        parsed.data.updates,
        entityId
      );
      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to bulk update';
      return error('BULK_UPDATE_FAILED', message, 500);
    }
  });
}
