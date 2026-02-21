/**
 * Comprehensive unit tests for InboxService (Prisma-backed implementation)
 *
 * Covers:
 *   1. Follow-up CRUD (4 tests): create, list, complete, delete/cancel
 *   2. Canned Response CRUD (4 tests): create, list, update, delete
 *   3. Message read/starred state (4 tests): markAsRead, toggleStar, check read, check starred
 *   4. getCurrentUserId (2 tests): with x-user-id header, without header (fallback)
 *
 * Mocks @/lib/db with jest.fn() for all Prisma models used (followUpReminder,
 * cannedResponse, message). Tests validate function signatures and return shapes,
 * working regardless of whether the service uses Maps or Prisma internally.
 */

import { InboxService, getCurrentUserId } from '@/modules/inbox/inbox.service';

// Mock Prisma client with all models used by InboxService
jest.mock('@/lib/db', () => ({
  prisma: {
    message: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    followUpReminder: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    cannedResponse: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
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
  v4: jest.fn(() => 'test-uuid-generated'),
}));

import { prisma } from '@/lib/db';

const mockedPrisma = prisma as unknown as {
  message: Record<string, jest.Mock>;
  followUpReminder: Record<string, jest.Mock>;
  cannedResponse: Record<string, jest.Mock>;
  contact: Record<string, jest.Mock>;
  entity: Record<string, jest.Mock>;
};

// --- Fixture helpers ---

const makeMessageRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-100',
  channel: 'EMAIL',
  senderId: 'sender-1',
  recipientId: 'recipient-1',
  entityId: 'entity-1',
  threadId: null,
  subject: 'Test Subject',
  body: 'Test body content',
  triageScore: 5,
  intent: 'INQUIRY',
  sensitivity: 'INTERNAL',
  draftStatus: null,
  attachments: [],
  read: false,
  starred: false,
  createdAt: new Date('2025-01-15T10:00:00Z'),
  updatedAt: new Date('2025-01-15T10:00:00Z'),
  entity: null,
  contact: null,
  ...overrides,
});

/**
 * Build a Prisma follow-up reminder row using the encoding scheme
 * from the service (status:entityId stored in `priority`).
 */
const makeFollowUpRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'fu-1',
  userId: 'default-user',
  messageId: 'msg-100',
  description: 'Follow up required',
  dueDate: new Date('2025-06-01T09:00:00Z'),
  priority: 'PENDING:entity-1',
  completed: false,
  completedAt: null,
  createdAt: new Date('2025-01-15T10:00:00Z'),
  updatedAt: new Date('2025-01-15T10:00:00Z'),
  ...overrides,
});

/**
 * Build a Prisma canned response row using the encoding scheme
 * from the service (JSON metadata stored in `shortcut`).
 */
const makeCannedResponseRow = (overrides: Record<string, unknown> = {}) => {
  const meta = {
    entityId: 'entity-1',
    channel: 'EMAIL',
    category: 'General',
    tone: 'FORMAL',
    usageCount: 0,
    ...(overrides._meta as Record<string, unknown> ?? {}),
  };
  // Remove _meta from overrides before spreading
  const { _meta, ...rest } = overrides;
  return {
    id: 'cr-1',
    userId: 'default-user',
    title: 'Auto Reply',
    content: 'Thank you for reaching out.',
    tags: [],
    shortcut: JSON.stringify(meta),
    createdAt: new Date('2025-01-15T10:00:00Z'),
    updatedAt: new Date('2025-01-15T10:00:00Z'),
    ...rest,
  };
};

describe('InboxService', () => {
  let service: InboxService;

  beforeEach(() => {
    service = new InboxService();
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Follow-up CRUD (4 tests)
  // =========================================================================
  describe('Follow-up CRUD', () => {
    it('should create a follow-up reminder and return expected shape', async () => {
      // Arrange: message exists in DB
      mockedPrisma.message.findUnique.mockResolvedValue(makeMessageRow());

      // Mock prisma.followUpReminder.create to return a valid row
      const createdRow = makeFollowUpRow({
        id: 'fu-new',
        messageId: 'msg-100',
        description: 'Check status of proposal',
        dueDate: new Date('2025-06-01T09:00:00Z'),
        priority: 'PENDING:entity-1',
      });
      mockedPrisma.followUpReminder.create.mockResolvedValue(createdRow);

      // Act
      const followUp = await service.createFollowUp({
        messageId: 'msg-100',
        entityId: 'entity-1',
        reminderAt: new Date('2025-06-01T09:00:00Z'),
        reason: 'Check status of proposal',
      });

      // Assert: return shape matches FollowUpReminder interface
      expect(followUp).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          messageId: 'msg-100',
          entityId: 'entity-1',
          reminderAt: expect.any(Date),
          reason: 'Check status of proposal',
          status: 'PENDING',
          createdAt: expect.any(Date),
        })
      );
      expect(followUp.id).toBeTruthy();
      expect(followUp.status).toBe('PENDING');
    });

    it('should list follow-ups and return an array sorted by reminderAt', async () => {
      // Arrange: mock Prisma to return multiple follow-up rows
      const earlyRow = makeFollowUpRow({
        id: 'fu-early',
        dueDate: new Date('2025-03-01T09:00:00Z'),
        priority: 'PENDING:entity-1',
        description: 'Earlier follow-up',
      });
      const lateRow = makeFollowUpRow({
        id: 'fu-late',
        dueDate: new Date('2025-09-01T09:00:00Z'),
        priority: 'PENDING:entity-1',
        description: 'Later follow-up',
      });
      mockedPrisma.followUpReminder.findMany.mockResolvedValue([earlyRow, lateRow]);

      // Act
      const list = await service.listFollowUps('default-user');

      // Assert
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(2);

      // Should be sorted ascending by reminderAt
      for (let i = 1; i < list.length; i++) {
        expect(list[i].reminderAt.getTime()).toBeGreaterThanOrEqual(
          list[i - 1].reminderAt.getTime()
        );
      }

      // Each item should have expected properties
      for (const item of list) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('messageId');
        expect(item).toHaveProperty('entityId');
        expect(item).toHaveProperty('reminderAt');
        expect(item).toHaveProperty('reason');
        expect(item).toHaveProperty('status');
        expect(item).toHaveProperty('createdAt');
      }
    });

    it('should complete a follow-up by changing its status to COMPLETED', async () => {
      // Arrange: existing follow-up row
      const existingRow = makeFollowUpRow({
        id: 'fu-to-complete',
        priority: 'PENDING:entity-1',
      });
      mockedPrisma.followUpReminder.findUnique.mockResolvedValue(existingRow);

      // Mock update to return the completed row
      const completedRow = {
        ...existingRow,
        completed: true,
        completedAt: new Date(),
        priority: 'COMPLETED:entity-1',
      };
      mockedPrisma.followUpReminder.update.mockResolvedValue(completedRow);

      // Act
      await service.completeFollowUp('fu-to-complete');

      // Assert: prisma update was called with the correct status encoding
      expect(mockedPrisma.followUpReminder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'fu-to-complete' },
          data: expect.objectContaining({
            completed: true,
            priority: expect.stringContaining('COMPLETED'),
          }),
        })
      );
    });

    it('should cancel a follow-up by changing its status to CANCELLED', async () => {
      // Arrange
      const existingRow = makeFollowUpRow({
        id: 'fu-to-cancel',
        priority: 'PENDING:entity-1',
      });
      mockedPrisma.followUpReminder.findUnique.mockResolvedValue(existingRow);

      const cancelledRow = {
        ...existingRow,
        priority: 'CANCELLED:entity-1',
      };
      mockedPrisma.followUpReminder.update.mockResolvedValue(cancelledRow);

      // Act
      await service.cancelFollowUp('fu-to-cancel');

      // Assert
      expect(mockedPrisma.followUpReminder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'fu-to-cancel' },
          data: expect.objectContaining({
            priority: expect.stringContaining('CANCELLED'),
          }),
        })
      );
    });
  });

  // =========================================================================
  // 2. Canned Response CRUD (4 tests)
  // =========================================================================
  describe('Canned Response CRUD', () => {
    it('should create a canned response with expected shape and defaults', async () => {
      // Arrange: mock prisma.cannedResponse.create
      const createdRow = makeCannedResponseRow({
        id: 'cr-new',
        title: 'Welcome Reply',
        content: 'Thank you for reaching out. We look forward to working with you.',
        tags: ['{{name}}', '{{company}}'],
        _meta: {
          entityId: 'entity-1',
          channel: 'EMAIL',
          category: 'Onboarding',
          subject: 'Welcome!',
          tone: 'WARM',
          usageCount: 0,
        },
      });
      mockedPrisma.cannedResponse.create.mockResolvedValue(createdRow);

      // Act
      const response = await service.createCannedResponse({
        name: 'Welcome Reply',
        entityId: 'entity-1',
        channel: 'EMAIL',
        category: 'Onboarding',
        subject: 'Welcome!',
        body: 'Thank you for reaching out. We look forward to working with you.',
        variables: ['{{name}}', '{{company}}'],
        tone: 'WARM',
      });

      // Assert: return shape matches CannedResponse interface
      expect(response).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: 'Welcome Reply',
          entityId: 'entity-1',
          channel: 'EMAIL',
          category: 'Onboarding',
          body: expect.stringContaining('Thank you'),
          variables: ['{{name}}', '{{company}}'],
          tone: 'WARM',
          usageCount: 0,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
      expect(response.id).toBeTruthy();
      expect(response.usageCount).toBe(0);
    });

    it('should list canned responses filtered by entityId', async () => {
      // Arrange: mock Prisma to return rows with different entityIds
      const row1 = makeCannedResponseRow({
        id: 'cr-e1',
        title: 'Entity-1 Reply',
        _meta: { entityId: 'entity-1', channel: 'EMAIL', category: 'General', tone: 'FORMAL', usageCount: 0 },
      });
      const row2 = makeCannedResponseRow({
        id: 'cr-e2',
        title: 'Entity-2 Reply',
        _meta: { entityId: 'entity-2', channel: 'EMAIL', category: 'General', tone: 'FORMAL', usageCount: 0 },
      });
      mockedPrisma.cannedResponse.findMany.mockResolvedValue([row1, row2]);

      // Act
      const entity1Responses = await service.listCannedResponses('entity-1');

      // Assert: only entity-1 responses returned
      expect(Array.isArray(entity1Responses)).toBe(true);
      expect(entity1Responses.length).toBe(1);
      expect(entity1Responses.every((r) => r.entityId === 'entity-1')).toBe(true);

      // Each item should have standard canned response properties
      for (const r of entity1Responses) {
        expect(r).toHaveProperty('id');
        expect(r).toHaveProperty('name');
        expect(r).toHaveProperty('entityId');
        expect(r).toHaveProperty('channel');
        expect(r).toHaveProperty('category');
        expect(r).toHaveProperty('body');
        expect(r).toHaveProperty('tone');
        expect(r).toHaveProperty('usageCount');
      }
    });

    it('should update a canned response and preserve unmodified fields', async () => {
      // Arrange: existing row in Prisma
      const existingRow = makeCannedResponseRow({
        id: 'cr-to-update',
        title: 'Original Name',
        content: 'Original body text',
        tags: [],
        _meta: {
          entityId: 'entity-1',
          channel: 'SMS',
          category: 'Quick Reply',
          tone: 'CASUAL',
          usageCount: 3,
        },
      });
      mockedPrisma.cannedResponse.findUnique.mockResolvedValue(existingRow);

      // Mock update to return the updated row
      const updatedRow = makeCannedResponseRow({
        id: 'cr-to-update',
        title: 'Updated Name',
        content: 'Updated body text',
        tags: [],
        _meta: {
          entityId: 'entity-1',
          channel: 'SMS',
          category: 'Quick Reply',
          tone: 'CASUAL',
          usageCount: 3,
        },
      });
      mockedPrisma.cannedResponse.update.mockResolvedValue(updatedRow);

      // Act: update only name and body
      const updated = await service.updateCannedResponse('cr-to-update', {
        name: 'Updated Name',
        body: 'Updated body text',
      });

      // Assert: updated fields changed
      expect(updated.name).toBe('Updated Name');
      expect(updated.body).toBe('Updated body text');

      // Assert: non-updated fields preserved
      expect(updated.channel).toBe('SMS');
      expect(updated.category).toBe('Quick Reply');
      expect(updated.tone).toBe('CASUAL');
      expect(updated.entityId).toBe('entity-1');
      expect(updated.id).toBe('cr-to-update');
      expect(updated.updatedAt).toBeInstanceOf(Date);
    });

    it('should delete a canned response so it is no longer retrievable', async () => {
      // Arrange: response exists for first findUnique call (for delete check)
      const existingRow = makeCannedResponseRow({ id: 'cr-to-delete' });
      mockedPrisma.cannedResponse.findUnique
        .mockResolvedValueOnce(existingRow) // exists check in deleteCannedResponse
        .mockResolvedValueOnce(null);       // getCannedResponse after delete returns null
      mockedPrisma.cannedResponse.delete.mockResolvedValue(existingRow);

      // Act
      await service.deleteCannedResponse('cr-to-delete');

      // Assert: delete was called
      expect(mockedPrisma.cannedResponse.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cr-to-delete' },
        })
      );

      // Assert: no longer retrievable
      const afterDelete = await service.getCannedResponse('cr-to-delete');
      expect(afterDelete).toBeNull();
    });
  });

  // =========================================================================
  // 3. Message read/starred state (4 tests)
  // =========================================================================
  describe('Message read/starred state', () => {
    it('should mark a message as read', async () => {
      // Arrange: message exists
      mockedPrisma.message.findUnique.mockResolvedValue(makeMessageRow({ id: 'msg-read-1' }));
      mockedPrisma.message.update.mockResolvedValue(makeMessageRow({ id: 'msg-read-1', read: true }));

      // Act
      await service.markAsRead('msg-read-1', true);

      // Assert: prisma.message.update was called with the correct read value
      expect(mockedPrisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-read-1' },
          data: expect.objectContaining({ read: true }),
        })
      );
    });

    it('should toggle starred state via toggleStar', async () => {
      // Arrange: message exists, currently not starred
      mockedPrisma.message.findUnique.mockResolvedValue(
        makeMessageRow({ id: 'msg-star-1', starred: false })
      );
      mockedPrisma.message.update.mockResolvedValue(
        makeMessageRow({ id: 'msg-star-1', starred: true })
      );

      // Act: toggle should set starred to true (opposite of current false)
      await service.toggleStar('msg-star-1');

      // Assert
      expect(mockedPrisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-star-1' },
          data: expect.objectContaining({ starred: true }),
        })
      );
    });

    it('should reflect read state when listing inbox items', async () => {
      // Arrange: message with read=true in DB
      const msgRow = makeMessageRow({ id: 'msg-read-check', read: true });
      mockedPrisma.message.findMany
        .mockResolvedValueOnce([msgRow])  // listInbox query
        .mockResolvedValueOnce([{ id: 'msg-read-check', channel: 'EMAIL', triageScore: 5, intent: 'INQUIRY', draftStatus: null, read: true }]); // stats query
      mockedPrisma.message.count.mockResolvedValue(1);
      mockedPrisma.followUpReminder.findMany.mockResolvedValue([]);

      // Act
      const result = await service.listInbox('user-1', { page: 1, pageSize: 20 });

      // Assert
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBe(1);

      const item = result.items[0];
      expect(typeof item.isRead).toBe('boolean');
      expect(item.isRead).toBe(true);
    });

    it('should reflect starred state when listing inbox items', async () => {
      // Arrange: message with starred=true in DB
      const msgRow = makeMessageRow({ id: 'msg-star-check', starred: true });
      mockedPrisma.message.findMany
        .mockResolvedValueOnce([msgRow])  // listInbox query
        .mockResolvedValueOnce([{ id: 'msg-star-check', channel: 'EMAIL', triageScore: 5, intent: 'INQUIRY', draftStatus: null, read: false }]); // stats query
      mockedPrisma.message.count.mockResolvedValue(1);
      mockedPrisma.followUpReminder.findMany.mockResolvedValue([]);

      // Act
      const result = await service.listInbox('user-1', { page: 1, pageSize: 20 });

      // Assert
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBe(1);

      const item = result.items[0];
      expect(typeof item.isStarred).toBe('boolean');
      expect(item.isStarred).toBe(true);
    });
  });

  // =========================================================================
  // 4. getCurrentUserId (2 tests)
  // =========================================================================
  describe('getCurrentUserId', () => {
    it('should return the user ID from x-user-id header when present', () => {
      const headers = { 'x-user-id': 'user-abc-123' };
      const userId = getCurrentUserId(headers);

      expect(typeof userId).toBe('string');
      expect(userId).toBe('user-abc-123');
    });

    it('should return fallback default value when no header context is available', () => {
      // Case 1: no headers argument at all
      const userId1 = getCurrentUserId();
      expect(typeof userId1).toBe('string');
      expect(userId1.length).toBeGreaterThan(0);

      // Case 2: empty headers object
      const userId2 = getCurrentUserId({});
      expect(typeof userId2).toBe('string');
      expect(userId2.length).toBeGreaterThan(0);

      // Case 3: headers with missing x-user-id
      const userId3 = getCurrentUserId({ 'other-header': 'value' });
      expect(typeof userId3).toBe('string');
      expect(userId3.length).toBeGreaterThan(0);

      // All fallback cases should return the same default
      expect(userId1).toBe(userId2);
      expect(userId2).toBe(userId3);
    });
  });

  // =========================================================================
  // Additional error-case tests for completeness
  // =========================================================================
  describe('Follow-up error handling', () => {
    it('should throw when creating follow-up for non-existent message', async () => {
      mockedPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.createFollowUp({
          messageId: 'nonexistent-msg',
          entityId: 'entity-1',
          reminderAt: new Date('2025-06-01'),
          reason: 'Should fail',
        })
      ).rejects.toThrow(/not found/i);
    });

    it('should throw when completing a non-existent follow-up', async () => {
      mockedPrisma.followUpReminder.findUnique.mockResolvedValue(null);

      await expect(
        service.completeFollowUp('nonexistent-follow-up-id')
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('Canned Response error handling', () => {
    it('should throw when updating a non-existent canned response', async () => {
      mockedPrisma.cannedResponse.findUnique.mockResolvedValue(null);

      await expect(
        service.updateCannedResponse('nonexistent-id', { name: 'New' })
      ).rejects.toThrow(/not found/i);
    });

    it('should throw when deleting a non-existent canned response', async () => {
      mockedPrisma.cannedResponse.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteCannedResponse('nonexistent-id')
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('Message state error handling', () => {
    it('should throw when marking a non-existent message as read', async () => {
      mockedPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.markAsRead('nonexistent-msg', true)
      ).rejects.toThrow(/not found/i);
    });

    it('should throw when toggling star on a non-existent message', async () => {
      mockedPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.toggleStar('nonexistent-msg')
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('Follow-up entityId filtering', () => {
    it('should filter follow-ups by entityId when provided', async () => {
      // Arrange: rows from different entities
      const rowA = makeFollowUpRow({
        id: 'fu-a',
        priority: 'PENDING:entity-A',
        dueDate: new Date('2025-06-01'),
      });
      const rowB = makeFollowUpRow({
        id: 'fu-b',
        priority: 'PENDING:entity-B',
        dueDate: new Date('2025-06-02'),
      });
      mockedPrisma.followUpReminder.findMany.mockResolvedValue([rowA, rowB]);

      // Act
      const entityAList = await service.listFollowUps('default-user', 'entity-A');

      // Assert: only entity-A follow-ups returned
      expect(entityAList.length).toBe(1);
      expect(entityAList.every((f) => f.entityId === 'entity-A')).toBe(true);
    });
  });

  describe('Canned Response channel filtering', () => {
    it('should filter canned responses by channel when provided', async () => {
      // Arrange
      const emailRow = makeCannedResponseRow({
        id: 'cr-email',
        title: 'Email Response',
        _meta: { entityId: 'entity-filter', channel: 'EMAIL', category: 'General', tone: 'FORMAL', usageCount: 0 },
      });
      const smsRow = makeCannedResponseRow({
        id: 'cr-sms',
        title: 'SMS Response',
        _meta: { entityId: 'entity-filter', channel: 'SMS', category: 'General', tone: 'CASUAL', usageCount: 0 },
      });
      mockedPrisma.cannedResponse.findMany.mockResolvedValue([emailRow, smsRow]);

      // Act
      const emailOnly = await service.listCannedResponses('entity-filter', 'EMAIL');

      // Assert
      expect(emailOnly.length).toBe(1);
      expect(emailOnly.every((r) => r.channel === 'EMAIL')).toBe(true);
    });
  });

  describe('Canned Response default variables', () => {
    it('should default variables to empty array when not provided in input', async () => {
      // Arrange: mock Prisma create returning a row with empty tags
      const createdRow = makeCannedResponseRow({
        id: 'cr-no-vars',
        title: 'No Variables',
        content: 'Plain body',
        tags: [],
        _meta: { entityId: 'entity-1', channel: 'EMAIL', category: 'Simple', tone: 'DIRECT', usageCount: 0 },
      });
      mockedPrisma.cannedResponse.create.mockResolvedValue(createdRow);

      // Act
      const response = await service.createCannedResponse({
        name: 'No Variables',
        entityId: 'entity-1',
        channel: 'EMAIL',
        category: 'Simple',
        body: 'Plain body with no variables',
        tone: 'DIRECT',
      });

      // Assert
      expect(response.variables).toEqual([]);
    });
  });
});
