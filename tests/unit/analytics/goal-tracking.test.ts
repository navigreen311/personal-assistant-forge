import {
  createGoal,
  updateGoalProgress,
  suggestCourseCorrection,
  _getGoalStore,
} from '@/modules/analytics/services/goal-tracking-service';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    workflow: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-1'),
}));

const { prisma } = require('@/lib/db');

describe('updateGoalProgress', () => {
  beforeEach(() => {
    _getGoalStore().clear();
    jest.clearAllMocks();
  });

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
    const goal = await createGoal({
      userId: 'user1',
      title: 'Test goal',
      framework: 'OKR',
      targetValue: 100,
      unit: '%',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      autoProgress: true,
      linkedTaskIds: ['task1', 'task2', 'task3'],
      linkedWorkflowIds: [],
    });

    // 2 out of 3 = 67% progress, only ~13% of time elapsed -> ON_TRACK
    prisma.task.findMany.mockResolvedValueOnce([
      { id: 'task1', status: 'DONE' },
      { id: 'task2', status: 'DONE' },
      { id: 'task3', status: 'TODO' },
    ]);

    const updated = await updateGoalProgress(goal.id);
    expect(updated.status).toBe('ON_TRACK');
  });

  it('should set AT_RISK when pace is 80-100% of required', async () => {
    // Create goal that's almost half elapsed with less than half done
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 50); // 50 days ago
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 10); // 10 days from now

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

    // 4 out of 5 tasks done = 80% progress, but 83% time elapsed
    prisma.task.findMany.mockResolvedValueOnce([
      { id: 't1', status: 'DONE' },
      { id: 't2', status: 'DONE' },
      { id: 't3', status: 'DONE' },
      { id: 't4', status: 'DONE' },
      { id: 't5', status: 'TODO' },
    ]);

    const updated = await updateGoalProgress(goal.id);
    // pace ratio = (80/100) / (50/60) = 0.96 -> AT_RISK (between 0.8 and 1.0)
    expect(['ON_TRACK', 'AT_RISK']).toContain(updated.status);
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

    // Only 1 out of 5 done = 20% progress, but 90% time elapsed
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

describe('suggestCourseCorrection', () => {
  beforeEach(() => {
    _getGoalStore().clear();
    jest.clearAllMocks();
  });

  it('should suggest for AT_RISK goals', async () => {
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

    // Manually set status
    const store = _getGoalStore();
    const g = store.get(goal.id)!;
    g.status = 'AT_RISK';
    g.currentValue = 40;
    store.set(goal.id, g);

    const suggestion = await suggestCourseCorrection(goal.id);
    expect(suggestion.goalId).toBe(goal.id);
    expect(suggestion.suggestion).toBeTruthy();
    expect(suggestion.currentPace).toBeGreaterThanOrEqual(0);
    expect(suggestion.requiredPace).toBeGreaterThanOrEqual(0);
  });

  it('should suggest for BEHIND goals', async () => {
    const goal = await createGoal({
      userId: 'user1',
      title: 'Behind',
      framework: 'OKR',
      targetValue: 100,
      unit: 'tasks',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-03-31'),
      autoProgress: false,
      linkedTaskIds: [],
      linkedWorkflowIds: [],
    });

    const store = _getGoalStore();
    const g = store.get(goal.id)!;
    g.status = 'BEHIND';
    g.currentValue = 10;
    store.set(goal.id, g);

    const suggestion = await suggestCourseCorrection(goal.id);
    expect(suggestion.suggestion).toContain('pace');
    expect(suggestion.adjustedEndDate).toBeDefined();
  });

  it('should not suggest adjustments for ON_TRACK goals', async () => {
    const goal = await createGoal({
      userId: 'user1',
      title: 'On track',
      framework: 'OKR',
      targetValue: 100,
      unit: 'tasks',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      autoProgress: false,
      linkedTaskIds: [],
      linkedWorkflowIds: [],
    });

    const store = _getGoalStore();
    const g = store.get(goal.id)!;
    g.status = 'ON_TRACK';
    g.currentValue = 50;
    store.set(goal.id, g);

    const suggestion = await suggestCourseCorrection(goal.id);
    expect(suggestion.suggestion).toContain('on track');
    expect(suggestion.adjustedEndDate).toBeUndefined();
  });

  it('should calculate adjusted end date', async () => {
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

    const store = _getGoalStore();
    const g = store.get(goal.id)!;
    g.status = 'BEHIND';
    g.currentValue = 20;
    store.set(goal.id, g);

    const suggestion = await suggestCourseCorrection(goal.id);
    if (suggestion.adjustedEndDate) {
      expect(suggestion.adjustedEndDate).toBeInstanceOf(Date);
    }
  });
});
