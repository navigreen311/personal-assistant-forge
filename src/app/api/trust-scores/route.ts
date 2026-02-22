import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { getTrustScores } from '@/engines/trust-ui/trust-score-service';

/**
 * GET /api/trust-scores?userId=...
 *
 * Returns TrustScoreBreakdown[] for the authenticated user.
 * Computes scores from ActionLog data across all domains.
 * The userId query param is accepted for compatibility but the
 * authenticated session userId is always used for security.
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const scores = await getTrustScores(session.userId);
      return success(scores);
    } catch (err) {
      console.error('Error fetching trust scores:', err);
      return error(
        'TRUST_SCORES_ERROR',
        'Failed to compute trust scores',
        500
      );
    }
  });
}
