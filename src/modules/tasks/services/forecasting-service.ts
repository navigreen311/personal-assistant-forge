import { prisma } from '@/lib/db';
import {
  addDays,
  addWeeks,
  differenceInDays,
  startOfWeek,
  endOfWeek,
  subWeeks,
  format,
} from 'date-fns';
import type { CompletionForecast, VelocityMetrics, BurndownData } from '../types';

export async function forecastTaskCompletion(taskId: string): Promise<CompletionForecast> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const velocity = await calculateVelocity(task.entityId, task.projectId ?? undefined, 8);

  if (velocity.currentVelocity === 0) {
    return {
      taskId,
      predictedCompletionDate: addWeeks(new Date(), 2),
      confidence: 0.3,
      velocity: 0,
      remainingTasks: 1,
      historicalData: velocity.weeklyData,
      risks: ['Zero velocity detected — no tasks completed recently'],
    };
  }

  // Single task: estimate based on priority and velocity
  const estimatedDays = task.priority === 'P0' ? 2 : task.priority === 'P1' ? 5 : 10;
  const predictedDate = addDays(new Date(), estimatedDays);

  const risks: string[] = [];
  if (task.status === 'BLOCKED') {
    risks.push('Task is currently blocked');
  }
  if (task.dependencies.length > 0) {
    risks.push(`Has ${task.dependencies.length} dependency(ies) that must complete first`);
  }
  if (velocity.trend === 'DECREASING') {
    risks.push('Velocity is trending downward');
  }

  const confidence = task.status === 'BLOCKED' ? 0.3 : velocity.trend === 'DECREASING' ? 0.5 : 0.7;

  return {
    taskId,
    predictedCompletionDate: predictedDate,
    confidence,
    velocity: velocity.currentVelocity,
    remainingTasks: 1,
    historicalData: velocity.weeklyData,
    risks,
  };
}

export async function forecastProjectCompletion(projectId: string): Promise<CompletionForecast> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const tasks = await prisma.task.findMany({
    where: { projectId, status: { notIn: ['DONE', 'CANCELLED'] } },
  });

  const remainingTasks = tasks.length;
  if (remainingTasks === 0) {
    return {
      projectId,
      predictedCompletionDate: new Date(),
      confidence: 1.0,
      velocity: 0,
      remainingTasks: 0,
      historicalData: [],
      risks: [],
    };
  }

  const velocity = await calculateVelocity(project.entityId, projectId, 8);

  const weeksNeeded =
    velocity.currentVelocity > 0
      ? remainingTasks / velocity.currentVelocity
      : remainingTasks / Math.max(velocity.averageVelocity, 1);

  const predictedDate = addWeeks(new Date(), Math.ceil(weeksNeeded));

  const risks: string[] = [];
  const blockedTasks = tasks.filter((t) => t.status === 'BLOCKED');
  if (blockedTasks.length > 0) {
    risks.push(`${blockedTasks.length} task(s) are currently blocked`);
  }
  if (velocity.trend === 'DECREASING') {
    risks.push('Velocity is declining — forecast may be optimistic');
  }
  if (velocity.currentVelocity === 0) {
    risks.push('No tasks completed in the last week');
  }

  const confidence =
    velocity.currentVelocity > 0
      ? velocity.trend === 'STABLE'
        ? 0.7
        : velocity.trend === 'INCREASING'
        ? 0.8
        : 0.5
      : 0.3;

  return {
    projectId,
    predictedCompletionDate: predictedDate,
    confidence,
    velocity: velocity.currentVelocity,
    remainingTasks,
    historicalData: velocity.weeklyData,
    risks,
  };
}

export async function calculateVelocity(
  entityId: string,
  projectId?: string,
  weeks = 8
): Promise<VelocityMetrics> {
  const now = new Date();
  const weeklyData: Array<{ week: string; completed: number }> = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 });

    const where: Record<string, unknown> = {
      entityId,
      status: 'DONE',
      updatedAt: { gte: weekStart, lte: weekEnd },
    };
    if (projectId) where.projectId = projectId;

    const count = await prisma.task.count({ where });

    weeklyData.push({
      week: format(weekStart, 'yyyy-MM-dd'),
      completed: count,
    });
  }

  const completions = weeklyData.map((w) => w.completed);
  const currentVelocity = completions[completions.length - 1] ?? 0;
  const averageVelocity =
    completions.length > 0
      ? Math.round((completions.reduce((a, b) => a + b, 0) / completions.length) * 10) / 10
      : 0;

  const trend = detectTrend(completions);

  return {
    entityId,
    projectId,
    currentVelocity,
    averageVelocity,
    trend,
    weeklyData,
  };
}

export async function getBurndownData(projectId: string): Promise<BurndownData> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const allTasks = await prisma.task.findMany({
    where: { projectId, status: { notIn: ['CANCELLED'] } },
    orderBy: { createdAt: 'asc' },
  });

  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter((t) => t.status === 'DONE').length;

  if (totalTasks === 0) {
    return {
      projectId,
      dataPoints: [],
      totalTasks: 0,
      completedTasks: 0,
      startDate: project.createdAt,
      targetDate: addWeeks(project.createdAt, 12),
    };
  }

  const startDate = project.createdAt;
  const targetDate = getProjectTargetDate(project, allTasks);
  const totalDays = differenceInDays(targetDate, startDate) || 1;

  const dataPoints: BurndownData['dataPoints'] = [];
  const now = new Date();

  for (let d = 0; d <= totalDays; d++) {
    const date = addDays(startDate, d);
    if (date > now) break;

    const idealRemaining = Math.max(0, totalTasks - (totalTasks * d) / totalDays);

    const completedByDate = allTasks.filter(
      (t) => t.status === 'DONE' && t.updatedAt <= date
    ).length;
    const actualRemaining = totalTasks - completedByDate;

    dataPoints.push({
      date,
      idealRemaining: Math.round(idealRemaining * 10) / 10,
      actualRemaining,
    });
  }

  return {
    projectId,
    dataPoints,
    totalTasks,
    completedTasks,
    startDate,
    targetDate,
  };
}

export function detectVelocityAnomalies(metrics: VelocityMetrics): string[] {
  const anomalies: string[] = [];
  const { weeklyData, averageVelocity } = metrics;

  if (weeklyData.length < 2) return anomalies;

  const latest = weeklyData[weeklyData.length - 1];
  const previous = weeklyData[weeklyData.length - 2];

  // Significant drop
  if (previous.completed > 0 && latest.completed < previous.completed * 0.5) {
    anomalies.push(
      `Velocity dropped ${Math.round(((previous.completed - latest.completed) / previous.completed) * 100)}% from last week`
    );
  }

  // Significant spike
  if (averageVelocity > 0 && latest.completed > averageVelocity * 2) {
    anomalies.push(
      `Unusual spike: ${latest.completed} tasks completed vs ${averageVelocity} average`
    );
  }

  // Zero velocity
  if (latest.completed === 0 && averageVelocity > 0) {
    anomalies.push('No tasks completed this week despite positive historical velocity');
  }

  return anomalies;
}

// --- Helpers ---

function detectTrend(completions: number[]): 'INCREASING' | 'STABLE' | 'DECREASING' {
  if (completions.length < 3) return 'STABLE';

  const recent = completions.slice(-3);
  const older = completions.slice(-6, -3);

  if (older.length === 0) return 'STABLE';

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const changePercent = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;

  if (changePercent > 0.15) return 'INCREASING';
  if (changePercent < -0.15) return 'DECREASING';
  return 'STABLE';
}

function getProjectTargetDate(
  project: { milestones: unknown; createdAt: Date },
  tasks: Array<{ dueDate: Date | null }>
): Date {
  const milestones = project.milestones as Array<{ dueDate: string | Date }> | null;

  // Use the last milestone date if available
  if (milestones && milestones.length > 0) {
    const lastMilestone = milestones
      .map((m) => new Date(m.dueDate))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return lastMilestone;
  }

  // Use the latest task due date
  const taskDates = tasks
    .filter((t) => t.dueDate)
    .map((t) => t.dueDate!)
    .sort((a, b) => b.getTime() - a.getTime());

  if (taskDates.length > 0) {
    return taskDates[0];
  }

  // Default: 12 weeks from creation
  return addWeeks(project.createdAt, 12);
}
