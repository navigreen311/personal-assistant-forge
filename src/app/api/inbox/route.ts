import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';

import { InboxService } from '@/modules/inbox';
import { inboxListSchema } from '@/modules/inbox/inbox.validation';

const inboxService = new InboxService();

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const searchParams = Object.fromEntries(req.nextUrl.searchParams);

      const parsed = inboxListSchema.safeParse(searchParams);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid query parameters', 400, {
          issues: parsed.error.issues,
        });
      }

      // `entityId` off the query string is dropped here, not merged: it has
      // already been verified by withEntityScope and re-enters as the branded
      // leading argument. Leaving it on the filter bag would let the caller
      // name their own scope a second time.
      const { entityId: _requested, ...filters } = parsed.data;

      const result = await inboxService.listInbox(entityId, filters);

      return success({
        items: result.items,
        stats: result.stats,
        meta: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
