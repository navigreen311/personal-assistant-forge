import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';

import { InboxService } from '@/modules/inbox';
import { createFollowUpSchema } from '@/modules/inbox/inbox.validation';

const inboxService = new InboxService();

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, session, entityId) => {
    try {
      // Both halves of "whose follow-ups": the authenticated caller (the
      // FollowUpReminder.userId column) and the verified entity.
      const followUps = await inboxService.listFollowUps(session.userId, entityId);
      return success(followUps);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, session, entityId) => {
      try {
        const body = await req.json();
        const parsed = createFollowUpSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid follow-up request', 400, {
            issues: parsed.error.issues,
          });
        }

        // The caller's own entityId is discarded; the verified one is passed
        // separately, and the row is stamped with the authenticated user rather
        // than the literal 'default-user'.
        const { entityId: _requested, ...input } = parsed.data;

        const followUp = await inboxService.createFollowUp(input, entityId, session.userId);
        return success(followUp, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
        }
        return error('INTERNAL_ERROR', message, 500);
      }
    })
  );
}
