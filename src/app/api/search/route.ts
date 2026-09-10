import { NextRequest } from 'next/server';
import { withEntityScope } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { search, searchByType, getSearchSuggestions } from '@/lib/search';
import type { SearchFilter } from '@/lib/search';
import { withRateLimit } from '@/shared/middleware/rate-limit';

// GET /api/search?q=search+terms&type=task&entityId=xxx&limit=20&offset=0&dateFrom=...&dateTo=...
// GET /api/search?suggestions=true&q=par&entityId=xxx
//
// P-23 tenancy: this route read `?entityId=` and passed it straight to the
// search layer with no ownership check, so any authenticated user could search
// any tenant's tasks, messages, documents and contacts by naming their entity.
// Worse, full-search mode passed `entityId ?? undefined` when nothing resolved,
// and `src/lib/search/index.ts` builds `filters.entityId ? {...} : {}` -- an
// undefined scope means NO WHERE CLAUSE, i.e. a search across every tenant in
// the database. A user whose JWT carried no activeEntityId got that by default.
//
// Single-entity, deliberately (tenancy-pattern.md §5b): the route already
// resolved to exactly one entity and 400'd without one in suggestions mode, so
// `withEntityScope` preserves the intent while proving ownership. `entityId` is
// now always defined inside the handler, which is what removes the unscoped
// search entirely.
async function handleGET(req: NextRequest) {
  return withEntityScope(req, async (scopedReq, _session, entityId) => {
    const params = scopedReq.nextUrl.searchParams;

    const q = params.get('q')?.trim() ?? '';
    const isSuggestions = params.get('suggestions') === 'true';

    // --- Suggestions mode ---
    if (isSuggestions) {
      if (q.length < 2) {
        return error('INVALID_QUERY', 'Query must be at least 2 characters', 400);
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

    const limit = Math.min(100, Math.max(1, Number(params.get('limit')) || 20));
    const offset = Math.max(0, Number(params.get('offset')) || 0);

    const dateFromStr = params.get('dateFrom');
    const dateToStr = params.get('dateTo');

    // P-26: the scope is no longer a FIELD on this bag at all
    // (tenancy-pattern.md §2). The bag is caller-supplied and nothing else;
    // `entityId` travels as its own leading argument below, typed
    // `VerifiedEntityId`, so a route that forgot it would not compile.
    const filters: SearchFilter = {
      model: type ?? undefined,
      dateFrom: dateFromStr ? new Date(dateFromStr) : undefined,
      dateTo: dateToStr ? new Date(dateToStr) : undefined,
      status: params.get('status') ?? undefined,
      priority: params.get('priority') ?? undefined,
    };

    try {
      const result = type
        ? await searchByType(entityId, { query: q, type, filters, limit, offset })
        : await search(entityId, { query: q, filters, limit, offset });

      return success(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Search failed';
      return error('SEARCH_ERROR', message, 500);
    }
  });
}

// ---------------------------------------------------------------------------
// P-18 / T-012 — rate limit: tier "search".
//
// The limiter sits OUTSIDE the auth wrappers, so a refused request never reaches
// the handler, the entity-ownership query, or the work itself. (On a user-keyed
// tier the limiter does decrypt the session token -- that is what makes the
// bucket unspoofable -- but nothing beyond that runs.) The tier, its budget and
// the reason for that budget live in RATE_LIMIT_POLICY in
// src/shared/middleware/rate-limit.ts; nothing about the limit is decided here,
// so no route can quietly hold a different number from the published table.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<Response> {
  return withRateLimit(request, 'search', handleGET);
}
