import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { syntheticMonitor } from '@/modules/shadow/monitoring/synthetic-tests';

/**
 * POST /api/shadow/test/voice
 * Run synthetic voice pipeline test.
 * Tests database connectivity and session lifecycle as proxy for voice readiness.
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    try {
      // Voice test: run DB connectivity + session lifecycle tests
      const [dbResult, lifecycleResult] = await Promise.all([
        syntheticMonitor.testDatabaseConnectivity(),
        syntheticMonitor.testSessionLifecycle(),
      ]);

      const passed = dbResult.passed && lifecycleResult.passed;
      const totalDurationMs = dbResult.durationMs + lifecycleResult.durationMs;

      const result = {
        name: 'voice_pipeline',
        passed,
        durationMs: totalDurationMs,
        subtests: [dbResult, lifecycleResult],
        error: passed
          ? undefined
          : [dbResult.error, lifecycleResult.error].filter(Boolean).join('; '),
      };

      return success(result, passed ? 200 : 503);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Synthetic voice test failed';
      return error('SYNTHETIC_TEST_FAILED', message, 500);
    }
  });
}
