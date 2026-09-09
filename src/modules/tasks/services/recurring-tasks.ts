/**
 * Recurring task configs.
 *
 * ============================================================================
 * A SHARED, PROCESS-GLOBAL STORE WITH NO TENANT COLUMN
 * ============================================================================
 *
 * These configs live in an in-memory Map, not the database -- there is no
 * Prisma model for them and the schema is frozen this run, so P-04 cannot add
 * one (that would be an automatic hand-back). Before P-04 the Map had no
 * entity on it at all, and `adjustCadence`, `deactivateRecurring`,
 * `generateNextOccurrence` and `checkSLACompliance` each took a bare
 * `configId`. One process serves every tenant, so any authenticated caller
 * could deactivate or re-cadence any other tenant's recurring task by naming
 * its id.
 *
 * The fix needs no migration: the config now carries the `entityId` it was
 * created under, and every lookup goes through `getScopedConfig`, which returns
 * the config only when the scope matches. A config belonging to another tenant
 * is reported as not found, exactly like a row that does not exist.
 *
 * The store being in-memory is a separate, pre-existing defect (configs are
 * lost on restart and are not shared between server instances). It is out of
 * scope here and is recorded in PARALLEL_BUILD_ESCALATION_P04.md.
 */

import { v4 as uuidv4 } from 'uuid';
import { addDays, addWeeks, addMonths, differenceInHours } from 'date-fns';
import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { Task } from '@/shared/types';
import type { RecurringTaskConfig, RecurrenceCadence } from '../types';

// In-memory store for recurring configs (in production, this would be in DB)
const recurringConfigs = new Map<string, RecurringTaskConfig>();

/**
 * The single door into the store.
 *
 * Every exported function that takes a `configId` goes through here, so
 * "look up by id, then check the entity" cannot be forgotten at one call site
 * the way it was forgotten at four.
 */
function getScopedConfig(
  configId: string,
  entityId: VerifiedEntityId
): RecurringTaskConfig | undefined {
  const config = recurringConfigs.get(configId);
  if (!config || config.entityId !== entityId) return undefined;
  return config;
}

/**
 * Create a config. Async now, because the template task has to be proven to
 * live in the caller's entity before a config can point at it -- otherwise the
 * config becomes a handle onto a foreign task.
 */
export async function createRecurringConfig(
  params: Omit<RecurringTaskConfig, 'id' | 'lastGenerated' | 'entityId'>,
  entityId: VerifiedEntityId
): Promise<RecurringTaskConfig> {
  const template = await prisma.task.findFirst({
    where: { id: params.taskTemplateId, entityId },
    select: { id: true },
  });
  if (!template) {
    throw new Error(`Task template not found: ${params.taskTemplateId}`);
  }

  const config: RecurringTaskConfig = {
    id: uuidv4(),
    entityId,
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

export async function generateNextOccurrence(
  configId: string,
  entityId: VerifiedEntityId
): Promise<Task> {
  const config = getScopedConfig(configId, entityId);
  if (!config) {
    throw new Error(`Recurring config not found: ${configId}`);
  }

  const template = await prisma.task.findFirst({
    where: { id: config.taskTemplateId, entityId },
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
  entityId: VerifiedEntityId,
  days = 30
): Promise<Array<{ config: RecurringTaskConfig; nextDue: Date }>> {
  const cutoff = addDays(new Date(), days);
  const results: Array<{ config: RecurringTaskConfig; nextDue: Date }> = [];

  for (const config of recurringConfigs.values()) {
    if (!config.isActive) continue;
    if (config.entityId !== entityId) continue;

    if (config.nextDue <= cutoff) {
      results.push({ config, nextDue: config.nextDue });
    }
  }

  return results.sort((a, b) => a.nextDue.getTime() - b.nextDue.getTime());
}

export async function adjustCadence(
  configId: string,
  entityId: VerifiedEntityId
): Promise<RecurringTaskConfig> {
  const config = getScopedConfig(configId, entityId);
  if (!config) {
    throw new Error(`Recurring config not found: ${configId}`);
  }

  if (!config.autoAdjust) {
    return config;
  }

  // Analyze completion patterns for tasks generated from this config
  const generatedTasks = await prisma.task.findMany({
    where: {
      entityId,
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

export async function getRecurringConfigs(
  entityId: VerifiedEntityId
): Promise<RecurringTaskConfig[]> {
  const configs: RecurringTaskConfig[] = [];

  for (const config of recurringConfigs.values()) {
    if (config.entityId === entityId) {
      configs.push(config);
    }
  }

  return configs;
}

export async function deactivateRecurring(
  configId: string,
  entityId: VerifiedEntityId
): Promise<void> {
  const config = getScopedConfig(configId, entityId);
  if (!config) {
    throw new Error(`Recurring config not found: ${configId}`);
  }

  config.isActive = false;
  recurringConfigs.set(config.id, config);
}

export async function checkSLACompliance(
  configId: string,
  entityId: VerifiedEntityId
): Promise<{
  compliant: boolean;
  averageCompletionHours: number;
  slaHours: number;
  complianceRate: number;
}> {
  const config = getScopedConfig(configId, entityId);
  if (!config) {
    throw new Error(`Recurring config not found: ${configId}`);
  }

  const slaHours = config.slaHours ?? 168;

  const generatedTasks = await prisma.task.findMany({
    where: {
      entityId,
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
