import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { syntheticMonitor } from '@/modules/shadow/monitoring/synthetic-tests';

/**
 * POST /api/shadow/test/phone
 * Run synthetic phone integration test.
 * Tests the full suite as proxy for phone readiness (DB + tools + session).
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    try {
      // Phone test: run the full synthetic test suite
      const suiteResult = await syntheticMonitor.runAllTests();

      const result = {
        name: 'phone_integration',
        passed: suiteResult.failed === 0,
        durationMs: suiteResult.results.reduce((sum, r) => sum + r.durationMs, 0),
        subtests: suiteResult.results,
        summary: {
          passed: suiteResult.passed,
          failed: suiteResult.failed,
        },
        error:
          suiteResult.failed > 0
            ? suiteResult.results
                .filter((r) => !r.passed)
                .map((r) => `${r.name}: ${r.error}`)
                .join('; ')
            : undefined,
      };

      return success(result, suiteResult.failed === 0 ? 200 : 503);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Synthetic phone test failed';
      return error('SYNTHETIC_TEST_FAILED', message, 500);
    }
  });
}
