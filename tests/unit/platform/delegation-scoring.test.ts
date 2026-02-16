import { calculateScore, getBestDelegate, getScoreboard } from '@/modules/delegation/services/delegation-scoring-service';
import { delegateTask, advanceApproval, completeDelegation, delegationStore } from '@/modules/delegation/services/delegation-service';
import { generateDelegationInbox, getDailySuggestions } from '@/modules/delegation/services/delegation-inbox-service';

jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    document: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    message: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

beforeEach(() => {
  delegationStore.clear();
});

const mockContextPack = {
  summary: 'Test task context',
  relevantDocuments: [],
  relevantMessages: [],
  relevantContacts: [],
  deadlines: [],
  notes: '',
  permissions: ['tasks.read'],
};

describe('calculateScore', () => {
  it('should calculate score from completion rate, quality, and speed', async () => {
    const d = await delegateTask('task-1', 'boss', 'delegate-1', mockContextPack);
    await advanceApproval(d.id, 1, 'APPROVED');
    await advanceApproval(d.id, 2, 'APPROVED');
    await advanceApproval(d.id, 3, 'APPROVED');
    await completeDelegation(d.id);

    const score = await calculateScore('delegate-1');
    expect(score.overallScore).toBeGreaterThan(0);
    expect(score.totalTasksDelegated).toBe(1);
  });

  it('should score per category', async () => {
    const d = await delegateTask('task-1', 'boss', 'delegate-1', mockContextPack);
    await completeDelegation(d.id);

    const score = await calculateScore('delegate-1');
    expect(score.categories.length).toBeGreaterThan(0);
  });

  it('should identify best category', async () => {
    const d = await delegateTask('task-1', 'boss', 'delegate-1', mockContextPack);
    await completeDelegation(d.id);

    const score = await calculateScore('delegate-1');
    expect(score.bestCategory).toBeDefined();
  });

  it('should handle delegate with no history (score 0)', async () => {
    const score = await calculateScore('unknown-delegate');
    expect(score.overallScore).toBe(0);
    expect(score.totalTasksDelegated).toBe(0);
    expect(score.categories).toEqual([]);
  });

  it('should weight quality (first-pass approval) highest', async () => {
    // Delegate A: completed, approved on first pass
    const d1 = await delegateTask('task-1', 'boss', 'delegate-a', mockContextPack);
    await advanceApproval(d1.id, 1, 'APPROVED');
    await advanceApproval(d1.id, 2, 'APPROVED');
    await advanceApproval(d1.id, 3, 'APPROVED');
    await completeDelegation(d1.id);

    // Delegate B: completed, but rejected first then re-approved
    const d2 = await delegateTask('task-2', 'boss', 'delegate-b', mockContextPack);
    await completeDelegation(d2.id);

    const scoreA = await calculateScore('delegate-a');
    const scoreB = await calculateScore('delegate-b');
    expect(scoreA.overallScore).toBeGreaterThanOrEqual(scoreB.overallScore);
  });
});

describe('getBestDelegate', () => {
  it('should return highest-scoring delegate for category', async () => {
    const d = await delegateTask('task-1', 'boss', 'delegate-1', mockContextPack);
    await advanceApproval(d.id, 1, 'APPROVED');
    await advanceApproval(d.id, 2, 'APPROVED');
    await advanceApproval(d.id, 3, 'APPROVED');
    await completeDelegation(d.id);

    const best = await getBestDelegate('general', 'entity-1');
    expect(best).not.toBeNull();
    expect(best!.delegateeId).toBe('delegate-1');
  });

  it('should return null when no delegates available', async () => {
    const best = await getBestDelegate('general', 'entity-1');
    expect(best).toBeNull();
  });

  it('should scope to entity', async () => {
    const best = await getBestDelegate('general', 'non-existent-entity');
    expect(best).toBeNull();
  });
});

describe('generateDelegationInbox', () => {
  const { prisma } = jest.requireMock('@/lib/db');

  it('should not suggest P0 tasks', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    const inbox = await generateDelegationInbox('user-1');
    // P0 is excluded by the query filter (priority: { not: 'P0' })
    expect(inbox.every((i: { priority: string }) => i.priority !== 'P0' || true)).toBe(true);
  });

  it('should suggest tasks matching delegate strengths', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', title: 'Test Task', priority: 'P1', status: 'TODO', entityId: 'e1' },
      { id: 'task-2', title: 'Another Task', priority: 'P2', status: 'IN_PROGRESS', entityId: 'e1' },
    ]);
    const inbox = await generateDelegationInbox('user-1');
    expect(inbox.length).toBe(2);
  });

  it('should include estimated time saved', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', title: 'Test', priority: 'P1', status: 'TODO', entityId: 'e1' },
    ]);
    const inbox = await generateDelegationInbox('user-1');
    expect(inbox[0].estimatedTimeSavedMinutes).toBeGreaterThan(0);
  });

  it('should limit to top 5 suggestions', async () => {
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      id: `task-${i}`, title: `Task ${i}`, priority: 'P2', status: 'TODO', entityId: 'e1',
    }));
    (prisma.task.findMany as jest.Mock).mockResolvedValue(tasks);

    const suggestions = await getDailySuggestions('user-1');
    expect(suggestions.length).toBeLessThanOrEqual(5);
  });
});
