import { v4 as uuidv4 } from 'uuid';
import { createHmac } from 'crypto';
import type { WebhookConfig, WebhookEvent } from '../types';

const webhookStore = new Map<string, WebhookConfig>();
const webhookEventStore = new Map<string, WebhookEvent>();

export async function createWebhook(
  entityId: string,
  direction: string,
  url: string,
  events: string[]
): Promise<WebhookConfig> {
  const webhook: WebhookConfig = {
    id: uuidv4(),
    entityId,
    direction: direction as 'INBOUND' | 'OUTBOUND',
    url,
    events,
    secret: uuidv4().replace(/-/g, ''),
    isActive: true,
    failureCount: 0,
    createdAt: new Date(),
  };
  webhookStore.set(webhook.id, webhook);
  return webhook;
}

export async function getWebhooks(entityId: string): Promise<WebhookConfig[]> {
  const results: WebhookConfig[] = [];
  for (const webhook of webhookStore.values()) {
    if (webhook.entityId === entityId) results.push(webhook);
  }
  return results;
}

export async function deleteWebhook(webhookId: string): Promise<void> {
  if (!webhookStore.has(webhookId)) throw new Error(`Webhook ${webhookId} not found`);
  webhookStore.delete(webhookId);
}

export async function triggerWebhook(
  webhookId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<WebhookEvent> {
  const webhook = webhookStore.get(webhookId);
  if (!webhook) throw new Error(`Webhook ${webhookId} not found`);

  const webhookEvent: WebhookEvent = {
    id: uuidv4(),
    webhookId,
    event,
    payload,
    status: 'PENDING',
    attempts: 1,
    lastAttempt: new Date(),
    createdAt: new Date(),
  };

  // Placeholder: simulate HTTP POST
  // In real implementation, this would make an actual HTTP request
  webhookEvent.status = 'DELIVERED';
  webhookEvent.response = { status: 200, body: 'OK' };

  webhook.lastTriggered = new Date();
  webhookStore.set(webhookId, webhook);

  webhookEventStore.set(webhookEvent.id, webhookEvent);
  return webhookEvent;
}

export async function getWebhookEvents(webhookId: string, limit = 50): Promise<WebhookEvent[]> {
  const results: WebhookEvent[] = [];
  for (const event of webhookEventStore.values()) {
    if (event.webhookId === webhookId) results.push(event);
  }
  return results
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export async function retryFailedEvent(eventId: string): Promise<WebhookEvent> {
  const event = webhookEventStore.get(eventId);
  if (!event) throw new Error(`Event ${eventId} not found`);

  event.attempts += 1;
  event.lastAttempt = new Date();
  event.status = 'RETRYING';

  // Placeholder: simulate retry
  event.status = 'DELIVERED';
  event.response = { status: 200, body: 'OK' };

  webhookEventStore.set(eventId, event);
  return event;
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  return expected === signature;
}

export { webhookStore, webhookEventStore };
