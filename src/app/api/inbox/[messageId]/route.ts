import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

import { InboxService } from '@/modules/inbox';
import { updateMessageSchema } from '@/modules/inbox/inbox.validation';

const inboxService = new InboxService();

/**
 * The entity of a message is a property of the row, not of the request.
 *
 * withEntityScope resolves from query / body / session, none of which describe
 * `GET /api/inbox/<id>`; falling through to the session's active entity would
 * answer about a message the caller never asked for. So: authenticate first --
 * an anonymous caller must never reach the database -- read the OWNER ID ONLY,
 * and hand that to withEntityScope, which proves the caller owns it.
 *
 * Local to this file on purpose: a Next.js route file may only export HTTP
 * handlers. See docs/parallel-build/tenancy-pattern.md sec.4.
 */
async function withMessageScope(
  request: NextRequest,
  messageId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.message.findUnique({
      where: { id: messageId },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Message not found: ${messageId}`, 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;

  return withMessageScope(request, messageId, async (_req, _session, entityId) => {
    try {
      const item = await inboxService.getMessageDetail(messageId, entityId);
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
  const { messageId } = await params;

  return withRole(request, ['owner', 'admin', 'member'], () =>
    withMessageScope(request, messageId, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = updateMessageSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid update request', 400, {
            issues: parsed.error.issues,
          });
        }

        if (parsed.data.isRead !== undefined) {
          await inboxService.markAsRead(messageId, parsed.data.isRead, entityId);
        }
        if (parsed.data.isStarred !== undefined) {
          await inboxService.toggleStar(messageId, entityId);
        }
        if (parsed.data.archived) {
          await inboxService.archiveMessage(messageId, entityId);
        }

        return success({ messageId, updated: true });
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;

  return withRole(request, ['owner', 'admin'], () =>
    withMessageScope(request, messageId, async (_req, _session, entityId) => {
      try {
        await inboxService.archiveMessage(messageId, entityId);
        return success({ messageId, archived: true });
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
