import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';

import { InboxService } from '@/modules/inbox';

const inboxService = new InboxService();

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      // entityId used to be optional here, and an omitted one made
      // getInboxStats count every message row in the database.
      const stats = await inboxService.getInboxStats(entityId);
      return success(stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
