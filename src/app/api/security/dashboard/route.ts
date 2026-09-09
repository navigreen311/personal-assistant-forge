import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedEntityScope } from '@/modules/security/audit-wiring';
import { auditService } from '@/modules/security/services/audit-service';

/**
 * P-10 / T-026 — the security dashboard, from fabrication to measurement.
 *
 * This route returned a hardcoded `securityScore: 82`, a six-item checklist
 * whose every entry was a constant ("Password last changed: 45 days ago",
 * "Backup encryption key configured: fail"), three invented recent events
 * including a "Breach detected", and `failedLogins30d: 3`. None of it was
 * measured. An operator checking the security posture during an incident was
 * reading a number that had never depended on anything.
 *
 * Everything here is now derived from the persisted audit log for the caller's
 * verified entity, or reported as unknown. Where a check has no data source in
 * this system, it says `status: 'unknown'` with a reason rather than inventing
 * a pass or a fail — an unknown a human can act on beats a green tick they
 * cannot verify.
 */

const WINDOW_DAYS = 30;

export async function GET(request: NextRequest) {
  return withAuditedEntityScope(
    request,
    { resource: 'security.dashboard', sensitivityLevel: 'CONFIDENTIAL' },
    async (req, session, entityId) => {
      try {
        const to = new Date();
        const from = new Date(to.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

        const { data: recent, total } = await auditService.getAuditLog(
          { entityId, dateRange: { from, to } },
          1,
          200,
        );

        const refused = recent.filter((e) => e.statusCode === 401 || e.statusCode === 403);
        const failures = recent.filter((e) => e.statusCode >= 500);
        const chain = await auditService.verifyAuditChain(entityId, { from, to });

        const checklist = [
          {
            id: 'audit-log',
            label: 'Audit log is recording requests',
            status: total > 0 ? 'pass' : 'fail',
            detail:
              total > 0
                ? `${total} entries in the last ${WINDOW_DAYS} days`
                : 'No audit entries recorded for this entity',
          },
          {
            id: 'audit-chain',
            label: 'Audit hash chain intact',
            status: chain.valid ? 'pass' : 'fail',
            detail: chain.valid
              ? `${chain.checkedEntries} entries verified`
              : `Chain broken at ${chain.brokenAt}`,
          },
          {
            id: 'refusals',
            label: 'Refused requests in the last 30 days',
            status: refused.length === 0 ? 'pass' : 'warning',
            detail: `${refused.length} requests refused (401/403)`,
          },
          {
            id: 'server-errors',
            label: 'Server errors in the last 30 days',
            status: failures.length === 0 ? 'pass' : 'warning',
            detail: `${failures.length} requests returned 5xx`,
          },
          // Deliberately 'unknown', not 'pass'. There is no MFA, key-rotation or
          // backup subsystem wired into this build, so any other answer would be
          // the fabrication this task exists to remove.
          {
            id: 'mfa',
            label: 'Two-factor authentication enforced',
            status: 'unknown',
            detail: 'No MFA subsystem is wired into this deployment',
          },
          {
            id: 'backups',
            label: 'Encrypted backups configured',
            status: 'unknown',
            detail: 'No backup subsystem is wired into this deployment',
          },
        ];

        const known = checklist.filter((c) => c.status !== 'unknown');
        const passing = known.filter((c) => c.status === 'pass').length;
        const securityScore =
          known.length === 0 ? null : Math.round((passing / known.length) * 100);

        return success({
          // null, not a number, when nothing can be measured. A score of 0 and
          // "we cannot tell" are different answers and must not share a value.
          securityScore,
          scoredChecks: known.length,
          unknownChecks: checklist.length - known.length,
          checklist,
          recentEvents: recent.slice(-10).reverse().map((e) => ({
            time: e.timestamp.toISOString(),
            event: e.action,
            severity: e.statusCode >= 500 ? 'critical' : e.statusCode >= 400 ? 'warning' : 'info',
            details: `${e.actor} — ${e.resource} (${e.statusCode})`,
          })),
          refusedRequests30d: refused.length,
          auditEntries30d: total,
          auditChainValid: chain.valid,
        });
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    },
  );
}
