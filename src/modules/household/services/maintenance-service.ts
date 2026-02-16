import { v4 as uuidv4 } from 'uuid';
import { addMonths, addDays, isBefore, addYears } from 'date-fns';
import { generateJSON } from '@/lib/ai';
import type { MaintenanceTask } from '../types';

const taskStore = new Map<string, MaintenanceTask>();

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

export async function createTask(
  userId: string,
  task: Omit<MaintenanceTask, 'id' | 'status'>
): Promise<MaintenanceTask> {
  const now = new Date();
  const newTask: MaintenanceTask = {
    ...task,
    id: uuidv4(),
    userId,
    status: isBefore(new Date(task.nextDueDate), now) ? 'OVERDUE' : 'UPCOMING',
  };
  taskStore.set(newTask.id, newTask);
  return newTask;
}

export async function getUpcomingTasks(userId: string, days: number): Promise<MaintenanceTask[]> {
  const now = new Date();
  const futureDate = addDays(now, days);
  return Array.from(taskStore.values()).filter(
    t => t.userId === userId && t.status !== 'COMPLETED' && t.status !== 'SKIPPED' &&
      !isBefore(new Date(t.nextDueDate), now) && isBefore(new Date(t.nextDueDate), futureDate)
  );
}

export async function getOverdueTasks(userId: string): Promise<MaintenanceTask[]> {
  const now = new Date();
  return Array.from(taskStore.values())
    .filter(t => t.userId === userId && isBefore(new Date(t.nextDueDate), now) && t.status !== 'COMPLETED' && t.status !== 'SKIPPED')
    .map(t => ({ ...t, status: 'OVERDUE' as const }));
}

export async function completeTask(taskId: string): Promise<MaintenanceTask> {
  const task = taskStore.get(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const now = new Date();
  task.lastCompletedDate = now;
  task.status = 'COMPLETED';

  const nextDue = calculateNextDueDate(task.frequency, now);
  if (nextDue) {
    // Create the next occurrence
    const nextTask: MaintenanceTask = {
      ...task,
      id: uuidv4(),
      status: 'UPCOMING',
      nextDueDate: nextDue,
      lastCompletedDate: now,
    };
    taskStore.set(nextTask.id, nextTask);
  }

  taskStore.set(taskId, task);
  return task;
}

export async function getSeasonalSchedule(userId: string, season: string): Promise<MaintenanceTask[]> {
  return Array.from(taskStore.values()).filter(
    t => t.userId === userId && (t.season === season || t.season === 'ANY')
  );
}

export async function generateAnnualSchedule(userId: string): Promise<MaintenanceTask[]> {
  const now = new Date();
  const year = now.getFullYear();
  const templates: Omit<MaintenanceTask, 'id' | 'status'>[] = [
    // HVAC filter changes - quarterly
    { userId, category: 'HVAC', title: 'Replace HVAC filter', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 0, 15), estimatedCostUsd: 30 },
    { userId, category: 'HVAC', title: 'Replace HVAC filter', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 3, 15), estimatedCostUsd: 30 },
    { userId, category: 'HVAC', title: 'Replace HVAC filter', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 6, 15), estimatedCostUsd: 30 },
    { userId, category: 'HVAC', title: 'Replace HVAC filter', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 9, 15), estimatedCostUsd: 30 },
    // Gutter cleaning - biannual
    { userId, category: 'GENERAL', title: 'Clean gutters', frequency: 'BIANNUAL', season: 'SPRING', nextDueDate: new Date(year, 3, 1), estimatedCostUsd: 150 },
    { userId, category: 'GENERAL', title: 'Clean gutters', frequency: 'BIANNUAL', season: 'FALL', nextDueDate: new Date(year, 10, 1), estimatedCostUsd: 150 },
    // Lawn care - monthly spring/summer/fall
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'SPRING', nextDueDate: new Date(year, 2, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'SPRING', nextDueDate: new Date(year, 3, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'SPRING', nextDueDate: new Date(year, 4, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'SUMMER', nextDueDate: new Date(year, 5, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'SUMMER', nextDueDate: new Date(year, 6, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'SUMMER', nextDueDate: new Date(year, 7, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'FALL', nextDueDate: new Date(year, 8, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'FALL', nextDueDate: new Date(year, 9, 15), estimatedCostUsd: 50 },
    { userId, category: 'LAWN', title: 'Lawn mowing and maintenance', frequency: 'MONTHLY', season: 'FALL', nextDueDate: new Date(year, 10, 15), estimatedCostUsd: 50 },
    // Pest control - quarterly
    { userId, category: 'PEST', title: 'Pest control treatment', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 2, 1), estimatedCostUsd: 100 },
    { userId, category: 'PEST', title: 'Pest control treatment', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 5, 1), estimatedCostUsd: 100 },
    { userId, category: 'PEST', title: 'Pest control treatment', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 8, 1), estimatedCostUsd: 100 },
    { userId, category: 'PEST', title: 'Pest control treatment', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date(year, 11, 1), estimatedCostUsd: 100 },
    // HVAC tune-up - biannual
    { userId, category: 'HVAC', title: 'HVAC system tune-up', frequency: 'BIANNUAL', season: 'SPRING', nextDueDate: new Date(year, 2, 15), estimatedCostUsd: 200 },
    { userId, category: 'HVAC', title: 'HVAC system tune-up', frequency: 'BIANNUAL', season: 'FALL', nextDueDate: new Date(year, 9, 15), estimatedCostUsd: 200 },
    // Smoke detector battery - annual
    { userId, category: 'GENERAL', title: 'Replace smoke detector batteries', frequency: 'ANNUAL', season: 'FALL', nextDueDate: new Date(year, 10, 1), estimatedCostUsd: 20 },
    // Dryer vent cleaning - annual
    { userId, category: 'APPLIANCE', title: 'Clean dryer vent', frequency: 'ANNUAL', season: 'ANY', nextDueDate: new Date(year, 5, 1), estimatedCostUsd: 100 },
  ];

  // Use AI to optimize the schedule based on seasonal considerations
  let optimizedTemplates = templates;
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

    // Apply AI-suggested optimizations to templates
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
