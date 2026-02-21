import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { search } from '@/modules/knowledge/services/search-service';
import { withAuth } from '@/shared/middleware/auth';
import type { CaptureType } from '@/modules/knowledge/types';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const { searchParams } = req.nextUrl;
      const entityId = searchParams.get('entityId');
      const query = searchParams.get('query') || '';
      const types = searchParams.get('types');
      const tags = searchParams.get('tags');
      const source = searchParams.get('source');
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      const page = parseInt(searchParams.get('page') || '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

      if (!entityId) {
        return error('VALIDATION_ERROR', 'entityId is required', 400);
      }

      const result = await search({
        entityId,
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
      });

      return success(result);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to search knowledge entries', 500);
    }
  });
}
