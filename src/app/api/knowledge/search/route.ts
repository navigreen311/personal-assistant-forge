import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { search } from '@/modules/knowledge/services/search-service';
import { withEntityScope } from '@/shared/middleware/auth';
import type { CaptureType } from '@/modules/knowledge/types';
import { withRateLimit } from '@/shared/middleware/rate-limit';

async function handleGET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = req.nextUrl;
      const query = searchParams.get('query') || '';
      const types = searchParams.get('types');
      const tags = searchParams.get('tags');
      const source = searchParams.get('source');
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      const page = parseInt(searchParams.get('page') || '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

      // The filter bag is parsed wholesale off the query string, so the scope
      // is NOT a field on it -- it is its own argument (tenancy-pattern.md sec.2).
      const result = await search(
        {
          query,
          page,
          pageSize,
          filters: {
            types: types ? (types.split(',') as CaptureType[]) : undefined,
            tags: tags ? tags.split(',') : undefined,
            source: source || undefined,
            dateRange: startDate && endDate
              ? { start: new Date(startDate), end: new Date(endDate) }
              : undefined,
          },
        },
        entityId
      );

      return success(result);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to search knowledge entries', 500);
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
