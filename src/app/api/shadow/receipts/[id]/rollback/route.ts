import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import type { UserRole } from '@/lib/auth/types';

import { consentReceiptService } from '@/modules/shadow/safety';

const ALLOWED_ROLES: UserRole[] = ['owner', 'admin'];

/**
 * POST /api/shadow/receipts/[id]/rollback — undo a consented action.
 *
 * P-34. THE WORST OF THE FIVE. `rollbackAction(id, session.userId)` was
 * unscoped, so any owner or admin of any entity could reverse another tenant's
 * consented action by naming its receipt id -- a cross-tenant WRITE, and one no
 * static rule could see because the route looked authenticated and authorised.
 * Worse, the failure path quoted the record it declined to touch
 * (`Action "X" is not reversible`), so even the refusal disclosed it. That is
 * why P-20 counted this route's 400 as a leak.
 *
 * `withEntityScope` is used INSTEAD of `withRole` rather than alongside it,
 * because it already performs `withAuth`; the role check is kept explicitly
 * inside so the 403 for an insufficient role still happens, and still happens
 * BEFORE any receipt is read.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withEntityScope(request, async (_req, session, entityId) => {
    if (!ALLOWED_ROLES.includes(session.role)) {
      return error('FORBIDDEN', 'Insufficient permissions', 403);
    }

    try {
      const { id } = await params;
      const result = await consentReceiptService.rollbackAction(
        id,
        session.userId,
        entityId
      );

      if (!result.success) {
        return error('ROLLBACK_FAILED', result.message, 400);
      }

      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rollback action';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
