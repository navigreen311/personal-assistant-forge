import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedRole } from '@/modules/security/audit-wiring';
import { checkThrottle, recordAction } from '@/engines/trust-safety/throttle-service';

// P-10/T-001 — DELIBERATELY NOT ENTITY-SCOPED, stated rather than left to be
// inferred. Throttle counters in `engines/trust-safety` are keyed by userId and
// the model has no entity anywhere in it, so there is nothing here to scope to.
// Reading or writing another user's counter is the operation, not the bug.
//
// `withAuditedRole` is a separate helper from `withAuditedRoleEntityScope` so
// that this choice is visible in the route file. What DID change: the admin
// gate is unchanged, but every call now leaves an audit row naming the admin
// who throttled whom — previously an admin could silently rate-limit any user
// with no record anywhere that it happened.
const RecordSchema = z.object({
  userId: z.string().min(1),
  actionType: z.string().min(1),
});

const AUDIT = { resource: 'safety.throttle', sensitivityLevel: 'CONFIDENTIAL' as const };

export async function GET(request: NextRequest) {
  return withAuditedRole(request, ['owner', 'admin'], AUDIT, async (req, _session) => {
    try {
      const { searchParams } = new URL(req.url);
      const userId = searchParams.get('userId');
      const actionType = searchParams.get('actionType');

      if (!userId || !actionType) {
        return error('VALIDATION_ERROR', 'userId and actionType query params required', 400);
      }

      const status = await checkThrottle(userId, actionType);
      return success(status);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to check throttle status', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuditedRole(request, ['owner', 'admin'], AUDIT, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = RecordSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      await recordAction(parsed.data.userId, parsed.data.actionType);
      const status = await checkThrottle(parsed.data.userId, parsed.data.actionType);
      return success(status, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to record action', 500);
    }
  });
}
