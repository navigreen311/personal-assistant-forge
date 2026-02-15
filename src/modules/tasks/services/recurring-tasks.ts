import { v4 as uuidv4 } from 'uuid';
import { addDays, addWeeks, addMonths, differenceInHours } from 'date-fns';
import { prisma } from '@/lib/db';
import type { Task } from '@/shared/types';
import type { RecurringTaskConfig, RecurrenceCadence } from '../types';

// In-memory store for recurring configs (in production, this would be in DB)
const recurringConfigs = new Map<string, RecurringTaskConfig>();

export function createRecurringConfig(
  params: Omit<RecurringTaskConfig, 'id' | 'lastGenerated'>
): RecurringTaskConfig {
  const config: RecurringTaskConfig = {
    id: uuidv4(),
    taskTemplateId: params.taskTemplateId,
    cadence: params.cadence,
    nextDue: params.nextDue,
    slaHours: params.slaHours,
    autoAdjust: params.autoAdjust,
    isActive: params.isActive,
  };

  recurringConfigs.set(config.id, config);
  return config;
}

export async function generateNextOccurrence(configId: string): Promise<Task> {
  const config = recurringConfigs.get(configId);
  if (!config) {
    throw new Error(`Recurring config not found: ${configId}`);
  }

  const template = await prisma.task.findUnique({
    where: { id: config.taskTemplateId },
  });
  if (!template) {
    throw new Error(`Task template not found: ${config.taskTemplateId}`);
  }

  const task = await prisma.task.create({
    data: {
      title: template.title,
      description: template.description,
      entityId: template.entityId,
      projectId: template.projectId,
      priority: template.priority,
      status: 'TODO',
      dueDate: config.nextDue,
      dependencies: [],
      assigneeId: template.assigneeId,
      tags: [...template.tags, 'recurring'],
      createdFrom: { type: 'RECURRING', sourceId: configId },
    },
  });

  // Advance next due date
  config.lastGenerated = new Date();
  config.nextDue = calculateNextDue(config.cadence, config.nextDue);
  recurringConfigs.set(config.id, config);

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

export async function getUpcomingRecurrences(
  entityId: string,
  days = 30
): Promise<Array<{ config: RecurringTaskConfig; nextDue: Date }>> {
  const cutoff = addDays(new Date(), days);
  const results: Array<{ config: RecurringTaskConfig; nextDue: Date }> = [];

  for (const config of recurringConfigs.values()) {
    if (!config.isActive) continue;

    // Verify config belongs to entity by checking template
    const template = await prisma.task.findUnique({
      where: { id: config.taskTemplateId },
    });
    if (template?.entityId !== entityId) continue;

    if (config.nextDue <= cutoff) {
      results.push({ config, nextDue: config.nextDue });
    }
  }

  return results.sort((a, b) => a.nextDue.getTime() - b.nextDue.getTime());
}

export async function adjustCadence(configId: string): Promise<RecurringTaskConfig> {
  const config = recurringConfigs.get(configId);
  if (!config) {
    throw new Error(`Recurring config not found: ${configId}`);
  }

  if (!config.autoAdjust) {
    return config;
  }

  // Analyze completion patterns for tasks generated from this config
  const generatedTasks = await prisma.task.findMany({
    where: {
      tags: { has: 'recurring' },
      status: 'DONE',
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });

  if (generatedTasks.length < 3) {
    return config; // Not enough data to adjust
  }

  // Calculate average completion time
  const completionHours = generatedTasks
    .filter((t) => t.dueDate)
    .map((t) => differenceInHours(t.updatedAt, t.createdAt));

  if (completionHours.length === 0) return config;

  const avgHours = completionHours.reduce((sum, h) => sum + h, 0) / completionHours.length;
  const slaHours = config.slaHours ?? 168; // default 1 week

  // If consistently completed early (< 50% of SLA), suggest shorter cadence
  if (avgHours < slaHours * 0.5 && config.cadence.type === 'WEEKLY') {
    config.cadence = { type: 'DAILY' };
  }

  // If consistently late, suggest longer cadence
  if (avgHours > slaHours * 1.5 && config.cadence.type === 'DAILY') {
    config.cadence = { type: 'WEEKLY', dayOfWeek: 1 };
  }

  recurringConfigs.set(config.id, config);
  return config;
}

export async function getRecurringConfigs(entityId: string): Promise<RecurringTaskConfig[]> {
  const configs: RecurringTaskConfig[] = [];

  for (const config of recurringConfigs.values()) {
    const template = await prisma.task.findUnique({
      where: { id: config.taskTemplateId },
    });
    if (template?.entityId === entityId) {
      configs.push(config);
    }
  }

  return configs;
}

export async function deactivateRecurring(configId: string): Promise<void> {
  const config = recurringConfigs.get(configId);
  if (!config) {
    throw new Error(`Recurring config not found: ${configId}`);
  }

  config.isActive = false;
  recurringConfigs.set(config.id, config);
}

export async function checkSLACompliance(configId: string): Promise<{
  compliant: boolean;
  averageCompletionHours: number;
  slaHours: number;
  complianceRate: number;
}> {
  const config = recurringConfigs.get(configId);
  if (!config) {
    throw new Error(`Recurring config not found: ${configId}`);
  }

  const slaHours = config.slaHours ?? 168;

  const generatedTasks = await prisma.task.findMany({
    where: {
      tags: { has: 'recurring' },
      status: 'DONE',
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  if (generatedTasks.length === 0) {
    return { compliant: true, averageCompletionHours: 0, slaHours, complianceRate: 1 };
  }

  const completionHours = generatedTasks.map((t) =>
    differenceInHours(t.updatedAt, t.createdAt)
  );

  const avgHours = completionHours.reduce((sum, h) => sum + h, 0) / completionHours.length;
  const compliantCount = completionHours.filter((h) => h <= slaHours).length;
  const complianceRate = compliantCount / completionHours.length;

  return {
    compliant: complianceRate >= 0.8,
    averageCompletionHours: Math.round(avgHours),
    slaHours,
    complianceRate: Math.round(complianceRate * 100) / 100,
  };
}

// --- Helpers ---

function calculateNextDue(cadence: RecurrenceCadence, currentDue: Date): Date {
  switch (cadence.type) {
    case 'DAILY':
      return addDays(currentDue, 1);
    case 'WEEKLY':
      return addWeeks(currentDue, 1);
    case 'BIWEEKLY':
      return addWeeks(currentDue, 2);
    case 'MONTHLY':
      return addMonths(currentDue, 1);
    case 'QUARTERLY':
      return addMonths(currentDue, 3);
    case 'CUSTOM':
      // For custom cron, default to weekly
      return addWeeks(currentDue, 1);
  }
}
