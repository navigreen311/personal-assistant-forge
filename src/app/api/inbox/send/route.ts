import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { InboxService } from '@/modules/inbox';
import { sendDraftSchema } from '@/modules/inbox/inbox.validation';

const inboxService = new InboxService();

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = sendDraftSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid send request', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = await inboxService.sendDraft(parsed.data.messageId, session.userId);
      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      if (message.includes('not a draft')) {
        return error('BAD_REQUEST', message, 400);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
