import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedAuth } from '@/modules/security/audit-wiring';
import { getScoreboard } from '@/modules/delegation/services/delegation-scoring-service';

/**
 * P-10/T-001. Was `withAuth(... _session)` + a required, unverified `?entityId=`
 * that the service then ignored entirely — so this returned every delegation in
 * the process to any authenticated caller.
 *
 * The scope is the DELEGATOR, taken from the verified session: delegations carry
 * no entityId in the model. `withAuditedAuth`, not `withAuditedEntityScope`,
 * because there is no entity here to verify and pretending otherwise would put a
 * meaningless check in front of a real one. See tenancy-pattern.md §5b.
 */
export async function GET(request: NextRequest) {
  return withAuditedAuth(
    request,
    { resource: 'delegation.scores' },
    async (req, session) => {
      try {
        const scoreboard = await getScoreboard(session.userId);
        return success(scoreboard);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    },
  );
}
