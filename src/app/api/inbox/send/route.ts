import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withRole, withEntityScope } from '@/shared/middleware/auth';

import { InboxService } from '@/modules/inbox';
import { sendDraftSchema } from '@/modules/inbox/inbox.validation';
import { withRateLimit } from '@/shared/middleware/rate-limit';

const inboxService = new InboxService();

async function handlePOST(request: NextRequest) {
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

// ---------------------------------------------------------------------------
// P-18 / T-012 — rate limit: tier "send".
//
// The limiter sits OUTSIDE the auth wrappers, so a refused request never reaches
// the handler, the entity-ownership query, or the work itself. (On a user-keyed
// tier the limiter does decrypt the session token -- that is what makes the
// bucket unspoofable -- but nothing beyond that runs.) The tier, its budget and
// the reason for that budget live in RATE_LIMIT_POLICY in
// src/shared/middleware/rate-limit.ts; nothing about the limit is decided here,
// so no route can quietly hold a different number from the published table.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  return withRateLimit(request, 'send', handlePOST);
}
