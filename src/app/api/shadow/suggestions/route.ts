import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { suggestionEngine } from '@/modules/shadow/proactive/suggestion-engine';

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const suggestions = await suggestionEngine.getSuggestions(session.userId);
      return success(suggestions);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to get suggestions',
        500
      );
    }
  });
}
