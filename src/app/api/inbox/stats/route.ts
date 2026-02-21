import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

import { InboxService } from '@/modules/inbox';

const inboxService = new InboxService();

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const entityId = req.nextUrl.searchParams.get('entityId') ?? undefined;

      const stats = await inboxService.getInboxStats(session.userId, entityId);
      return success(stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
