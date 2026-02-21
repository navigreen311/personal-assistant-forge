import { loadTaskContext } from '@/modules/tasks/services/context-loader';

// --- Mocks ---

const mockTaskFindUnique = jest.fn();
const mockDocumentFindMany = jest.fn();
const mockMessageFindUnique = jest.fn();
const mockMessageFindMany = jest.fn();
const mockUserFindUnique = jest.fn();
const mockContactFindMany = jest.fn();
const mockKnowledgeEntryFindMany = jest.fn();
const mockActionLogFindMany = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findUnique: (...args: unknown[]) => mockTaskFindUnique(...args),
    },
    document: {
      findMany: (...args: unknown[]) => mockDocumentFindMany(...args),
    },
    message: {
      findUnique: (...args: unknown[]) => mockMessageFindUnique(...args),
      findMany: (...args: unknown[]) => mockMessageFindMany(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    contact: {
      findMany: (...args: unknown[]) => mockContactFindMany(...args),
    },
    knowledgeEntry: {
      findMany: (...args: unknown[]) => mockKnowledgeEntryFindMany(...args),
    },
    actionLog: {
      findMany: (...args: unknown[]) => mockActionLogFindMany(...args),
    },
  },
}));

// --- Tests ---

describe('ContextLoader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadTaskContext', () => {
    it('should throw if task is not found', async () => {
      mockTaskFindUnique.mockResolvedValue(null);

      await expect(loadTaskContext('nonexistent')).rejects.toThrow(
        'Task not found: nonexistent'
      );
    });

    it('should return full context for a valid task with all related data', async () => {
      const task = {
        id: 'task-1',
        entityId: 'entity-1',
        projectId: 'project-1',
        title: 'Review budget',
        tags: ['finance', 'quarterly'],
        assigneeId: 'user-1',
        createdFrom: null,
      };

      mockTaskFindUnique.mockResolvedValue(task);

      // Documents with tag overlap in title
      mockDocumentFindMany.mockResolvedValue([
        { id: 'doc-1', title: 'Finance Report Q4', type: 'REPORT' },
        { id: 'doc-2', title: 'Quarterly Budget Plan', type: 'BRIEF' },
        { id: 'doc-3', title: 'Meeting Notes', type: 'MINUTES' },
      ]);

      // Messages (no createdFrom, so falls through to search)
      mockMessageFindMany.mockResolvedValue([
        {
          id: 'msg-1',
          subject: 'Budget update',
          channel: 'EMAIL',
          body: 'Please review the budget at https://example.com/budget',
          createdAt: new Date(),
        },
      ]);

      // User (assignee)
      mockUserFindUnique.mockResolvedValue({ id: 'user-1', name: 'Alice' });

      // Contacts
      mockContactFindMany.mockResolvedValue([
        { id: 'contact-1', name: 'Bob', lastTouch: new Date() },
      ]);

      // Knowledge entries (tags overlap)
      mockKnowledgeEntryFindMany.mockResolvedValue([
        { content: 'Budget best practices note content here', updatedAt: new Date() },
      ]);

      // Action logs
      mockActionLogFindMany.mockResolvedValue([
        {
          actionType: 'UPDATED',
          reason: 'Changed priority',
          timestamp: new Date('2025-01-15'),
          actor: 'user-1',
        },
      ]);

      const context = await loadTaskContext('task-1');

      expect(context.taskId).toBe('task-1');
      // Documents scored by tag overlap: 'finance' matches 'Finance Report Q4', 'quarterly' matches 'Quarterly Budget Plan'
      expect(context.relatedDocuments.length).toBeGreaterThanOrEqual(1);
      expect(context.relatedMessages).toHaveLength(1);
      expect(context.relatedMessages[0].id).toBe('msg-1');
      expect(context.relatedContacts).toHaveLength(2); // assignee + entity contact
      expect(context.relatedContacts[0]).toEqual({ id: 'user-1', name: 'Alice', role: 'Assignee' });
      expect(context.relatedNotes).toHaveLength(1);
      expect(context.previousActivity).toHaveLength(1);
      expect(context.previousActivity[0].action).toBe('UPDATED: Changed priority');
      // URL extracted from message preview
      expect(context.linkedUrls).toContain('https://example.com/budget');
    });

    it('should fetch source message when task was created from a MESSAGE', async () => {
      const task = {
        id: 'task-2',
        entityId: 'entity-1',
        projectId: null,
        title: 'Follow up',
        tags: [],
        assigneeId: null,
        createdFrom: { type: 'MESSAGE', sourceId: 'msg-source' },
      };

      mockTaskFindUnique.mockResolvedValue(task);
      mockDocumentFindMany.mockResolvedValue([]);
      mockMessageFindUnique.mockResolvedValue({
        id: 'msg-source',
        subject: 'Important Request',
        channel: 'EMAIL',
        body: 'Please follow up on the project deliverables',
      });
      mockUserFindUnique.mockResolvedValue(null);
      mockContactFindMany.mockResolvedValue([]);
      mockKnowledgeEntryFindMany.mockResolvedValue([]);
      mockActionLogFindMany.mockResolvedValue([]);

      const context = await loadTaskContext('task-2');

      expect(context.relatedMessages).toHaveLength(1);
      expect(context.relatedMessages[0].id).toBe('msg-source');
      expect(context.relatedMessages[0].subject).toBe('Important Request');
      expect(context.relatedMessages[0].channel).toBe('EMAIL');
    });

    it('should return empty notes when task has no tags', async () => {
      const task = {
        id: 'task-3',
        entityId: 'entity-1',
        projectId: null,
        title: 'Simple task',
        tags: [],
        assigneeId: null,
        createdFrom: null,
      };

      mockTaskFindUnique.mockResolvedValue(task);
      mockDocumentFindMany.mockResolvedValue([]);
      mockMessageFindMany.mockResolvedValue([]);
      mockUserFindUnique.mockResolvedValue(null);
      mockContactFindMany.mockResolvedValue([]);
      // knowledgeEntryFindMany should NOT be called since tags is empty
      // but the function checks tags.length === 0 and returns [] early
      mockActionLogFindMany.mockResolvedValue([]);

      const context = await loadTaskContext('task-3');

      expect(context.relatedNotes).toEqual([]);
      expect(context.relatedDocuments).toEqual([]);
      expect(context.linkedUrls).toEqual([]);
    });
  });
});
