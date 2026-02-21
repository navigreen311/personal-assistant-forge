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

import { prisma } from '@/lib/db';
import { createWebhook, triggerWebhook, getWebhookEvents, verifyWebhookSignature } from '@/modules/developer/services/webhook-service';
import { createHmac } from 'crypto';

const mockWebhookConfig = prisma.webhookConfig as jest.Mocked<typeof prisma.webhookConfig>;
const mockWebhookEvent = prisma.webhookEvent as jest.Mocked<typeof prisma.webhookEvent>;

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

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

beforeEach(() => {
  jest.clearAllMocks();
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
    const configRow = makeConfigRow();
    (mockWebhookConfig.create as jest.Mock).mockResolvedValue(configRow);
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

    const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://example.com/hook', ['task.created']);
    const event = await triggerWebhook(webhook.id, 'task.created', { taskId: '123' });

    expect(event.webhookId).toBe(webhook.id);
    expect(event.event).toBe('task.created');
    expect(event.attempts).toBe(1);
  });

  it('should increment failure count on failed delivery', async () => {
    const configRow = makeConfigRow();
    (mockWebhookConfig.create as jest.Mock).mockResolvedValue(configRow);
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

    const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://example.com/hook', ['task.created']);
    const event = await triggerWebhook(webhook.id, 'task.created', {});
    expect(event.status).toBe('DELIVERED');
    expect(event.response).toBeDefined();
  });

  it('should record events in history', async () => {
    const configRow = makeConfigRow();
    (mockWebhookConfig.create as jest.Mock).mockResolvedValue(configRow);
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

    const webhook = await createWebhook('entity-1', 'OUTBOUND', 'https://example.com/hook', ['test']);
    await triggerWebhook(webhook.id, 'test', { data: 1 });
    await triggerWebhook(webhook.id, 'test', { data: 2 });

    // Mock findMany to return 2 events
    (mockWebhookEvent.findMany as jest.Mock).mockResolvedValue([
      makeEventRow({ id: 'evt-1' }),
      makeEventRow({ id: 'evt-2' }),
    ]);

    const events = await getWebhookEvents(webhook.id);
    expect(events.length).toBe(2);
  });
});
