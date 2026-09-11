// ============================================================================
// POST /api/shadow/summary/deliver — deliver the end-of-day summary now
// ============================================================================
//
// P-16, deliverable 3. The counterpart of `POST /api/shadow/briefing/deliver`,
// and the manual half of what the `shadow-proactive` cron does at the user's
// configured `endOfDayTime`. Both land the same two durable rows: a
// `Notification` the user sees and a `ShadowOutreach` row that records the
// delivery — which is also what makes the cron idempotent, because it refuses
// to deliver a second `eod_summary` on a day that already has one.

import { NextRequest } from 'next/server';
import { withRole } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { endOfDaySummaryService } from '@/modules/shadow/proactive/end-of-day';
import { loadEndOfDayPrefs } from '@/modules/shadow/proactive/proactive-runner';

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin'], async (_req, session) => {
    try {
      const prefs = await loadEndOfDayPrefs(session.userId);
      const result = await endOfDaySummaryService.deliverSummary(session.userId, {
        channel: prefs.channel,
      });
      return success(result, 201);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to deliver end-of-day summary',
        500
      );
    }
  });
}
