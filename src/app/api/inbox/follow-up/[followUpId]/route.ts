import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

import { InboxService } from '@/modules/inbox';
import { updateFollowUpSchema } from '@/modules/inbox/inbox.validation';

const inboxService = new InboxService();

// FollowUpReminder has no entityId column (frozen schema); its scope column is
// `userId`. The service puts session.userId in every WHERE clause, so another
// tenant's follow-up is simply not found -- there is no ownership check here
// that a later edit could reorder away from.

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ followUpId: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { followUpId } = await params;
      const body = await req.json();
      const parsed = updateFollowUpSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid update request', 400, {
          issues: parsed.error.issues,
        });
      }

      if (parsed.data.status === 'COMPLETED') {
        await inboxService.completeFollowUp(followUpId, session.userId);
      } else if (parsed.data.status === 'SNOOZED' && parsed.data.reminderAt) {
        await inboxService.snoozeFollowUp(followUpId, parsed.data.reminderAt, session.userId);
      } else if (parsed.data.status === 'CANCELLED') {
        await inboxService.cancelFollowUp(followUpId, session.userId);
      }

      return success({ followUpId, updated: true });
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
  { params }: { params: Promise<{ followUpId: string }> }
) {
  return withAuth(request, async (_req, session) => {
    try {
      const { followUpId } = await params;
      await inboxService.cancelFollowUp(followUpId, session.userId);
      return success({ followUpId, cancelled: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
