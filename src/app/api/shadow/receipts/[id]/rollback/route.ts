import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { consentReceiptService } from '@/modules/shadow/safety';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await params;
      const result = await consentReceiptService.rollbackAction(id, session.userId);

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
