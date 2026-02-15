import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import {
  forecastTaskCompletion,
  forecastProjectCompletion,
} from '@/modules/tasks/services/forecasting-service';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const taskId = params.get('taskId');
    const projectId = params.get('projectId');

    if (!taskId && !projectId) {
      return error('VALIDATION_ERROR', 'Either taskId or projectId is required', 400);
    }

    if (taskId) {
      const forecast = await forecastTaskCompletion(taskId);
      return success(forecast);
    }

    const forecast = await forecastProjectCompletion(projectId!);
    return success(forecast);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate forecast';
    return error('FORECAST_FAILED', message, 500);
  }
}
