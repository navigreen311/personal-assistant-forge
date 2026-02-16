jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated context summary for delegation.'),
  generateJSON: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findUnique: jest.fn(),
    },
    document: {
      findMany: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
    },
  },
}));

import {
  delegateTask,
  getDelegatedTasks,
  advanceApproval,
  completeDelegation,
  buildContextPack,
  delegationStore,
} from '@/modules/delegation/services/delegation-service';
import { generateText } from '@/lib/ai';
import { prisma } from '@/lib/db';

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('delegation-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delegationStore.clear();
  });

  const mockContextPack = {
    summary: 'Test context',
    relevantDocuments: ['doc-1'],
    relevantMessages: ['msg-1'],
    relevantContacts: [],
    deadlines: [],
    notes: '',
    permissions: ['tasks.read'],
  };

  describe('delegateTask', () => {
    it('creates a delegation with PENDING status, 3-step approval chain, and correct delegatedBy/delegatedTo', async () => {
      const result = await delegateTask('task-1', 'user-owner', 'user-delegate', mockContextPack);

      expect(result.id).toBeDefined();
      expect(result.taskId).toBe('task-1');
      expect(result.delegatedBy).toBe('user-owner');
      expect(result.delegatedTo).toBe('user-delegate');
      expect(result.status).toBe('PENDING');
      expect(result.approvalChain).toHaveLength(3);
      expect(result.approvalChain[0].role).toBe('AI_DRAFT');
      expect(result.approvalChain[1].role).toBe('EA_REVIEW');
      expect(result.approvalChain[2].role).toBe('USER_APPROVE');
      expect(result.delegatedAt).toBeInstanceOf(Date);
      expect(delegationStore.has(result.id)).toBe(true);
    });
  });

  describe('getDelegatedTasks', () => {
    it('with direction delegated_by returns only tasks delegated by the given user', async () => {
      await delegateTask('task-1', 'owner-a', 'delegate-1', mockContextPack);
      await delegateTask('task-2', 'owner-b', 'delegate-2', mockContextPack);
      await delegateTask('task-3', 'owner-a', 'delegate-3', mockContextPack);

      const results = await getDelegatedTasks('owner-a', 'delegated_by');

      expect(results).toHaveLength(2);
      expect(results.every((d) => d.delegatedBy === 'owner-a')).toBe(true);
    });

    it('with direction delegated_to returns only tasks delegated to the given user', async () => {
      await delegateTask('task-1', 'owner-a', 'delegate-x', mockContextPack);
      await delegateTask('task-2', 'owner-b', 'delegate-x', mockContextPack);
      await delegateTask('task-3', 'owner-c', 'delegate-y', mockContextPack);

      const results = await getDelegatedTasks('delegate-x', 'delegated_to');

      expect(results).toHaveLength(2);
      expect(results.every((d) => d.delegatedTo === 'delegate-x')).toBe(true);
    });
  });

  describe('advanceApproval', () => {
    it('with APPROVED status updates the step and sets delegation to IN_REVIEW when not all steps are approved', async () => {
      const delegation = await delegateTask('task-1', 'owner', 'delegate', mockContextPack);

      const result = await advanceApproval(delegation.id, 1, 'APPROVED', 'Looks good');

      const step = result.approvalChain.find((s) => s.order === 1);
      expect(step?.status).toBe('APPROVED');
      expect(step?.reviewedAt).toBeInstanceOf(Date);
      expect(step?.comments).toBe('Looks good');
      expect(result.status).toBe('IN_REVIEW');
    });

    it('with REJECTED status sets overall delegation status to REJECTED', async () => {
      const delegation = await delegateTask('task-1', 'owner', 'delegate', mockContextPack);

      const result = await advanceApproval(delegation.id, 2, 'REJECTED', 'Not acceptable');

      expect(result.status).toBe('REJECTED');
      const step = result.approvalChain.find((s) => s.order === 2);
      expect(step?.status).toBe('REJECTED');
    });

    it('when all steps approved sets overall status to APPROVED', async () => {
      const delegation = await delegateTask('task-1', 'owner', 'delegate', mockContextPack);

      await advanceApproval(delegation.id, 1, 'APPROVED');
      await advanceApproval(delegation.id, 2, 'APPROVED');
      const result = await advanceApproval(delegation.id, 3, 'APPROVED');

      expect(result.status).toBe('APPROVED');
      expect(result.approvalChain.every((s) => s.status === 'APPROVED')).toBe(true);
    });

    it('throws for unknown delegation ID', async () => {
      await expect(advanceApproval('non-existent', 1, 'APPROVED')).rejects.toThrow(
        'Delegation non-existent not found'
      );
    });
  });

  describe('completeDelegation', () => {
    it('sets status to COMPLETED and sets completedAt', async () => {
      const delegation = await delegateTask('task-1', 'owner', 'delegate', mockContextPack);

      const result = await completeDelegation(delegation.id);

      expect(result.status).toBe('COMPLETED');
      expect(result.completedAt).toBeInstanceOf(Date);
    });

    it('throws for unknown delegation ID', async () => {
      await expect(completeDelegation('non-existent')).rejects.toThrow(
        'Delegation non-existent not found'
      );
    });
  });

  describe('buildContextPack', () => {
    it('calls Prisma for task, documents, messages and calls AI for summary', async () => {
      const mockTask = {
        id: 'task-1',
        title: 'Important Task',
        description: 'A test task',
        entityId: 'entity-1',
        dueDate: new Date('2026-03-01'),
      };
      const mockDocs = [{ id: 'doc-1' }, { id: 'doc-2' }];
      const mockMsgs = [{ id: 'msg-1' }];

      (mockPrisma.task.findUnique as jest.Mock).mockResolvedValue(mockTask);
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue(mockDocs);
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue(mockMsgs);
      mockGenerateText.mockResolvedValue('AI summary of the task context.');

      const result = await buildContextPack('task-1');

      expect(mockPrisma.task.findUnique).toHaveBeenCalledWith({ where: { id: 'task-1' } });
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith({
        where: { entityId: 'entity-1' },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      });
      expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
        where: { entityId: 'entity-1' },
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      expect(mockGenerateText).toHaveBeenCalled();
      expect(result.summary).toBe('AI summary of the task context.');
      expect(result.relevantDocuments).toEqual(['doc-1', 'doc-2']);
      expect(result.relevantMessages).toEqual(['msg-1']);
      expect(result.permissions).toEqual(['tasks.read', 'tasks.write', 'documents.read']);
      expect(result.deadlines).toHaveLength(1);
      expect(result.deadlines[0].description).toBe('Task due date');
    });

    it('throws when task not found', async () => {
      (mockPrisma.task.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(buildContextPack('non-existent')).rejects.toThrow('Task non-existent not found');
    });
  });
});
