import { prisma } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import type { GoalDefinition, GoalMilestone, GoalCorrectionSuggestion } from '../types';

// In-memory store for goals (would be a dedicated DB table in production)
const goalStore = new Map<string, GoalDefinition>();

export async function createGoal(
  goal: Omit<GoalDefinition, 'id' | 'currentValue' | 'status' | 'milestones'> & {
    milestones?: Omit<GoalMilestone, 'id' | 'isComplete'>[];
  }
): Promise<GoalDefinition> {
  const id = uuidv4();
  const milestones: GoalMilestone[] = (goal.milestones ?? []).map((m) => ({
    ...m,
    id: uuidv4(),
    isComplete: false,
  }));

  const newGoal: GoalDefinition = {
    ...goal,
    id,
    currentValue: 0,
    status: 'ON_TRACK',
    milestones,
  };

  goalStore.set(id, newGoal);
  return newGoal;
}

export async function updateGoalProgress(
  goalId: string
): Promise<GoalDefinition> {
  const goal = goalStore.get(goalId);
  if (!goal) throw new Error(`Goal not found: ${goalId}`);

  // Auto-update from linked tasks
  if (goal.linkedTaskIds.length > 0) {
    const tasks = await prisma.task.findMany({
      where: { id: { in: goal.linkedTaskIds } },
    });
    const completedCount = tasks.filter((t: any) => t.status === 'DONE').length;
    const totalCount = tasks.length;
    goal.currentValue =
      totalCount > 0
        ? Math.round((completedCount / totalCount) * goal.targetValue)
        : goal.currentValue;
  }

  // Auto-update from linked workflows
  if (goal.linkedWorkflowIds.length > 0) {
    const workflows = await prisma.workflow.findMany({
      where: { id: { in: goal.linkedWorkflowIds } },
    });
    const avgSuccessRate =
      workflows.reduce((sum: number, w: any) => sum + w.successRate, 0) / workflows.length;
    // Blend workflow success rate with current value
    if (goal.linkedTaskIds.length === 0) {
      goal.currentValue = Math.round(
        (avgSuccessRate / 100) * goal.targetValue
      );
    }
  }

  // Update milestone completion
  for (const milestone of goal.milestones) {
    if (!milestone.isComplete && goal.currentValue >= milestone.targetValue) {
      milestone.isComplete = true;
      milestone.completedAt = new Date();
    }
  }

  // Check completion
  if (goal.currentValue >= goal.targetValue) {
    goal.status = 'COMPLETE';
    goalStore.set(goalId, goal);
    return goal;
  }

  // Calculate pace
  const now = new Date();
  const elapsed = now.getTime() - goal.startDate.getTime();
  const total = goal.endDate.getTime() - goal.startDate.getTime();
  const timeProgress = total > 0 ? elapsed / total : 1;
  const valueProgress = goal.targetValue > 0 ? goal.currentValue / goal.targetValue : 0;

  const paceRatio = timeProgress > 0 ? valueProgress / timeProgress : 1;

  if (paceRatio >= 1) {
    goal.status = 'ON_TRACK';
  } else if (paceRatio >= 0.8) {
    goal.status = 'AT_RISK';
  } else {
    goal.status = 'BEHIND';
  }

  goalStore.set(goalId, goal);
  return goal;
}

export async function getGoals(
  userId: string,
  entityId?: string
): Promise<GoalDefinition[]> {
  const goals = Array.from(goalStore.values());
  return goals.filter(
    (g) => g.userId === userId && (!entityId || g.entityId === entityId)
  );
}

export async function suggestCourseCorrection(
  goalId: string
): Promise<GoalCorrectionSuggestion> {
  const goal = goalStore.get(goalId);
  if (!goal) throw new Error(`Goal not found: ${goalId}`);

  const now = new Date();
  const elapsed = now.getTime() - goal.startDate.getTime();
  const total = goal.endDate.getTime() - goal.startDate.getTime();
  const remaining = goal.targetValue - goal.currentValue;
  const daysElapsed = elapsed / (1000 * 60 * 60 * 24);
  const totalDays = total / (1000 * 60 * 60 * 24);
  const daysRemaining = totalDays - daysElapsed;

  const currentPace =
    daysElapsed > 0 ? goal.currentValue / daysElapsed : 0;
  const requiredPace = daysRemaining > 0 ? remaining / daysRemaining : remaining;

  let suggestion: string;
  let adjustedEndDate: Date | undefined;

  if (goal.status === 'BEHIND') {
    const projectedDaysNeeded =
      currentPace > 0 ? remaining / currentPace : totalDays * 2;
    adjustedEndDate = new Date(now.getTime() + projectedDaysNeeded * 86400000);
    suggestion = `At current pace (${currentPace.toFixed(1)} ${goal.unit}/day), you need ${Math.ceil(projectedDaysNeeded)} more days. Consider extending the deadline to ${adjustedEndDate.toISOString().split('T')[0]} or increasing daily effort to ${requiredPace.toFixed(1)} ${goal.unit}/day.`;
  } else if (goal.status === 'AT_RISK') {
    suggestion = `You need to increase pace from ${currentPace.toFixed(1)} to ${requiredPace.toFixed(1)} ${goal.unit}/day. Consider prioritizing linked tasks or removing blockers.`;
  } else {
    suggestion = `Goal is on track. Maintain current pace of ${currentPace.toFixed(1)} ${goal.unit}/day.`;
  }

  return {
    goalId,
    currentPace: Math.round(currentPace * 100) / 100,
    requiredPace: Math.round(requiredPace * 100) / 100,
    suggestion,
    adjustedEndDate,
  };
}

export async function completeGoal(goalId: string): Promise<GoalDefinition> {
  const goal = goalStore.get(goalId);
  if (!goal) throw new Error(`Goal not found: ${goalId}`);

  goal.status = 'COMPLETE';
  goal.currentValue = goal.targetValue;

  for (const milestone of goal.milestones) {
    if (!milestone.isComplete) {
      milestone.isComplete = true;
      milestone.completedAt = new Date();
    }
  }

  goalStore.set(goalId, goal);
  return goal;
}

// Exported for testing
export function _getGoalStore(): Map<string, GoalDefinition> {
  return goalStore;
}
