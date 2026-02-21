import { addMonths, addDays, isBefore, addYears } from 'date-fns';
import { generateJSON } from '@/lib/ai';
import { prisma } from '@/lib/db';
import type { MaintenanceTask } from '../types';

function calculateNextDueDate(frequency: MaintenanceTask['frequency'], fromDate: Date): Date | null {
  switch (frequency) {
    case 'MONTHLY': return addMonths(fromDate, 1);
    case 'QUARTERLY': return addMonths(fromDate, 3);
    case 'BIANNUAL': return addMonths(fromDate, 6);
    case 'ANNUAL': return addYears(fromDate, 1);
    case 'ONE_TIME': return null;
    default: return addMonths(fromDate, 1);
  }
}

function taskToMaintenance(task: {
  id: string;
  title: string;
  description: string | null;
  entityId: string;
  status: string;
  dueDate: Date | null;
  createdFrom: unknown;
  tags: string[];
}): MaintenanceTask {
  const meta = (task.createdFrom ?? {}) as Record<string, unknown>;
  return {
    id: task.id,
    userId: task.entityId,
    category: (meta.category as MaintenanceTask['category']) ?? 'GENERAL',
    title: task.title,
    description: task.description ?? undefined,
    frequency: (meta.frequency as MaintenanceTask['frequency']) ?? 'ONE_TIME',
    season: meta.season as MaintenanceTask['season'],
    lastCompletedDate: meta.lastCompletedDate ? new Date(meta.lastCompletedDate as string) : undefined,
    nextDueDate: task.dueDate ?? new Date(meta.nextDueDate as string),
    assignedProviderId: meta.assignedProviderId as string | undefined,
    estimatedCostUsd: meta.estimatedCostUsd as number | undefined,
    status: (meta.maintenanceStatus as MaintenanceTask['status']) ?? 'UPCOMING',
    notes: meta.notes as string | undefined,
  };
}

export async function createTask(
  userId: string,
  task: Omit<MaintenanceTask, 'id' | 'status'>
): Promise<MaintenanceTask> {
  const now = new Date();
  const maintenanceStatus = isBefore(new Date(task.nextDueDate), now) ? 'OVERDUE' : 'UPCOMING';

  const created = await prisma.task.create({
    data: {
      title: task.title,
      description: task.description ?? null,
      entityId: userId,
      priority: 'P1',
      status: 'TODO',
      dueDate: new Date(task.nextDueDate),
      tags: ['maintenance'],
      createdFrom: {
        category: task.category,
        frequency: task.frequency,
        season: task.season,
        estimatedCostUsd: task.estimatedCostUsd,
        nextDueDate: new Date(task.nextDueDate).toISOString(),
        lastCompletedDate: task.lastCompletedDate ? new Date(task.lastCompletedDate).toISOString() : null,
        assignedProviderId: task.assignedProviderId,
        maintenanceStatus,
        notes: task.notes,
      },
    },
  });

  return taskToMaintenance(created);
}

export async function getUpcomingTasks(userId: string, days: number): Promise<MaintenanceTask[]> {
  const now = new Date();
  const futureDate = addDays(now, days);

  const tasks = await prisma.task.findMany({
    where: {
      entityId: userId,
      tags: { has: 'maintenance' },
      deletedAt: null,
    },
  });

  const mapped: MaintenanceTask[] = tasks.map(taskToMaintenance);
  return mapped.filter(
    (t: MaintenanceTask) =>
      t.status !== 'COMPLETED' &&
      t.status !== 'SKIPPED' &&
      !isBefore(new Date(t.nextDueDate), now) &&
      isBefore(new Date(t.nextDueDate), futureDate)
  );
}

export async function getOverdueTasks(userId: string): Promise<MaintenanceTask[]> {
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: {
      entityId: userId,
      tags: { has: 'maintenance' },
      deletedAt: null,
    },
  });

  const mapped: MaintenanceTask[] = tasks.map(taskToMaintenance);
  return mapped
    .filter((t: MaintenanceTask) => isBefore(new Date(t.nextDueDate), now) && t.status !== 'COMPLETED' && t.status !== 'SKIPPED')
    .map((t: MaintenanceTask) => ({ ...t, status: 'OVERDUE' as const }));
}

export async function completeTask(taskId: string): Promise<MaintenanceTask> {
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) throw new Error(`Task ${taskId} not found`);

  const meta = (existing.createdFrom ?? {}) as Record<string, unknown>;
  const now = new Date();

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: 'DONE',
      createdFrom: {
        ...meta,
        maintenanceStatus: 'COMPLETED',
        lastCompletedDate: now.toISOString(),
      },
    },
  });

  const frequency = (meta.frequency as MaintenanceTask['frequency']) ?? 'ONE_TIME';
  const nextDue = calculateNextDueDate(frequency, now);

  if (nextDue) {
    await prisma.task.create({
      data: {
        title: existing.title,
        description: existing.description,
        entityId: existing.entityId,
        priority: existing.priority,
        status: 'TODO',
        dueDate: nextDue,
        tags: ['maintenance'],
        createdFrom: {
          ...meta,
          maintenanceStatus: 'UPCOMING',
          nextDueDate: nextDue.toISOString(),
          lastCompletedDate: now.toISOString(),
        },
      },
    });
  }

  return taskToMaintenance(updated);
}

export async function getSeasonalSchedule(userId: string, season: string): Promise<MaintenanceTask[]> {
  const tasks = await prisma.task.findMany({
    where: {
      entityId: userId,
      tags: { has: 'maintenance' },
      deletedAt: null,
    },
  });

  const mapped: MaintenanceTask[] = tasks.map(taskToMaintenance);
  return mapped.filter((t: MaintenanceTask) => t.season === season || t.season === 'ANY');
}

export async function generateAnnualSchedule(userId: string): Promise<MaintenanceTask[]> {
  const now = new Date();
  const year = now.getFullYear();
  const templates: Omit<MaintenanceTask, 'id' | 'status'>[] = [
    { userId, category: 'HVAC', title: 'Replace HVAC filter', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 0, 15), estimatedCostUsd: 30 },
    { userId, category: 'HVAC', title: 'Replace HVAC filter', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 3, 15), estimatedCostUsd: 30 },
    { userId, category: 'HVAC', title: 'Replace HVAC filter', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 6, 15), estimatedCostUsd: 30 },
    { userId, category: 'HVAC', title: 'Replace HVAC filter', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 9, 15), estimatedCostUsd: 30 },
    { userId, category: 'GENERAL', title: 'Clean gutters', frequency: 'BIANNUAL', season: 'SPRING', nextDueDate: new Date(year, 3, 1), estimatedCostUsd: 150 },
    { userId, category: 'GENERAL', title: 'Clean gutters', frequency: 'BIANNUAL', season: 'FALL', nextDueDate: new Date(year, 10, 1), estimatedCostUsd: 150 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'SPRING', nextDueDate: new Date(year, 2, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'SPRING', nextDueDate: new Date(year, 3, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'SPRING', nextDueDate: new Date(year, 4, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'SUMMER', nextDueDate: new Date(year, 5, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'SUMMER', nextDueDate: new Date(year, 6, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'SUMMER', nextDueDate: new Date(year, 7, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'FALL', nextDueDate: new Date(year, 8, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'FALL', nextDueDate: new Date(year, 9, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'FALL', nextDueDate: new Date(year, 10, 15), estimatedCostUsd: 50 },
    { userId, category: 'PEST', title: 'Pest control treatment', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 2, 1), estimatedCostUsd: 100 },
    { userId, category: 'PEST', title: 'Pest control treatment', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 5, 1), estimatedCostUsd: 100 },
    { userId, category: 'PEST', title: 'Pest control treatment', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 8, 1), estimatedCostUsd: 100 },
    { userId, category: 'PEST', title: 'Pest control treatment', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 11, 1), estimatedCostUsd: 100 },
    { userId, category: 'HVAC', title: 'HVAC system tune-up', frequency: 'BIANNUAL', season: 'SPRING', nextDueDate: new Date(year, 2, 15), estimatedCostUsd: 200 },
    { userId, category: 'HVAC', title: 'HVAC system tune-up', frequency: 'BIANNUAL', season: 'FALL', nextDueDate: new Date(year, 9, 15), estimatedCostUsd: 200 },
    { userId, category: 'GENERAL', title: 'Replace smoke detector batteries', frequency: 'ANNUAL', season: 'FALL', nextDueDate: new Date(year, 10, 1), estimatedCostUsd: 20 },
    { userId, category: 'APPLIANCE', title: 'Clean dryer vent', frequency: 'ANNUAL', season: 'ANY', nextDueDate: new Date(year, 5, 1), estimatedCostUsd: 100 },
  ];

  const optimizedTemplates = [...templates];
  try {
    const taskSummary = templates.map(t => ({
      title: t.title,
      category: t.category,
      frequency: t.frequency,
      season: t.season,
      month: new Date(t.nextDueDate).getMonth() + 1,
      cost: t.estimatedCostUsd,
    }));

    const aiResult = await generateJSON<{
      optimizations: { title: string; suggestedMonth?: number; reason?: string }[];
    }>(
      `Review this annual home maintenance schedule and suggest optimizations.

Current schedule: ${JSON.stringify(taskSummary, null, 2)}

Consider:
- Seasonal appropriateness (e.g., HVAC before extreme weather)
- Cost optimization (bundle related tasks)
- Regional climate patterns

Return a JSON object with:
- "optimizations": array of { "title": string, "suggestedMonth": number (1-12), "reason": string }
Only include tasks that should be rescheduled. Omit tasks that are already optimally scheduled.`,
      {
        temperature: 0.4,
        system: 'You are a home maintenance scheduling expert. Suggest practical schedule optimizations considering seasonal factors, cost efficiency, and common maintenance best practices.',
      }
    );

    if (aiResult.optimizations) {
      for (const opt of aiResult.optimizations) {
        const idx = optimizedTemplates.findIndex(t => t.title === opt.title && opt.suggestedMonth);
        if (idx >= 0 && opt.suggestedMonth) {
          const currentDate = new Date(optimizedTemplates[idx].nextDueDate);
          optimizedTemplates[idx] = {
            ...optimizedTemplates[idx],
            nextDueDate: new Date(year, opt.suggestedMonth - 1, currentDate.getDate()),
          };
        }
      }
    }
  } catch {
    // Fall through to use original templates
  }

  const tasks: MaintenanceTask[] = [];
  for (const template of optimizedTemplates) {
    const task = await createTask(userId, template);
    tasks.push(task);
  }

  return tasks;
}
