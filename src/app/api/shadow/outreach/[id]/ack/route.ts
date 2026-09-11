// ============================================================================
// POST /api/shadow/outreach/[id]/ack — "I got it, stop escalating"
// ============================================================================
//
// P-16, deliverables 4 and 5. Two things that did not exist before this route:
//
//  1. `NotificationEscalator.escalate()` has always refused to advance past an
//     `acknowledged` outreach row, and NOTHING IN THE REPOSITORY COULD WRITE
//     ONE. The ladder's stop condition was unreachable, so every escalation ran
//     to exhaustion regardless of whether the user had answered.
//
//  2. `ShadowChannelEffectiveness` had a reader (`GET /api/shadow/analytics/
//     channel-effectiveness`) and a deleter (`POST .../reset-adaptive`) and no
//     writer at all. `adaptiveChannelService.recordResponse` existed and had
//     zero callers, so the analytics page could only ever show the hard-coded
//     `DEFAULT_RATES` placeholder. An acknowledgement is the response half of
//     the response rate, and this is where it is recorded.
//
// The two are one transaction of meaning and so are one request: the user
// answering on a channel is both "stop the ladder" and "this channel works".

import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { acknowledgeEscalation } from '@/modules/shadow/proactive/proactive-runner';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await params;

      const result = await acknowledgeEscalation({
        userId: session.userId,
        outreachId: id,
      });

      // A row belonging to someone else, a row that does not exist, and a row
      // already acknowledged are deliberately one answer. The first two must be
      // indistinguishable; the third is idempotent rather than an error,
      // because a user tapping "got it" twice has not done anything wrong.
      if (!result.acknowledged) {
        return error('NOT_FOUND', 'No outreach awaiting acknowledgement', 404);
      }

      return success({
        acknowledged: true,
        channel: result.channel,
        medium: result.medium,
      });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to acknowledge outreach',
        500
      );
    }
  });
}
