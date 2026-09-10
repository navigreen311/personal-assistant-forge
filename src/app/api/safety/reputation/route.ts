import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedRoleEntityScope } from '@/modules/security/audit-wiring';
import { getReputationDashboard } from '@/engines/trust-safety/reputation-service';

// P-10/T-001. `withRole(['admin'])` + an unverified `?entityId=`: a global admin
// could pull any tenant's sender-reputation posture. The engine's own signature
// stays `string` — `src/engines/**` belongs to P-13 — but a VerifiedEntityId is
// assignable to it, so the proof happens here and the value that crosses the
// boundary has already been checked against the caller.
export async function GET(request: NextRequest) {
  return withAuditedRoleEntityScope(
    request,
    ['owner', 'admin'],
    { resource: 'safety.reputation', sensitivityLevel: 'CONFIDENTIAL' },
    async (req, session, entityId) => {
      try {
        const dashboard = await getReputationDashboard(entityId);
        return success(dashboard);
      } catch (_err) {
        return error('INTERNAL_ERROR', 'Failed to get reputation dashboard', 500);
      }
    },
  );
}
