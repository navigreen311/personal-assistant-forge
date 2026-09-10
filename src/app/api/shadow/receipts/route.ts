import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { consentReceiptService } from '@/modules/shadow/safety';

/**
 * GET /api/shadow/receipts — consent receipts for the entity in scope.
 *
 * P-34. This was `withAuth` plus `params.get('entityId')` handed straight to
 * `listReceipts`, which is one of the five route/method pairs P-20's fuzz
 * recorded as answering tenant A with tenant B's rows. `withEntityScope` is
 * P-30's helper and applies Decision 1 unchanged: the entity must exist, belong
 * to the caller, AND be the one the session is acting in. The query parameter
 * still says which entity the request is ABOUT; it no longer decides which
 * tenant the caller is IN.
 */
export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const params = req.nextUrl.searchParams;

      const sessionId = params.get('sessionId') ?? undefined;
      const actionType = params.get('actionType') ?? undefined;
      const limit = parseInt(params.get('limit') ?? '50', 10);
      const offset = parseInt(params.get('offset') ?? '0', 10);

      const result = await consentReceiptService.listReceipts(entityId, {
        sessionId,
        actionType,
        limit,
        offset,
      });

      return success({
        receipts: result.receipts,
        total: result.total,
        limit,
        offset,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list consent receipts';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
