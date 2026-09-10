import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { consentReceiptService } from '@/modules/shadow/safety';

/**
 * GET /api/shadow/receipts/[id] — one consent receipt, from the entity in scope.
 *
 * P-34. `getReceipt(id)` was unscoped, and P-20 called this one out on its own
 * because reaching it needs a real receipt id and because a receipt is the
 * record of a consent decision: reading someone else's is not a cosmetic leak.
 * A receipt outside the scoped entity is now indistinguishable from one that
 * does not exist -- the same 404, from the same branch.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      const { id } = await params;
      const receipt = await consentReceiptService.getReceipt(id, entityId);

      if (!receipt) {
        return error('NOT_FOUND', 'Consent receipt not found', 404);
      }

      return success(receipt);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get consent receipt';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
