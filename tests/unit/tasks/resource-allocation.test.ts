import {
  getResourceAllocation,
  detectOvercommitment,
  suggestRebalancing,
} from '@/modules/tasks/services/resource-allocation';

// --- Mocks ---

const mockTaskFindMany = jest.fn();
const mockUserFindUnique = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findMany: (...args: unknown[]) => mockTaskFindMany(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

// --- Tests ---

describe('ResourceAllocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getResourceAllocation', () => {
    it('should return empty array when no tasks exist', async () => {
      mockTaskFindMany.mockResolvedValue([]);

      const result = await getResourceAllocation('entity-1');

      expect(result).toEqual([]);
    });

    it('should group tasks by assignee and calculate allocation', async () => {
      mockTaskFindMany.mockResolvedValue([
        { id: 't1', title: 'Task 1', priority: 'P0', status: 'TODO', assigneeId: 'user-1' },
        { id: 't2', title: 'Task 2', priority: 'P1', status: 'IN_PROGRESS', assigneeId: 'user-1' },
        { id: 't3', title: 'Task 3', priority: 'P2', status: 'TODO', assigneeId: 'user-2' },
      ]);

      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'user-1', name: 'Alice' })
        .mockResolvedValueOnce({ id: 'user-2', name: 'Bob' });

      const result = await getResourceAllocation('entity-1');

      expect(result).toHaveLength(2);

      // Find allocations by user
      const alice = result.find((a) => a.userId === 'user-1')!;
      const bob = result.find((a) => a.userId === 'user-2')!;

      // Alice: P0 (4h) + P1 (2h) = 6h
      expect(alice.userName).toBe('Alice');
      expect(alice.allocatedHours).toBe(6);
      expect(alice.totalCapacityHours).toBe(40);
      expect(alice.utilizationPercent).toBe(15); // 6/40 = 15%
      expect(alice.isOvercommitted).toBe(false);
      expect(alice.tasks).toHaveLength(2);

      // Bob: P2 (1h) = 1h
      expect(bob.userName).toBe('Bob');
      expect(bob.allocatedHours).toBe(1);
      expect(bob.isOvercommitted).toBe(false);
    });

    it('should detect overcommitment when hours exceed 40h capacity', async () => {
      // Create enough P0 tasks to exceed 40h: 11 P0 tasks * 4h = 44h
      const tasks = Array.from({ length: 11 }, (_, i) => ({
        id: `t${i}`,
        title: `Task ${i}`,
        priority: 'P0',
        status: 'TODO',
        assigneeId: 'user-1',
      }));

      mockTaskFindMany.mockResolvedValue(tasks);
      mockUserFindUnique.mockResolvedValue({ id: 'user-1', name: 'Alice' });

      const result = await getResourceAllocation('entity-1');

      expect(result).toHaveLength(1);
      expect(result[0].isOvercommitted).toBe(true);
      expect(result[0].allocatedHours).toBe(44); // 11 * 4h
      expect(result[0].overcommitmentHours).toBe(4); // 44 - 40
      expect(result[0].utilizationPercent).toBe(110); // 44/40 = 110%
    });

    it('should sort allocations by utilization descending', async () => {
      mockTaskFindMany.mockResolvedValue([
        { id: 't1', title: 'Task 1', priority: 'P2', status: 'TODO', assigneeId: 'user-low' },
        { id: 't2', title: 'Task 2', priority: 'P0', status: 'TODO', assigneeId: 'user-high' },
        { id: 't3', title: 'Task 3', priority: 'P0', status: 'TODO', assigneeId: 'user-high' },
      ]);

      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'user-high', name: 'High' })
        .mockResolvedValueOnce({ id: 'user-low', name: 'Low' });

      const result = await getResourceAllocation('entity-1');

      // user-high: 2 * 4h = 8h (20%), user-low: 1h (3%)
      expect(result[0].userId).toBe('user-high');
      expect(result[1].userId).toBe('user-low');
    });
  });

  describe('detectOvercommitment', () => {
    it('should return only overcommitted users', async () => {
      // 11 P0 tasks = 44h (overcommitted) for user-1
      // 1 P2 task = 1h (not overcommitted) for user-2
      const tasks = [
        ...Array.from({ length: 11 }, (_, i) => ({
          id: `t-over-${i}`,
          title: `Over Task ${i}`,
          priority: 'P0',
          status: 'TODO',
          assigneeId: 'user-over',
        })),
        { id: 't-under', title: 'Under Task', priority: 'P2', status: 'TODO', assigneeId: 'user-under' },
      ];

      mockTaskFindMany.mockResolvedValue(tasks);
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'user-over', name: 'Overloaded' })
        .mockResolvedValueOnce({ id: 'user-under', name: 'Underloaded' });

      const result = await detectOvercommitment('entity-1');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-over');
      expect(result[0].isOvercommitted).toBe(true);
    });

    it('should return empty array when no one is overcommitted', async () => {
      mockTaskFindMany.mockResolvedValue([
        { id: 't1', title: 'Task 1', priority: 'P2', status: 'TODO', assigneeId: 'user-1' },
      ]);
      mockUserFindUnique.mockResolvedValue({ id: 'user-1', name: 'Alice' });

      const result = await detectOvercommitment('entity-1');

      expect(result).toEqual([]);
    });
  });

  describe('suggestRebalancing', () => {
    it('should suggest moving tasks from overcommitted to underutilized users', async () => {
      const tasks = [
        // user-over: 11 P0 tasks (44h) + 1 P2 task (1h) = 45h -- overcommitted
        ...Array.from({ length: 11 }, (_, i) => ({
          id: `t-p0-${i}`,
          title: `P0 Task ${i}`,
          priority: 'P0',
          status: 'TODO',
          assigneeId: 'user-over',
        })),
        { id: 't-p2-movable', title: 'Movable P2', priority: 'P2', status: 'TODO', assigneeId: 'user-over' },
        // user-under: 1 P2 task (1h) = 1h -- underutilized
        { id: 't-under', title: 'Under Task', priority: 'P2', status: 'TODO', assigneeId: 'user-under' },
      ];

      mockTaskFindMany.mockResolvedValue(tasks);
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'user-over', name: 'Overloaded' })
        .mockResolvedValueOnce({ id: 'user-under', name: 'Free' });

      const suggestions = await suggestRebalancing('entity-1');

      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      // The P2 task (1h, <= 2h) should be suggested for move
      const moveSuggestion = suggestions.find((s) => s.taskId === 't-p2-movable');
      expect(moveSuggestion).toBeDefined();
      expect(moveSuggestion!.fromUserId).toBe('user-over');
      expect(moveSuggestion!.toUserId).toBe('user-under');
    });
  });
});
