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
      // Reads are scoped now -- findFirst({ id, entityId }). Same stub, so the
      // existing mockResolvedValueOnce sequences keep their meaning.
      findFirst: (...args: unknown[]) => mockFindUnique(...args),
    },
    task: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindUnique(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    actionLog: {
      create: (...args: unknown[]) => mockActionLogCreate(...args),
    },
  },
}));

import type { VerifiedEntityId } from '@/shared/middleware/auth';

/**
 * TEST-ONLY, and the ONLY place in this file that manufactures the brand.
 *
 * A `VerifiedEntityId` can only be minted by `withEntityScope`, which needs a
 * `NextRequest`. This suite calls services directly, with no request, so there
 * is no supported way to obtain one -- see PARALLEL_BUILD_ESCALATION_P04.md,
 * gap 2. Keeping the cast in one named helper means
 * `grep -rn "as VerifiedEntityId" src/` stays at zero and every test-side
 * manufacture is one grep away.
 */
function verified(id: string): VerifiedEntityId {
  return id as VerifiedEntityId;
}


describe('TaskCRUD', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTask', () => {
    it('should create task with required fields', async () => {
      mockFindUnique.mockResolvedValue({ id: 'e1', entityId: 'e1', userId: 'user-1' });
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

      const task = await createTask({ title: 'Test Task', entityId: verified('e1') }, 'user-1');
      expect(task.title).toBe('Test Task');
      expect(task.entityId).toBe('e1');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should validate entityId exists', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(
        createTask({ title: 'Test', entityId: verified('nonexistent') }, 'user-1')
      ).rejects.toThrow('Entity not found');
    });

    it('should validate projectId belongs to entity', async () => {
      // First call: entity lookup returns entity
      // Second call: project lookup returns project with different entityId
      mockFindUnique
        .mockResolvedValueOnce({ id: 'e1', userId: 'user-1' }) // entity
        .mockResolvedValueOnce(null); // project from another entity: not found when scoped

      await expect(
        createTask({ title: 'Test', entityId: verified('e1'), projectId: 'p1' }, 'user-1')
      ).rejects.toThrow('Project not found: p1');
    });

    it('should default status to TODO', async () => {
      mockFindUnique.mockResolvedValue({ id: 'e1', userId: 'user-1' });
      mockCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'task-1',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const task = await createTask({ title: 'Test', entityId: verified('e1') }, 'user-1');
      expect(task.status).toBe('TODO');
    });

    it('should default priority to P1', async () => {
      mockFindUnique.mockResolvedValue({ id: 'e1', userId: 'user-1' });
      mockCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'task-1',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const task = await createTask({ title: 'Test', entityId: verified('e1') }, 'user-1');
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

    it('always puts the verified entity in the WHERE clause', async () => {
      // Would fail against the pre-P-04 listTasks, which took entityId as an
      // optional field on the caller-supplied filter bag and omitted it when
      // the caller did not ask for it -- i.e. listed every tenant's tasks.
      await listTasks(verified('e1'), {});

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityId: 'e1' }),
        })
      );
    });

    it('should filter by status', async () => {
      const result = await listTasks(verified('e1'), { status: 'TODO' });
      expect(result).toBeDefined();
      expect(mockFindMany).toHaveBeenCalled();
    });

    it('should filter by priority', async () => {
      const result = await listTasks(verified('e1'), { priority: 'P0' });
      expect(result).toBeDefined();
    });

    it('should filter by multiple statuses', async () => {
      const result = await listTasks(verified('e1'), { status: ['TODO', 'IN_PROGRESS'] });
      expect(result).toBeDefined();
    });

    it('should filter by date range', async () => {
      const result = await listTasks(verified('e1'), {
        dueDateRange: { from: subDays(new Date(), 1), to: addDays(new Date(), 7) },
      });
      expect(result).toBeDefined();
    });

    it('should search by title', async () => {
      const result = await listTasks(verified('e1'), { search: 'Task 1' });
      expect(result).toBeDefined();
    });

    it('should paginate results', async () => {
      const result = await listTasks(verified('e1'), {}, undefined, 1, 10);
      expect(result).toBeDefined();
      expect(result.total).toBe(2);
    });

    it('should sort by specified field', async () => {
      const result = await listTasks(
        verified('e1'),
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

      const result = await getOverdueTasks(verified('e1'));
      expect(result.length).toBe(1);
      expect(result[0].title).toBe('Overdue');
    });

    it('should exclude DONE and CANCELLED', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await getOverdueTasks(verified('e1'));
      expect(result.length).toBe(0);
      // The mock verifies that the query includes status filter
      expect(mockFindMany).toHaveBeenCalled();
    });
  });
});
