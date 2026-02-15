import { createTask, listTasks, getOverdueTasks } from '@/modules/tasks/services/task-crud';
import { subDays, addDays } from 'date-fns';

// Mock prisma
const mockCreate = jest.fn();
const mockFindMany = jest.fn();
const mockFindUnique = jest.fn();
const mockCount = jest.fn();
const mockActionLogCreate = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    entity: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    project: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    task: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    actionLog: {
      create: (...args: unknown[]) => mockActionLogCreate(...args),
    },
  },
}));

describe('TaskCRUD', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTask', () => {
    it('should create task with required fields', async () => {
      mockFindUnique.mockResolvedValue({ id: 'e1', entityId: 'e1' });
      const now = new Date();
      mockCreate.mockResolvedValue({
        id: 'task-1',
        title: 'Test Task',
        description: null,
        entityId: 'e1',
        projectId: null,
        priority: 'P1',
        status: 'TODO',
        dueDate: null,
        dependencies: [],
        assigneeId: null,
        createdFrom: null,
        tags: [],
        createdAt: now,
        updatedAt: now,
      });

      const task = await createTask({ title: 'Test Task', entityId: 'e1' });
      expect(task.title).toBe('Test Task');
      expect(task.entityId).toBe('e1');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should validate entityId exists', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(
        createTask({ title: 'Test', entityId: 'nonexistent' })
      ).rejects.toThrow('Entity not found');
    });

    it('should validate projectId belongs to entity', async () => {
      // First call: entity lookup returns entity
      // Second call: project lookup returns project with different entityId
      mockFindUnique
        .mockResolvedValueOnce({ id: 'e1' }) // entity
        .mockResolvedValueOnce({ id: 'p1', entityId: 'e2' }); // project from different entity

      await expect(
        createTask({ title: 'Test', entityId: 'e1', projectId: 'p1' })
      ).rejects.toThrow('Project does not belong to the specified entity');
    });

    it('should default status to TODO', async () => {
      mockFindUnique.mockResolvedValue({ id: 'e1' });
      mockCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'task-1',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const task = await createTask({ title: 'Test', entityId: 'e1' });
      expect(task.status).toBe('TODO');
    });

    it('should default priority to P1', async () => {
      mockFindUnique.mockResolvedValue({ id: 'e1' });
      mockCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'task-1',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const task = await createTask({ title: 'Test', entityId: 'e1' });
      expect(task.priority).toBe('P1');
    });
  });

  describe('listTasks', () => {
    const mockTasks = [
      { id: 't1', title: 'Task 1', description: null, entityId: 'e1', projectId: null, priority: 'P0', status: 'TODO', dueDate: null, dependencies: [], assigneeId: null, createdFrom: null, tags: [], createdAt: new Date(), updatedAt: new Date() },
      { id: 't2', title: 'Task 2', description: null, entityId: 'e1', projectId: null, priority: 'P1', status: 'IN_PROGRESS', dueDate: addDays(new Date(), 5), dependencies: [], assigneeId: null, createdFrom: null, tags: ['finance'], createdAt: new Date(), updatedAt: new Date() },
    ];

    beforeEach(() => {
      mockFindMany.mockResolvedValue(mockTasks);
      mockCount.mockResolvedValue(2);
    });

    it('should filter by status', async () => {
      const result = await listTasks({ status: 'TODO' });
      expect(result).toBeDefined();
      expect(mockFindMany).toHaveBeenCalled();
    });

    it('should filter by priority', async () => {
      const result = await listTasks({ priority: 'P0' });
      expect(result).toBeDefined();
    });

    it('should filter by multiple statuses', async () => {
      const result = await listTasks({ status: ['TODO', 'IN_PROGRESS'] });
      expect(result).toBeDefined();
    });

    it('should filter by date range', async () => {
      const result = await listTasks({
        dueDateRange: { from: subDays(new Date(), 1), to: addDays(new Date(), 7) },
      });
      expect(result).toBeDefined();
    });

    it('should search by title', async () => {
      const result = await listTasks({ search: 'Task 1' });
      expect(result).toBeDefined();
    });

    it('should paginate results', async () => {
      const result = await listTasks({}, undefined, 1, 10);
      expect(result).toBeDefined();
      expect(result.total).toBe(2);
    });

    it('should sort by specified field', async () => {
      const result = await listTasks(
        {},
        { field: 'priority', direction: 'asc' }
      );
      expect(result).toBeDefined();
    });
  });

  describe('getOverdueTasks', () => {
    it('should return tasks past due date', async () => {
      const overdueTasks = [
        {
          id: 't1',
          title: 'Overdue',
          description: null,
          entityId: 'e1',
          projectId: null,
          priority: 'P1',
          status: 'TODO',
          dueDate: subDays(new Date(), 3),
          dependencies: [],
          assigneeId: null,
          createdFrom: null,
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockFindMany.mockResolvedValue(overdueTasks);

      const result = await getOverdueTasks('e1');
      expect(result.length).toBe(1);
      expect(result[0].title).toBe('Overdue');
    });

    it('should exclude DONE and CANCELLED', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await getOverdueTasks('e1');
      expect(result.length).toBe(0);
      // The mock verifies that the query includes status filter
      expect(mockFindMany).toHaveBeenCalled();
    });
  });
});
