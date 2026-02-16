import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import { differenceInDays, differenceInHours, isAfter, isBefore, addDays } from 'date-fns';
import type { Task } from '@/shared/types';
import type {
  PrioritizationScore,
  PrioritizationFactor,
  EisenhowerQuadrant,
  DailyTop3,
} from '../types';

const FACTOR_WEIGHTS = {
  urgency: 0.20,
  revenueImpact: 0.20,
  deadlinePressure: 0.15,
  stakeholderImportance: 0.15,
  strategicAlignment: 0.10,
  dependencyImpact: 0.10,
  completionMomentum: 0.10,
} as const;

export async function scoreTask(task: Task, entityId: string): Promise<PrioritizationScore> {
  const factors = await calculateFactors(task, entityId);

  const overallScore = Math.round(
    factors.reduce((sum, f) => sum + f.weight * f.score, 0)
  );

  const quadrant = classifyEisenhower(overallScore, task);
  const recommendation = generateRecommendation(quadrant, overallScore, task);

  return {
    taskId: task.id,
    overallScore: Math.max(0, Math.min(100, overallScore)),
    quadrant,
    factors,
    recommendation,
  };
}

export async function scoreBatch(
  tasks: Task[],
  entityId: string
): Promise<PrioritizationScore[]> {
  return Promise.all(tasks.map((t) => scoreTask(t, entityId)));
}

export async function getDailyTop3(
  userId: string,
  entityId: string
): Promise<DailyTop3> {
  const tasks = await prisma.task.findMany({
    where: {
      entityId,
      status: { in: ['TODO', 'IN_PROGRESS'] },
    },
  });

  const mappedTasks: Task[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description ?? undefined,
    entityId: t.entityId,
    projectId: t.projectId ?? undefined,
    priority: t.priority as Task['priority'],
    status: t.status as Task['status'],
    dueDate: t.dueDate ?? undefined,
    dependencies: t.dependencies,
    assigneeId: t.assigneeId ?? undefined,
    createdFrom: t.createdFrom as Task['createdFrom'],
    tags: t.tags,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));

  const scores = await scoreBatch(mappedTasks, entityId);

  // Sort by overall score descending
  const sortedScores = scores.sort((a, b) => b.overallScore - a.overallScore);
  const top3Scores = sortedScores.slice(0, 3);

  const top3Tasks = top3Scores.map((score) => {
    const task = mappedTasks.find((t) => t.id === score.taskId)!;
    const estimatedDuration = estimateTaskDuration(task);
    return { task, score, estimatedDuration };
  });

  const reasoning = generateDailyReasoning(top3Tasks);

  return {
    date: new Date(),
    tasks: top3Tasks,
    reasoning,
  };
}

export async function reprioritize(
  entityId: string
): Promise<{
  reranked: number;
  changes: Array<{ taskId: string; oldPriority: string; newPriority: string }>;
}> {
  const tasks = await prisma.task.findMany({
    where: {
      entityId,
      status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] },
    },
  });

  const mappedTasks: Task[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description ?? undefined,
    entityId: t.entityId,
    projectId: t.projectId ?? undefined,
    priority: t.priority as Task['priority'],
    status: t.status as Task['status'],
    dueDate: t.dueDate ?? undefined,
    dependencies: t.dependencies,
    assigneeId: t.assigneeId ?? undefined,
    createdFrom: t.createdFrom as Task['createdFrom'],
    tags: t.tags,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));

  const scores = await scoreBatch(mappedTasks, entityId);
  const changes: Array<{ taskId: string; oldPriority: string; newPriority: string }> = [];

  for (const score of scores) {
    const task = mappedTasks.find((t) => t.id === score.taskId)!;
    let suggestedPriority: Task['priority'];

    if (score.overallScore >= 75) {
      suggestedPriority = 'P0';
    } else if (score.overallScore >= 40) {
      suggestedPriority = 'P1';
    } else {
      suggestedPriority = 'P2';
    }

    if (suggestedPriority !== task.priority) {
      changes.push({
        taskId: task.id,
        oldPriority: task.priority,
        newPriority: suggestedPriority,
      });
    }
  }

  return { reranked: scores.length, changes };
}

// --- Internal scoring functions ---

async function calculateFactors(
  task: Task,
  entityId: string
): Promise<PrioritizationFactor[]> {
  const [urgency, revenueImpact, deadlinePressure, stakeholderImportance, strategicAlignment, dependencyImpact, completionMomentum] =
    await Promise.all([
      calculateUrgency(task),
      calculateRevenueImpact(task, entityId),
      calculateDeadlinePressure(task),
      calculateStakeholderImportance(task),
      calculateStrategicAlignment(task, entityId),
      calculateDependencyImpact(task),
      calculateCompletionMomentum(task),
    ]);

  return [
    { name: 'Urgency', weight: FACTOR_WEIGHTS.urgency, ...urgency },
    { name: 'Revenue Impact', weight: FACTOR_WEIGHTS.revenueImpact, ...revenueImpact },
    { name: 'Deadline Pressure', weight: FACTOR_WEIGHTS.deadlinePressure, ...deadlinePressure },
    { name: 'Stakeholder Importance', weight: FACTOR_WEIGHTS.stakeholderImportance, ...stakeholderImportance },
    { name: 'Strategic Alignment', weight: FACTOR_WEIGHTS.strategicAlignment, ...strategicAlignment },
    { name: 'Dependency Impact', weight: FACTOR_WEIGHTS.dependencyImpact, ...dependencyImpact },
    { name: 'Completion Momentum', weight: FACTOR_WEIGHTS.completionMomentum, ...completionMomentum },
  ];
}

async function calculateUrgency(task: Task): Promise<{ score: number; reason: string }> {
  if (!task.dueDate) {
    return { score: 30, reason: 'No due date set' };
  }

  const now = new Date();
  const daysUntilDue = differenceInDays(task.dueDate, now);

  if (daysUntilDue < 0) {
    return { score: 100, reason: `Overdue by ${Math.abs(daysUntilDue)} days` };
  }
  if (daysUntilDue === 0) {
    return { score: 90, reason: 'Due today' };
  }
  if (daysUntilDue <= 7) {
    return { score: 70, reason: `Due in ${daysUntilDue} days (this week)` };
  }
  if (daysUntilDue <= 30) {
    return { score: 50, reason: `Due in ${daysUntilDue} days (this month)` };
  }
  return { score: 20, reason: `Due in ${daysUntilDue} days` };
}

async function calculateRevenueImpact(
  task: Task,
  entityId: string
): Promise<{ score: number; reason: string }> {
  if (!task.projectId) {
    return { score: 30, reason: 'No project linked' };
  }

  const financialRecords = await prisma.financialRecord.findMany({
    where: { entityId },
    orderBy: { amount: 'desc' },
    take: 10,
  });

  if (financialRecords.length === 0) {
    return { score: 40, reason: 'No financial records found for entity' };
  }

  const totalRevenue = financialRecords.reduce((sum, r) => sum + r.amount, 0);
  if (totalRevenue > 100000) {
    return { score: 80, reason: 'Associated with high-value entity' };
  }
  if (totalRevenue > 10000) {
    return { score: 60, reason: 'Associated with medium-value entity' };
  }
  return { score: 40, reason: 'Associated with lower-value entity' };
}

async function calculateDeadlinePressure(task: Task): Promise<{ score: number; reason: string }> {
  if (!task.dueDate) {
    return { score: 20, reason: 'No deadline pressure' };
  }

  const now = new Date();
  const hoursRemaining = differenceInHours(task.dueDate, now);

  if (hoursRemaining <= 0) {
    return { score: 100, reason: 'Deadline passed' };
  }
  if (hoursRemaining <= 24) {
    return { score: 90, reason: 'Less than 24 hours remaining' };
  }
  if (hoursRemaining <= 72) {
    return { score: 70, reason: 'Less than 3 days remaining' };
  }
  return { score: 30, reason: 'Sufficient time remaining' };
}

async function calculateStakeholderImportance(task: Task): Promise<{ score: number; reason: string }> {
  if (task.priority === 'P0') {
    return { score: 90, reason: 'P0 priority task indicates VIP stakeholder' };
  }

  if (task.createdFrom?.type === 'CALL' || task.createdFrom?.type === 'MESSAGE') {
    return { score: 70, reason: 'Created from direct communication' };
  }

  if (task.assigneeId) {
    return { score: 50, reason: 'Has assigned stakeholder' };
  }

  return { score: 30, reason: 'No specific stakeholder signal' };
}

async function calculateStrategicAlignment(
  task: Task,
  entityId: string
): Promise<{ score: number; reason: string }> {
  const entity = await prisma.entity.findUnique({ where: { id: entityId } });
  if (!entity) {
    return { score: 30, reason: 'Entity not found' };
  }

  const complianceProfiles = entity.complianceProfile ?? [];
  const taskTags = task.tags.map((t) => t.toLowerCase());

  // Check if task tags align with entity compliance profiles
  const alignedProfiles = complianceProfiles.filter((profile) =>
    taskTags.some((tag) => tag.includes(profile.toLowerCase()))
  );

  if (alignedProfiles.length > 0) {
    return {
      score: 80,
      reason: `Aligned with compliance: ${alignedProfiles.join(', ')}`,
    };
  }

  return { score: 30, reason: 'No specific strategic alignment detected' };
}

async function calculateDependencyImpact(task: Task): Promise<{ score: number; reason: string }> {
  // Count how many tasks depend on this task
  const dependentTasks = await prisma.task.findMany({
    where: {
      dependencies: { has: task.id },
      status: { notIn: ['DONE', 'CANCELLED'] },
    },
  });

  const blockingCount = dependentTasks.length;
  if (blockingCount >= 5) {
    return { score: 100, reason: `Blocking ${blockingCount} downstream tasks` };
  }
  if (blockingCount >= 3) {
    return { score: 80, reason: `Blocking ${blockingCount} downstream tasks` };
  }
  if (blockingCount >= 1) {
    return { score: 60, reason: `Blocking ${blockingCount} downstream task(s)` };
  }
  return { score: 20, reason: 'No tasks depend on this' };
}

async function calculateCompletionMomentum(task: Task): Promise<{ score: number; reason: string }> {
  if (task.status === 'IN_PROGRESS') {
    const daysSinceUpdate = differenceInDays(new Date(), task.updatedAt);
    if (daysSinceUpdate <= 1) {
      return { score: 80, reason: 'Recently active, nearly complete' };
    }
    return { score: 60, reason: 'In progress, maintain momentum' };
  }

  if (task.status === 'TODO') {
    return { score: 30, reason: 'Not yet started' };
  }

  return { score: 20, reason: 'No completion momentum' };
}

// --- Eisenhower Classification ---

function classifyEisenhower(score: number, task: Task): EisenhowerQuadrant {
  const isUrgent = task.dueDate
    ? isBefore(task.dueDate, addDays(new Date(), 7))
    : false;
  const isImportant = score > 50;

  if (isUrgent && isImportant) return 'DO_FIRST';
  if (!isUrgent && isImportant) return 'SCHEDULE';
  if (isUrgent && !isImportant) return 'DELEGATE';
  return 'ELIMINATE';
}

function generateRecommendation(
  quadrant: EisenhowerQuadrant,
  score: number,
  task: Task
): string {
  switch (quadrant) {
    case 'DO_FIRST':
      return `High priority: Complete "${task.title}" immediately. Score: ${score}/100.`;
    case 'SCHEDULE':
      return `Schedule time for "${task.title}". Important but not immediately urgent.`;
    case 'DELEGATE':
      return `Consider delegating "${task.title}". Time-sensitive but lower strategic value.`;
    case 'ELIMINATE':
      return `Review if "${task.title}" is still needed. Low urgency and importance.`;
  }
}

function estimateTaskDuration(task: Task): number {
  switch (task.priority) {
    case 'P0': return 240; // 4 hours
    case 'P1': return 120; // 2 hours
    case 'P2': return 60;  // 1 hour
    default: return 120;
  }
}

function generateDailyReasoning(
  tasks: Array<{ task: Task; score: PrioritizationScore; estimatedDuration?: number }>
): string {
  if (tasks.length === 0) return 'No active tasks found for today.';

  const reasons = tasks.map((t, i) => {
    const topFactor = t.score.factors.sort((a, b) => b.score * b.weight - a.score * a.weight)[0];
    return `${i + 1}. "${t.task.title}" (Score: ${t.score.overallScore}) — ${topFactor.name}: ${topFactor.reason}`;
  });

  return `Today's top tasks selected based on urgency, impact, and momentum:\n${reasons.join('\n')}`;
}

// --- AI-Powered Priority Suggestion ---

export async function suggestPriorityWithAI(
  task: { title: string; description?: string; dueDate?: Date; dependencies?: string[] },
  context: { openTaskCount: number; upcomingDeadlines: number; entityGoals?: string[] }
): Promise<{ priority: 'P0' | 'P1' | 'P2'; reasoning: string }> {
  try {
    const result = await generateJSON<{ priority: 'P0' | 'P1' | 'P2'; reasoning: string }>(
      `Suggest a priority level for this task based on context.

Task: "${task.title}"
${task.description ? `Description: ${task.description}` : ''}
${task.dueDate ? `Due date: ${task.dueDate.toISOString().split('T')[0]}` : 'No due date'}
${task.dependencies?.length ? `Dependencies: ${task.dependencies.join(', ')}` : 'No dependencies'}

Context:
- Open tasks: ${context.openTaskCount}
- Upcoming deadlines this week: ${context.upcomingDeadlines}
${context.entityGoals?.length ? `- Entity goals: ${context.entityGoals.join(', ')}` : ''}

Priority levels:
- P0: Urgent/critical — must be done immediately, blocking others or time-sensitive
- P1: Important — should be done soon, has meaningful impact
- P2: Normal/low — can wait, minor impact

Return JSON with priority and reasoning.`,
      {
        maxTokens: 256,
        temperature: 0.3,
        system: 'You are a task prioritization assistant. Analyze the task and context to suggest the most appropriate priority level. Be concise in your reasoning.',
      }
    );
    return result;
  } catch {
    // Fall back to algorithmic suggestion
    const suggestedPriority = task.dueDate
      ? differenceInDays(task.dueDate, new Date()) <= 2
        ? 'P0'
        : differenceInDays(task.dueDate, new Date()) <= 7
        ? 'P1'
        : 'P2'
      : 'P1';
    return {
      priority: suggestedPriority,
      reasoning: 'AI unavailable — priority suggested based on due date proximity.',
    };
  }
}
