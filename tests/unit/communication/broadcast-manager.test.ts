import { renderTemplate, validateRecipients, sendBroadcast, scheduleBroadcast, getBroadcastHistory } from '@/modules/communication/services/broadcast-manager';

jest.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    document: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/integrations/email/client', () => ({
  sendEmail: jest.fn(),
}));

jest.mock('@/lib/integrations/sms/client', () => ({
  sendSMS: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'broadcast-uuid-123'),
}));

import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/integrations/email/client';
import { sendSMS } from '@/lib/integrations/sms/client';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('broadcast-manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('renderTemplate', () => {
    it('should replace all merge fields', () => {
      const result = renderTemplate(
        'Hello {{name}}, your order {{orderId}} is ready for {{action}}.',
        { name: 'Alice', orderId: '12345', action: 'pickup' }
      );
      expect(result).toBe('Hello Alice, your order 12345 is ready for pickup.');
    });

    it('should leave unmatched placeholders intact', () => {
      const result = renderTemplate(
        'Hello {{name}}, your {{missing}} is here.',
        { name: 'Bob' }
      );
      expect(result).toBe('Hello Bob, your {{missing}} is here.');
    });

    it('should handle empty merge fields', () => {
      const result = renderTemplate('Hello {{name}}!', {});
      expect(result).toBe('Hello {{name}}!');
    });

    it('should handle template with no placeholders', () => {
      const result = renderTemplate('Just a plain message.', { name: 'Test' });
      expect(result).toBe('Just a plain message.');
    });

    it('should handle multiple occurrences of the same field', () => {
      const result = renderTemplate('{{name}} said hello. Hello {{name}}!', { name: 'Eve' });
      expect(result).toBe('Eve said hello. Hello Eve!');
    });
  });

  describe('validateRecipients', () => {
    it('should mark doNotContact recipients as invalid', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', preferences: { doNotContact: true }, channels: [{ type: 'EMAIL', handle: 'a@b.com' }] },
        { id: 'c-2', preferences: {}, channels: [{ type: 'EMAIL', handle: 'b@b.com' }] },
      ]);

      const result = await validateRecipients(['c-1', 'c-2']);
      expect(result.valid).toContain('c-2');
      expect(result.invalid).toContain('c-1');
    });

    it('should mark contacts with no channels as invalid', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', preferences: {}, channels: [] },
      ]);

      const result = await validateRecipients(['c-1']);
      expect(result.invalid).toContain('c-1');
      expect(result.valid).toHaveLength(0);
    });

    it('should mark nonexistent contacts as invalid', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      const result = await validateRecipients(['nonexistent-1', 'nonexistent-2']);
      expect(result.invalid).toHaveLength(2);
      expect(result.valid).toHaveLength(0);
    });

    it('should handle empty recipient list', async () => {
      const result = await validateRecipients([]);
      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(0);
    });

    it('should pass valid contacts with channels and no doNotContact', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', preferences: {}, channels: [{ type: 'EMAIL', handle: 'a@b.com' }] },
        { id: 'c-2', preferences: { doNotContact: false }, channels: [{ type: 'SMS', handle: '555-0100' }] },
      ]);

      const result = await validateRecipients(['c-1', 'c-2']);
      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(0);
    });
  });

  describe('sendBroadcast', () => {
    it('should send to valid recipients and report results', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', preferences: {}, channels: [{ type: 'EMAIL', handle: 'a@b.com' }] },
        { id: 'c-2', preferences: { doNotContact: true }, channels: [{ type: 'EMAIL', handle: 'b@b.com' }] },
      ]);
      (mockPrisma.message.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({ email: 'a@b.com', name: 'Alice' });
      (sendEmail as jest.Mock).mockResolvedValue(true);

      const result = await sendBroadcast({
        entityId: 'entity-1',
        recipientIds: ['c-1', 'c-2'],
        template: 'Hello {{name}}!',
        mergeFields: [{ name: 'Alice' }, { name: 'Bob' }],
        channel: 'EMAIL',
      });

      expect(result.totalSent).toBe(1);
      expect(result.totalFailed).toBe(1);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].contactId).toBe('c-2');
    });

    it('should trigger email workflow for EMAIL channel', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', preferences: {}, channels: [{ type: 'EMAIL', handle: 'a@b.com' }] },
      ]);
      (mockPrisma.message.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({ email: 'test@example.com', name: 'Test' });
      (sendEmail as jest.Mock).mockResolvedValue(true);

      await sendBroadcast({
        entityId: 'entity-1',
        recipientIds: ['c-1'],
        template: 'Hello!',
        mergeFields: [{}],
        channel: 'EMAIL',
      });

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('Broadcast:'),
        })
      );
    });

    it('should trigger SMS workflow for SMS channel', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', preferences: {}, channels: [{ type: 'SMS', handle: '555-0100' }] },
      ]);
      (mockPrisma.message.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({ phone: '+15550100', name: 'Test' });
      (sendSMS as jest.Mock).mockResolvedValue('sms-sid-123');

      await sendBroadcast({
        entityId: 'entity-1',
        recipientIds: ['c-1'],
        template: 'Hello!',
        mergeFields: [{}],
        channel: 'SMS',
      });

      expect(sendSMS).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '+15550100',
          body: 'Hello!',
        })
      );
    });

    it('should handle message creation failure gracefully', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', preferences: {}, channels: [{ type: 'EMAIL', handle: 'a@b.com' }] },
      ]);
      (mockPrisma.message.create as jest.Mock).mockRejectedValue(new Error('DB connection lost'));

      const result = await sendBroadcast({
        entityId: 'entity-1',
        recipientIds: ['c-1'],
        template: 'Hello!',
        mergeFields: [{}],
        channel: 'EMAIL',
      });

      expect(result.totalSent).toBe(0);
      expect(result.totalFailed).toBe(1);
      expect(result.failures[0].reason).toContain('DB connection lost');
    });

    it('should continue on individual email send failures', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', preferences: {}, channels: [{ type: 'EMAIL', handle: 'a@b.com' }] },
      ]);
      (mockPrisma.message.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({ email: 'a@b.com', name: 'Alice' });
      (sendEmail as jest.Mock).mockRejectedValue(new Error('SMTP error'));

      const result = await sendBroadcast({
        entityId: 'entity-1',
        recipientIds: ['c-1'],
        template: 'Hello!',
        mergeFields: [{}],
        channel: 'EMAIL',
      });

      // Message is still recorded, so totalSent = 1 even though email dispatch failed
      expect(result.totalSent).toBe(1);
    });

    it('should render templates with correct merge fields per recipient', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', preferences: {}, channels: [{ type: 'EMAIL', handle: 'a@b.com' }] },
        { id: 'c-2', preferences: {}, channels: [{ type: 'EMAIL', handle: 'b@b.com' }] },
      ]);
      (mockPrisma.message.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      await sendBroadcast({
        entityId: 'entity-1',
        recipientIds: ['c-1', 'c-2'],
        template: 'Hello {{name}}, welcome!',
        mergeFields: [{ name: 'Alice' }, { name: 'Bob' }],
        channel: 'EMAIL',
      });

      const firstCall = (mockPrisma.message.create as jest.Mock).mock.calls[0][0];
      expect(firstCall.data.body).toBe('Hello Alice, welcome!');
      const secondCall = (mockPrisma.message.create as jest.Mock).mock.calls[1][0];
      expect(secondCall.data.body).toBe('Hello Bob, welcome!');
    });
  });

  describe('scheduleBroadcast', () => {
    it('should create Document with type SCHEDULED_BROADCAST', async () => {
      const scheduledAt = new Date('2026-03-01T10:00:00Z');
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'doc-123',
        type: 'SCHEDULED_BROADCAST',
      });

      const result = await scheduleBroadcast({
        entityId: 'entity-1',
        recipientIds: ['c-1', 'c-2'],
        template: 'Hello!',
        mergeFields: [{}],
        channel: 'EMAIL',
        scheduledAt,
      });

      expect(result.broadcastId).toBe('doc-123');
      expect(result.scheduledAt).toEqual(scheduledAt);

      const createCall = (mockPrisma.document.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.type).toBe('SCHEDULED_BROADCAST');
      expect(createCall.data.status).toBe('DRAFT');
    });

    it('should store request as JSON content', async () => {
      const scheduledAt = new Date('2026-03-01T10:00:00Z');
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({ id: 'doc-456' });

      await scheduleBroadcast({
        entityId: 'entity-1',
        recipientIds: ['c-1'],
        template: 'Test',
        mergeFields: [{}],
        channel: 'SMS',
        scheduledAt,
      });

      const createCall = (mockPrisma.document.create as jest.Mock).mock.calls[0][0];
      const content = JSON.parse(createCall.data.content);
      expect(content.entityId).toBe('entity-1');
      expect(content.channel).toBe('SMS');
    });
  });

  describe('getBroadcastHistory', () => {
    it('should query messages with Broadcast: subject prefix', async () => {
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue([
        { id: 'm-1', subject: 'Broadcast: Hello!', createdAt: new Date('2026-01-01') },
        { id: 'm-2', subject: 'Broadcast: Hello!', createdAt: new Date('2026-01-01') },
        { id: 'm-3', subject: 'Broadcast: Goodbye!', createdAt: new Date('2026-01-02') },
      ]);

      const result = await getBroadcastHistory('entity-1');

      expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityId: 'entity-1',
            subject: { startsWith: 'Broadcast:' },
          }),
        })
      );
      expect(result).toHaveLength(2); // two unique subjects
    });

    it('should group by subject for deduplication', async () => {
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue([
        { id: 'm-1', subject: 'Broadcast: Promo', createdAt: new Date('2026-01-01') },
        { id: 'm-2', subject: 'Broadcast: Promo', createdAt: new Date('2026-01-01') },
        { id: 'm-3', subject: 'Broadcast: Promo', createdAt: new Date('2026-01-01') },
      ]);

      const result = await getBroadcastHistory('entity-1');

      expect(result).toHaveLength(1);
      expect(result[0].totalSent).toBe(3);
      expect(result[0].subject).toBe('Broadcast: Promo');
    });
  });
});
