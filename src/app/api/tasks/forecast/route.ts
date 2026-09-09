import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope } from '@/shared/middleware/auth';
import {
  forecastTaskCompletion,
  forecastProjectCompletion,
} from '@/modules/tasks/services/forecasting-service';

/**
 * Resource-scoped from whichever id was supplied. Both branches resolve the
 * owning entity from the row (id only) before withEntityScope proves ownership.
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (authedReq) => {
    const params = authedReq.nextUrl.searchParams;
    const taskId = params.get('taskId');
    const projectId = params.get('projectId');

    if (!taskId && !projectId) {
      return error('VALIDATION_ERROR', 'Either taskId or projectId is required', 400);
    }

    const owner = taskId
      ? await prisma.task.findUnique({
          where: { id: taskId },
          select: { entityId: true },
        })
      : await prisma.project.findUnique({
          where: { id: projectId! },
          select: { entityId: true },
        });

    if (!owner) {
      return error('NOT_FOUND', taskId ? 'Task not found' : 'Project not found', 404);
    }

    return withEntityScope(
      authedReq,
      async (_req, _session, entityId) => {
        try {
          if (taskId) {
            const forecast = await forecastTaskCompletion(taskId, entityId);
            return success(forecast);
          }

          const forecast = await forecastProjectCompletion(projectId!, entityId);
          return success(forecast);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to generate forecast';
          return error('FORECAST_FAILED', message, 500);
        }
      },
      owner.entityId
    );
  });
}
