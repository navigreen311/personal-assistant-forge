// ============================================================================
// POST /api/shadow/proactive/run — run the proactive sweep now, for me
// ============================================================================
//
// P-16, deliverables 1-3. The cron consumer is
// `src/lib/queue/shadow-proactive.ts`; this is the same sweep on demand,
// restricted to the calling user.
//
// It exists for two reasons that are not "a convenience button".
//
// First, a user who configures a briefing time at 09:30 for an 08:00 briefing
// has to wait until tomorrow to learn whether anything works. That is the
// shape of failure this whole run has been undoing: a stored preference with
// no observable consequence.
//
// Second, it is a real entry point a test can drive. The card's standard is
// that a deliverable is done when a test drives it through the entry point a
// user or a cron would use and asserts a durable effect — and there are two
// such entry points here, the BullMQ job and this route, which call the same
// `runProactiveTick`. Neither is a reimplementation of the other.
//
// `userIds` is NOT a parameter. The sweep runs for `session.userId` and nothing
// else, so this route cannot be used to deliver a briefing into another user's
// notification list.

import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { runProactiveTick } from '@/modules/shadow/proactive/proactive-runner';

export async function POST(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const result = await runProactiveTick({ userIds: [session.userId] });
      return success(result);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Proactive sweep failed',
        500
      );
    }
  });
}
