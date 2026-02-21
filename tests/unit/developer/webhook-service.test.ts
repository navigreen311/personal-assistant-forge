jest.mock('@/lib/db', () => ({
  prisma: {
    webhookConfig: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    webhookEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('Check webhook URL and ensure endpoint is accessible.'),
  generateJSON: jest.fn().mockResolvedValue({}),
}));

import { prisma } from '@/lib/db';
import {
  createWebhook,
  getWebhooks,
  deleteWebhook,
  triggerWebhook,
  getWebhookEvents,
  retryFailedEvent,
  getDebuggingSuggestions,
  verifyWebhookSignature,
} from '@/modules/developer/services/webhook-service';
import { createHmac } from 'crypto';
import { generateText } from '@/lib/ai';

const mockWebhookConfig = prisma.webhookConfig as jest.Mocked<typeof prisma.webhookConfig>;
const mockWebhookEvent = prisma.webhookEvent as jest.Mocked<typeof prisma.webhookEvent>;
const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('webhook-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const makeConfigRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'wh-1',
    userId: 'entity-1',
    url: 'https://example.com/hook',
    events: ['task.created'] as unknown,
    secret: 'abc123secret',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });

  const makeEventRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'evt-1',
    webhookConfigId: 'wh-1',
    event: 'task.created',
    payload: { taskId: 'task-1' } as unknown,
    status: 'PENDING',
    response: null as unknown,
    attempts: 0,
    lastAttemptAt: null as Date | null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });

  describe('createWebhook', () => {
    it('creates webhook via Prisma with correct fields', async () => {
      const row = makeConfigRow();
      (mockWebhookConfig.create as jest.Mock).mockResolvedValue(row);

      const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://example.com/hook', ['task.created']);

      expect(mockWebhookConfig.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'entity-1',
          url: 'https://example.com/hook',
          events: ['task.created'],
          isActive: true,
        }),
      });
      expect(webhook.id).toBe('wh-1');
      expect(webhook.entityId).toBe('entity-1');
      expect(webhook.url).toBe('https://example.com/hook');
      expect(webhook.events).toEqual(['task.created']);
      expect(webhook.isActive).toBe(true);
      expect(webhook.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('getWebhooks', () => {
    it('returns webhooks for the given entityId via Prisma', async () => {
      const rows = [
        makeConfigRow({ id: 'wh-1', url: 'https://a.com' }),
        makeConfigRow({ id: 'wh-2', url: 'https://c.com' }),
      ];
      (mockWebhookConfig.findMany as jest.Mock).mockResolvedValue(rows);

      const results = await getWebhooks('entity-1');

      expect(mockWebhookConfig.findMany).toHaveBeenCalledWith({
        where: { userId: 'entity-1' },
      });
      expect(results).toHaveLength(2);
      expect(results[0].entityId).toBe('entity-1');
    });

    it('returns empty array when no webhooks match', async () => {
      (mockWebhookConfig.findMany as jest.Mock).mockResolvedValue([]);

      const results = await getWebhooks('entity-999');
      expect(results).toHaveLength(0);
    });
  });

  describe('deleteWebhook', () => {
    it('deletes the webhook via Prisma', async () => {
      (mockWebhookConfig.findUnique as jest.Mock).mockResolvedValue(makeConfigRow());
      (mockWebhookConfig.delete as jest.Mock).mockResolvedValue(makeConfigRow());

      await deleteWebhook('wh-1');

      expect(mockWebhookConfig.delete).toHaveBeenCalledWith({ where: { id: 'wh-1' } });
    });

    it('throws for unknown ID', async () => {
      (mockWebhookConfig.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(deleteWebhook('non-existent')).rejects.toThrow('Webhook non-existent not found');
    });
  });

  describe('triggerWebhook', () => {
    it('delivers successfully on first attempt with real fetch', async () => {
      const configRow = makeConfigRow();
      (mockWebhookConfig.findUnique as jest.Mock).mockResolvedValue(configRow);

      const pendingEvent = makeEventRow();
      const deliveredEvent = makeEventRow({
        status: 'DELIVERED',
        attempts: 1,
        lastAttemptAt: new Date(),
        response: { status: 200, body: 'OK' },
      });

      (mockWebhookEvent.create as jest.Mock).mockResolvedValue(pendingEvent);
      (mockWebhookEvent.update as jest.Mock).mockResolvedValue(deliveredEvent);
      (mockWebhookConfig.update as jest.Mock).mockResolvedValue(configRow);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK'),
      } as Response);

      const result = await triggerWebhook('wh-1', 'task.created', { taskId: 'task-1' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Webhook-Event': 'task.created',
            'X-Webhook-Signature': expect.any(String),
          }),
          body: JSON.stringify({ taskId: 'task-1' }),
        })
      );
      expect(result.status).toBe('DELIVERED');
      expect(result.attempts).toBe(1);
      expect(result.response).toEqual({ status: 200, body: 'OK' });
    });

    it('sends correct HMAC signature in X-Webhook-Signature header', async () => {
      const configRow = makeConfigRow({ secret: 'my-secret' });
      (mockWebhookConfig.findUnique as jest.Mock).mockResolvedValue(configRow);

      const pendingEvent = makeEventRow();
      const deliveredEvent = makeEventRow({ status: 'DELIVERED', attempts: 1 });

      (mockWebhookEvent.create as jest.Mock).mockResolvedValue(pendingEvent);
      (mockWebhookEvent.update as jest.Mock).mockResolvedValue(deliveredEvent);
      (mockWebhookConfig.update as jest.Mock).mockResolvedValue(configRow);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK'),
      } as Response);

      const payload = { taskId: 'task-1' };
      await triggerWebhook('wh-1', 'task.created', payload);

      const expectedSig = createHmac('sha256', 'my-secret')
        .update(JSON.stringify(payload))
        .digest('hex');

      const fetchCall = mockFetch.mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;
      expect(headers['X-Webhook-Signature']).toBe(expectedSig);
    });

    it('retries with exponential backoff on failure and marks FAILED after 3 attempts', async () => {
      const configRow = makeConfigRow();
      (mockWebhookConfig.findUnique as jest.Mock).mockResolvedValue(configRow);

      const pendingEvent = makeEventRow();
      const retryingEvent = makeEventRow({ status: 'RETRYING', attempts: 1 });
      const retryingEvent2 = makeEventRow({ status: 'RETRYING', attempts: 2 });
      const failedEvent = makeEventRow({
        status: 'FAILED',
        attempts: 3,
        lastAttemptAt: new Date(),
        response: { status: 500, body: 'Internal Server Error' },
      });

      (mockWebhookEvent.create as jest.Mock).mockResolvedValue(pendingEvent);
      (mockWebhookEvent.update as jest.Mock)
        .mockResolvedValueOnce(retryingEvent)
        .mockResolvedValueOnce(retryingEvent2)
        .mockResolvedValueOnce(failedEvent);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      } as Response);

      const resultPromise = triggerWebhook('wh-1', 'task.created', { taskId: 'task-1' });

      // Advance through backoff delays: 1s after first failure, 5s after second
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(5000);

      const result = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.status).toBe('FAILED');
      expect(result.attempts).toBe(3);
    });

    it('retries on network error (fetch throws) and marks FAILED', async () => {
      const configRow = makeConfigRow();
      (mockWebhookConfig.findUnique as jest.Mock).mockResolvedValue(configRow);

      const pendingEvent = makeEventRow();
      const retryingEvent = makeEventRow({ status: 'RETRYING', attempts: 1 });
      const retryingEvent2 = makeEventRow({ status: 'RETRYING', attempts: 2 });
      const failedEvent = makeEventRow({
        status: 'FAILED',
        attempts: 3,
        response: { status: 0, body: 'Request failed' },
      });

      (mockWebhookEvent.create as jest.Mock).mockResolvedValue(pendingEvent);
      (mockWebhookEvent.update as jest.Mock)
        .mockResolvedValueOnce(retryingEvent)
        .mockResolvedValueOnce(retryingEvent2)
        .mockResolvedValueOnce(failedEvent);

      mockFetch.mockRejectedValue(new Error('Network error'));

      const resultPromise = triggerWebhook('wh-1', 'task.created', { taskId: 'task-1' });

      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(5000);

      const result = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.status).toBe('FAILED');
    });

    it('succeeds on second attempt after first failure', async () => {
      const configRow = makeConfigRow();
      (mockWebhookConfig.findUnique as jest.Mock).mockResolvedValue(configRow);

      const pendingEvent = makeEventRow();
      const retryingEvent = makeEventRow({ status: 'RETRYING', attempts: 1 });
      const deliveredEvent = makeEventRow({
        status: 'DELIVERED',
        attempts: 2,
        response: { status: 200, body: 'OK' },
      });

      (mockWebhookEvent.create as jest.Mock).mockResolvedValue(pendingEvent);
      (mockWebhookEvent.update as jest.Mock)
        .mockResolvedValueOnce(retryingEvent)
        .mockResolvedValueOnce(deliveredEvent);
      (mockWebhookConfig.update as jest.Mock).mockResolvedValue(configRow);

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Error'),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve('OK'),
        } as Response);

      const resultPromise = triggerWebhook('wh-1', 'task.created', { taskId: 'task-1' });

      await jest.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('DELIVERED');
      expect(result.attempts).toBe(2);
    });

    it('throws for unknown webhook ID', async () => {
      (mockWebhookConfig.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(triggerWebhook('non-existent', 'event', {})).rejects.toThrow(
        'Webhook non-existent not found'
      );
    });
  });

  describe('getWebhookEvents', () => {
    it('returns events for a webhook sorted by createdAt descending', async () => {
      const rows = [
        makeEventRow({ id: 'evt-2', createdAt: new Date('2026-01-02') }),
        makeEventRow({ id: 'evt-1', createdAt: new Date('2026-01-01') }),
      ];
      (mockWebhookEvent.findMany as jest.Mock).mockResolvedValue(rows);

      const events = await getWebhookEvents('wh-1');

      expect(mockWebhookEvent.findMany).toHaveBeenCalledWith({
        where: { webhookConfigId: 'wh-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(events).toHaveLength(2);
    });

    it('returns empty array for webhook with no events', async () => {
      (mockWebhookEvent.findMany as jest.Mock).mockResolvedValue([]);

      const events = await getWebhookEvents('wh-1');
      expect(events).toHaveLength(0);
    });

    it('respects the limit parameter', async () => {
      (mockWebhookEvent.findMany as jest.Mock).mockResolvedValue([]);

      await getWebhookEvents('wh-1', 10);

      expect(mockWebhookEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });
  });

  describe('retryFailedEvent', () => {
    it('retries delivery via fetch and updates event to DELIVERED', async () => {
      const eventRow = makeEventRow({ status: 'FAILED', attempts: 2 });
      const configRow = makeConfigRow();
      const updatedRow = makeEventRow({
        status: 'DELIVERED',
        attempts: 3,
        lastAttemptAt: new Date(),
        response: { status: 200, body: 'OK' },
      });

      (mockWebhookEvent.findUnique as jest.Mock).mockResolvedValue(eventRow);
      (mockWebhookConfig.findUnique as jest.Mock).mockResolvedValue(configRow);
      (mockWebhookEvent.update as jest.Mock).mockResolvedValue(updatedRow);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK'),
      } as Response);

      const result = await retryFailedEvent('evt-1');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('DELIVERED');
      expect(result.attempts).toBe(3);
    });

    it('marks event as FAILED when retry fetch fails', async () => {
      const eventRow = makeEventRow({ status: 'FAILED', attempts: 2 });
      const configRow = makeConfigRow();
      const updatedRow = makeEventRow({
        status: 'FAILED',
        attempts: 3,
        response: { status: 0, body: 'Request failed' },
      });

      (mockWebhookEvent.findUnique as jest.Mock).mockResolvedValue(eventRow);
      (mockWebhookConfig.findUnique as jest.Mock).mockResolvedValue(configRow);
      (mockWebhookEvent.update as jest.Mock).mockResolvedValue(updatedRow);

      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await retryFailedEvent('evt-1');

      expect(result.status).toBe('FAILED');
    });

    it('throws for unknown event ID', async () => {
      (mockWebhookEvent.findUnique as jest.Mock).mockResolvedValue(null);

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
      const eventRow = makeEventRow({ status: 'DELIVERED' });
      (mockWebhookEvent.findUnique as jest.Mock).mockResolvedValue(eventRow);

      const result = await getDebuggingSuggestions('evt-1');

      expect(result).toBe('Event was delivered successfully. No debugging needed.');
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('calls AI for FAILED events', async () => {
      const eventRow = makeEventRow({
        status: 'FAILED',
        response: { status: 500, body: 'Server Error' },
      });
      (mockWebhookEvent.findUnique as jest.Mock).mockResolvedValue(eventRow);
      mockGenerateText.mockResolvedValueOnce('Debug: Check URL, verify SSL, confirm endpoint is up.');

      const result = await getDebuggingSuggestions('evt-1');

      expect(mockGenerateText).toHaveBeenCalled();
      expect(result).toBe('Debug: Check URL, verify SSL, confirm endpoint is up.');
    });

    it('returns fallback message when AI fails', async () => {
      const eventRow = makeEventRow({ status: 'FAILED' });
      (mockWebhookEvent.findUnique as jest.Mock).mockResolvedValue(eventRow);
      mockGenerateText.mockRejectedValueOnce(new Error('AI unavailable'));

      const result = await getDebuggingSuggestions('evt-1');

      expect(result).toBe(
        'Unable to generate debugging suggestions. Check the webhook URL, ensure the endpoint is accessible, and verify the payload format.'
      );
    });

    it('throws for unknown event ID', async () => {
      (mockWebhookEvent.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(getDebuggingSuggestions('non-existent')).rejects.toThrow(
        'Event non-existent not found'
      );
    });
  });
});
