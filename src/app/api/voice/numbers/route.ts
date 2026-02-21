import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { listNumbers } from '@/modules/voiceforge/services/number-manager';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const entityId = req.nextUrl.searchParams.get('entityId');
      if (!entityId) {
        return error('VALIDATION_ERROR', 'entityId query parameter required', 400);
      }

      const numbers = await listNumbers(entityId);
      return success(numbers);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
