// ============================================================================
// GET /api/shadow/summary — today's end-of-day summary
// ============================================================================
//
// P-16, deliverable 3. The counterpart of `GET /api/shadow/briefing`.
// `/api/shadow/config` has stored `endOfDayEnabled`, `endOfDayTime`,
// `endOfDayChannel` and `endOfDayContent` since it was written and nothing
// generated or delivered a summary, so all four were write-only preferences.

import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { endOfDaySummaryService } from '@/modules/shadow/proactive/end-of-day';

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const summary = await endOfDaySummaryService.generateSummary(session.userId);
      return success(summary);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to generate end-of-day summary',
        500
      );
    }
  });
}
