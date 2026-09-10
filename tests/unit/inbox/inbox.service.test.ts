import { InboxService } from '@/modules/inbox/inbox.service';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    message: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    contact: {
      findUnique: jest.fn(),
    },
    entity: {
      findUnique: jest.fn(),
    },
    followUpReminder: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    cannedResponse: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

import { prisma } from '@/lib/db';
import { asMockedPrisma } from '../../support/prisma-mock';

/**
 * P-35: was `prisma as jest.Mocked<typeof prisma>`, which does not do what it
 * looks like it does. `Db` is the `$extends`ed client
 * (`DynamicClientExtensionThis`), and `jest.Mocked` leaves its delegate methods
 * as the real Prisma signatures rather than mocks -- so `.mockResolvedValue`
 * did not exist on any of them and every use in this file needed a second cast.
 * The author reached for `(mockedPrisma as any).followUpReminder`, which then
 * removed delegate checking too.
 *
 * `asMockedPrisma` is the type that was wanted: the delegate and method NAMES
 * still come from `Db`, only the signatures are widened to `jest.Mock`. See
 * tests/support/prisma-mock.ts.
 */
const mockedPrisma = asMockedPrisma(prisma);

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
  read: false,
  starred: false,
  attachments: [],
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  entity: { id: 'entity-1', name: 'Test Entity', type: 'LLC' },
  contact: null,
};

// P-35: these two were `(mockedPrisma as any).followUpReminder` and
// `.cannedResponse`. Both models are in schema.prisma, so the cast bought
// nothing and cost the one check worth having here -- that the delegate the
// service queries is a delegate the client has. Read off the typed client, a
// model deleted by a future migration breaks this file at compile time instead
// of returning `undefined` into a swallowed catch.
const mockFollowUpReminder = () => mockedPrisma.followUpReminder;
const mockCannedResponse = () => mockedPrisma.cannedResponse;

// P-06: InboxService now takes a VerifiedEntityId for the entity in scope and
// the authenticated userId for rows it owns. A unit test cannot mint the brand,
// so it uses the one sanctioned helper (P-00b) rather than a local cast. See
// docs/parallel-build/tenancy-pattern.md trap 3.
import { verifiedEntityIdForTest } from '../../helpers/factories';

const SCOPE = verifiedEntityIdForTest('entity-1');
const USER = 'user-1';

describe('InboxService', () => {
  let service: InboxService;

  beforeEach(() => {
    service = new InboxService();
    jest.clearAllMocks();
    // Default mocks for follow-up and canned response Prisma calls
    mockFollowUpReminder().findMany.mockResolvedValue([]);
    mockFollowUpReminder().findFirst.mockResolvedValue(null);
    mockCannedResponse().findMany.mockResolvedValue([]);
    mockCannedResponse().findFirst.mockResolvedValue(null);
    mockCannedResponse().updateMany.mockResolvedValue({ count: 1 });
    mockCannedResponse().deleteMany.mockResolvedValue({ count: 1 });
    mockFollowUpReminder().updateMany.mockResolvedValue({ count: 1 });
    (mockedPrisma.message.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  describe('listInbox', () => {
    it('should return paginated inbox items', async () => {
      (mockedPrisma.message.findMany as jest.Mock)
        .mockResolvedValueOnce([mockMessageRow]) // list query
        .mockResolvedValueOnce([mockMessageRow]); // stats query
      (mockedPrisma.message.count as jest.Mock).mockResolvedValue(1);

      const result = await service.listInbox(SCOPE, { page: 1, pageSize: 20 });

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

      await service.listInbox(SCOPE, { channel: 'SMS' });

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

      await service.listInbox(SCOPE, { minTriageScore: 7, maxTriageScore: 10 });

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

      await service.listInbox(SCOPE, {});

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
      await service.listInbox(SCOPE, { dateFrom, dateTo });

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

      await service.listInbox(SCOPE, { search: 'urgent' });

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

      await service.listInbox(SCOPE, {});

      expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { triageScore: 'desc' },
        })
      );
    });

    it('should include inbox stats in response', async () => {
      (mockedPrisma.message.findMany as jest.Mock)
        .mockResolvedValueOnce([mockMessageRow])
        .mockResolvedValueOnce([{ id: 'msg-1', channel: 'EMAIL', triageScore: 5, intent: 'INQUIRY', draftStatus: null, read: false }]);
      (mockedPrisma.message.count as jest.Mock).mockResolvedValue(1);

      const result = await service.listInbox(SCOPE, {});

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
      (mockedPrisma.message.findFirst as jest.Mock).mockResolvedValue(mockMessageRow);
      (mockedPrisma.message.findMany as jest.Mock).mockResolvedValue([mockMessageRow]);

      const result = await service.getMessageDetail('msg-1', SCOPE);

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
      (mockedPrisma.message.findFirst as jest.Mock).mockResolvedValue(msgWithContact);
      (mockedPrisma.message.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getMessageDetail('msg-1', SCOPE);

      expect(result!.senderContact).toBeDefined();
      expect(result!.senderName).toBe('John Doe');
    });

    it('should return null for non-existent message', async () => {
      (mockedPrisma.message.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getMessageDetail('nonexistent', SCOPE);
      expect(result).toBeNull();
    });
  });

  describe('getThread', () => {
    it('should return all messages in thread ordered by date', async () => {
      const msg1 = { ...mockMessageRow, id: 'msg-1', createdAt: new Date('2024-01-01') };
      const msg2 = { ...mockMessageRow, id: 'msg-2', createdAt: new Date('2024-01-02') };
      (mockedPrisma.message.findMany as jest.Mock).mockResolvedValue([msg1, msg2]);

      const thread = await service.getThread('thread-1', SCOPE);

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

      const thread = await service.getThread('thread-1', SCOPE);
      expect(thread).toHaveLength(1);
    });
  });

  describe('followUp operations', () => {
    it('should create follow-up reminder', async () => {
      (mockedPrisma.message.findFirst as jest.Mock).mockResolvedValue(mockMessageRow);
      const createdRow = {
        id: 'fu-1',
        userId: 'default-user',
        messageId: 'msg-1',
        description: 'Need to check back',
        dueDate: new Date('2024-06-01'),
        priority: 'PENDING:entity-1',
        completed: false,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockFollowUpReminder().create.mockResolvedValue(createdRow);

      const followUp = await service.createFollowUp({
        messageId: 'msg-1',
        reminderAt: new Date('2024-06-01'),
        reason: 'Need to check back',
      }, SCOPE, USER);

      expect(followUp.id).toBe('fu-1');
      expect(followUp.messageId).toBe('msg-1');
      expect(followUp.status).toBe('PENDING');
      expect(followUp.reason).toBe('Need to check back');
    });

    it('should list follow-ups sorted by date', async () => {
      const rows = [
        {
          id: 'fu-1',
          userId: 'user-1',
          messageId: 'msg-1',
          description: 'Follow up required',
          dueDate: new Date('2024-07-01'),
          priority: 'PENDING:entity-1',
          completed: false,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'fu-2',
          userId: 'user-1',
          messageId: 'msg-2',
          description: 'Another follow up',
          dueDate: new Date('2024-06-15'),
          priority: 'PENDING:entity-1',
          completed: false,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockFollowUpReminder().findMany.mockResolvedValue(rows);

      const list = await service.listFollowUps(USER);
      expect(list.length).toBe(2);
      // Should be sorted by date ascending
      expect(list[0].id).toBe('fu-2');
      expect(list[1].id).toBe('fu-1');
    });

    it('should complete a follow-up', async () => {
      const row = {
        id: 'fu-1',
        userId: 'default-user',
        messageId: 'msg-1',
        description: 'Follow up',
        dueDate: new Date('2024-06-01'),
        priority: 'PENDING:entity-1',
        completed: false,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockFollowUpReminder().findFirst.mockResolvedValue(row);
      mockFollowUpReminder().updateMany.mockResolvedValue({
        ...row,
        priority: 'COMPLETED:entity-1',
        completed: true,
        completedAt: new Date(),
      });

      await service.completeFollowUp('fu-1', USER);

      expect(mockFollowUpReminder().updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'fu-1', userId: USER },
          data: expect.objectContaining({
            completed: true,
            priority: 'COMPLETED:entity-1',
          }),
        })
      );
    });

    it('should snooze a follow-up to new date', async () => {
      const row = {
        id: 'fu-1',
        userId: 'default-user',
        messageId: 'msg-1',
        description: 'Follow up',
        dueDate: new Date('2024-06-01'),
        priority: 'PENDING:entity-1',
        completed: false,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockFollowUpReminder().findFirst.mockResolvedValue(row);

      const newDate = new Date('2024-06-08');
      mockFollowUpReminder().updateMany.mockResolvedValue({
        ...row,
        dueDate: newDate,
        priority: 'PENDING:entity-1',
      });

      await service.snoozeFollowUp('fu-1', newDate, USER);

      expect(mockFollowUpReminder().updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'fu-1', userId: USER },
          data: expect.objectContaining({
            dueDate: newDate,
            priority: 'PENDING:entity-1',
            completed: false,
          }),
        })
      );
    });
  });

  describe('cannedResponse operations', () => {
    const makeCannedRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'cr-1',
      userId: 'default-user',
      title: 'Auto Reply',
      content: 'Thank you for reaching out. We will get back to you shortly.',
      tags: [],
      shortcut: JSON.stringify({
        entityId: 'entity-1',
        channel: 'EMAIL',
        category: 'General',
        tone: 'FORMAL',
        usageCount: 0,
      }),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

    it('should create canned response', async () => {
      mockCannedResponse().create.mockResolvedValue(makeCannedRow());

      const response = await service.createCannedResponse({
        name: 'Auto Reply',
        channel: 'EMAIL',
        category: 'General',
        body: 'Thank you for reaching out. We will get back to you shortly.',
        tone: 'FORMAL',
      }, SCOPE, USER);

      expect(response.id).toBe('cr-1');
      expect(response.name).toBe('Auto Reply');
      expect(response.usageCount).toBe(0);
    });

    it('should list canned responses filtered by entity', async () => {
      mockCannedResponse().findMany.mockResolvedValue([makeCannedRow()]);

      const list = await service.listCannedResponses(SCOPE, USER);
      expect(list.length).toBe(1);
      expect(list.every((r) => r.entityId === 'entity-1')).toBe(true);
    });

    it('should list canned responses filtered by channel', async () => {
      mockCannedResponse().findMany.mockResolvedValue([
        makeCannedRow({
          id: 'cr-sms',
          title: 'SMS Response',
          content: 'Quick SMS reply',
          shortcut: JSON.stringify({
            entityId: 'entity-1',
            channel: 'SMS',
            category: 'Quick',
            tone: 'CASUAL',
            usageCount: 0,
          }),
        }),
      ]);

      const list = await service.listCannedResponses(SCOPE, USER, 'SMS');
      expect(list.every((r) => r.channel === 'SMS')).toBe(true);
    });

    it('should update canned response', async () => {
      const existingRow = makeCannedRow({ id: 'cr-upd', title: 'Old Name', content: 'Old body' });
      mockCannedResponse().findFirst.mockResolvedValue(existingRow);
      mockCannedResponse().updateMany.mockResolvedValue({
        ...existingRow,
        title: 'New Name',
        content: 'New body',
      });

      const updated = await service.updateCannedResponse('cr-upd', {
        name: 'New Name',
        body: 'New body',
      }, USER);

      expect(updated.name).toBe('New Name');
      expect(updated.body).toBe('New body');
    });

    it('should delete canned response', async () => {
      // deleteCannedResponse no longer reads the row first: the scope rides in
      // the deleteMany WHERE clause and count === 0 is not-found. Queueing a
      // read for it would leave a stale mockResolvedValueOnce behind --
      // jest.clearAllMocks() does not drain the once-queue -- and the next
      // test in this file would consume it.
      mockCannedResponse().findFirst.mockResolvedValueOnce(null); // after delete
      mockCannedResponse().deleteMany.mockResolvedValue({ count: 1 });

      await service.deleteCannedResponse('cr-del', USER);

      const found = await service.getCannedResponse('cr-del', USER);
      expect(found).toBeNull();
    });

    it('should increment usage count on use', async () => {
      const existingRow = makeCannedRow({ id: 'cr-usage' });
      // First call: incrementCannedResponseUsage reads existing
      // Second call: incrementCannedResponseUsage reads existing again
      // Third call: getCannedResponse reads the updated version
      mockCannedResponse().findFirst
        .mockResolvedValueOnce(existingRow) // first increment
        .mockResolvedValueOnce({
          ...existingRow,
          shortcut: JSON.stringify({
            entityId: 'entity-1',
            channel: 'EMAIL',
            category: 'General',
            tone: 'FORMAL',
            usageCount: 1,
            lastUsed: new Date().toISOString(),
          }),
        }) // second increment
        .mockResolvedValueOnce({
          ...existingRow,
          shortcut: JSON.stringify({
            entityId: 'entity-1',
            channel: 'EMAIL',
            category: 'General',
            tone: 'FORMAL',
            usageCount: 2,
            lastUsed: new Date().toISOString(),
          }),
        }); // getCannedResponse

      mockCannedResponse().updateMany.mockResolvedValue(existingRow);
      mockCannedResponse().create.mockResolvedValue(existingRow);

      await service.incrementCannedResponseUsage('cr-usage', USER);
      await service.incrementCannedResponseUsage('cr-usage', USER);

      const updated = await service.getCannedResponse('cr-usage', USER);
      expect(updated!.usageCount).toBe(2);
    });
  });
});
