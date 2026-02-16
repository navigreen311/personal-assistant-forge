import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { InboxService } from '@/modules/inbox';
import { updateMessageSchema } from '@/modules/inbox/inbox.validation';

const inboxService = new InboxService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { messageId } = await params;

      const item = await inboxService.getMessageDetail(messageId, session.userId);
      if (!item) {
        return error('NOT_FOUND', `Message not found: ${messageId}`, 404);
      }

      return success(item);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { messageId } = await params;
      const body = await req.json();
      const parsed = updateMessageSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid update request', 400, {
          issues: parsed.error.issues,
        });
      }

      if (parsed.data.isRead !== undefined) {
        await inboxService.markAsRead(messageId, parsed.data.isRead);
      }
      if (parsed.data.isStarred !== undefined) {
        await inboxService.toggleStar(messageId);
      }
      if (parsed.data.archived) {
        await inboxService.archiveMessage(messageId);
      }

      return success({ messageId, updated: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { messageId } = await params;
      await inboxService.archiveMessage(messageId);
      return success({ messageId, archived: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
