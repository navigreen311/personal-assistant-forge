import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { getDueForReview } from '@/modules/knowledge/services/learning-tracker';
import { withEntityScope } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      const items = await getDueForReview(entityId);
      return success(items);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to get items due for review', 500);
    }
  });
}
