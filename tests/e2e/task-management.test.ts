/**
 * E2E Test: Task Management
 * Tests full task lifecycle flows end-to-end:
 *   create -> update -> assign -> complete -> archive
 *   bulk operations, dependency creation/resolution,
 *   NLP task parsing, forecasting, procrastination detection
 *
 * Services under test:
 * - task-crud.ts (createTask, updateTask, getTask, listTasks, bulkUpdateTasks, deleteTask, getOverdueTasks, getBlockedTasks)
 * - dependency-graph.ts (buildDependencyGraph, getBlockingChain, getDownstreamTasks, suggestDependencyResolution, detectCircularDependencies)
 * - nlp-parser.ts (parseTaskFromText, extractEntities, resolveEntityReferences, parseMultipleTasks)
 * - forecasting-service.ts (forecastTaskCompletion, calculateVelocity, detectVelocityAnomalies)
 * - procrastination-detector.ts (detectProcrastination, getSuggestion, getTaskDeferralHistory)
 */

// --- Infrastructure mocks ---

const mockPrisma = {
  entity: {
    findUnique: jest.fn(),
  },
  project: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
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
    count: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  financialRecord: {
    findMany: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
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

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'e2e-task-uuid'),
}));

import {
  createTask,
  updateTask,
  getTask,
  listTasks,
  bulkUpdateTasks,
  deleteTask,
  getOverdueTasks,
  getBlockedTasks,
} from '@/modules/tasks/services/task-crud';
import {
  buildDependencyGraph,
  getBlockingChain,
  getDownstreamTasks,
  suggestDependencyResolution,
  detectCircularDependencies,
} from '@/modules/tasks/services/dependency-graph';
import {
  parseTaskFromText,
  extractEntities,
  resolveEntityReferences,
  parseMultipleTasks,
} from '@/modules/tasks/services/nlp-parser';
import {
  forecastTaskCompletion,
  calculateVelocity,
  detectVelocityAnomalies,
} from '@/modules/tasks/services/forecasting-service';
import {
  detectProcrastination,
  getSuggestion,
  getTaskDeferralHistory,
} from '@/modules/tasks/services/procrastination-detector';
import { scoreTask } from '@/modules/tasks/services/prioritization-engine';
import { generateJSON } from '@/lib/ai';
import type { Task } from '@/shared/types';

const mockedGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;

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

describe('Task Management E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGenerateJSON.mockRejectedValue(new Error('AI unavailable'));
  });

  // =========================================================================
  // Full task lifecycle: create -> update -> assign -> complete -> archive
  // =========================================================================
  describe('Full task lifecycle: create -> update -> assign -> complete -> archive', () => {
    it('should walk a task through every status from creation to archival', async () => {
      const mockEntity = { id: 'entity-1', name: 'Test Entity', complianceProfile: [] };
      mockPrisma.entity.findUnique.mockResolvedValue(mockEntity);

      // Step 1: CREATE
      const createdRecord = createMockTaskRecord({
        id: 'lifecycle-task',
        title: 'Prepare quarterly report',
        status: 'TODO',
        priority: 'P1',
        dueDate: new Date('2026-03-01'),
      });
      mockPrisma.task.create.mockResolvedValue(createdRecord);

      const created = await createTask({
        title: 'Prepare quarterly report',
        entityId: 'entity-1',
        dueDate: new Date('2026-03-01'),
      });

      expect(created.id).toBe('lifecycle-task');
      expect(created.status).toBe('TODO');
      expect(created.priority).toBe('P1');
      expect(created.title).toBe('Prepare quarterly report');

      // Step 2: UPDATE description and tags
      const updatedRecord = createMockTaskRecord({
        id: 'lifecycle-task',
        title: 'Prepare quarterly report',
        description: 'Include financial data and projections',
        tags: ['finance', 'quarterly'],
        status: 'TODO',
      });
      mockPrisma.task.findUnique.mockResolvedValue(createdRecord);
      mockPrisma.task.update.mockResolvedValue(updatedRecord);

      const updated = await updateTask('lifecycle-task', {
        description: 'Include financial data and projections',
        tags: ['finance', 'quarterly'],
      });

      expect(updated.description).toBe('Include financial data and projections');
      expect(updated.tags).toEqual(['finance', 'quarterly']);

      // Step 3: ASSIGN to a user
      const assignedRecord = createMockTaskRecord({
        id: 'lifecycle-task',
        assigneeId: 'user-42',
        status: 'TODO',
      });
      mockPrisma.task.findUnique.mockResolvedValue(updatedRecord);
      mockPrisma.task.update.mockResolvedValue(assignedRecord);

      const assigned = await updateTask('lifecycle-task', { assigneeId: 'user-42' });
      expect(assigned.assigneeId).toBe('user-42');

      // Step 4: Move to IN_PROGRESS
      const inProgressRecord = createMockTaskRecord({
        id: 'lifecycle-task',
        status: 'IN_PROGRESS',
        assigneeId: 'user-42',
      });
      mockPrisma.task.findUnique.mockResolvedValue(assignedRecord);
      mockPrisma.task.update.mockResolvedValue(inProgressRecord);

      const inProgress = await updateTask('lifecycle-task', { status: 'IN_PROGRESS' });
      expect(inProgress.status).toBe('IN_PROGRESS');

      // Step 5: COMPLETE (move to DONE)
      const doneRecord = createMockTaskRecord({
        id: 'lifecycle-task',
        status: 'DONE',
        assigneeId: 'user-42',
      });
      mockPrisma.task.findUnique.mockResolvedValue(inProgressRecord);
      mockPrisma.task.update.mockResolvedValue(doneRecord);

      const done = await updateTask('lifecycle-task', { status: 'DONE' });
      expect(done.status).toBe('DONE');

      // Step 6: ARCHIVE (soft-delete via CANCELLED status)
      const cancelledRecord = createMockTaskRecord({
        id: 'lifecycle-task',
        status: 'CANCELLED',
      });
      mockPrisma.task.update.mockResolvedValue(cancelledRecord);

      await deleteTask('lifecycle-task');
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'lifecycle-task' },
        data: { status: 'CANCELLED' },
      });
    });

    it('should track deferral when due date is pushed back during lifecycle', async () => {
      const originalDue = new Date('2026-03-01');
      const newDue = new Date('2026-04-01');

      const existingTask = createMockTaskRecord({
        id: 'deferred-task',
        dueDate: originalDue,
        status: 'IN_PROGRESS',
      });
      const deferredTask = createMockTaskRecord({
        id: 'deferred-task',
        dueDate: newDue,
        status: 'IN_PROGRESS',
      });

      mockPrisma.task.findUnique.mockResolvedValue(existingTask);
      mockPrisma.task.update.mockResolvedValue(deferredTask);
      mockPrisma.actionLog.create.mockResolvedValue({});

      await updateTask('deferred-task', { dueDate: newDue });

      expect(mockPrisma.actionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actor: 'SYSTEM',
          actionType: 'TASK_DEFERRED',
          target: 'deferred-task',
          blastRadius: 'LOW',
          reversible: true,
        }),
      });
    });

    it('should throw when creating a task for a nonexistent entity', async () => {
      mockPrisma.entity.findUnique.mockResolvedValue(null);

      await expect(
        createTask({ title: 'Orphan task', entityId: 'bad-entity' })
      ).rejects.toThrow('Entity not found: bad-entity');
    });

    it('should throw when updating a task that does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(
        updateTask('nonexistent', { status: 'DONE' })
      ).rejects.toThrow('Task not found: nonexistent');
    });
  });

  // =========================================================================
  // Bulk operations
  // =========================================================================
  describe('Bulk operations', () => {
    it('should bulk update status for multiple tasks', async () => {
      mockPrisma.task.updateMany.mockResolvedValue({ count: 3 });

      const result = await bulkUpdateTasks(
        ['task-a', 'task-b', 'task-c'],
        { status: 'DONE' }
      );

      expect(result.updated).toBe(3);
      expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['task-a', 'task-b', 'task-c'] } },
        data: { status: 'DONE' },
      });
    });

    it('should bulk update priority and assignee', async () => {
      mockPrisma.task.updateMany.mockResolvedValue({ count: 2 });

      const result = await bulkUpdateTasks(
        ['task-x', 'task-y'],
        { priority: 'P0', assigneeId: 'user-99' }
      );

      expect(result.updated).toBe(2);
      expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['task-x', 'task-y'] } },
        data: { priority: 'P0', assigneeId: 'user-99' },
      });
    });

    it('should list tasks with filtering and pagination', async () => {
      const tasks = [
        createMockTaskRecord({ id: 'task-1', status: 'TODO' }),
        createMockTaskRecord({ id: 'task-2', status: 'TODO' }),
      ];
      mockPrisma.task.findMany.mockResolvedValue(tasks);
      mockPrisma.task.count.mockResolvedValue(5);

      const result = await listTasks(
        { entityId: 'entity-1', status: 'TODO' },
        { field: 'priority', direction: 'asc' },
        1,
        2
      );

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityId: 'entity-1', status: 'TODO' }),
          skip: 0,
          take: 2,
        })
      );
    });

    it('should find overdue tasks', async () => {
      const overdueTasks = [
        createMockTaskRecord({ id: 'od-1', dueDate: new Date('2026-01-01'), status: 'TODO' }),
        createMockTaskRecord({ id: 'od-2', dueDate: new Date('2026-01-10'), status: 'IN_PROGRESS' }),
      ];
      mockPrisma.task.findMany.mockResolvedValue(overdueTasks);

      const result = await getOverdueTasks('entity-1');

      expect(result).toHaveLength(2);
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityId: 'entity-1',
            status: { notIn: ['DONE', 'CANCELLED'] },
          }),
        })
      );
    });

    it('should find blocked tasks', async () => {
      const blockedTasks = [
        createMockTaskRecord({ id: 'bl-1', status: 'BLOCKED' }),
      ];
      mockPrisma.task.findMany.mockResolvedValue(blockedTasks);

      const result = await getBlockedTasks('entity-1');

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('BLOCKED');
    });
  });

  // =========================================================================
  // Dependency creation and resolution
  // =========================================================================
  describe('Dependency creation and resolution', () => {
    it('should build a dependency graph for a project and identify critical path and bottlenecks', async () => {
      const projectTasks = [
        createMockTaskRecord({ id: 'dep-1', title: 'Design', projectId: 'proj-1', dependencies: [], status: 'DONE' }),
        createMockTaskRecord({ id: 'dep-2', title: 'Implement', projectId: 'proj-1', dependencies: ['dep-1'], status: 'IN_PROGRESS' }),
        createMockTaskRecord({ id: 'dep-3', title: 'Test', projectId: 'proj-1', dependencies: ['dep-2'], status: 'TODO' }),
        createMockTaskRecord({ id: 'dep-4', title: 'Deploy', projectId: 'proj-1', dependencies: ['dep-3'], status: 'TODO' }),
        createMockTaskRecord({ id: 'dep-5', title: 'Write docs', projectId: 'proj-1', dependencies: ['dep-2'], status: 'TODO' }),
      ];
      mockPrisma.task.findMany.mockResolvedValue(projectTasks);

      const graph = await buildDependencyGraph('proj-1');

      expect(graph.nodes).toHaveLength(5);
      expect(graph.edges.length).toBeGreaterThan(0);

      // Critical path should be the longest chain: dep-1 -> dep-2 -> dep-3 -> dep-4
      expect(graph.criticalPath).toContain('dep-1');
      expect(graph.criticalPath).toContain('dep-4');
      expect(graph.criticalPath.length).toBeGreaterThanOrEqual(4);

      // dep-2 blocks both dep-3 and dep-5, so it should be a bottleneck
      expect(graph.bottlenecks).toContain('dep-2');

      // Verify node properties
      const dep2Node = graph.nodes.find((n) => n.taskId === 'dep-2');
      expect(dep2Node).toBeDefined();
      expect(dep2Node!.blockingCount).toBe(2);
      expect(dep2Node!.blockedByCount).toBe(1);
      expect(dep2Node!.isBottleneck).toBe(true);
    });

    it('should trace the blocking chain for a blocked task', async () => {
      // getBlockingChain traces: findUnique(dep-4) -> deps=[dep-3] ->
      //   findUnique(dep-3) as blocker -> push -> traceBlockers(dep-3) ->
      //   findUnique(dep-3) -> deps=[dep-2] ->
      //   findUnique(dep-2) as blocker -> push -> traceBlockers(dep-2) ->
      //   findUnique(dep-2) -> deps=[] -> done
      mockPrisma.task.findUnique
        .mockResolvedValueOnce(createMockTaskRecord({
          id: 'dep-4',
          dependencies: ['dep-3'],
          status: 'BLOCKED',
        }))
        .mockResolvedValueOnce(createMockTaskRecord({
          id: 'dep-3',
          dependencies: ['dep-2'],
          status: 'TODO',
        }))
        .mockResolvedValueOnce(createMockTaskRecord({
          id: 'dep-3',
          dependencies: ['dep-2'],
          status: 'TODO',
        }))
        .mockResolvedValueOnce(createMockTaskRecord({
          id: 'dep-2',
          dependencies: [],
          status: 'IN_PROGRESS',
        }))
        .mockResolvedValueOnce(createMockTaskRecord({
          id: 'dep-2',
          dependencies: [],
          status: 'IN_PROGRESS',
        }));

      const chain = await getBlockingChain('dep-4');

      expect(chain).toHaveLength(2);
      expect(chain.map((t) => t.id)).toContain('dep-3');
      expect(chain.map((t) => t.id)).toContain('dep-2');
    });

    it('should find downstream tasks that would be unblocked by completing a task', async () => {
      mockPrisma.task.findMany
        .mockResolvedValueOnce([
          createMockTaskRecord({ id: 'down-1', dependencies: ['blocker-1'], status: 'BLOCKED' }),
          createMockTaskRecord({ id: 'down-2', dependencies: ['blocker-1'], status: 'TODO' }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const downstream = await getDownstreamTasks('blocker-1');

      expect(downstream).toHaveLength(2);
      expect(downstream.map((t) => t.id)).toContain('down-1');
      expect(downstream.map((t) => t.id)).toContain('down-2');
    });

    it('should detect circular dependencies', () => {
      const tasks = [
        { id: 'a', dependencies: ['c'] },
        { id: 'b', dependencies: ['a'] },
        { id: 'c', dependencies: ['b'] },
      ];

      const cycles = detectCircularDependencies(tasks);

      expect(cycles.length).toBeGreaterThan(0);
      const allCycleNodes = new Set(cycles.flat());
      expect(allCycleNodes.has('a')).toBe(true);
      expect(allCycleNodes.has('b')).toBe(true);
      expect(allCycleNodes.has('c')).toBe(true);
    });

    it('should return no circular dependencies for a valid DAG', () => {
      const tasks = [
        { id: 'a', dependencies: [] },
        { id: 'b', dependencies: ['a'] },
        { id: 'c', dependencies: ['b'] },
      ];

      const cycles = detectCircularDependencies(tasks);
      expect(cycles).toHaveLength(0);
    });

    it('should suggest dependency resolution for a blocked task', async () => {
      const blockedTask = createMockTaskRecord({
        id: 'blocked-task',
        status: 'BLOCKED',
        dependencies: ['blocker-a', 'blocker-b'],
      });
      const blockerA = createMockTaskRecord({
        id: 'blocker-a',
        title: 'Review API spec',
        status: 'TODO',
        assigneeId: null,
      });
      const blockerB = createMockTaskRecord({
        id: 'blocker-b',
        title: 'Database migration',
        status: 'IN_PROGRESS',
        assigneeId: 'user-5',
      });

      mockPrisma.task.findUnique
        .mockResolvedValueOnce(blockedTask)
        .mockResolvedValueOnce(blockerA)
        .mockResolvedValueOnce(blockerB);

      const suggestion = await suggestDependencyResolution('blocked-task');

      expect(suggestion).toContain('Review API spec');
      expect(suggestion).toContain('TODO');
      expect(suggestion).toContain('Database migration');
      expect(suggestion).toContain('in progress');
      expect(suggestion).toContain('Assign');
    });

    it('should create a task with dependencies and verify they are stored', async () => {
      const mockEntity = { id: 'entity-1', name: 'Test Entity' };
      mockPrisma.entity.findUnique.mockResolvedValue(mockEntity);

      const taskWithDeps = createMockTaskRecord({
        id: 'dep-task',
        title: 'Deploy to prod',
        dependencies: ['run-tests', 'code-review'],
      });
      mockPrisma.task.create.mockResolvedValue(taskWithDeps);

      const task = await createTask({
        title: 'Deploy to prod',
        entityId: 'entity-1',
        dependencies: ['run-tests', 'code-review'],
      });

      expect(task.dependencies).toEqual(['run-tests', 'code-review']);
      expect(mockPrisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dependencies: ['run-tests', 'code-review'],
        }),
      });
    });
  });

  // =========================================================================
  // NLP task parsing
  // =========================================================================
  describe('NLP task parsing', () => {
    it('should parse a natural language task with date, priority, and person', async () => {
      const parsed = await parseTaskFromText(
        'Call Dr. Smith tomorrow P0 #urgent'
      );

      expect(parsed.rawInput).toBe('Call Dr. Smith tomorrow P0 #urgent');
      expect(parsed.dueDate).toBeInstanceOf(Date);
      expect(parsed.priority).toBe('P0');
      expect(parsed.tags).toContain('urgent');
      expect(parsed.confidence).toBeGreaterThan(0);
    });

    it('should extract entities from structured input', () => {
      const entities = extractEntities(
        'Review contract for John Smith by Friday #legal tag:compliance P0'
      );

      const types = entities.map((e) => e.type);
      expect(types).toContain('DATE');
      expect(types).toContain('PRIORITY');
      expect(types).toContain('TAG');
      expect(types).toContain('ACTION_VERB');

      const dateEntity = entities.find((e) => e.type === 'DATE');
      expect(dateEntity).toBeDefined();
      expect(dateEntity!.normalized).toBeTruthy();

      const priorityEntity = entities.find((e) => e.type === 'PRIORITY');
      expect(priorityEntity!.normalized).toBe('P0');

      const tagEntities = entities.filter((e) => e.type === 'TAG');
      expect(tagEntities.length).toBeGreaterThanOrEqual(1);
    });

    it('should parse a task with a specific date format (MM/DD/YYYY)', async () => {
      const parsed = await parseTaskFromText('Submit report by 3/15/2026');

      expect(parsed.dueDate).toBeInstanceOf(Date);
      expect(parsed.dueDate!.getFullYear()).toBe(2026);
      expect(parsed.dueDate!.getMonth()).toBe(2);
      expect(parsed.dueDate!.getDate()).toBe(15);
    });

    it('should parse a task with relative date "in 5 days"', async () => {
      const parsed = await parseTaskFromText('Fix bug in 5 days');

      expect(parsed.dueDate).toBeInstanceOf(Date);
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 5);
      const diff = Math.abs(parsed.dueDate!.getTime() - expectedDate.getTime());
      expect(diff).toBeLessThan(2 * 24 * 60 * 60 * 1000);
    });

    it('should resolve entity references (project and assignee) from parsed input', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: 'proj-abc' });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-john' });

      const parsed = {
        title: 'Update API docs',
        projectName: 'Platform',
        assigneeName: 'John',
        confidence: 0.8,
        rawInput: 'Update API docs for Platform project assign to John',
      };

      const resolved = await resolveEntityReferences(parsed, 'entity-1');

      expect(resolved.entityId).toBe('entity-1');
      expect(resolved.projectId).toBe('proj-abc');
      expect(resolved.assigneeId).toBe('user-john');
    });

    it('should parse multiple tasks from a numbered list', async () => {
      const input = `1. Review PR tomorrow
2. Update docs by Friday
3. Fix login bug P0`;

      const tasks = await parseMultipleTasks(input);

      expect(tasks).toHaveLength(3);
      expect(tasks[0].rawInput).toContain('Review PR');
      expect(tasks[1].rawInput).toContain('Update docs');
      expect(tasks[2].rawInput).toContain('Fix login bug');
      expect(tasks[2].priority).toBe('P0');
    });

    it('should parse multiple tasks separated by "and"', async () => {
      const input = 'Review PR and update docs';

      const tasks = await parseMultipleTasks(input);

      expect(tasks).toHaveLength(2);
    });

    it('should handle unrecognized input gracefully with low confidence', async () => {
      const parsed = await parseTaskFromText('xyz');

      expect(parsed.title).toBeTruthy();
      expect(parsed.confidence).toBeLessThan(1);
      expect(parsed.rawInput).toBe('xyz');
    });
  });

  // =========================================================================
  // Task forecasting
  // =========================================================================
  describe('Task forecasting', () => {
    it('should forecast completion for a single task based on velocity', async () => {
      const task = createMockTaskRecord({
        id: 'fc-task',
        status: 'IN_PROGRESS',
        priority: 'P1',
        dependencies: [],
      });
      mockPrisma.task.findUnique.mockResolvedValue(task);
      mockPrisma.task.count.mockImplementation(() => Promise.resolve(3));

      const forecast = await forecastTaskCompletion('fc-task');

      expect(forecast.taskId).toBe('fc-task');
      expect(forecast.predictedCompletionDate).toBeInstanceOf(Date);
      expect(forecast.confidence).toBeGreaterThan(0);
      expect(forecast.velocity).toBeGreaterThanOrEqual(0);
      expect(forecast.risks).toBeInstanceOf(Array);
      expect(forecast.historicalData).toBeInstanceOf(Array);
    });

    it('should flag risk when a task is BLOCKED', async () => {
      const task = createMockTaskRecord({
        id: 'blocked-fc',
        status: 'BLOCKED',
        priority: 'P0',
        dependencies: ['other-task'],
      });
      mockPrisma.task.findUnique.mockResolvedValue(task);
      mockPrisma.task.count.mockResolvedValue(2);

      const forecast = await forecastTaskCompletion('blocked-fc');

      expect(forecast.confidence).toBeLessThanOrEqual(0.5);
      expect(forecast.risks.some((r) => r.includes('blocked'))).toBe(true);
      expect(forecast.risks.some((r) => r.includes('dependency'))).toBe(true);
    });

    it('should handle zero velocity gracefully', async () => {
      const task = createMockTaskRecord({
        id: 'zero-vel',
        status: 'TODO',
        priority: 'P2',
        dependencies: [],
      });
      mockPrisma.task.findUnique.mockResolvedValue(task);
      mockPrisma.task.count.mockResolvedValue(0);

      const forecast = await forecastTaskCompletion('zero-vel');

      expect(forecast.confidence).toBeLessThanOrEqual(0.3);
      expect(forecast.risks.some((r) => r.toLowerCase().includes('zero velocity'))).toBe(true);
    });

    it('should calculate velocity metrics over 8 weeks', async () => {
      const weeklyCounts = [2, 3, 4, 3, 5, 4, 6, 5];
      let callIdx = 0;
      mockPrisma.task.count.mockImplementation(() => {
        const val = weeklyCounts[callIdx % weeklyCounts.length];
        callIdx++;
        return Promise.resolve(val);
      });

      const velocity = await calculateVelocity('entity-1', undefined, 8);

      expect(velocity.entityId).toBe('entity-1');
      expect(velocity.weeklyData).toHaveLength(8);
      expect(velocity.currentVelocity).toBe(5);
      expect(velocity.averageVelocity).toBeGreaterThan(0);
      expect(['INCREASING', 'STABLE', 'DECREASING']).toContain(velocity.trend);
    });

    it('should detect velocity anomalies', () => {
      const metrics = {
        entityId: 'entity-1',
        currentVelocity: 1,
        averageVelocity: 5,
        trend: 'DECREASING' as const,
        weeklyData: [
          { week: '2026-01-06', completed: 5 },
          { week: '2026-01-13', completed: 6 },
          { week: '2026-01-20', completed: 5 },
          { week: '2026-01-27', completed: 4 },
          { week: '2026-02-03', completed: 5 },
          { week: '2026-02-10', completed: 6 },
          { week: '2026-02-17', completed: 10 },
          { week: '2026-02-24', completed: 1 },
        ],
      };

      const anomalies = detectVelocityAnomalies(metrics);

      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies.some((a) => a.toLowerCase().includes('drop'))).toBe(true);
    });
  });

  // =========================================================================
  // Procrastination detection
  // =========================================================================
  describe('Procrastination detection', () => {
    it('should detect tasks deferred multiple times', async () => {
      const now = new Date();
      const staleTasks = [
        createMockTaskRecord({
          id: 'procrastinated-1',
          title: 'Clean up codebase',
          status: 'TODO',
          createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
        }),
      ];

      mockPrisma.task.findMany.mockResolvedValue(staleTasks);
      mockPrisma.actionLog.count.mockResolvedValue(3);
      mockPrisma.actionLog.findFirst.mockResolvedValue({
        reason: 'Due date moved from 2026-01-01T00:00:00.000Z to 2026-01-15T00:00:00.000Z',
        timestamp: new Date('2026-01-01'),
      });

      const alerts = await detectProcrastination('entity-1');

      expect(alerts.length).toBeGreaterThan(0);
      const alert = alerts[0];
      expect(alert.taskId).toBe('procrastinated-1');
      expect(alert.deferrals).toBe(3);
      expect(alert.suggestion).toBe('BREAK_DOWN');
      expect(alert.reason).toContain('Deferred 3 times');
    });

    it('should detect stale TODO tasks with no activity', async () => {
      const now = new Date();
      const staleTasks = [
        createMockTaskRecord({
          id: 'stale-1',
          title: 'Old unused task',
          status: 'TODO',
          createdAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
        }),
      ];

      mockPrisma.task.findMany.mockResolvedValue(staleTasks);
      mockPrisma.actionLog.count.mockResolvedValue(0);
      mockPrisma.actionLog.findFirst.mockResolvedValue(null);

      const alerts = await detectProcrastination('entity-1');

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].suggestion).toBe('DELEGATE');
      expect(alerts[0].daysSinceCreation).toBeGreaterThanOrEqual(20);
    });

    it('should detect stuck IN_PROGRESS tasks', async () => {
      const now = new Date();
      const stuckTasks = [
        createMockTaskRecord({
          id: 'stuck-1',
          title: 'Half-finished feature',
          status: 'IN_PROGRESS',
          createdAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        }),
      ];

      mockPrisma.task.findMany.mockResolvedValue(stuckTasks);
      mockPrisma.actionLog.count.mockResolvedValue(0);
      mockPrisma.actionLog.findFirst.mockResolvedValue(null);

      const alerts = await detectProcrastination('entity-1');

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].suggestion).toBe('BREAK_DOWN');
      expect(alerts[0].reason).toContain('In progress');
    });

    it('should suggest ELIMINATE for tasks deferred 5+ times', async () => {
      const now = new Date();
      const hyperDeferredTasks = [
        createMockTaskRecord({
          id: 'eliminate-me',
          title: 'Never going to happen',
          status: 'TODO',
          createdAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        }),
      ];

      mockPrisma.task.findMany.mockResolvedValue(hyperDeferredTasks);
      mockPrisma.actionLog.count.mockResolvedValue(5);
      mockPrisma.actionLog.findFirst.mockResolvedValue({
        reason: 'Due date moved from 2025-12-01T00:00:00.000Z to 2025-12-15T00:00:00.000Z',
        timestamp: new Date('2025-12-01'),
      });

      const alerts = await detectProcrastination('entity-1');

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].suggestion).toBe('ELIMINATE');
      expect(alerts[0].deferrals).toBe(5);
    });

    it('should generate human-readable suggestions for each alert type', () => {
      const breakDown = getSuggestion({
        taskId: 't1',
        taskTitle: 'Big project',
        deferrals: 3,
        daysSinceCreation: 14,
        suggestion: 'BREAK_DOWN',
        reason: '',
      });
      expect(breakDown).toContain('Big project');
      expect(breakDown).toContain('subtasks');

      const delegate = getSuggestion({
        taskId: 't2',
        taskTitle: 'Old task',
        deferrals: 0,
        daysSinceCreation: 30,
        suggestion: 'DELEGATE',
        reason: '',
      });
      expect(delegate).toContain('delegating');
      expect(delegate).toContain('30 days');

      const eliminate = getSuggestion({
        taskId: 't3',
        taskTitle: 'Dead task',
        deferrals: 6,
        daysSinceCreation: 90,
        suggestion: 'ELIMINATE',
        reason: '',
      });
      expect(eliminate).toContain('6 times');

      const scheduleNow = getSuggestion({
        taskId: 't4',
        taskTitle: 'Urgent task',
        deferrals: 2,
        daysSinceCreation: 7,
        suggestion: 'SCHEDULE_NOW',
        reason: '',
      });
      expect(scheduleNow).toContain('Block 90 minutes');
    });

    it('should retrieve deferral history for a task', async () => {
      mockPrisma.actionLog.findMany.mockResolvedValue([
        {
          timestamp: new Date('2026-01-10'),
          reason: 'Due date moved from 2026-01-15T00:00:00.000Z to 2026-01-22T00:00:00.000Z',
        },
        {
          timestamp: new Date('2026-01-22'),
          reason: 'Due date moved from 2026-01-22T00:00:00.000Z to 2026-02-01T00:00:00.000Z',
        },
      ]);

      const history = await getTaskDeferralHistory('deferred-task');

      expect(history).toHaveLength(2);
      expect(history[0].date).toEqual(new Date('2026-01-10'));
      expect(history[0].oldDueDate).toEqual(new Date('2026-01-15T00:00:00.000Z'));
      expect(history[0].newDueDate).toEqual(new Date('2026-01-22T00:00:00.000Z'));
      expect(history[1].oldDueDate).toEqual(new Date('2026-01-22T00:00:00.000Z'));
    });
  });

  // =========================================================================
  // Cross-module: NLP parse -> create -> score -> forecast
  // =========================================================================
  describe('Cross-module flow: NLP parse -> create -> score -> forecast', () => {
    it('should parse a natural language input, create the task, score it, and forecast completion', async () => {
      // Step 1: Parse
      const parsed = await parseTaskFromText('Prepare investor pitch tomorrow P0 #fundraising');

      expect(parsed.title).toBeTruthy();
      expect(parsed.priority).toBe('P0');
      expect(parsed.dueDate).toBeInstanceOf(Date);

      // Step 2: Create
      const mockEntity = { id: 'entity-1', name: 'Startup', complianceProfile: [] };
      mockPrisma.entity.findUnique.mockResolvedValue(mockEntity);
      const taskRecord = createMockTaskRecord({
        id: 'nlp-task',
        title: parsed.title,
        priority: parsed.priority ?? 'P1',
        dueDate: parsed.dueDate,
        status: 'TODO',
        tags: parsed.tags ?? [],
      });
      mockPrisma.task.create.mockResolvedValue(taskRecord);

      const task = await createTask({
        title: parsed.title,
        entityId: 'entity-1',
        priority: parsed.priority,
        dueDate: parsed.dueDate,
        tags: parsed.tags,
      });

      expect(task.id).toBe('nlp-task');

      // Step 3: Score
      mockPrisma.financialRecord.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]);

      const score = await scoreTask(
        createMockTask({ ...task, dueDate: parsed.dueDate }),
        'entity-1'
      );

      expect(score.taskId).toBe('nlp-task');
      expect(score.overallScore).toBeGreaterThan(0);
      expect(score.quadrant).toBeDefined();

      // Step 4: Forecast
      mockPrisma.task.findUnique.mockResolvedValue(taskRecord);
      mockPrisma.task.count.mockResolvedValue(4);

      const forecast = await forecastTaskCompletion('nlp-task');

      expect(forecast.taskId).toBe('nlp-task');
      expect(forecast.predictedCompletionDate).toBeInstanceOf(Date);
    });
  });
});
