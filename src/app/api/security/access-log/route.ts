import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedEntityScope } from '@/modules/security/audit-wiring';
import { auditService } from '@/modules/security/services/audit-service';

/**
 * P-10 / T-002 + T-026 — THE READ SIDE OF THE AUDIT LOG.
 *
 * This route used to return ten hardcoded rows: invented user emails
 * (`alex@johnson.com`), invented attacker IPs, invented cities, and three
 * "blocked" login attempts from Sao Paulo and Moscow that never happened. An
 * operator opening the access log during an incident was reading fiction with
 * the confident presentation of fact, which is worse than an empty page —
 * an empty page prompts a question, a plausible one ends the investigation.
 *
 * It now serves the real `AuditLogEntry` rows for the caller's verified entity.
 * Together with `audit-wiring.ts` on the write side, this is the loop closing:
 * a request to any route in this package writes a hash-chained row, and this is
 * where that row can be read back.
 *
 * Empty is a legitimate answer and is reported as such. It means nothing has
 * been recorded for this tenant yet, not that nothing happened elsewhere.
 */

const MAX_PAGE_SIZE = 200;

/** How the UI presents an outcome; derived from the status, never stored twice. */
function statusOf(statusCode: number): 'success' | 'failed' | 'blocked' {
  if (statusCode < 400) return 'success';
  if (statusCode === 401 || statusCode === 403) return 'blocked';
  return 'failed';
}

export async function GET(request: NextRequest) {
  return withAuditedEntityScope(
    request,
    { resource: 'security.access-log', sensitivityLevel: 'CONFIDENTIAL' },
    async (req, session, entityId) => {
      try {
        const params = req.nextUrl.searchParams;
        const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
        const pageSize = Math.min(
          MAX_PAGE_SIZE,
          Math.max(1, Number(params.get('pageSize') ?? '50') || 50),
        );

        // entityId LAST and unconditionally, so no filter combination widens it.
        const { data, total } = await auditService.getAuditLog(
          {
            actor: params.get('actor') ?? undefined,
            resource: params.get('resource') ?? undefined,
            entityId,
          },
          page,
          pageSize,
        );

        const entries = data.map((entry) => ({
          id: entry.id,
          time: entry.timestamp.toISOString(),
          user: entry.actor,
          action: entry.action,
          resource: entry.resource,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
          statusCode: entry.statusCode,
          status: statusOf(entry.statusCode),
          sensitivityLevel: entry.sensitivityLevel,
          hash: entry.hash ?? null,
          previousHash: entry.previousHash ?? null,
        }));

        return success({ entries, total, page, pageSize });
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    },
  );
}
