import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { syntheticMonitor } from '@/modules/shadow/monitoring/synthetic-tests';

/**
 * POST /api/shadow/test/text
 * Run the synthetic text chat test.
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    try {
      const result = await syntheticMonitor.testTextChat();
      const status = result.passed ? 200 : 503;
      return success(result, status);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Synthetic text test failed';
      return error('SYNTHETIC_TEST_FAILED', message, 500);
    }
  });
}
