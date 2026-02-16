jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue(''),
  generateJSON: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    task: { findUnique: jest.fn() },
    document: { findMany: jest.fn() },
    message: { findMany: jest.fn() },
  },
}));

import {
  calculateScore,
  getBestDelegate,
  getScoreboard,
} from '@/modules/delegation/services/delegation-scoring-service';
import { delegationStore } from '@/modules/delegation/services/delegation-service';
import type { DelegationTask, ContextPack, ApprovalStep } from '@/modules/delegation/types';

describe('delegation-scoring-service', () => {
  beforeEach(() => {
    delegationStore.clear();
  });

  const mockContextPack: ContextPack = {
    summary: 'Test',
    relevantDocuments: [],
    relevantMessages: [],
    relevantContacts: [],
    deadlines: [],
    notes: '',
    permissions: [],
  };

  function createDelegation(
    overrides: Partial<DelegationTask> & { id: string; delegatedTo: string }
  ): DelegationTask {
    const base: DelegationTask = {
      taskId: 'task-1',
      delegatedBy: 'owner-1',
      contextPack: mockContextPack,
      approvalChain: [
        { order: 1, approverId: 'ai', approverName: 'AI', role: 'AI_DRAFT', status: 'PENDING' },
        { order: 2, approverId: 'ea', approverName: 'EA', role: 'EA_REVIEW', status: 'PENDING' },
        { order: 3, approverId: 'owner', approverName: 'Owner', role: 'USER_APPROVE', status: 'PENDING' },
      ],
      status: 'PENDING',
      delegatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
    delegationStore.set(base.id, base);
    return base;
  }

  describe('calculateScore', () => {
    it('returns zero score for delegatee with no delegations', async () => {
      const score = await calculateScore('unknown-user');

      expect(score.delegateeId).toBe('unknown-user');
      expect(score.overallScore).toBe(0);
      expect(score.totalTasksDelegated).toBe(0);
      expect(score.categories).toEqual([]);
      expect(score.bestCategory).toBe('');
    });

    it('returns correct score for delegatee with completed/approved delegations', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      createDelegation({
        id: 'del-1',
        delegatedTo: 'delegate-a',
        status: 'COMPLETED',
        delegatedAt: oneHourAgo,
        completedAt: now,
        approvalChain: [
          { order: 1, approverId: 'ai', approverName: 'AI', role: 'AI_DRAFT', status: 'APPROVED' },
          { order: 2, approverId: 'ea', approverName: 'EA', role: 'EA_REVIEW', status: 'APPROVED' },
          { order: 3, approverId: 'owner', approverName: 'Owner', role: 'USER_APPROVE', status: 'APPROVED' },
        ],
      });

      createDelegation({
        id: 'del-2',
        delegatedTo: 'delegate-a',
        status: 'COMPLETED',
        delegatedAt: oneHourAgo,
        completedAt: now,
        approvalChain: [
          { order: 1, approverId: 'ai', approverName: 'AI', role: 'AI_DRAFT', status: 'APPROVED' },
          { order: 2, approverId: 'ea', approverName: 'EA', role: 'EA_REVIEW', status: 'APPROVED' },
          { order: 3, approverId: 'owner', approverName: 'Owner', role: 'USER_APPROVE', status: 'APPROVED' },
        ],
      });

      const score = await calculateScore('delegate-a');

      expect(score.delegateeId).toBe('delegate-a');
      expect(score.totalTasksDelegated).toBe(2);
      expect(score.overallScore).toBeGreaterThan(0);
      // 100% completion = 30pts, 100% quality = 50pts, speed within 72h = ~20pts
      expect(score.overallScore).toBeGreaterThanOrEqual(80);
      expect(score.categories.length).toBeGreaterThan(0);
      expect(score.bestCategory).toBe('general');
    });
  });

  describe('getBestDelegate', () => {
    it('returns the highest-scoring delegatee', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      // delegate-a: completed + approved => high score
      createDelegation({
        id: 'del-a1',
        delegatedTo: 'delegate-a',
        status: 'COMPLETED',
        delegatedAt: oneHourAgo,
        completedAt: now,
        approvalChain: [
          { order: 1, approverId: 'ai', approverName: 'AI', role: 'AI_DRAFT', status: 'APPROVED' },
          { order: 2, approverId: 'ea', approverName: 'EA', role: 'EA_REVIEW', status: 'APPROVED' },
          { order: 3, approverId: 'owner', approverName: 'Owner', role: 'USER_APPROVE', status: 'APPROVED' },
        ],
      });

      // delegate-b: pending => low score
      createDelegation({
        id: 'del-b1',
        delegatedTo: 'delegate-b',
        status: 'PENDING',
      });

      const best = await getBestDelegate('general', 'entity-1');

      expect(best).not.toBeNull();
      expect(best!.delegateeId).toBe('delegate-a');
      expect(best!.score).toBeGreaterThan(0);
    });

    it('returns null when no delegations exist', async () => {
      const best = await getBestDelegate('general', 'entity-1');
      expect(best).toBeNull();
    });
  });

  describe('getScoreboard', () => {
    it('returns all delegatees sorted by score descending', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      // High performer
      createDelegation({
        id: 'del-high',
        delegatedTo: 'delegate-high',
        status: 'COMPLETED',
        delegatedAt: oneHourAgo,
        completedAt: now,
        approvalChain: [
          { order: 1, approverId: 'ai', approverName: 'AI', role: 'AI_DRAFT', status: 'APPROVED' },
          { order: 2, approverId: 'ea', approverName: 'EA', role: 'EA_REVIEW', status: 'APPROVED' },
          { order: 3, approverId: 'owner', approverName: 'Owner', role: 'USER_APPROVE', status: 'APPROVED' },
        ],
      });

      // Low performer
      createDelegation({
        id: 'del-low',
        delegatedTo: 'delegate-low',
        status: 'PENDING',
      });

      const scoreboard = await getScoreboard('entity-1');

      expect(scoreboard).toHaveLength(2);
      expect(scoreboard[0].delegateeId).toBe('delegate-high');
      expect(scoreboard[0].overallScore).toBeGreaterThanOrEqual(scoreboard[1].overallScore);
    });
  });
});
