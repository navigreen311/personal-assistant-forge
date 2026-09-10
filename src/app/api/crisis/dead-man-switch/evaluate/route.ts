import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedRoleEntityScope } from '@/modules/security/audit-wiring';

import { fireDeadManSwitch } from '@/modules/crisis/services/dead-man-switch-service';

/**
 * P-10 / T-015 — THE CONSUMER OF THE KILL SWITCH.
 *
 * Before this route, `evaluateSwitch()` computed `triggered: true` and handed it
 * back to nobody: its only caller was a unit test. The switch was correct and
 * inert, which is the failure mode that looks most like completion.
 *
 * POST here evaluates the caller's switch and, if it has tripped, executes the
 * protocols whose delay has elapsed and records each one in the audit log. It is
 * idempotent per outage — calling it repeatedly does not re-notify anyone — so a
 * scheduler can safely call it on every tick. There is no scheduler registration
 * in this PR: `scripts/` is outside P-10's file list. Flagged in the PR body.
 *
 * Entity-scoped rather than merely authenticated because the audit rows it
 * writes have to be filed under a verified tenant; the switch itself is keyed by
 * `session.userId`, which no caller can influence.
 */
export async function POST(request: NextRequest) {
  return withAuditedRoleEntityScope(request, ['owner', 'admin', 'member'],
    { resource: 'crisis.dead-man-switch', sensitivityLevel: 'RESTRICTED' },
    async (req, session, entityId) => {
      try {
        const result = await fireDeadManSwitch(session.userId, {
          actor: session.email || session.userId,
          actorId: session.userId,
          entityId,
        });
        return success(result);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    },
  );
}
