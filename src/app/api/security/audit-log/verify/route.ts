import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedEntityScope } from '@/modules/security/audit-wiring';
import { auditService } from '@/modules/security/services/audit-service';

/**
 * P-10 / T-002 — verify the hash chain for the caller's entity.
 *
 * `verifyAuditChain` existed and had no route: the system could prove its own
 * audit log had not been tampered with and offered nobody a way to ask. A
 * tamper-evident log with no verifier is a log with extra columns.
 *
 * Entity-scoped, and the chain itself is per-entity (see audit-service.ts), so
 * one tenant's answer never depends on another tenant's rows.
 */
export async function GET(request: NextRequest) {
  return withAuditedEntityScope(
    request,
    { resource: 'security.audit-log.verify', sensitivityLevel: 'CONFIDENTIAL' },
    async (req, session, entityId) => {
      try {
        const params = req.nextUrl.searchParams;
        const fromParam = params.get('from');
        const toParam = params.get('to');

        const from = fromParam ? new Date(fromParam) : new Date(0);
        const to = toParam ? new Date(toParam) : new Date();

        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
          return error('VALIDATION_ERROR', 'from and to must be valid dates', 400);
        }

        const result = await auditService.verifyAuditChain(entityId, { from, to });
        return success(result);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    },
  );
}
