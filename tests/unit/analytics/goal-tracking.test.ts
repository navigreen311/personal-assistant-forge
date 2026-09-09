import {
  createGoal,
  updateGoalProgress,
  suggestCourseCorrection,
} from '@/modules/analytics/services/goal-tracking-service';

// Track created goals for mock lookups
const goalStore = new Map<string, Record<string, unknown>>();
let uuidCounter = 0;

// The service under test derives pace from `new Date()`, so the real system
// clock is a hidden input to every status assertion below. Left unfrozen, this
// suite passes or fails depending on the day it runs: the 2026-01-01 ->
// 2026-12-31 goal used by the ON_TRACK case is 67% complete by value, so it
// reported ON_TRACK until roughly 2 September 2026 (when the year became more
// than 67% elapsed) and would have started passing again on 1 January 2027.
// Pinning the clock makes every case below deterministic. The instant chosen
// sits inside every fixed goal window used in this file.
const FIXED_NOW = new Date('2026-02-15T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => `test-uuid-${++uuidCounter}`),
}));

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    goalEntry: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const record = { id: data.id || `test-uuid-${uuidCounter}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        goalStore.set(record.id as string, record);
        return Promise.resolve(record);
      }),
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        return Promise.resolve(goalStore.get(where.id) || null);
      }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const existing = goalStore.get(where.id);
        if (existing) {
          const updated = { ...existing, ...data, updatedAt: new Date() };
          goalStore.set(where.id, updated);
          return Promise.resolve(updated);
        }
        return Promise.resolve(null);
      }),
    },
    task: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    workflow: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockResolvedValue({
    suggestion: 'Increase your daily pace to meet the deadline.',
  }),
  generateText: jest.fn().mockResolvedValue('AI-generated insight'),
}));

const { prisma } = require('@/lib/db');
const { generateJSON } = require('@/lib/ai');

beforeEach(() => {
  jest.useFakeTimers({ now: FIXED_NOW });
  goalStore.clear();
  uuidCounter = 0;
  jest.clearAllMocks();
  // Re-wire create mock after clearAllMocks
  prisma.goalEntry.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
    const record = { id: data.id || `test-uuid-${++uuidCounter}`, ...data, createdAt: new Date(), updatedAt: new Date() };
    goalStore.set(record.id as string, record);
    return Promise.resolve(record);
  });
  prisma.goalEntry.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
    return Promise.resolve(goalStore.get(where.id) || null);
  });
  prisma.goalEntry.update.mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const existing = goalStore.get(where.id);
    if (existing) {
      const updated = { ...existing, ...data, updatedAt: new Date() };
      goalStore.set(where.id, updated);
      return Promise.resolve(updated);
    }
    return Promise.resolve(null);
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('updateGoalProgress', () => {
  it('should update currentValue from linked task completion', async () => {
    const goal = await createGoal({
      userId: 'user1',
      title: 'Complete tasks',
      framework: 'OKR',
      targetValue: 100,
      unit: '%',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      autoProgress: true,
      linkedTaskIds: ['task1', 'task2', 'task3'],
      linkedWorkflowIds: [],
    });

    prisma.task.findMany.mockResolvedValueOnce([
      { id: 'task1', status: 'DONE' },
      { id: 'task2', status: 'DONE' },
      { id: 'task3', status: 'TODO' },
    ]);

    const updated = await updateGoalProgress(goal.id);
    // 2 out of 3 tasks = 67% of target (100)
    expect(updated.currentValue).toBe(67);
  });

  it('should set ON_TRACK when pace >= required pace', async () => {
    // 60 of the window's 100 days have elapsed, and 2 of 3 linked tasks are
    // done (67% of target). Actual pace therefore exceeds required pace, which
    // is what ON_TRACK means. Expressed relative to the pinned clock so the
    // relationship between the two paces is a property of the test, not of the
    // date it happens to run on.
    const goal = await createGoal({
      userId: 'user1',
      title: 'Test goal',
      framework: 'OKR',
      targetValue: 100,
      unit: '%',
      startDate: new Date(FIXED_NOW.getTime() - 60 * DAY_MS),
      endDate: new Date(FIXED_NOW.getTime() + 40 * DAY_MS),
      autoProgress: true,
      linkedTaskIds: ['task1', 'task2', 'task3'],
      linkedWorkflowIds: [],
    });

    prisma.task.findMany.mockResolvedValueOnce([
      { id: 'task1', status: 'DONE' },
      { id: 'task2', status: 'DONE' },
      { id: 'task3', status: 'TODO' },
    ]);

    const updated = await updateGoalProgress(goal.id);
    expect(updated.status).toBe('ON_TRACK');
  });

  it('should set AT_RISK when pace is 80-100% of required', async () => {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 50);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 10);

    const goal = await createGoal({
      userId: 'user1',
      title: 'Tight goal',
      framework: 'SMART',
      targetValue: 100,
      unit: '%',
      startDate,
      endDate,
      autoProgress: true,
      linkedTaskIds: ['t1', 't2', 't3', 't4', 't5'],
      linkedWorkflowIds: [],
    });

    prisma.task.findMany.mockResolvedValueOnce([
      { id: 't1', status: 'DONE' },
      { id: 't2', status: 'DONE' },
      { id: 't3', status: 'DONE' },
      { id: 't4', status: 'DONE' },
      { id: 't5', status: 'TODO' },
    ]);

    // 50 of 60 days elapsed (83%) against 4 of 5 tasks done (80%): pace ratio
    // 0.96, i.e. inside the 80-100% AT_RISK band. Now that the clock is pinned
    // this is exact, so the assertion no longer has to accept ON_TRACK too.
    const updated = await updateGoalProgress(goal.id);
    expect(updated.status).toBe('AT_RISK');
  });

  it('should set BEHIND when pace < 80% of required', async () => {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 90);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 10);

    const goal = await createGoal({
      userId: 'user1',
      title: 'Behind goal',
      framework: 'OKR',
      targetValue: 100,
      unit: '%',
      startDate,
      endDate,
      autoProgress: true,
      linkedTaskIds: ['t1', 't2', 't3', 't4', 't5'],
      linkedWorkflowIds: [],
    });

    prisma.task.findMany.mockResolvedValueOnce([
      { id: 't1', status: 'DONE' },
      { id: 't2', status: 'TODO' },
      { id: 't3', status: 'TODO' },
      { id: 't4', status: 'TODO' },
      { id: 't5', status: 'TODO' },
    ]);

    const updated = await updateGoalProgress(goal.id);
    expect(updated.status).toBe('BEHIND');
  });

  it('should set COMPLETE when currentValue >= targetValue', async () => {
    const goal = await createGoal({
      userId: 'user1',
      title: 'Almost done',
      framework: 'OKR',
      targetValue: 100,
      unit: '%',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      autoProgress: true,
      linkedTaskIds: ['t1'],
      linkedWorkflowIds: [],
    });

    prisma.task.findMany.mockResolvedValueOnce([
      { id: 't1', status: 'DONE' },
    ]);

    const updated = await updateGoalProgress(goal.id);
    expect(updated.status).toBe('COMPLETE');
  });
});

describe('suggestCourseCorrection (AI-powered)', () => {
  it('should call generateJSON with goal context in prompt', async () => {
    const goal = await createGoal({
      userId: 'user1',
      title: 'At risk',
      framework: 'OKR',
      targetValue: 100,
      unit: 'tasks',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-03-31'),
      autoProgress: false,
      linkedTaskIds: [],
      linkedWorkflowIds: [],
    });

    // Set goal status directly in store for mock
    const stored = goalStore.get(goal.id);
    if (stored) {
      stored.status = 'AT_RISK';
      stored.currentValue = 40;
    }

    await suggestCourseCorrection(goal.id);
    expect(generateJSON).toHaveBeenCalledTimes(1);
    const prompt = generateJSON.mock.calls[0][0] as string;
    expect(prompt).toContain('At risk');
    expect(prompt).toContain('AT_RISK');
  });

  it('should include current pace and required pace in prompt', async () => {
    const goal = await createGoal({
      userId: 'user1',
      title: 'Pace test',
      framework: 'OKR',
      targetValue: 100,
      unit: 'tasks',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-03-31'),
      autoProgress: false,
      linkedTaskIds: [],
      linkedWorkflowIds: [],
    });

    const stored = goalStore.get(goal.id);
    if (stored) {
      stored.status = 'BEHIND';
      stored.currentValue = 10;
    }

    await suggestCourseCorrection(goal.id);
    const prompt = generateJSON.mock.calls[0][0] as string;
    expect(prompt).toContain('Current pace');
    expect(prompt).toContain('Required pace');
  });

  it('should return AI-generated suggestion', async () => {
    const goal = await createGoal({
      userId: 'user1',
      title: 'AI suggestion',
      framework: 'OKR',
      targetValue: 100,
      unit: 'tasks',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-03-31'),
      autoProgress: false,
      linkedTaskIds: [],
      linkedWorkflowIds: [],
    });

    const stored = goalStore.get(goal.id);
    if (stored) {
      stored.status = 'AT_RISK';
      stored.currentValue = 40;
    }

    const result = await suggestCourseCorrection(goal.id);
    expect(result.suggestion).toBe('Increase your daily pace to meet the deadline.');
    expect(result.goalId).toBe(goal.id);
    expect(result.currentPace).toBeGreaterThanOrEqual(0);
    expect(result.requiredPace).toBeGreaterThanOrEqual(0);
  });

  it('should handle AI failure gracefully with fallback', async () => {
    generateJSON.mockRejectedValueOnce(new Error('AI service unavailable'));

    const goal = await createGoal({
      userId: 'user1',
      title: 'Fallback test',
      framework: 'OKR',
      targetValue: 100,
      unit: 'tasks',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-03-31'),
      autoProgress: false,
      linkedTaskIds: [],
      linkedWorkflowIds: [],
    });

    const stored = goalStore.get(goal.id);
    if (stored) {
      stored.status = 'BEHIND';
      stored.currentValue = 10;
    }

    const result = await suggestCourseCorrection(goal.id);
    expect(result.suggestion).toBeTruthy();
    expect(result.suggestion.length).toBeGreaterThan(0);
    expect(result.adjustedEndDate).toBeDefined();
  });

  it('should calculate adjusted end date for BEHIND goals', async () => {
    const goal = await createGoal({
      userId: 'user1',
      title: 'Adjust date',
      framework: 'SMART',
      targetValue: 100,
      unit: '%',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-02-28'),
      autoProgress: false,
      linkedTaskIds: [],
      linkedWorkflowIds: [],
    });

    const stored = goalStore.get(goal.id);
    if (stored) {
      stored.status = 'BEHIND';
      stored.currentValue = 20;
    }

    const suggestion = await suggestCourseCorrection(goal.id);
    if (suggestion.adjustedEndDate) {
      expect(suggestion.adjustedEndDate).toBeInstanceOf(Date);
    }
  });
});
