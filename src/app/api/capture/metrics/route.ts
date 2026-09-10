import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { captureService } from '@/modules/capture/services/capture-service';

// P-13 -- CROSS-ENTITY (latency samples span every entity the caller captures
// into). `?userId=` was a REQUIRED query parameter here, and the service then
// ignored it and returned EVERY tenant's samples. Both halves are fixed: the
// scope is the session's user, and `getCaptureMetrics` now actually filters.

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const metrics = await captureService.getCaptureMetrics(session.userId);
      return success(metrics);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get metrics';
      return error('METRICS_FAILED', message, 500);
    }
  });
}
