import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, withRole } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { createWebhook, getWebhooks, deleteWebhook, triggerWebhook, getWebhookEvents } from '@/modules/developer/services/webhook-service';

// P-13 / tenancy-pattern.md 5b -- CROSS-ENTITY, USER-SCOPED.
//
// `WebhookConfig` is keyed by `userId` and has no `entityId` column at all, so
// this is NOT a `withEntityScope` route: scoping it to one entity would answer
// about a column the table does not have.
//
// `?entityId=` was required here and was passed to a service that put it in the
// `userId` WHERE clause, so `GET /api/developer/webhooks?entityId=<victim's
// user id>` returned that user's webhooks INCLUDING their HMAC `secret`. The
// `entityId` field is dropped: there is nothing for a caller to name any more.
//
// `webhookId`, `direction`, `event` and `payload` still come from the caller,
// but every by-id call now carries the session's user id into the WHERE clause.

const createWebhookSchema = z.object({
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  url: z.string().url(),
  events: z.array(z.string().min(1)),
});

const triggerWebhookSchema = z.object({
  webhookId: z.string().min(1),
  event: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

const deleteWebhookSchema = z.object({
  webhookId: z.string().min(1),
  action: z.literal('delete'),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const webhookId = req.nextUrl.searchParams.get('webhookId');

      if (webhookId) {
        const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);
        const events = await getWebhookEvents(webhookId, limit, session.userId);
        return success(events);
      }

      const webhooks = await getWebhooks(session.userId);
      return success(webhooks);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin'], async (req, session) => {
    try {
      const body = await req.json();

      if (body.action === 'delete') {
        const parsed = deleteWebhookSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);
        await deleteWebhook(parsed.data.webhookId, session.userId);
        return success({ deleted: true });
      }

      if (body.action === 'trigger') {
        const parsed = triggerWebhookSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);
        const event = await triggerWebhook(
          parsed.data.webhookId,
          parsed.data.event,
          parsed.data.payload,
          session.userId
        );
        return success(event, 201);
      }

      const parsed = createWebhookSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      // The owner is the authenticated caller, never a value off the body.
      const webhook = await createWebhook(session.userId, parsed.data.direction, parsed.data.url, parsed.data.events);
      return success(webhook, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) return error('NOT_FOUND', message, 404);
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
