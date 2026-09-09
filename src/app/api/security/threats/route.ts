import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedEntityScope } from '@/modules/security/audit-wiring';
import { auditService } from '@/modules/security/services/audit-service';

/**
 * P-10 / T-026 — the threat feed, from invention to evidence.
 *
 * This route returned five hardcoded "threats" with invented attacker IPs
 * (`45.227.11.3`, `203.0.113.42`), invented timestamps computed from
 * `Date.now()` so they always looked recent, four "active" monitors that
 * monitored nothing, and three IPs described as blocked that were never blocked.
 *
 * That is materially worse than returning nothing. An operator who sees a
 * plausible attacker IP will look it up, block it, and tell someone — acting on
 * a string a developer typed. And an operator who sees four green monitors stops
 * looking for the reason they have no alerts.
 *
 * The feed is now derived from the audit log: refused and failed requests
 * against the caller's verified entity, grouped by source. `monitors` reports
 * only what genuinely exists — the audit trail — and `blockedIPs` is empty
 * because nothing in this build blocks an IP. `notImplemented` names what is
 * missing so the absence is legible rather than inferred from an empty list.
 */

const WINDOW_HOURS = 24;

type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

function severityOf(statusCode: number): Severity {
  if (statusCode >= 500) return 'HIGH';
  if (statusCode === 403) return 'MEDIUM';
  if (statusCode === 401) return 'LOW';
  return 'LOW';
}

export async function GET(request: NextRequest) {
  return withAuditedEntityScope(
    request,
    { resource: 'security.threats', sensitivityLevel: 'CONFIDENTIAL' },
    async (req, session, entityId) => {
      try {
        const to = new Date();
        const from = new Date(to.getTime() - WINDOW_HOURS * 60 * 60 * 1000);

        const { data } = await auditService.getAuditLog(
          { entityId, dateRange: { from, to } },
          1,
          200,
        );

        const threats = data
          .filter((e) => e.statusCode >= 400)
          .map((e) => ({
            id: e.id,
            type: e.statusCode === 403 ? 'AUTHORIZATION' : e.statusCode === 401 ? 'AUTHENTICATION' : 'ERROR',
            severity: severityOf(e.statusCode),
            description: `${e.requestMethod} ${e.requestPath} returned ${e.statusCode}`,
            timestamp: e.timestamp.toISOString(),
            // The request was refused, which is the only sense in which
            // anything here was "blocked". Not an IP block.
            blocked: e.statusCode === 401 || e.statusCode === 403,
            source: e.ipAddress ?? e.actor,
          }))
          .reverse();

        return success({
          threats,
          windowHours: WINDOW_HOURS,
          monitors: [
            {
              id: 'audit-trail',
              name: 'Audit trail',
              status: 'active',
              detail: `${data.length} requests recorded in the last ${WINDOW_HOURS}h`,
            },
          ],
          blockedIPs: [],
          notImplemented: [
            'IP blocking (nothing in this build blocks an address)',
            'Injection and fraud monitors are request-scoped engines with no persistent alert store',
            'Geolocation of request sources',
          ],
        });
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    },
  );
}
