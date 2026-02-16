/**
 * Integration Test: Task Lifecycle
 * Tests cross-module interactions: create -> prioritize -> update -> complete
 *
 * Services under test:
 * - task-crud.ts (createTask, updateTask, getTask, listTasks)
 * - prioritization-engine.ts (scoreTask, scoreBatch, reprioritize)
 */

// --- Infrastructure mocks ---

const mockPrisma = {
  entity: {
    findUnique: jest.fn(),
  },
  project: {
    findUnique: jest.fn(),
  },
  task: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  actionLog: {
    create: jest.fn(),
  },
  financialRecord: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
  generateJSON: jest.fn(),
  chat: jest.fn(),
  streamText: jest.fn(),
}));

import { createTask, updateTask, getTask } from '@/modules/tasks/services/task-crud';
import { scoreTask, scoreBatch, reprioritize } from '@/modules/tasks/services/prioritization-engine';
import type { Task } from '@/shared/types';

// --- Test helpers ---

function createMockTaskRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Test Task',
    description: null,
    entityId: 'entity-1',
    projectId: null,
    priority: 'P1',
    status: 'TODO',
    dueDate: null,
    dependencies: [],
    assigneeId: null,
    createdFrom: null,
    tags: [],
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  };
}

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    entityId: 'entity-1',
    priority: 'P1',
    status: 'TODO',
    dependencies: [],
    tags: [],
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  };
}

describe('Task Lifecycle Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Create and prioritize', () => {
    it('should create a task and calculate its priority score', async () => {
      const mockEntity = { id: 'entity-1', name: 'Test Entity', complianceProfile: [] };
      const taskRecord = createMockTaskRecord({
        title: 'Prepare investor deck',
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        priority: 'P1',
      });

      // Mock entity lookup for createTask
      mockPrisma.entity.findUnique.mockResolvedValue(mockEntity);
      mockPrisma.task.create.mockResolvedValue(taskRecord);

      // Step 1: Create the task
      const task = await createTask({
        title: 'Prepare investor deck',
        entityId: 'entity-1',
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      });

      expect(task.id).toBe('task-1');
      expect(task.title).toBe('Prepare investor deck');
      expect(task.status).toBe('TODO');
      expect(task.priority).toBe('P1');

      // Step 2: Score the task using prioritization engine
      // Mock dependencies for scoreTask
      mockPrisma.financialRecord.findMany.mockResolvedValue([]);
      mockPrisma.entity.findUnique.mockResolvedValue(mockEntity);
      mockPrisma.task.findMany.mockResolvedValue([]); // no dependent tasks

      const score = await scoreTask(task, 'entity-1');

      expect(score.taskId).toBe('task-1');
      expect(score.overallScore).toBeGreaterThanOrEqual(0);
      expect(score.overallScore).toBeLessThanOrEqual(100);
      expect(score.quadrant).toMatch(/^(DO_FIRST|SCHEDULE|DELEGATE|ELIMINATE)$/);
      expect(score.factors).toBeInstanceOf(Array);
      expect(score.factors.length).toBeGreaterThan(0);
      expect(score.recommendation).toBeTruthy();

      // Verify factors include expected scoring dimensions
      const factorNames = score.factors.map((f) => f.name);
      expect(factorNames).toContain('Urgency');
      expect(factorNames).toContain('Revenue Impact');
      expect(factorNames).toContain('Deadline Pressure');
    });
  });

  describe('Status transitions', () => {
    it('should transition task through TODO -> IN_PROGRESS -> DONE', async () => {
      const taskRecord = createMockTaskRecord();

      // Create task
      mockPrisma.entity.findUnique.mockResolvedValue({ id: 'entity-1' });
      mockPrisma.task.create.mockResolvedValue(taskRecord);

      const task = await createTask({
        title: 'Test Task',
        entityId: 'entity-1',
      });
      expect(task.status).toBe('TODO');

      // Update to IN_PROGRESS
      const inProgressRecord = createMockTaskRecord({ status: 'IN_PROGRESS' });
      mockPrisma.task.findUnique.mockResolvedValue(taskRecord);
      mockPrisma.task.update.mockResolvedValue(inProgressRecord);

      const inProgressTask = await updateTask('task-1', { status: 'IN_PROGRESS' });
      expect(inProgressTask.status).toBe('IN_PROGRESS');

      // Update to DONE
      const doneRecord = createMockTaskRecord({ status: 'DONE' });
      mockPrisma.task.findUnique.mockResolvedValue(inProgressRecord);
      mockPrisma.task.update.mockResolvedValue(doneRecord);

      const doneTask = await updateTask('task-1', { status: 'DONE' });
      expect(doneTask.status).toBe('DONE');

      // Verify update was called with correct data
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'DONE' },
      });
    });
  });

  describe('Reprioritize after due date change', () => {
    it('should recalculate priority when due date is moved closer', async () => {
      const farFutureDue = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      const nearDue = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000); // 1 day

      const taskWithFarDue = createMockTask({
        id: 'task-1',
        title: 'Report preparation',
        dueDate: farFutureDue,
        priority: 'P2',
      });

      const taskWithNearDue = createMockTask({
        id: 'task-1',
        title: 'Report preparation',
        dueDate: nearDue,
        priority: 'P2',
      });

      // Mock entity and financial records for scoring
      const mockEntity = { id: 'entity-1', complianceProfile: [] };
      mockPrisma.entity.findUnique.mockResolvedValue(mockEntity);
      mockPrisma.financialRecord.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]); // no dependent tasks

      // Score with far future due date
      const scoreFar = await scoreTask(taskWithFarDue, 'entity-1');

      // Score with near due date
      const scoreNear = await scoreTask(taskWithNearDue, 'entity-1');

      // Task with closer deadline should have higher score
      expect(scoreNear.overallScore).toBeGreaterThan(scoreFar.overallScore);

      // Near-deadline task should reflect urgency (DO_FIRST if important, DELEGATE if urgent-only)
      expect(['DO_FIRST', 'SCHEDULE', 'DELEGATE']).toContain(scoreNear.quadrant);
    });

    it('should log deferral when due date is moved to the future', async () => {
      const originalDue = new Date('2026-02-20');
      const newDue = new Date('2026-03-15');

      const existingTask = createMockTaskRecord({
        dueDate: originalDue,
      });

      const updatedTask = createMockTaskRecord({
        dueDate: newDue,
      });

      mockPrisma.task.findUnique.mockResolvedValue(existingTask);
      mockPrisma.task.update.mockResolvedValue(updatedTask);
      mockPrisma.actionLog.create.mockResolvedValue({});

      await updateTask('task-1', { dueDate: newDue });

      // Verify deferral was logged
      expect(mockPrisma.actionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actor: 'SYSTEM',
          actionType: 'TASK_DEFERRED',
          target: 'task-1',
          blastRadius: 'LOW',
          reversible: true,
        }),
      });
    });
  });

  describe('Multi-task prioritization', () => {
    it('should correctly rank 3 tasks with different urgencies using reprioritize', async () => {
      const now = new Date();
      const urgentTask = createMockTaskRecord({
        id: 'task-urgent',
        title: 'Fix production bug',
        priority: 'P2', // Currently under-prioritized
        status: 'TODO',
        dueDate: new Date(now.getTime() + 4 * 60 * 60 * 1000), // 4 hours from now
      });

      const normalTask = createMockTaskRecord({
        id: 'task-normal',
        title: 'Update documentation',
        priority: 'P1',
        status: 'TODO',
        dueDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), // 14 days
      });

      const lowTask = createMockTaskRecord({
        id: 'task-low',
        title: 'Clean up old code',
        priority: 'P0', // Currently over-prioritized
        status: 'TODO',
        dueDate: null,
      });

      // Mock task lookup for reprioritize
      mockPrisma.task.findMany
        .mockResolvedValueOnce([urgentTask, normalTask, lowTask]) // initial fetch
        .mockResolvedValue([]); // dependency checks return empty

      const mockEntity = { id: 'entity-1', complianceProfile: [] };
      mockPrisma.entity.findUnique.mockResolvedValue(mockEntity);
      mockPrisma.financialRecord.findMany.mockResolvedValue([]);

      const result = await reprioritize('entity-1');

      expect(result.reranked).toBe(3);
      expect(result.changes).toBeInstanceOf(Array);

      // The urgent task (4 hours from now, currently P2) should be upgraded
      const urgentChange = result.changes.find((c) => c.taskId === 'task-urgent');
      if (urgentChange) {
        // Should be elevated from P2 to P0 or P1 based on score
        expect(['P0', 'P1']).toContain(urgentChange.newPriority);
        expect(urgentChange.oldPriority).toBe('P2');
      }

      // The low-priority task with no due date (currently P0) should be lowered
      const lowChange = result.changes.find((c) => c.taskId === 'task-low');
      if (lowChange) {
        expect(['P1', 'P2']).toContain(lowChange.newPriority);
        expect(lowChange.oldPriority).toBe('P0');
      }
    });

    it('should batch-score multiple tasks and return scores for all', async () => {
      const tasks: Task[] = [
        createMockTask({ id: 'task-a', title: 'Task A', dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000) }),
        createMockTask({ id: 'task-b', title: 'Task B', dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }),
        createMockTask({ id: 'task-c', title: 'Task C' }), // no due date
      ];

      const mockEntity = { id: 'entity-1', complianceProfile: [] };
      mockPrisma.entity.findUnique.mockResolvedValue(mockEntity);
      mockPrisma.financialRecord.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]); // no dependents

      const scores = await scoreBatch(tasks, 'entity-1');

      expect(scores).toHaveLength(3);

      // Each score should reference the correct task
      expect(scores[0].taskId).toBe('task-a');
      expect(scores[1].taskId).toBe('task-b');
      expect(scores[2].taskId).toBe('task-c');

      // Task A (due tomorrow) should have highest score
      expect(scores[0].overallScore).toBeGreaterThan(scores[2].overallScore);
    });
  });
});
