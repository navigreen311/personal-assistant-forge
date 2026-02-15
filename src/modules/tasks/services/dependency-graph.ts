import { prisma } from '@/lib/db';
import type { Task } from '@/shared/types';
import type { DependencyGraph, DependencyNode, DependencyEdge } from '../types';

export async function buildDependencyGraph(projectId: string): Promise<DependencyGraph> {
  const tasks = await prisma.task.findMany({
    where: { projectId },
  });

  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // Build nodes
  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];

  // Build adjacency lists
  const blockedBy = new Map<string, string[]>(); // taskId -> tasks that block it
  const blocking = new Map<string, string[]>();   // taskId -> tasks it blocks

  for (const task of tasks) {
    blockedBy.set(task.id, []);
    blocking.set(task.id, []);
  }

  for (const task of tasks) {
    for (const depId of task.dependencies) {
      if (taskMap.has(depId)) {
        blockedBy.get(task.id)!.push(depId);
        blocking.get(depId)!.push(task.id);
        edges.push({
          fromTaskId: depId,
          toTaskId: task.id,
          type: 'BLOCKS',
        });
      }
    }
  }

  // Calculate depths via topological sort
  const depths = calculateDepths(tasks, blockedBy);

  // Find critical path
  const criticalPath = findCriticalPath({ nodes: [], edges, criticalPath: [], bottlenecks: [] }, tasks, blockedBy, blocking);

  // Find bottlenecks
  const bottlenecks = findBottlenecksFromMaps(blocking);

  const criticalPathSet = new Set(criticalPath);
  const bottleneckSet = new Set(bottlenecks);

  // Layout positions
  const depthGroups = new Map<number, string[]>();
  for (const [taskId, depth] of depths) {
    if (!depthGroups.has(depth)) depthGroups.set(depth, []);
    depthGroups.get(depth)!.push(taskId);
  }

  for (const task of tasks) {
    const depth = depths.get(task.id) ?? 0;
    const depthTasks = depthGroups.get(depth) ?? [];
    const indexInDepth = depthTasks.indexOf(task.id);

    nodes.push({
      taskId: task.id,
      taskTitle: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ?? undefined,
      depth,
      blockedByCount: (blockedBy.get(task.id) ?? []).length,
      blockingCount: (blocking.get(task.id) ?? []).length,
      isCriticalPath: criticalPathSet.has(task.id),
      isBottleneck: bottleneckSet.has(task.id),
      position: {
        x: depth * 250,
        y: indexInDepth * 120,
      },
    });
  }

  return { nodes, edges, criticalPath, bottlenecks };
}

export function findCriticalPathFromGraph(graph: DependencyGraph): string[] {
  if (graph.nodes.length === 0) return [];

  // Find the longest path through the dependency graph
  const adjList = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjList.set(node.taskId, []);
  }
  for (const edge of graph.edges) {
    adjList.get(edge.fromTaskId)?.push(edge.toTaskId);
  }

  // Find all roots (nodes with no incoming edges)
  const hasIncoming = new Set(graph.edges.map((e) => e.toTaskId));
  const roots = graph.nodes
    .filter((n) => !hasIncoming.has(n.taskId))
    .map((n) => n.taskId);

  let longestPath: string[] = [];

  function dfs(nodeId: string, currentPath: string[]): void {
    currentPath.push(nodeId);
    const neighbors = adjList.get(nodeId) ?? [];

    if (neighbors.length === 0) {
      if (currentPath.length > longestPath.length) {
        longestPath = [...currentPath];
      }
    } else {
      for (const neighbor of neighbors) {
        dfs(neighbor, currentPath);
      }
    }
    currentPath.pop();
  }

  for (const root of roots) {
    dfs(root, []);
  }

  // If no roots found (all have dependencies), start from any node
  if (longestPath.length === 0 && graph.nodes.length > 0) {
    dfs(graph.nodes[0].taskId, []);
  }

  return longestPath;
}

export function findBottlenecksFromGraph(graph: DependencyGraph): string[] {
  return graph.nodes
    .filter((n) => n.blockingCount > 0)
    .sort((a, b) => b.blockingCount - a.blockingCount)
    .map((n) => n.taskId);
}

export function detectCircularDependencies(
  tasks: Array<{ id: string; dependencies: string[] }>
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  const adjList = new Map<string, string[]>();
  for (const task of tasks) {
    adjList.set(task.id, task.dependencies.filter((d) =>
      tasks.some((t) => t.id === d)
    ));
  }

  function dfs(nodeId: string): void {
    visited.add(nodeId);
    recStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adjList.get(nodeId) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);
          cycles.push([...cycle]);
        }
      }
    }

    path.pop();
    recStack.delete(nodeId);
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      dfs(task.id);
    }
  }

  return cycles;
}

export async function getBlockingChain(taskId: string): Promise<Task[]> {
  const chain: Task[] = [];
  const visited = new Set<string>();

  async function traceBlockers(currentId: string): Promise<void> {
    if (visited.has(currentId)) return;
    visited.add(currentId);

    const task = await prisma.task.findUnique({ where: { id: currentId } });
    if (!task) return;

    for (const depId of task.dependencies) {
      const blocker = await prisma.task.findUnique({ where: { id: depId } });
      if (blocker && blocker.status !== 'DONE' && blocker.status !== 'CANCELLED') {
        chain.push(mapPrismaTask(blocker));
        await traceBlockers(depId);
      }
    }
  }

  await traceBlockers(taskId);
  return chain;
}

export async function getDownstreamTasks(taskId: string): Promise<Task[]> {
  const downstream: Task[] = [];
  const visited = new Set<string>();

  async function traceDownstream(currentId: string): Promise<void> {
    if (visited.has(currentId)) return;
    visited.add(currentId);

    const dependents = await prisma.task.findMany({
      where: { dependencies: { has: currentId } },
    });

    for (const dep of dependents) {
      if (!visited.has(dep.id)) {
        downstream.push(mapPrismaTask(dep));
        await traceDownstream(dep.id);
      }
    }
  }

  await traceDownstream(taskId);
  return downstream;
}

export async function suggestDependencyResolution(blockedTaskId: string): Promise<string> {
  const task = await prisma.task.findUnique({ where: { id: blockedTaskId } });
  if (!task) return 'Task not found.';

  const blockers: Array<{ id: string; title: string; status: string; assigneeId: string | null }> = [];

  for (const depId of task.dependencies) {
    const blocker = await prisma.task.findUnique({ where: { id: depId } });
    if (blocker && blocker.status !== 'DONE' && blocker.status !== 'CANCELLED') {
      blockers.push(blocker);
    }
  }

  if (blockers.length === 0) {
    return 'No active blockers found. Consider changing status from BLOCKED.';
  }

  const suggestions: string[] = [];

  for (const blocker of blockers) {
    if (blocker.status === 'TODO') {
      suggestions.push(`Start working on "${blocker.title}" (currently TODO).`);
    } else if (blocker.status === 'IN_PROGRESS') {
      suggestions.push(`"${blocker.title}" is in progress. Follow up with assignee.`);
    } else if (blocker.status === 'BLOCKED') {
      suggestions.push(`"${blocker.title}" is also blocked. Escalate or break the dependency.`);
    }

    if (!blocker.assigneeId) {
      suggestions.push(`Assign "${blocker.title}" to someone to unblock progress.`);
    }
  }

  suggestions.push(`Alternative: Remove dependency on blockers if "${task.title}" can proceed independently.`);

  return suggestions.join('\n');
}

// --- Internal helpers ---

function calculateDepths(
  tasks: Array<{ id: string; dependencies: string[] }>,
  blockedBy: Map<string, string[]>
): Map<string, number> {
  const depths = new Map<string, number>();
  const taskSet = new Set(tasks.map((t) => t.id));

  function getDepth(taskId: string, visited: Set<string>): number {
    if (depths.has(taskId)) return depths.get(taskId)!;
    if (visited.has(taskId)) return 0; // circular dep guard

    visited.add(taskId);
    const deps = (blockedBy.get(taskId) ?? []).filter((d) => taskSet.has(d));

    if (deps.length === 0) {
      depths.set(taskId, 0);
      return 0;
    }

    const maxDepth = Math.max(...deps.map((d) => getDepth(d, visited)));
    const depth = maxDepth + 1;
    depths.set(taskId, depth);
    return depth;
  }

  for (const task of tasks) {
    if (!depths.has(task.id)) {
      getDepth(task.id, new Set());
    }
  }

  return depths;
}

function findCriticalPath(
  _graph: DependencyGraph,
  tasks: Array<{ id: string; dependencies: string[]; dueDate: Date | null; status: string }>,
  blockedBy: Map<string, string[]>,
  blocking: Map<string, string[]>
): string[] {
  const taskSet = new Set(tasks.map((t) => t.id));

  // Find leaf nodes (no downstream tasks)
  const leaves = tasks.filter((t) => {
    const downstream = (blocking.get(t.id) ?? []).filter((d) => taskSet.has(d));
    return downstream.length === 0;
  });

  let longestPath: string[] = [];

  function tracePath(taskId: string, currentPath: string[], visited: Set<string>): void {
    if (visited.has(taskId)) return;
    visited.add(taskId);
    currentPath.push(taskId);

    const deps = (blockedBy.get(taskId) ?? []).filter((d) => taskSet.has(d));
    if (deps.length === 0) {
      if (currentPath.length > longestPath.length) {
        longestPath = [...currentPath].reverse();
      }
    } else {
      for (const dep of deps) {
        tracePath(dep, currentPath, visited);
      }
    }

    currentPath.pop();
    visited.delete(taskId);
  }

  for (const leaf of leaves) {
    tracePath(leaf.id, [], new Set());
  }

  return longestPath;
}

function findBottlenecksFromMaps(blocking: Map<string, string[]>): string[] {
  const entries = [...blocking.entries()]
    .filter(([, downstream]) => downstream.length > 0)
    .sort(([, a], [, b]) => b.length - a.length);

  return entries.map(([taskId]) => taskId);
}

function mapPrismaTask(task: {
  id: string;
  title: string;
  description: string | null;
  entityId: string;
  projectId: string | null;
  priority: string;
  status: string;
  dueDate: Date | null;
  dependencies: string[];
  assigneeId: string | null;
  createdFrom: unknown;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}): Task {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? undefined,
    entityId: task.entityId,
    projectId: task.projectId ?? undefined,
    priority: task.priority as Task['priority'],
    status: task.status as Task['status'],
    dueDate: task.dueDate ?? undefined,
    dependencies: task.dependencies,
    assigneeId: task.assigneeId ?? undefined,
    createdFrom: task.createdFrom as Task['createdFrom'],
    tags: task.tags,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
