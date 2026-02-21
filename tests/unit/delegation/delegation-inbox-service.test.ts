jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    actionLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  },
}));

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated reason'),
  generateJSON: jest.fn().mockResolvedValue({ suggestions: [], delegatability: 0.7 }),
}));

jest.mock('@/modules/delegation/services/delegation-scoring-service', () => ({
  scoreTask: jest.fn().mockResolvedValue(0.75),
}));

import {
  generateDelegationInbox,
  getDailySuggestions,
  getDelegatableTasks,
  getInboxForDelegate,
  assignTask,
  getDelegationStats,
} from '@/modules/delegation/services/delegation-inbox-service';

const { prisma } = jest.requireMock('@/lib/db');
const { generateJSON, generateText } = jest.requireMock('@/lib/ai');
const { scoreTask } = jest.requireMock('@/modules/delegation/services/delegation-scoring-service');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('generateDelegationInbox', () => {
  it('should return empty array when user has no tasks', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);

    const result = await generateDelegationInbox('user-1');

    expect(result).toEqual([]);
  });

  it('should query tasks excluding P0 priority with TODO and IN_PROGRESS statuses', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);

    await generateDelegationInbox('user-1');

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assigneeId: 'user-1',
          status: { in: ['TODO', 'IN_PROGRESS'] },
          priority: { not: 'P0' },
        }),
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    );
  });

  it('should return AI-scored suggestions when AI succeeds', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', title: 'Test Task', priority: 'P1', status: 'TODO', entityId: 'e1' },
    ]);
    (generateJSON as jest.Mock).mockResolvedValue({
      suggestions: [
        { taskId: 'task-1', confidence: 0.9, priority: 'HIGH', estimatedTimeSavedMinutes: 45, reason: 'AI reason' },
      ],
    });

    const result = await generateDelegationInbox('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].taskId).toBe('task-1');
    expect(result[0].reason).toBe('AI reason');
    expect(result[0].confidence).toBe(0.9);
    expect(result[0].priority).toBe('HIGH');
  });

  it('should fall back to heuristic scoring when AI fails', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', title: 'Test Task', priority: 'P1', status: 'TODO', entityId: 'e1' },
    ]);
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));

    const result = await generateDelegationInbox('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].taskId).toBe('task-1');
    expect(result[0].reason).toContain('P1');
    expect(result[0].estimatedTimeSavedMinutes).toBe(30);
    expect(result[0].confidence).toBe(0.65);
  });

  it('should cap results at 10 items for fallback suggestions', async () => {
    const manyTasks = Array.from({ length: 15 }, (_, i) => ({
      id: `task-${i}`,
      title: `Task ${i}`,
      priority: 'P2',
      status: 'TODO',
      entityId: 'e1',
    }));
    (prisma.task.findMany as jest.Mock).mockResolvedValue(manyTasks);
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));

    const result = await generateDelegationInbox('user-1');

    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('should assign correct fallback values based on priority', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-p1', title: 'P1 Task', priority: 'P1', status: 'TODO', entityId: 'e1' },
      { id: 'task-p2', title: 'P2 Task', priority: 'P2', status: 'TODO', entityId: 'e1' },
    ]);
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));

    const result = await generateDelegationInbox('user-1');

    const p1Item = result.find((r) => r.taskId === 'task-p1');
    const p2Item = result.find((r) => r.taskId === 'task-p2');

    expect(p1Item!.estimatedTimeSavedMinutes).toBe(30);
    expect(p1Item!.confidence).toBe(0.65);
    expect(p1Item!.priority).toBe('MEDIUM');

    expect(p2Item!.estimatedTimeSavedMinutes).toBe(15);
    expect(p2Item!.confidence).toBe(0.85);
    expect(p2Item!.priority).toBe('LOW');
  });
});

describe('getDailySuggestions', () => {
  it('should return top 5 suggestions from inbox', async () => {
    const tasks = Array.from({ length: 8 }, (_, i) => ({
      id: `task-${i}`,
      title: `Task ${i}`,
      priority: 'P2',
      status: 'TODO',
      entityId: 'e1',
    }));
    (prisma.task.findMany as jest.Mock).mockResolvedValue(tasks);
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));
    (generateText as jest.Mock).mockResolvedValue('Enhanced AI reason');

    const result = await getDailySuggestions('user-1');

    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('should enhance each suggestion with AI-generated reason', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', title: 'Test Task', priority: 'P1', status: 'TODO', entityId: 'e1' },
    ]);
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));
    (generateText as jest.Mock).mockResolvedValue('Enhanced delegation reason from AI');

    const result = await getDailySuggestions('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('Enhanced delegation reason from AI');
    expect(generateText).toHaveBeenCalledWith(
      expect.stringContaining('Test Task'),
      expect.objectContaining({ temperature: 0.5, maxTokens: 100 })
    );
  });

  it('should keep original reason if AI text generation fails', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', title: 'Test Task', priority: 'P1', status: 'TODO', entityId: 'e1' },
    ]);
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));
    (generateText as jest.Mock).mockRejectedValue(new Error('Text generation failed'));

    const result = await getDailySuggestions('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].reason).toContain('P1');
  });

  it('should return empty array when no tasks exist', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getDailySuggestions('user-1');

    expect(result).toEqual([]);
  });
});

describe('getDelegatableTasks', () => {
  it('should query tasks with null assigneeId for entity', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);

    await getDelegatableTasks('entity-1');

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityId: 'entity-1', assigneeId: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    );
  });

  it('should score each task and persist delegatability score', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', title: 'Task 1', description: 'A task', priority: 'P1', status: 'TODO', tags: [], createdFrom: null },
      { id: 'task-2', title: 'Task 2', description: 'Another task', priority: 'P2', status: 'TODO', tags: ['easy'], createdFrom: null },
    ]);
    (scoreTask as jest.Mock).mockResolvedValueOnce(0.8).mockResolvedValueOnce(0.5);

    const result = await getDelegatableTasks('entity-1');

    expect(scoreTask).toHaveBeenCalledTimes(2);
    expect(prisma.task.update).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    // Should be sorted by score descending
    expect(result[0].delegatabilityScore).toBeGreaterThanOrEqual(result[1].delegatabilityScore);
  });

  it('should return empty array when no unassigned tasks', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getDelegatableTasks('entity-1');

    expect(result).toEqual([]);
  });
});

describe('getInboxForDelegate', () => {
  it('should query tasks assigned to user with IN_PROGRESS and PENDING statuses', async () => {
    const mockTasks = [
      { id: 'task-1', title: 'Pending Task', status: 'PENDING', priority: 'P1' },
    ];
    (prisma.task.findMany as jest.Mock).mockResolvedValue(mockTasks);

    const result = await getInboxForDelegate('user-1', 'entity-1');

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assigneeId: 'user-1',
          entityId: 'entity-1',
          status: { in: ['IN_PROGRESS', 'PENDING'] },
        },
        orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
      })
    );
    expect(result).toEqual(mockTasks);
  });
});

describe('assignTask', () => {
  it('should update task and create action log entry', async () => {
    (prisma.task.update as jest.Mock).mockResolvedValue({
      id: 'task-1',
      title: 'Test Task',
      assigneeId: 'assignee-1',
      status: 'PENDING',
    });

    const result = await assignTask('task-1', 'assignee-1', 'boss-1');

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { assigneeId: 'assignee-1', status: 'PENDING' },
    });
    expect(prisma.actionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actor: 'boss-1',
          actionType: 'DELEGATE',
          target: 'task-1',
          blastRadius: 'LOW',
          reversible: true,
          status: 'COMPLETED',
        }),
      })
    );
    expect(result.status).toBe('PENDING');
  });

  it('should propagate errors when task update fails', async () => {
    (prisma.task.update as jest.Mock).mockRejectedValue(new Error('Record not found'));

    await expect(assignTask('nonexistent', 'assignee-1', 'boss-1')).rejects.toThrow('Record not found');
  });
});

describe('getDelegationStats', () => {
  it('should return stats with correct status counts and success rate', async () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 3600000);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', status: 'COMPLETED', assigneeId: 'user-1', createdAt: earlier, updatedAt: now },
      { id: 'task-2', status: 'IN_PROGRESS', assigneeId: 'user-2', createdAt: earlier, updatedAt: now },
      { id: 'task-3', status: 'COMPLETED', assigneeId: 'user-1', createdAt: earlier, updatedAt: now },
    ]);

    const stats = await getDelegationStats('entity-1');

    expect(stats.totalDelegated).toBe(3);
    expect(stats.byStatus.COMPLETED).toBe(2);
    expect(stats.byStatus.IN_PROGRESS).toBe(1);
    expect(stats.successRate).toBeCloseTo(0.67, 1);
    expect(stats.avgCompletionTimeMs).toBe(3600000);
  });

  it('should return zero stats when no delegated tasks exist', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);

    const stats = await getDelegationStats('entity-1');

    expect(stats.totalDelegated).toBe(0);
    expect(stats.byStatus).toEqual({});
    expect(stats.successRate).toBe(0);
    expect(stats.avgCompletionTimeMs).toBe(0);
  });
});
