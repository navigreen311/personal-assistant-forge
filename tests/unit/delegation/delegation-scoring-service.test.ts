jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue(''),
  generateJSON: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    document: { findMany: jest.fn() },
    message: { findMany: jest.fn() },
    actionLog: {
      count: jest.fn().mockResolvedValue(0),
    },
  },
}));

import {
  calculateScore,
  getBestDelegate,
  getScoreboard,
  scoreDelegatability,
  scoreTask,
} from '@/modules/delegation/services/delegation-scoring-service';
import { delegationStore } from '@/modules/delegation/services/delegation-service';
import type { DelegationTask, ContextPack } from '@/modules/delegation/types';

const { prisma } = jest.requireMock('@/lib/db');
const { generateJSON } = jest.requireMock('@/lib/ai');

beforeEach(() => {
  jest.clearAllMocks();
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

describe('scoreTask', () => {
  it('should return higher score for low-priority well-described TODO tasks', async () => {
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));

    const score = await scoreTask({
      id: 'task-1',
      title: 'Simple task',
      description: 'A well-described task that has more than one hundred characters of detailed description explaining exactly what needs to be done step by step',
      priority: 'P2',
      status: 'TODO',
      tags: ['easy'],
    });

    // P2 = +0.3, hasDescription(>20) = +0.2, TODO = +0.2, >100 chars = +0.1, tags = +0.1 = 0.9
    expect(score).toBe(0.9);
  });

  it('should return lower score for high-priority tasks without description', async () => {
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));

    const score = await scoreTask({
      id: 'task-2',
      title: 'Urgent task',
      description: '',
      priority: 'P0',
      status: 'IN_PROGRESS',
      tags: [],
    });

    // P0 is not low priority, no description, not TODO, no tags = 0
    expect(score).toBe(0);
  });

  it('should blend AI score with heuristic when AI succeeds', async () => {
    (generateJSON as jest.Mock).mockResolvedValue({ delegatability: 1.0 });

    const score = await scoreTask({
      id: 'task-3',
      title: 'Task',
      description: 'Short',
      priority: 'P0',
      status: 'IN_PROGRESS',
      tags: [],
    });

    // Heuristic = 0, AI = 1.0 => blended = 1.0 * 0.6 + 0 * 0.4 = 0.6
    expect(score).toBe(0.6);
  });

  it('should keep heuristic score when AI returns non-numeric', async () => {
    (generateJSON as jest.Mock).mockResolvedValue({ delegatability: 'not-a-number' });

    const score = await scoreTask({
      id: 'task-4',
      title: 'Task',
      description: 'A description that is longer than twenty characters for sure',
      priority: 'P1',
      status: 'TODO',
      tags: [],
    });

    // P1 = +0.3, hasDescription = +0.2, TODO = +0.2 = 0.7
    expect(score).toBe(0.7);
  });

  it('should cap score at 1.0 for heuristic fallback', async () => {
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));

    const score = await scoreTask({
      id: 'task-5',
      title: 'Perfect task',
      description: 'A well-described task that has more than one hundred characters of detailed description explaining exactly what needs to be done step by step with great clarity',
      priority: 'P2',
      status: 'TODO',
      tags: ['frontend', 'easy'],
    });

    // All criteria met: 0.3 + 0.2 + 0.2 + 0.1 + 0.1 = 0.9, capped at min(1, 0.9) = 0.9
    expect(score).toBeLessThanOrEqual(1.0);
  });
});

describe('scoreDelegatability', () => {
  const mockTask = {
    id: 'task-1',
    title: 'Test Task',
    description: 'A moderately long description for the task',
    priority: 'P1',
    status: 'TODO',
    tags: [],
  };

  it('should score delegates based on workload and experience', async () => {
    (prisma.task.count as jest.Mock).mockResolvedValue(2); // activeTasks
    (prisma.actionLog.count as jest.Mock).mockResolvedValue(10); // completedDelegations
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));

    const results = await scoreDelegatability(mockTask, [
      { id: 'del-1', name: 'Delegate One', role: 'assistant' },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].delegateId).toBe('del-1');
    expect(results[0].delegateName).toBe('Delegate One');
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].reasons).toContain('Workload: 2 active tasks');
    expect(results[0].reasons).toContain('Experience: 10 completed delegations');
  });

  it('should give higher workload score to delegates with fewer active tasks', async () => {
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));

    // First delegate: low workload
    (prisma.task.count as jest.Mock).mockResolvedValueOnce(0);
    (prisma.actionLog.count as jest.Mock).mockResolvedValueOnce(5);

    // Second delegate: high workload
    (prisma.task.count as jest.Mock).mockResolvedValueOnce(9);
    (prisma.actionLog.count as jest.Mock).mockResolvedValueOnce(5);

    const results = await scoreDelegatability(mockTask, [
      { id: 'del-free', name: 'Free Delegate' },
      { id: 'del-busy', name: 'Busy Delegate' },
    ]);

    expect(results).toHaveLength(2);
    // Sorted by score descending
    expect(results[0].delegateId).toBe('del-free');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('should blend AI scores with heuristic when AI succeeds', async () => {
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);
    (generateJSON as jest.Mock).mockResolvedValue({
      scores: [{ delegateId: 'del-1', score: 0.9, reason: 'AI says excellent match' }],
    });

    const results = await scoreDelegatability(mockTask, [
      { id: 'del-1', name: 'Delegate One' },
    ]);

    expect(results).toHaveLength(1);
    // Blended: 0.9 * 0.6 + heuristic * 0.4
    expect(results[0].reasons).toContain('AI says excellent match');
  });

  it('should return empty array for empty delegates list', async () => {
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));

    const results = await scoreDelegatability(mockTask, []);

    expect(results).toEqual([]);
  });

  it('should classify task complexity based on description length', async () => {
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));

    const shortTask = { ...mockTask, description: 'Short' };
    const results = await scoreDelegatability(shortTask, [
      { id: 'del-1', name: 'Delegate One' },
    ]);

    expect(results[0].reasons).toContain('Task complexity: low');
  });

  it('should handle high complexity tasks', async () => {
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));

    const longDescription = 'x'.repeat(600);
    const complexTask = { ...mockTask, description: longDescription };
    const results = await scoreDelegatability(complexTask, [
      { id: 'del-1', name: 'Delegate One' },
    ]);

    expect(results[0].reasons).toContain('Task complexity: high');
  });
});

describe('calculateScore', () => {
  it('should return zero score for unknown delegatee', async () => {
    const score = await calculateScore('unknown');

    expect(score.delegateeId).toBe('unknown');
    expect(score.overallScore).toBe(0);
    expect(score.totalTasksDelegated).toBe(0);
    expect(score.categories).toEqual([]);
    expect(score.bestCategory).toBe('');
  });

  it('should compute weighted score from completion, quality, and speed', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);

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

    const score = await calculateScore('delegate-a');

    expect(score.totalTasksDelegated).toBe(1);
    // 100% completion (30), 100% quality (50), fast speed (~20)
    expect(score.overallScore).toBeGreaterThanOrEqual(80);
  });
});

describe('getBestDelegate', () => {
  it('should return the highest-scoring delegatee', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);

    createDelegation({
      id: 'del-a',
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
      id: 'del-b',
      delegatedTo: 'delegate-b',
      status: 'PENDING',
    });

    const best = await getBestDelegate('general', 'entity-1');

    expect(best).not.toBeNull();
    expect(best!.delegateeId).toBe('delegate-a');
  });

  it('should return null when no delegations exist', async () => {
    const best = await getBestDelegate('general', 'entity-1');
    expect(best).toBeNull();
  });
});

describe('getScoreboard', () => {
  it('should return all delegatees sorted by score descending', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);

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
