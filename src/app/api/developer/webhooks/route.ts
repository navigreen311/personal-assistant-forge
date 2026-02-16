import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { createWebhook, getWebhooks, deleteWebhook, triggerWebhook, getWebhookEvents } from '@/modules/developer/services/webhook-service';

const createWebhookSchema = z.object({
  entityId: z.string().min(1),
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
      const entityId = req.nextUrl.searchParams.get('entityId');
      const webhookId = req.nextUrl.searchParams.get('webhookId');

      if (webhookId) {
        const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);
        const events = await getWebhookEvents(webhookId, limit);
        return success(events);
      }

      if (!entityId) return error('VALIDATION_ERROR', 'entityId is required', 400);
      const webhooks = await getWebhooks(entityId);
      return success(webhooks);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();

      if (body.action === 'delete') {
        const parsed = deleteWebhookSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);
        await deleteWebhook(parsed.data.webhookId);
        return success({ deleted: true });
      }

      if (body.action === 'trigger') {
        const parsed = triggerWebhookSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);
        const event = await triggerWebhook(parsed.data.webhookId, parsed.data.event, parsed.data.payload);
        return success(event, 201);
      }

      const parsed = createWebhookSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const webhook = await createWebhook(parsed.data.entityId, parsed.data.direction, parsed.data.url, parsed.data.events);
      return success(webhook, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
