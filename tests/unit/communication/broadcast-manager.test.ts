import { renderTemplate, validateRecipients, sendBroadcast } from '@/modules/communication/services/broadcast-manager';

jest.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      findMany: jest.fn(),
    },
    message: {
      create: jest.fn(),
    },
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'broadcast-uuid-123'),
}));

import { prisma } from '@/lib/db';

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

    it('should render templates with correct merge fields per recipient', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', preferences: {}, channels: [{ type: 'EMAIL', handle: 'a@b.com' }] },
        { id: 'c-2', preferences: {}, channels: [{ type: 'EMAIL', handle: 'b@b.com' }] },
      ]);
      (mockPrisma.message.create as jest.Mock).mockResolvedValue({});

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
});
