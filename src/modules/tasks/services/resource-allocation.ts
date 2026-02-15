import { prisma } from '@/lib/db';
import type { ResourceAllocation } from '../types';

const DEFAULT_CAPACITY_HOURS = 40;
const PRIORITY_HOURS: Record<string, number> = {
  P0: 4,
  P1: 2,
  P2: 1,
};

export async function getResourceAllocation(entityId: string): Promise<ResourceAllocation[]> {
  const tasks = await prisma.task.findMany({
    where: {
      entityId,
      status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] },
      assigneeId: { not: null },
    },
  });

  // Group tasks by assignee
  const assigneeMap = new Map<string, Array<{ taskId: string; taskTitle: string; estimatedHours: number }>>();

  for (const task of tasks) {
    if (!task.assigneeId) continue;

    if (!assigneeMap.has(task.assigneeId)) {
      assigneeMap.set(task.assigneeId, []);
    }

    const hours = PRIORITY_HOURS[task.priority] ?? 2;
    assigneeMap.get(task.assigneeId)!.push({
      taskId: task.id,
      taskTitle: task.title,
      estimatedHours: hours,
    });
  }

  const allocations: ResourceAllocation[] = [];

  for (const [userId, userTasks] of assigneeMap) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const userName = user?.name ?? 'Unknown';
    const allocatedHours = userTasks.reduce((sum, t) => sum + t.estimatedHours, 0);
    const utilizationPercent = Math.round((allocatedHours / DEFAULT_CAPACITY_HOURS) * 100);
    const isOvercommitted = allocatedHours > DEFAULT_CAPACITY_HOURS;

    allocations.push({
      userId,
      userName,
      totalCapacityHours: DEFAULT_CAPACITY_HOURS,
      allocatedHours,
      utilizationPercent,
      tasks: userTasks,
      isOvercommitted,
      overcommitmentHours: isOvercommitted ? allocatedHours - DEFAULT_CAPACITY_HOURS : undefined,
    });
  }

  return allocations.sort((a, b) => b.utilizationPercent - a.utilizationPercent);
}

export async function detectOvercommitment(entityId: string): Promise<ResourceAllocation[]> {
  const allocations = await getResourceAllocation(entityId);
  return allocations.filter((a) => a.isOvercommitted);
}

export async function suggestRebalancing(
  entityId: string
): Promise<Array<{ taskId: string; fromUserId: string; toUserId: string; reason: string }>> {
  const allocations = await getResourceAllocation(entityId);

  if (allocations.length < 2) return [];

  const overcommitted = allocations.filter((a) => a.isOvercommitted);
  const underutilized = allocations.filter((a) => a.utilizationPercent < 70);

  if (overcommitted.length === 0 || underutilized.length === 0) return [];

  const suggestions: Array<{ taskId: string; fromUserId: string; toUserId: string; reason: string }> = [];

  for (const over of overcommitted) {
    // Find P2 tasks that can be moved
    const movableTasks = over.tasks
      .filter((t) => t.estimatedHours <= 2) // Only move smaller tasks
      .sort((a, b) => a.estimatedHours - b.estimatedHours);

    for (const task of movableTasks) {
      const target = underutilized.find(
        (u) => u.allocatedHours + task.estimatedHours <= u.totalCapacityHours
      );

      if (target) {
        suggestions.push({
          taskId: task.taskId,
          fromUserId: over.userId,
          toUserId: target.userId,
          reason: `${over.userName} is over capacity (${over.utilizationPercent}%). "${task.taskTitle}" can be moved to ${target.userName} (${target.utilizationPercent}% utilized).`,
        });

        // Update target utilization for subsequent iterations
        target.allocatedHours += task.estimatedHours;
        target.utilizationPercent = Math.round((target.allocatedHours / target.totalCapacityHours) * 100);
      }
    }
  }

  return suggestions;
}
