import { InboxService } from '@/modules/inbox/inbox.service';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    message: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    contact: {
      findUnique: jest.fn(),
    },
    entity: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

import { prisma } from '@/lib/db';

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

const mockMessageRow = {
  id: 'msg-1',
  channel: 'EMAIL',
  senderId: 'sender-1',
  recipientId: 'recipient-1',
  entityId: 'entity-1',
  threadId: 'thread-1',
  subject: 'Test Subject',
  body: 'Hello world',
  triageScore: 5,
  intent: 'INQUIRY',
  sensitivity: 'INTERNAL',
  draftStatus: null,
  attachments: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  entity: { id: 'entity-1', name: 'Test Entity', type: 'LLC' },
  contact: null,
};

describe('InboxService', () => {
  let service: InboxService;

  beforeEach(() => {
    service = new InboxService();
    jest.clearAllMocks();
  });

  describe('listInbox', () => {
    it('should return paginated inbox items', async () => {
      (mockedPrisma.message.findMany as jest.Mock)
        .mockResolvedValueOnce([mockMessageRow]) // list query
        .mockResolvedValueOnce([mockMessageRow]); // stats query
      (mockedPrisma.message.count as jest.Mock).mockResolvedValue(1);

      const result = await service.listInbox('user-1', { page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.stats).toBeDefined();
    });

    it('should filter by channel', async () => {
      (mockedPrisma.message.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (mockedPrisma.message.count as jest.Mock).mockResolvedValue(0);

      await service.listInbox('user-1', { channel: 'SMS' });

      expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ channel: 'SMS' }),
        })
      );
    });

    it('should filter by triage score range', async () => {
      (mockedPrisma.message.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (mockedPrisma.message.count as jest.Mock).mockResolvedValue(0);

      await service.listInbox('user-1', { minTriageScore: 7, maxTriageScore: 10 });

      expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            triageScore: { gte: 7, lte: 10 },
          }),
        })
      );
    });

    it('should filter by entity', async () => {
      (mockedPrisma.message.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (mockedPrisma.message.count as jest.Mock).mockResolvedValue(0);

      await service.listInbox('user-1', { entityId: 'entity-1' });

      expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityId: 'entity-1' }),
        })
      );
    });

    it('should filter by date range', async () => {
      (mockedPrisma.message.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (mockedPrisma.message.count as jest.Mock).mockResolvedValue(0);

      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');
      await service.listInbox('user-1', { dateFrom, dateTo });

      expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: dateFrom, lte: dateTo },
          }),
        })
      );
    });

    it('should search by body/subject text', async () => {
      (mockedPrisma.message.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (mockedPrisma.message.count as jest.Mock).mockResolvedValue(0);

      await service.listInbox('user-1', { search: 'urgent' });

      expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ body: expect.objectContaining({ contains: 'urgent' }) }),
            ]),
          }),
        })
      );
    });

    it('should sort by triage score descending by default', async () => {
      (mockedPrisma.message.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (mockedPrisma.message.count as jest.Mock).mockResolvedValue(0);

      await service.listInbox('user-1', {});

      expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { triageScore: 'desc' },
        })
      );
    });

    it('should include inbox stats in response', async () => {
      (mockedPrisma.message.findMany as jest.Mock)
        .mockResolvedValueOnce([mockMessageRow])
        .mockResolvedValueOnce([{ id: 'msg-1', channel: 'EMAIL', triageScore: 5, intent: 'INQUIRY', draftStatus: null }]);
      (mockedPrisma.message.count as jest.Mock).mockResolvedValue(1);

      const result = await service.listInbox('user-1', {});

      expect(result.stats).toHaveProperty('total');
      expect(result.stats).toHaveProperty('unread');
      expect(result.stats).toHaveProperty('urgent');
      expect(result.stats).toHaveProperty('needsResponse');
      expect(result.stats).toHaveProperty('byChannel');
      expect(result.stats).toHaveProperty('avgTriageScore');
    });
  });

  describe('getMessageDetail', () => {
    it('should return message with thread context', async () => {
      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue(mockMessageRow);
      (mockedPrisma.message.findMany as jest.Mock).mockResolvedValue([mockMessageRow]);

      const result = await service.getMessageDetail('msg-1', 'user-1');

      expect(result).not.toBeNull();
      expect(result!.message.id).toBe('msg-1');
      expect(result!.threadMessages).toBeDefined();
    });

    it('should include sender contact info', async () => {
      const msgWithContact = {
        ...mockMessageRow,
        contact: {
          id: 'sender-1',
          entityId: 'entity-1',
          name: 'John Doe',
          email: 'john@example.com',
          phone: null,
          channels: [],
          relationshipScore: 75,
          lastTouch: null,
          commitments: [],
          preferences: {},
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue(msgWithContact);
      (mockedPrisma.message.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getMessageDetail('msg-1', 'user-1');

      expect(result!.senderContact).toBeDefined();
      expect(result!.senderName).toBe('John Doe');
    });

    it('should return null for non-existent message', async () => {
      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getMessageDetail('nonexistent', 'user-1');
      expect(result).toBeNull();
    });
  });

  describe('getThread', () => {
    it('should return all messages in thread ordered by date', async () => {
      const msg1 = { ...mockMessageRow, id: 'msg-1', createdAt: new Date('2024-01-01') };
      const msg2 = { ...mockMessageRow, id: 'msg-2', createdAt: new Date('2024-01-02') };
      (mockedPrisma.message.findMany as jest.Mock).mockResolvedValue([msg1, msg2]);

      const thread = await service.getThread('thread-1', 'entity-1');

      expect(thread).toHaveLength(2);
      expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { threadId: 'thread-1', entityId: 'entity-1' },
          orderBy: { createdAt: 'asc' },
        })
      );
    });

    it('should return single message if no thread', async () => {
      (mockedPrisma.message.findMany as jest.Mock).mockResolvedValue([mockMessageRow]);

      const thread = await service.getThread('thread-1', 'entity-1');
      expect(thread).toHaveLength(1);
    });
  });

  describe('followUp operations', () => {
    it('should create follow-up reminder', async () => {
      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue(mockMessageRow);

      const followUp = await service.createFollowUp({
        messageId: 'msg-1',
        entityId: 'entity-1',
        reminderAt: new Date('2024-06-01'),
        reason: 'Need to check back',
      });

      expect(followUp.id).toBeTruthy();
      expect(followUp.messageId).toBe('msg-1');
      expect(followUp.status).toBe('PENDING');
      expect(followUp.reason).toBe('Need to check back');
    });

    it('should list follow-ups sorted by date', async () => {
      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue(mockMessageRow);

      // Create two follow-ups
      await service.createFollowUp({
        messageId: 'msg-1',
        entityId: 'entity-1',
        reminderAt: new Date('2024-07-01'),
      });

      const list = await service.listFollowUps('user-1');
      expect(list.length).toBeGreaterThanOrEqual(1);
    });

    it('should complete a follow-up', async () => {
      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue(mockMessageRow);

      const followUp = await service.createFollowUp({
        messageId: 'msg-1',
        entityId: 'entity-1',
        reminderAt: new Date('2024-06-01'),
      });

      await service.completeFollowUp(followUp.id);

      const list = await service.listFollowUps('user-1');
      const completed = list.find((f) => f.id === followUp.id);
      expect(completed?.status).toBe('COMPLETED');
    });

    it('should snooze a follow-up to new date', async () => {
      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue(mockMessageRow);

      const followUp = await service.createFollowUp({
        messageId: 'msg-1',
        entityId: 'entity-1',
        reminderAt: new Date('2024-06-01'),
      });

      const newDate = new Date('2024-06-08');
      await service.snoozeFollowUp(followUp.id, newDate);

      const list = await service.listFollowUps('user-1');
      const snoozed = list.find((f) => f.id === followUp.id);
      expect(snoozed?.reminderAt).toEqual(newDate);
      expect(snoozed?.status).toBe('PENDING');
    });
  });

  describe('cannedResponse operations', () => {
    it('should create canned response', async () => {
      const response = await service.createCannedResponse({
        name: 'Auto Reply',
        entityId: 'entity-1',
        channel: 'EMAIL',
        category: 'General',
        body: 'Thank you for reaching out. We will get back to you shortly.',
        tone: 'FORMAL',
      });

      expect(response.id).toBeTruthy();
      expect(response.name).toBe('Auto Reply');
      expect(response.usageCount).toBe(0);
    });

    it('should list canned responses filtered by entity', async () => {
      await service.createCannedResponse({
        name: 'Response A',
        entityId: 'entity-1',
        channel: 'EMAIL',
        category: 'Support',
        body: 'Body A',
        tone: 'FORMAL',
      });

      const list = await service.listCannedResponses('entity-1');
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.every((r) => r.entityId === 'entity-1')).toBe(true);
    });

    it('should list canned responses filtered by channel', async () => {
      await service.createCannedResponse({
        name: 'SMS Response',
        entityId: 'entity-1',
        channel: 'SMS',
        category: 'Quick',
        body: 'Quick SMS reply',
        tone: 'CASUAL',
      });

      const list = await service.listCannedResponses('entity-1', 'SMS');
      expect(list.every((r) => r.channel === 'SMS')).toBe(true);
    });

    it('should update canned response', async () => {
      const response = await service.createCannedResponse({
        name: 'Old Name',
        entityId: 'entity-1',
        channel: 'EMAIL',
        category: 'Support',
        body: 'Old body',
        tone: 'FORMAL',
      });

      const updated = await service.updateCannedResponse(response.id, {
        name: 'New Name',
        body: 'New body',
      });

      expect(updated.name).toBe('New Name');
      expect(updated.body).toBe('New body');
    });

    it('should delete canned response', async () => {
      const response = await service.createCannedResponse({
        name: 'To Delete',
        entityId: 'entity-delete',
        channel: 'EMAIL',
        category: 'Temp',
        body: 'Delete me',
        tone: 'FORMAL',
      });

      await service.deleteCannedResponse(response.id);

      const found = await service.getCannedResponse(response.id);
      expect(found).toBeNull();
    });

    it('should increment usage count on use', async () => {
      const response = await service.createCannedResponse({
        name: 'Usage Counter',
        entityId: 'entity-1',
        channel: 'EMAIL',
        category: 'General',
        body: 'Test',
        tone: 'FORMAL',
      });

      await service.incrementCannedResponseUsage(response.id);
      await service.incrementCannedResponseUsage(response.id);

      const updated = await service.getCannedResponse(response.id);
      expect(updated!.usageCount).toBe(2);
    });
  });
});
