import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { search, searchByType, getSearchSuggestions } from '@/lib/search';
import type { SearchFilter } from '@/lib/search';

// GET /api/search?q=search+terms&type=task&entityId=xxx&limit=20&offset=0&dateFrom=...&dateTo=...
// GET /api/search?suggestions=true&q=par&entityId=xxx
export async function GET(req: NextRequest) {
  return withAuth(req, async (_req, session) => {
    const params = req.nextUrl.searchParams;

    const q = params.get('q')?.trim() ?? '';
    const isSuggestions = params.get('suggestions') === 'true';

    // --- Suggestions mode ---
    if (isSuggestions) {
      if (q.length < 2) {
        return error('INVALID_QUERY', 'Query must be at least 2 characters', 400);
      }

      const entityId = params.get('entityId') ?? session.activeEntityId;
      if (!entityId) {
        return error('MISSING_ENTITY', 'entityId is required', 400);
      }

      const limitParam = Math.min(10, Math.max(1, Number(params.get('limit')) || 5));
      const suggestions = await getSearchSuggestions({
        query: q,
        entityId,
        limit: limitParam,
      });

      return success({ suggestions });
    }

    // --- Full search mode ---
    if (!q || q.length < 2) {
      return error('INVALID_QUERY', 'Search query (q) must be at least 2 characters', 400);
    }

    const type = params.get('type') as
      | 'task'
      | 'message'
      | 'document'
      | 'knowledgeEntry'
      | 'contact'
      | null;

    const entityId = params.get('entityId') ?? session.activeEntityId;
    const limit = Math.min(100, Math.max(1, Number(params.get('limit')) || 20));
    const offset = Math.max(0, Number(params.get('offset')) || 0);

    const dateFromStr = params.get('dateFrom');
    const dateToStr = params.get('dateTo');

    const filters: SearchFilter = {
      entityId: entityId ?? undefined,
      model: type ?? undefined,
      dateFrom: dateFromStr ? new Date(dateFromStr) : undefined,
      dateTo: dateToStr ? new Date(dateToStr) : undefined,
      status: params.get('status') ?? undefined,
      priority: params.get('priority') ?? undefined,
    };

    try {
      const result = type
        ? await searchByType({ query: q, type, filters, limit, offset })
        : await search({ query: q, filters, limit, offset });

      return success(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Search failed';
      return error('SEARCH_ERROR', message, 500);
    }
  });
}
