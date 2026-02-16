import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { captureService } from '@/modules/capture/services/capture-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = new URL(req.url);
      const userId = searchParams.get('userId');

      if (!userId) {
        return error('VALIDATION_ERROR', 'userId query parameter is required', 400);
      }

      const metrics = await captureService.getCaptureMetrics(userId);
      return success(metrics);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get metrics';
      return error('METRICS_FAILED', message, 500);
    }
  });
}
