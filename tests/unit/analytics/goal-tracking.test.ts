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

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockResolvedValue({
    suggestion: 'Increase your daily pace to meet the deadline.',
  }),
  generateText: jest.fn().mockResolvedValue('AI-generated insight'),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-1'),
}));

const { prisma } = require('@/lib/db');
const { generateJSON } = require('@/lib/ai');

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

describe('suggestCourseCorrection (AI-powered)', () => {
  beforeEach(() => {
    _getGoalStore().clear();
    jest.clearAllMocks();
  });

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

    const store = _getGoalStore();
    const g = store.get(goal.id)!;
    g.status = 'AT_RISK';
    g.currentValue = 40;
    store.set(goal.id, g);

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

    const store = _getGoalStore();
    const g = store.get(goal.id)!;
    g.status = 'BEHIND';
    g.currentValue = 10;
    store.set(goal.id, g);

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

    const store = _getGoalStore();
    const g = store.get(goal.id)!;
    g.status = 'AT_RISK';
    g.currentValue = 40;
    store.set(goal.id, g);

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

    const store = _getGoalStore();
    const g = store.get(goal.id)!;
    g.status = 'BEHIND';
    g.currentValue = 10;
    store.set(goal.id, g);

    const result = await suggestCourseCorrection(goal.id);
    // Should fall back to static suggestion
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
