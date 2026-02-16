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
  generateText: jest.fn().mockResolvedValue('AI-generated content'),
  generateJSON: jest.fn().mockResolvedValue({ suggestions: [], delegatability: 0.7 }),
}));

import {
  generateDelegationInbox,
  getDelegatableTasks,
  getInboxForDelegate,
  assignTask,
  getDelegationStats,
} from '@/modules/delegation/services/delegation-inbox-service';

const { prisma } = jest.requireMock('@/lib/db');
const { generateJSON } = jest.requireMock('@/lib/ai');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getDelegatableTasks', () => {
  it('should query tasks with null assigneeId', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', title: 'Test Task', description: 'A test', priority: 'P1', status: 'TODO', tags: [], createdFrom: null },
    ]);
    (prisma.task.update as jest.Mock).mockResolvedValue({});
    (generateJSON as jest.Mock).mockResolvedValue({ delegatability: 0.8 });

    const tasks = await getDelegatableTasks('entity-1');

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ entityId: 'entity-1', assigneeId: null }),
      })
    );
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe('task-1');
  });

  it('should score each task for delegatability', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', title: 'Easy Task', description: 'Simple work', priority: 'P2', status: 'TODO', tags: ['easy'], createdFrom: null },
      { id: 'task-2', title: 'Hard Task', description: 'Complex work requiring deep expertise', priority: 'P0', status: 'TODO', tags: [], createdFrom: null },
    ]);
    (prisma.task.update as jest.Mock).mockResolvedValue({});
    (generateJSON as jest.Mock).mockResolvedValue({ delegatability: 0.6 });

    const tasks = await getDelegatableTasks('entity-1');

    expect(tasks.length).toBe(2);
    expect(tasks[0]).toHaveProperty('delegatabilityScore');
    expect(tasks[1]).toHaveProperty('delegatabilityScore');
    // Scores stored via task update
    expect(prisma.task.update).toHaveBeenCalledTimes(2);
  });

  it('should return empty array when no unassigned tasks', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);

    const tasks = await getDelegatableTasks('entity-1');

    expect(tasks).toEqual([]);
  });
});

describe('getInboxForDelegate', () => {
  it('should return tasks assigned to user with correct statuses', async () => {
    const mockTasks = [
      { id: 'task-1', title: 'Pending Task', status: 'PENDING', priority: 'P1' },
      { id: 'task-2', title: 'In Progress Task', status: 'IN_PROGRESS', priority: 'P0' },
    ];
    (prisma.task.findMany as jest.Mock).mockResolvedValue(mockTasks);

    const result = await getInboxForDelegate('user-1', 'entity-1');

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assigneeId: 'user-1',
          entityId: 'entity-1',
          status: { in: ['IN_PROGRESS', 'PENDING'] },
        }),
      })
    );
    expect(result.length).toBe(2);
  });
});

describe('assignTask', () => {
  it('should update task assigneeId and status', async () => {
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
    expect(result.status).toBe('PENDING');
    expect(result.assigneeId).toBe('assignee-1');
  });

  it('should log delegation in ActionLog', async () => {
    (prisma.task.update as jest.Mock).mockResolvedValue({
      id: 'task-1',
      title: 'Test Task',
      assigneeId: 'assignee-1',
      status: 'PENDING',
    });

    await assignTask('task-1', 'assignee-1', 'boss-1');

    expect(prisma.actionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actor: 'boss-1',
          actionType: 'DELEGATE',
          target: 'task-1',
        }),
      })
    );
  });

  it('should handle non-existent task gracefully', async () => {
    (prisma.task.update as jest.Mock).mockRejectedValue(new Error('Record not found'));

    await expect(assignTask('nonexistent', 'assignee-1', 'boss-1')).rejects.toThrow();
  });
});

describe('getDelegationStats', () => {
  it('should return delegation statistics for an entity', async () => {
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
    expect(stats.successRate).toBeGreaterThan(0);
  });
});

describe('generateDelegationInbox (AI-powered)', () => {
  it('should return AI-scored suggestions when available', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', title: 'Test Task', priority: 'P1', status: 'TODO', entityId: 'e1' },
    ]);
    (generateJSON as jest.Mock).mockResolvedValue({
      suggestions: [{ taskId: 'task-1', confidence: 0.8, priority: 'MEDIUM', estimatedTimeSavedMinutes: 30, reason: 'AI reason' }],
    });

    const inbox = await generateDelegationInbox('user-1');
    expect(inbox.length).toBe(1);
    expect(inbox[0].reason).toBe('AI reason');
  });

  it('should fall back to heuristic scoring on AI failure', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', title: 'Test', priority: 'P1', status: 'TODO', entityId: 'e1' },
    ]);
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));

    const inbox = await generateDelegationInbox('user-1');
    expect(inbox.length).toBe(1);
    expect(inbox[0].taskId).toBe('task-1');
    expect(inbox[0].reason).toContain('P1');
  });

  it('should return empty array when no tasks', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);

    const inbox = await generateDelegationInbox('user-1');
    expect(inbox).toEqual([]);
  });
});
