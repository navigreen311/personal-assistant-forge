import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { detectProcrastination } from '@/modules/tasks/services/procrastination-detector';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const entityId = params.get('entityId');

    if (!entityId) {
      return error('VALIDATION_ERROR', 'entityId is required', 400);
    }

    const alerts = await detectProcrastination(entityId);
    return success(alerts);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to detect procrastination';
    return error('DETECTION_FAILED', message, 500);
  }
}
