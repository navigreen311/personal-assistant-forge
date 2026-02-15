import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { InboxService, getCurrentUserId } from '@/modules/inbox';

const inboxService = new InboxService();

export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId();
    const entityId = request.nextUrl.searchParams.get('entityId') ?? undefined;

    const stats = await inboxService.getInboxStats(userId, entityId);
    return success(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return error('INTERNAL_ERROR', message, 500);
  }
}
