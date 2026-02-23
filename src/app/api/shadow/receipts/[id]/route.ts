import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { consentReceiptService } from '@/modules/shadow/safety';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { id } = await params;
      const receipt = await consentReceiptService.getReceipt(id);

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
