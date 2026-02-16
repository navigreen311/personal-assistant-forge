jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('Check webhook URL and ensure endpoint is accessible.'),
  generateJSON: jest.fn().mockResolvedValue({}),
}));

import {
  createWebhook,
  getWebhooks,
  deleteWebhook,
  triggerWebhook,
  getWebhookEvents,
  retryFailedEvent,
  getDebuggingSuggestions,
  verifyWebhookSignature,
  webhookStore,
  webhookEventStore,
} from '@/modules/developer/services/webhook-service';
import { createHmac } from 'crypto';
import { generateText } from '@/lib/ai';

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;

describe('webhook-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    webhookStore.clear();
    webhookEventStore.clear();
  });

  describe('createWebhook', () => {
    it('creates webhook with correct fields, active status, and zero failure count', async () => {
      const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://example.com/hook', ['task.created']);

      expect(webhook.id).toBeDefined();
      expect(webhook.entityId).toBe('entity-1');
      expect(webhook.direction).toBe('OUTBOUND');
      expect(webhook.url).toBe('https://example.com/hook');
      expect(webhook.events).toEqual(['task.created']);
      expect(webhook.secret).toBeDefined();
      expect(webhook.isActive).toBe(true);
      expect(webhook.failureCount).toBe(0);
      expect(webhook.createdAt).toBeInstanceOf(Date);
      expect(webhookStore.has(webhook.id)).toBe(true);
    });
  });

  describe('getWebhooks', () => {
    it('returns only webhooks for the given entityId', async () => {
      await createWebhook('entity-1', 'OUTBOUND', 'https://a.com', ['event.a']);
      await createWebhook('entity-2', 'INBOUND', 'https://b.com', ['event.b']);
      await createWebhook('entity-1', 'OUTBOUND', 'https://c.com', ['event.c']);

      const results = await getWebhooks('entity-1');

      expect(results).toHaveLength(2);
      expect(results.every((w) => w.entityId === 'entity-1')).toBe(true);
    });

    it('returns empty array when no webhooks match', async () => {
      await createWebhook('entity-1', 'OUTBOUND', 'https://a.com', ['event.a']);

      const results = await getWebhooks('entity-999');
      expect(results).toHaveLength(0);
    });
  });

  describe('deleteWebhook', () => {
    it('removes the webhook from the store', async () => {
      const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://a.com', ['event.a']);
      expect(webhookStore.has(webhook.id)).toBe(true);

      await deleteWebhook(webhook.id);

      expect(webhookStore.has(webhook.id)).toBe(false);
    });

    it('throws for unknown ID', async () => {
      await expect(deleteWebhook('non-existent')).rejects.toThrow('Webhook non-existent not found');
    });
  });

  describe('triggerWebhook', () => {
    it('creates an event with DELIVERED status and updates lastTriggered', async () => {
      const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://a.com', ['task.created']);

      const event = await triggerWebhook(webhook.id, 'task.created', { taskId: 'task-1' });

      expect(event.id).toBeDefined();
      expect(event.webhookId).toBe(webhook.id);
      expect(event.event).toBe('task.created');
      expect(event.payload).toEqual({ taskId: 'task-1' });
      expect(event.status).toBe('DELIVERED');
      expect(event.attempts).toBe(1);
      expect(event.response).toEqual({ status: 200, body: 'OK' });

      const updatedWebhook = webhookStore.get(webhook.id);
      expect(updatedWebhook?.lastTriggered).toBeInstanceOf(Date);
    });

    it('throws for unknown webhook ID', async () => {
      await expect(triggerWebhook('non-existent', 'event', {})).rejects.toThrow(
        'Webhook non-existent not found'
      );
    });
  });

  describe('getWebhookEvents', () => {
    it('returns events for a webhook sorted by createdAt descending', async () => {
      const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://a.com', ['event.a']);

      const event1 = await triggerWebhook(webhook.id, 'event.a', { seq: 1 });
      const event2 = await triggerWebhook(webhook.id, 'event.a', { seq: 2 });

      const events = await getWebhookEvents(webhook.id);

      expect(events).toHaveLength(2);
      // Sorted by createdAt descending - most recent first
      expect(events[0].createdAt.getTime()).toBeGreaterThanOrEqual(events[1].createdAt.getTime());
    });

    it('returns empty array for webhook with no events', async () => {
      const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://a.com', ['event.a']);
      const events = await getWebhookEvents(webhook.id);
      expect(events).toHaveLength(0);
    });
  });

  describe('retryFailedEvent', () => {
    it('increments attempts and sets status to DELIVERED', async () => {
      const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://a.com', ['event.a']);
      const event = await triggerWebhook(webhook.id, 'event.a', { data: 'test' });

      // Manually set to FAILED for retry
      event.status = 'FAILED';
      webhookEventStore.set(event.id, event);

      const retried = await retryFailedEvent(event.id);

      expect(retried.attempts).toBe(2);
      expect(retried.status).toBe('DELIVERED');
      expect(retried.lastAttempt).toBeInstanceOf(Date);
    });

    it('throws for unknown event ID', async () => {
      await expect(retryFailedEvent('non-existent')).rejects.toThrow('Event non-existent not found');
    });
  });

  describe('verifyWebhookSignature', () => {
    it('returns true for valid HMAC signature', () => {
      const secret = 'test-secret';
      const payload = '{"event":"task.created"}';
      const expected = createHmac('sha256', secret).update(payload).digest('hex');

      expect(verifyWebhookSignature(payload, expected, secret)).toBe(true);
    });

    it('returns false for invalid HMAC signature', () => {
      const secret = 'test-secret';
      const payload = '{"event":"task.created"}';

      expect(verifyWebhookSignature(payload, 'invalid-signature', secret)).toBe(false);
    });
  });

  describe('getDebuggingSuggestions', () => {
    it('returns success message for non-FAILED events', async () => {
      const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://a.com', ['event.a']);
      const event = await triggerWebhook(webhook.id, 'event.a', { data: 'test' });

      const result = await getDebuggingSuggestions(event.id);

      expect(result).toBe('Event was delivered successfully. No debugging needed.');
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('calls AI for FAILED events', async () => {
      const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://a.com', ['event.a']);
      const event = await triggerWebhook(webhook.id, 'event.a', { data: 'test' });

      // Manually set to FAILED
      event.status = 'FAILED';
      webhookEventStore.set(event.id, event);

      mockGenerateText.mockResolvedValueOnce('Debug: Check URL, verify SSL, confirm endpoint is up.');

      const result = await getDebuggingSuggestions(event.id);

      expect(mockGenerateText).toHaveBeenCalled();
      expect(result).toBe('Debug: Check URL, verify SSL, confirm endpoint is up.');
    });

    it('throws for unknown event ID', async () => {
      await expect(getDebuggingSuggestions('non-existent')).rejects.toThrow(
        'Event non-existent not found'
      );
    });
  });
});
