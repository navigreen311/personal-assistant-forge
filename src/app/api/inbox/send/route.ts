import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withRole, withEntityScope } from '@/shared/middleware/auth';

import { InboxService } from '@/modules/inbox';
import { sendDraftSchema } from '@/modules/inbox/inbox.validation';

const inboxService = new InboxService();

export async function POST(request: NextRequest) {
  // Authenticate first: an anonymous caller must not reach the database.
  // RBAC (P-15): sending is irreversible and speaks in the entity's name.
  return withRole(request, ['owner', 'admin'], async (authedReq) => {
    let parsedMessageId: string;
    try {
      const body = await authedReq.clone().json();
      const parsed = sendDraftSchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid send request', 400, {
          issues: parsed.error.issues,
        });
      }
      parsedMessageId = parsed.data.messageId;
    } catch {
      return error('VALIDATION_ERROR', 'Invalid send request', 400);
    }

    // The entity belongs to the message row, not to the request body.
    const owner = await prisma.message.findUnique({
      where: { id: parsedMessageId },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Message not found: ${parsedMessageId}`, 404);
    }

    return withEntityScope(
      authedReq,
      async (_req, _session, entityId) => {
        try {
          const result = await inboxService.sendDraft(parsedMessageId, entityId);
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
      },
      owner.entityId
    );
  });
}
