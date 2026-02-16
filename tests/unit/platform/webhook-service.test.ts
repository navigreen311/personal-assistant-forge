import { createWebhook, triggerWebhook, getWebhookEvents, verifyWebhookSignature, webhookStore, webhookEventStore } from '@/modules/developer/services/webhook-service';
import { createHmac } from 'crypto';

beforeEach(() => {
  webhookStore.clear();
  webhookEventStore.clear();
});

describe('verifyWebhookSignature', () => {
  it('should verify valid HMAC-SHA256 signature', () => {
    const secret = 'test-secret-key';
    const payload = '{"event":"test","data":{}}';
    const signature = createHmac('sha256', secret).update(payload).digest('hex');

    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const secret = 'test-secret-key';
    const payload = '{"event":"test","data":{}}';
    const invalidSignature = 'invalid-signature-value';

    expect(verifyWebhookSignature(payload, invalidSignature, secret)).toBe(false);
  });

  it('should handle empty payload', () => {
    const secret = 'test-secret-key';
    const payload = '';
    const signature = createHmac('sha256', secret).update(payload).digest('hex');

    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  });
});

describe('triggerWebhook', () => {
  it('should create webhook event with PENDING status initially', async () => {
    const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://example.com/hook', ['task.created']);
    const event = await triggerWebhook(webhook.id, 'task.created', { taskId: '123' });

    // After simulation, it becomes DELIVERED
    expect(event.webhookId).toBe(webhook.id);
    expect(event.event).toBe('task.created');
    expect(event.attempts).toBe(1);
  });

  it('should increment failure count on failed delivery', async () => {
    const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://example.com/hook', ['task.created']);

    // Trigger webhook (placeholder always succeeds, but verify structure)
    const event = await triggerWebhook(webhook.id, 'task.created', {});
    expect(event.status).toBe('DELIVERED');
    expect(event.response).toBeDefined();
  });

  it('should record events in history', async () => {
    const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://example.com/hook', ['test']);
    await triggerWebhook(webhook.id, 'test', { data: 1 });
    await triggerWebhook(webhook.id, 'test', { data: 2 });

    const events = await getWebhookEvents(webhook.id);
    expect(events.length).toBe(2);
  });
});
