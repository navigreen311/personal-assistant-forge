import { prisma } from '@/lib/db';
import { differenceInDays } from 'date-fns';
import type { ProcrastinationAlert } from '../types';

export async function detectProcrastination(entityId: string): Promise<ProcrastinationAlert[]> {
  const alerts: ProcrastinationAlert[] = [];
  const now = new Date();

  const activeTasks = await prisma.task.findMany({
    where: {
      entityId,
      status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] },
    },
  });

  for (const task of activeTasks) {
    const daysSinceCreation = differenceInDays(now, task.createdAt);
    const daysSinceUpdate = differenceInDays(now, task.updatedAt);

    // Get deferral history
    const deferrals = await prisma.actionLog.count({
      where: {
        target: task.id,
        actionType: 'TASK_DEFERRED',
      },
    });

    // Get original due date from first deferral log
    let originalDueDate: Date | undefined;
    if (deferrals > 0) {
      const firstDeferral = await prisma.actionLog.findFirst({
        where: { target: task.id, actionType: 'TASK_DEFERRED' },
        orderBy: { timestamp: 'asc' },
      });
      if (firstDeferral) {
        const match = firstDeferral.reason.match(/from (.+?) to/);
        if (match) {
          originalDueDate = new Date(match[1]);
        }
      }
    }

    let shouldAlert = false;
    let suggestion: ProcrastinationAlert['suggestion'] = 'SCHEDULE_NOW';
    let reason = '';

    // Signal: Due date deferred 2+ times
    if (deferrals >= 2) {
      shouldAlert = true;
      if (deferrals >= 5) {
        suggestion = 'ELIMINATE';
        reason = `This task has been deferred ${deferrals} times. Consider whether it's still needed.`;
      } else if (deferrals >= 3) {
        suggestion = 'BREAK_DOWN';
        reason = `Deferred ${deferrals} times. This task may be too large — try splitting it into smaller steps.`;
      } else {
        suggestion = 'SCHEDULE_NOW';
        reason = `Deferred ${deferrals} times. Block dedicated time on your calendar to complete this.`;
      }
    }

    // Signal: TODO for > 14 days with no activity
    if (!shouldAlert && task.status === 'TODO' && daysSinceCreation > 14 && daysSinceUpdate > 14) {
      shouldAlert = true;
      suggestion = 'DELEGATE';
      reason = `This task has been in TODO for ${daysSinceCreation} days with no activity. Consider delegating it.`;
    }

    // Signal: IN_PROGRESS for > 7 days with no updates
    if (!shouldAlert && task.status === 'IN_PROGRESS' && daysSinceUpdate > 7) {
      shouldAlert = true;
      suggestion = 'BREAK_DOWN';
      reason = `In progress for over a week with no updates. Try breaking it into smaller, achievable subtasks.`;
    }

    // Signal: BLOCKED without resolution
    if (!shouldAlert && task.status === 'BLOCKED' && daysSinceUpdate > 3) {
      shouldAlert = true;
      suggestion = 'SCHEDULE_NOW';
      reason = `Blocked for ${daysSinceUpdate} days. Address the blocker or escalate to unblock progress.`;
    }

    if (shouldAlert) {
      alerts.push({
        taskId: task.id,
        taskTitle: task.title,
        deferrals,
        originalDueDate,
        currentDueDate: task.dueDate ?? undefined,
        daysSinceCreation,
        suggestion,
        reason,
      });
    }
  }

  // Sort by severity: more deferrals and older tasks first
  alerts.sort((a, b) => {
    const scoreDiff = (b.deferrals * 10 + b.daysSinceCreation) - (a.deferrals * 10 + a.daysSinceCreation);
    return scoreDiff;
  });

  return alerts;
}

export function getSuggestion(alert: ProcrastinationAlert): string {
  switch (alert.suggestion) {
    case 'BREAK_DOWN':
      return `This task may be too large. Try breaking "${alert.taskTitle}" into 3-5 smaller subtasks that can each be completed in under an hour.`;
    case 'DELEGATE':
      return `Consider delegating "${alert.taskTitle}" to a team member who has capacity. It's been waiting for ${alert.daysSinceCreation} days.`;
    case 'ELIMINATE':
      return `"${alert.taskTitle}" has been deferred ${alert.deferrals} times. Consider whether it's still needed — cancelling it may free up mental bandwidth.`;
    case 'SCHEDULE_NOW':
      return `Block 90 minutes on your calendar right now to complete "${alert.taskTitle}". Treat it as a non-negotiable meeting with yourself.`;
  }
}

export async function getTaskDeferralHistory(
  taskId: string
): Promise<Array<{ date: Date; oldDueDate?: Date; newDueDate?: Date }>> {
  const logs = await prisma.actionLog.findMany({
    where: {
      target: taskId,
      actionType: 'TASK_DEFERRED',
    },
    orderBy: { timestamp: 'asc' },
  });

  return logs.map((log) => {
    const fromMatch = log.reason.match(/from (.+?) to/);
    const toMatch = log.reason.match(/to (.+)$/);

    return {
      date: log.timestamp,
      oldDueDate: fromMatch ? new Date(fromMatch[1]) : undefined,
      newDueDate: toMatch ? new Date(toMatch[1]) : undefined,
    };
  });
}
