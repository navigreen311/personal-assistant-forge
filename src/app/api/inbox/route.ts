import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { InboxService, getCurrentUserId } from '@/modules/inbox';
import type { InboxListParams } from '@/modules/inbox/inbox.types';
import { inboxListSchema } from '@/modules/inbox/inbox.validation';

const inboxService = new InboxService();

export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId();
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);

    const parsed = inboxListSchema.safeParse(searchParams);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid query parameters', 400, {
        issues: parsed.error.issues,
      });
    }

    const result = await inboxService.listInbox(userId, parsed.data as InboxListParams);

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
}
