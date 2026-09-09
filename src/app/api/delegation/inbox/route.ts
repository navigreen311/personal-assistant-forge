import { NextRequest } from 'next/server';
import { withAuditedAuth } from '@/modules/security/audit-wiring';
import { success, error } from '@/shared/utils/api-response';
import { getDailySuggestions } from '@/modules/delegation/services/delegation-inbox-service';

// P-10/T-002: audited. Already correctly scoped to `session.userId`;
// delegations carry no entityId in the model (tenancy-pattern.md §5b).
const AUDIT = { resource: 'delegation.inbox', sensitivityLevel: 'CONFIDENTIAL' as const };

export async function GET(request: NextRequest) {
  return withAuditedAuth(request, AUDIT, async (req, session) => {
    try {
      const suggestions = await getDailySuggestions(session.userId);
      return success(suggestions);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
