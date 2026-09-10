import { NextRequest } from 'next/server';
import { error } from '@/shared/utils/api-response';
import { withAuditedEntityScope, withAuditedRoleEntityScope } from '@/modules/security/audit-wiring';

/**
 * P-10 / T-026 — backups: an honest 501 in place of a reassuring fiction.
 *
 * GET returned a hardcoded schedule ("daily", "AWS S3", "encryptionEnabled:
 * true"), five invented backup runs with sizes and durations, and a disaster
 * recovery block claiming `rto: '~15 minutes'` and a recovery test that
 * "passed" thirty days ago. POST returned `status: 'in_progress'` and
 * "Backup initiated successfully" without initiating anything.
 *
 * There is no backup subsystem in this build. The difference between this route
 * and the threat feed is that a threat feed has a real substitute in the audit
 * log; a backup does not — there is nothing truthful to return. So it reports
 * NOT_IMPLEMENTED rather than a comforting shape.
 *
 * This is the one place in T-026 where the honest answer is an error status. It
 * is deliberate: a UI panel that renders "not implemented" sends someone to
 * arrange backups. A panel that renders five green completed runs does not, and
 * that is the failure this task exists to prevent — the fiction was doing active
 * harm precisely because it was reassuring.
 */

const MESSAGE =
  'No backup subsystem is configured in this deployment. This endpoint previously ' +
  'returned fabricated schedule, history and disaster-recovery figures.';

export async function GET(request: NextRequest) {
  return withAuditedEntityScope(
    request,
    { resource: 'security.backups', sensitivityLevel: 'CONFIDENTIAL' },
    async () => error('NOT_IMPLEMENTED', MESSAGE, 501),
  );
}

export async function POST(request: NextRequest) {
  return withAuditedRoleEntityScope(request, ['owner', 'admin'],
    { resource: 'security.backups', sensitivityLevel: 'CONFIDENTIAL' },
    async () =>
      error(
        'NOT_IMPLEMENTED',
        'Cannot start a backup: no backup subsystem is configured. This endpoint ' +
          'previously reported "Backup initiated successfully" without doing anything.',
        501,
      ),
  );
}
