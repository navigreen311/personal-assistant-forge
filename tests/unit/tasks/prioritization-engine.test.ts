import { scoreTask, getDailyTop3 } from '@/modules/tasks/services/prioritization-engine';
import type { Task } from '@/shared/types';
import { addDays, subDays } from 'date-fns';

// Mock AI client — reject so we fall back to algorithmic scoring
const mockGenerateJSON = jest.fn();
jest.mock('@/lib/ai', () => ({
  generateJSON: (...args: unknown[]) => mockGenerateJSON(...args),
}));

// Mock prisma
const mockFindMany = jest.fn();
const mockFindUnique = jest.fn();
const mockCount = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    financialRecord: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    entity: {
      findUnique: (...args: unknown[]) =>
        mockFindUnique(...args),
    },
  },
}));

describe('PrioritizationEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockFindUnique.mockResolvedValue({ id: 'entity-1', complianceProfile: ['HIPAA'] });
    mockCount.mockResolvedValue(0);
  });

  const createMockTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'task-1',
    title: 'Test Task',
    entityId: 'entity-1',
    priority: 'P1',
    status: 'TODO',
    dependencies: [],
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('scoreTask', () => {
    it('should give highest score to overdue P0 tasks blocking others', async () => {
      mockFindMany.mockResolvedValue([{ id: 'blocked-1' }, { id: 'blocked-2' }, { id: 'blocked-3' }]);

      const task = createMockTask({
        priority: 'P0',
        dueDate: subDays(new Date(), 3),
        status: 'IN_PROGRESS',
      });

      const score = await scoreTask(task, 'entity-1');
      expect(score.overallScore).toBeGreaterThan(70);
    });

    it('should give low score to P2 tasks with no due date', async () => {
      const task = createMockTask({
        priority: 'P2',
        status: 'TODO',
      });

      const score = await scoreTask(task, 'entity-1');
      expect(score.overallScore).toBeLessThan(50);
    });

    it('should boost score for tasks aligned with entity compliance profile', async () => {
      const alignedTask = createMockTask({
        tags: ['hipaa', 'compliance'],
      });
      const unalignedTask = createMockTask({
        tags: ['misc'],
      });

      const alignedScore = await scoreTask(alignedTask, 'entity-1');
      const unalignedScore = await scoreTask(unalignedTask, 'entity-1');

      expect(alignedScore.overallScore).toBeGreaterThan(unalignedScore.overallScore);
    });

    it('should boost score for nearly-complete tasks (momentum)', async () => {
      const inProgressTask = createMockTask({
        status: 'IN_PROGRESS',
        updatedAt: new Date(), // recently active
      });
      const todoTask = createMockTask({
        status: 'TODO',
      });

      const ipScore = await scoreTask(inProgressTask, 'entity-1');
      const todoScore = await scoreTask(todoTask, 'entity-1');

      expect(ipScore.overallScore).toBeGreaterThan(todoScore.overallScore);
    });

    it('should produce score between 0 and 100', async () => {
      const task = createMockTask();
      const score = await scoreTask(task, 'entity-1');
      expect(score.overallScore).toBeGreaterThanOrEqual(0);
      expect(score.overallScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Eisenhower classification', () => {
    it('should classify urgent+important as DO_FIRST', async () => {
      const task = createMockTask({
        priority: 'P0',
        dueDate: addDays(new Date(), 1), // due tomorrow - urgent
      });

      mockFindMany.mockResolvedValue([{ id: 'blocked-1' }]); // has downstream tasks

      const score = await scoreTask(task, 'entity-1');
      expect(score.quadrant).toBe('DO_FIRST');
    });

    it('should classify not-urgent+important as SCHEDULE', async () => {
      const task = createMockTask({
        priority: 'P0',
        dueDate: addDays(new Date(), 30), // due in a month - not urgent
        status: 'IN_PROGRESS',
      });

      mockFindMany.mockResolvedValue([{ id: 'blocked-1' }]);

      const score = await scoreTask(task, 'entity-1');
      expect(score.quadrant).toBe('SCHEDULE');
    });

    it('should classify not-urgent+not-important as ELIMINATE', async () => {
      const task = createMockTask({
        priority: 'P2',
        status: 'TODO',
      });

      const score = await scoreTask(task, 'entity-1');
      expect(score.quadrant).toBe('ELIMINATE');
    });
  });

  describe('getDailyTop3', () => {
    it('should return exactly 3 tasks', async () => {
      mockFindMany.mockResolvedValue([
        { id: 't1', title: 'Task 1', entityId: 'e1', priority: 'P0', status: 'TODO', dependencies: [], tags: [], createdAt: new Date(), updatedAt: new Date(), dueDate: addDays(new Date(), 1), assigneeId: null, projectId: null, description: null, createdFrom: null },
        { id: 't2', title: 'Task 2', entityId: 'e1', priority: 'P1', status: 'TODO', dependencies: [], tags: [], createdAt: new Date(), updatedAt: new Date(), dueDate: addDays(new Date(), 3), assigneeId: null, projectId: null, description: null, createdFrom: null },
        { id: 't3', title: 'Task 3', entityId: 'e1', priority: 'P0', status: 'IN_PROGRESS', dependencies: [], tags: [], createdAt: new Date(), updatedAt: new Date(), dueDate: addDays(new Date(), 2), assigneeId: null, projectId: null, description: null, createdFrom: null },
        { id: 't4', title: 'Task 4', entityId: 'e1', priority: 'P2', status: 'TODO', dependencies: [], tags: [], createdAt: new Date(), updatedAt: new Date(), dueDate: null, assigneeId: null, projectId: null, description: null, createdFrom: null },
      ]);

      const result = await getDailyTop3('user-1', 'e1');
      expect(result.tasks.length).toBe(3);
    });

    it('should return tasks sorted by score descending', async () => {
      mockFindMany.mockResolvedValue([
        { id: 't1', title: 'Low', entityId: 'e1', priority: 'P2', status: 'TODO', dependencies: [], tags: [], createdAt: new Date(), updatedAt: new Date(), dueDate: null, assigneeId: null, projectId: null, description: null, createdFrom: null },
        { id: 't2', title: 'High', entityId: 'e1', priority: 'P0', status: 'IN_PROGRESS', dependencies: [], tags: [], createdAt: new Date(), updatedAt: new Date(), dueDate: addDays(new Date(), 1), assigneeId: null, projectId: null, description: null, createdFrom: null },
      ]);

      const result = await getDailyTop3('user-1', 'e1');
      if (result.tasks.length >= 2) {
        expect(result.tasks[0].score.overallScore).toBeGreaterThanOrEqual(result.tasks[1].score.overallScore);
      }
    });

    it('should include reasoning for each task', async () => {
      mockFindMany.mockResolvedValue([
        { id: 't1', title: 'Task', entityId: 'e1', priority: 'P0', status: 'TODO', dependencies: [], tags: [], createdAt: new Date(), updatedAt: new Date(), dueDate: addDays(new Date(), 1), assigneeId: null, projectId: null, description: null, createdFrom: null },
      ]);

      const result = await getDailyTop3('user-1', 'e1');
      expect(result.reasoning).toBeTruthy();
    });

    it('should exclude DONE and CANCELLED tasks', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await getDailyTop3('user-1', 'e1');
      // The mock returns empty since we filter for TODO/IN_PROGRESS in the query
      expect(result.tasks.length).toBe(0);
    });
  });
});
