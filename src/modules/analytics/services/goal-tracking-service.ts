import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import type { GoalEntry, Task, Workflow } from '@prisma/client';
import type { GoalDefinition, GoalMilestone, GoalCorrectionSuggestion } from '../types';

function dbRecordToGoal(record: GoalEntry): GoalDefinition {
  return {
    id: record.id,
    userId: record.userId,
    entityId: record.entityId ?? undefined,
    title: record.title,
    description: record.description ?? undefined,
    framework: record.framework as GoalDefinition['framework'],
    targetValue: record.targetValue,
    currentValue: record.currentValue,
    unit: record.unit,
    milestones: (record.milestones ?? []) as unknown as GoalMilestone[],
    startDate: new Date(record.startDate),
    endDate: new Date(record.endDate),
    status: record.status as GoalDefinition['status'],
    autoProgress: record.autoProgress,
    linkedTaskIds: (record.linkedTaskIds ?? []) as string[],
    linkedWorkflowIds: (record.linkedWorkflowIds ?? []) as string[],
  };
}

export async function createGoal(
  goal: Omit<GoalDefinition, 'id' | 'currentValue' | 'status' | 'milestones'> & {
    milestones?: Omit<GoalMilestone, 'id' | 'isComplete'>[];
  }
): Promise<GoalDefinition> {
  const milestones: GoalMilestone[] = (goal.milestones ?? []).map((m) => ({
    ...m,
    id: uuidv4(),
    isComplete: false,
  }));

  const record = await prisma.goalEntry.create({
    data: {
      userId: goal.userId,
      entityId: goal.entityId ?? null,
      title: goal.title,
      description: goal.description ?? null,
      framework: goal.framework,
      targetValue: goal.targetValue,
      currentValue: 0,
      unit: goal.unit,
      milestones: milestones as unknown as Prisma.InputJsonValue,
      startDate: goal.startDate,
      endDate: goal.endDate,
      status: 'ON_TRACK',
      autoProgress: goal.autoProgress,
      linkedTaskIds: goal.linkedTaskIds as unknown as Prisma.InputJsonValue,
      linkedWorkflowIds: goal.linkedWorkflowIds as unknown as Prisma.InputJsonValue,
    },
  });

  return dbRecordToGoal(record);
}

export async function updateGoalProgress(
  goalId: string
): Promise<GoalDefinition> {
  const record = await prisma.goalEntry.findUnique({ where: { id: goalId } });
  if (!record) throw new Error(`Goal not found: ${goalId}`);

  const goal = dbRecordToGoal(record);

  // Auto-update from linked tasks
  if (goal.linkedTaskIds.length > 0) {
    const tasks = await prisma.task.findMany({
      where: { id: { in: goal.linkedTaskIds } },
    });
    const completedCount = tasks.filter((t: Task) => t.status === 'DONE').length;
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
      workflows.reduce((sum: number, w: Workflow) => sum + w.successRate, 0) / workflows.length;
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

    await prisma.goalEntry.update({
      where: { id: goalId },
      data: {
        currentValue: goal.currentValue,
        status: goal.status,
        milestones: goal.milestones as unknown as Prisma.InputJsonValue,
      },
    });

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

  await prisma.goalEntry.update({
    where: { id: goalId },
    data: {
      currentValue: goal.currentValue,
      status: goal.status,
      milestones: goal.milestones as unknown as Prisma.InputJsonValue,
    },
  });

  return goal;
}

export async function getGoals(
  userId: string,
  entityId?: string
): Promise<GoalDefinition[]> {
  const where: Record<string, unknown> = { userId };
  if (entityId) {
    where.entityId = entityId;
  }

  const records = await prisma.goalEntry.findMany({ where });
  return records.map(dbRecordToGoal);
}

export async function suggestCourseCorrection(
  goalId: string
): Promise<GoalCorrectionSuggestion> {
  const record = await prisma.goalEntry.findUnique({ where: { id: goalId } });
  if (!record) throw new Error(`Goal not found: ${goalId}`);

  const goal = dbRecordToGoal(record);

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

  let adjustedEndDate: Date | undefined;

  if (goal.status === 'BEHIND') {
    const projectedDaysNeeded =
      currentPace > 0 ? remaining / currentPace : totalDays * 2;
    adjustedEndDate = new Date(now.getTime() + projectedDaysNeeded * 86400000);
  }

  // Use AI to generate context-aware course correction suggestion
  let suggestion: string;
  try {
    const aiResult = await generateJSON<{ suggestion: string; adjustedEndDate?: string }>(
      `You are a productivity coach. Analyze this goal and provide a course correction suggestion.

Goal: "${goal.title}" (${goal.framework} framework)
Status: ${goal.status}
Current progress: ${goal.currentValue} / ${goal.targetValue} ${goal.unit}
Current pace: ${currentPace.toFixed(1)} ${goal.unit}/day
Required pace: ${requiredPace.toFixed(1)} ${goal.unit}/day
Days elapsed: ${Math.round(daysElapsed)}
Days remaining: ${Math.round(daysRemaining)}
Linked tasks: ${goal.linkedTaskIds.length}
Linked workflows: ${goal.linkedWorkflowIds.length}

Respond with JSON: { "suggestion": "<actionable advice in 1-2 sentences>" }`,
      { temperature: 0.4, maxTokens: 256 }
    );
    suggestion = aiResult.suggestion;
  } catch {
    // Fallback to static suggestion if AI fails
    if (goal.status === 'BEHIND') {
      suggestion = `At current pace (${currentPace.toFixed(1)} ${goal.unit}/day), consider increasing daily effort to ${requiredPace.toFixed(1)} ${goal.unit}/day or extending the deadline.`;
    } else if (goal.status === 'AT_RISK') {
      suggestion = `You need to increase pace from ${currentPace.toFixed(1)} to ${requiredPace.toFixed(1)} ${goal.unit}/day. Consider prioritizing linked tasks or removing blockers.`;
    } else {
      suggestion = `Goal is on track. Maintain current pace of ${currentPace.toFixed(1)} ${goal.unit}/day.`;
    }
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
  const record = await prisma.goalEntry.findUnique({ where: { id: goalId } });
  if (!record) throw new Error(`Goal not found: ${goalId}`);

  const goal = dbRecordToGoal(record);

  goal.status = 'COMPLETE';
  goal.currentValue = goal.targetValue;

  for (const milestone of goal.milestones) {
    if (!milestone.isComplete) {
      milestone.isComplete = true;
      milestone.completedAt = new Date();
    }
  }

  await prisma.goalEntry.update({
    where: { id: goalId },
    data: {
      status: 'COMPLETE',
      currentValue: goal.targetValue,
      milestones: goal.milestones as unknown as Prisma.InputJsonValue,
    },
  });

  return goal;
}
