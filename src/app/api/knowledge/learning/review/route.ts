import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { getDueForReview } from '@/modules/knowledge/services/learning-tracker';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = req.nextUrl;
      const entityId = searchParams.get('entityId');

      if (!entityId) {
        return error('VALIDATION_ERROR', 'entityId is required', 400);
      }

      const items = await getDueForReview(entityId);
      return success(items);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to get items due for review', 500);
    }
  });
}
