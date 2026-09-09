import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { detectProcrastination } from '@/modules/tasks/services/procrastination-detector';

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      const alerts = await detectProcrastination(entityId);
      return success(alerts);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to detect procrastination';
      return error('DETECTION_FAILED', message, 500);
    }
  });
}
