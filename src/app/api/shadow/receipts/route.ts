import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { consentReceiptService } from '@/modules/shadow/safety';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const params = req.nextUrl.searchParams;

      const sessionId = params.get('sessionId') ?? undefined;
      const entityId = params.get('entityId') ?? undefined;
      const actionType = params.get('actionType') ?? undefined;
      const limit = parseInt(params.get('limit') ?? '50', 10);
      const offset = parseInt(params.get('offset') ?? '0', 10);

      const result = await consentReceiptService.listReceipts({
        sessionId,
        entityId,
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
