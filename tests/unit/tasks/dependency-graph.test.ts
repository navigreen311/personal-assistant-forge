import {
  buildDependencyGraph,
  findCriticalPathFromGraph,
  findBottlenecksFromGraph,
  detectCircularDependencies,
} from '@/modules/tasks/services/dependency-graph';

// Mock prisma
const mockFindMany = jest.fn();
const mockFindUnique = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

const createMockPrismaTask = (id: string, title: string, dependencies: string[] = []) => ({
  id,
  title,
  description: null,
  entityId: 'entity-1',
  projectId: 'project-1',
  priority: 'P1',
  status: 'TODO',
  dueDate: null,
  dependencies,
  assigneeId: null,
  createdFrom: null,
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('DependencyGraph', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildDependencyGraph', () => {
    it('should build graph with correct nodes and edges', async () => {
      mockFindMany.mockResolvedValue([
        createMockPrismaTask('t1', 'Task 1'),
        createMockPrismaTask('t2', 'Task 2', ['t1']),
        createMockPrismaTask('t3', 'Task 3', ['t1']),
      ]);

      const graph = await buildDependencyGraph('project-1');

      expect(graph.nodes.length).toBe(3);
      expect(graph.edges.length).toBe(2);
      expect(graph.edges[0].fromTaskId).toBe('t1');
    });

    it('should calculate node depth from root', async () => {
      mockFindMany.mockResolvedValue([
        createMockPrismaTask('t1', 'Root'),
        createMockPrismaTask('t2', 'Level 1', ['t1']),
        createMockPrismaTask('t3', 'Level 2', ['t2']),
      ]);

      const graph = await buildDependencyGraph('project-1');

      const rootNode = graph.nodes.find((n) => n.taskId === 't1');
      const level1Node = graph.nodes.find((n) => n.taskId === 't2');
      const level2Node = graph.nodes.find((n) => n.taskId === 't3');

      expect(rootNode!.depth).toBe(0);
      expect(level1Node!.depth).toBe(1);
      expect(level2Node!.depth).toBe(2);
    });

    it('should calculate blockedByCount and blockingCount', async () => {
      mockFindMany.mockResolvedValue([
        createMockPrismaTask('t1', 'Root'),
        createMockPrismaTask('t2', 'Middle', ['t1']),
        createMockPrismaTask('t3', 'Leaf 1', ['t2']),
        createMockPrismaTask('t4', 'Leaf 2', ['t2']),
      ]);

      const graph = await buildDependencyGraph('project-1');

      const rootNode = graph.nodes.find((n) => n.taskId === 't1');
      const middleNode = graph.nodes.find((n) => n.taskId === 't2');

      expect(rootNode!.blockedByCount).toBe(0);
      expect(rootNode!.blockingCount).toBe(1);
      expect(middleNode!.blockedByCount).toBe(1);
      expect(middleNode!.blockingCount).toBe(2);
    });
  });

  describe('findCriticalPath', () => {
    it('should find longest dependency chain', () => {
      const graph = {
        nodes: [
          { taskId: 't1', taskTitle: 'A', status: 'TODO', priority: 'P1', depth: 0, blockedByCount: 0, blockingCount: 1, isCriticalPath: true, isBottleneck: false, position: { x: 0, y: 0 } },
          { taskId: 't2', taskTitle: 'B', status: 'TODO', priority: 'P1', depth: 1, blockedByCount: 1, blockingCount: 1, isCriticalPath: true, isBottleneck: false, position: { x: 200, y: 0 } },
          { taskId: 't3', taskTitle: 'C', status: 'TODO', priority: 'P1', depth: 2, blockedByCount: 1, blockingCount: 0, isCriticalPath: true, isBottleneck: false, position: { x: 400, y: 0 } },
        ],
        edges: [
          { fromTaskId: 't1', toTaskId: 't2', type: 'BLOCKS' as const },
          { fromTaskId: 't2', toTaskId: 't3', type: 'BLOCKS' as const },
        ],
        criticalPath: ['t1', 't2', 't3'],
        bottlenecks: [],
      };

      const path = findCriticalPathFromGraph(graph);
      expect(path.length).toBe(3);
    });

    it('should handle tasks with no dependencies', () => {
      const graph = {
        nodes: [
          { taskId: 't1', taskTitle: 'Solo', status: 'TODO', priority: 'P1', depth: 0, blockedByCount: 0, blockingCount: 0, isCriticalPath: false, isBottleneck: false, position: { x: 0, y: 0 } },
        ],
        edges: [],
        criticalPath: [],
        bottlenecks: [],
      };

      const path = findCriticalPathFromGraph(graph);
      expect(path.length).toBe(1);
    });

    it('should handle parallel branches', () => {
      const graph = {
        nodes: [
          { taskId: 't1', taskTitle: 'Root', status: 'TODO', priority: 'P1', depth: 0, blockedByCount: 0, blockingCount: 2, isCriticalPath: true, isBottleneck: true, position: { x: 0, y: 0 } },
          { taskId: 't2', taskTitle: 'Branch A', status: 'TODO', priority: 'P1', depth: 1, blockedByCount: 1, blockingCount: 0, isCriticalPath: false, isBottleneck: false, position: { x: 200, y: -50 } },
          { taskId: 't3', taskTitle: 'Branch B', status: 'TODO', priority: 'P1', depth: 1, blockedByCount: 1, blockingCount: 1, isCriticalPath: true, isBottleneck: false, position: { x: 200, y: 50 } },
          { taskId: 't4', taskTitle: 'Branch B2', status: 'TODO', priority: 'P1', depth: 2, blockedByCount: 1, blockingCount: 0, isCriticalPath: true, isBottleneck: false, position: { x: 400, y: 50 } },
        ],
        edges: [
          { fromTaskId: 't1', toTaskId: 't2', type: 'BLOCKS' as const },
          { fromTaskId: 't1', toTaskId: 't3', type: 'BLOCKS' as const },
          { fromTaskId: 't3', toTaskId: 't4', type: 'BLOCKS' as const },
        ],
        criticalPath: ['t1', 't3', 't4'],
        bottlenecks: ['t1'],
      };

      const path = findCriticalPathFromGraph(graph);
      // Should find the longer branch (t1 -> t3 -> t4)
      expect(path.length).toBe(3);
    });
  });

  describe('findBottlenecks', () => {
    it('should identify tasks blocking the most downstream tasks', () => {
      const graph = {
        nodes: [
          { taskId: 't1', taskTitle: 'Root', status: 'TODO', priority: 'P1', depth: 0, blockedByCount: 0, blockingCount: 3, isCriticalPath: true, isBottleneck: true, position: { x: 0, y: 0 } },
          { taskId: 't2', taskTitle: 'B', status: 'TODO', priority: 'P1', depth: 1, blockedByCount: 1, blockingCount: 1, isCriticalPath: false, isBottleneck: false, position: { x: 200, y: 0 } },
          { taskId: 't3', taskTitle: 'C', status: 'TODO', priority: 'P1', depth: 1, blockedByCount: 1, blockingCount: 0, isCriticalPath: false, isBottleneck: false, position: { x: 200, y: 50 } },
        ],
        edges: [],
        criticalPath: [],
        bottlenecks: ['t1'],
      };

      const bottlenecks = findBottlenecksFromGraph(graph);
      expect(bottlenecks[0]).toBe('t1');
    });

    it('should return empty array when no dependencies', () => {
      const graph = {
        nodes: [
          { taskId: 't1', taskTitle: 'A', status: 'TODO', priority: 'P1', depth: 0, blockedByCount: 0, blockingCount: 0, isCriticalPath: false, isBottleneck: false, position: { x: 0, y: 0 } },
        ],
        edges: [],
        criticalPath: [],
        bottlenecks: [],
      };

      const bottlenecks = findBottlenecksFromGraph(graph);
      expect(bottlenecks.length).toBe(0);
    });
  });

  describe('detectCircularDependencies', () => {
    it('should detect simple A->B->A cycle', () => {
      const tasks = [
        { id: 'a', dependencies: ['b'] },
        { id: 'b', dependencies: ['a'] },
      ];

      const cycles = detectCircularDependencies(tasks);
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should detect complex A->B->C->A cycle', () => {
      const tasks = [
        { id: 'a', dependencies: ['c'] },
        { id: 'b', dependencies: ['a'] },
        { id: 'c', dependencies: ['b'] },
      ];

      const cycles = detectCircularDependencies(tasks);
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should return empty array when no cycles', () => {
      const tasks = [
        { id: 'a', dependencies: [] },
        { id: 'b', dependencies: ['a'] },
        { id: 'c', dependencies: ['b'] },
      ];

      const cycles = detectCircularDependencies(tasks);
      expect(cycles.length).toBe(0);
    });
  });
});
