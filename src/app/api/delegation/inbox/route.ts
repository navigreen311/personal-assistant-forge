import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { getDailySuggestions } from '@/modules/delegation/services/delegation-inbox-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const suggestions = await getDailySuggestions(session.userId);
      return success(suggestions);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
