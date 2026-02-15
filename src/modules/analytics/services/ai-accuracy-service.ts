import { prisma } from '@/lib/db';
import type { AIAccuracyMetrics } from '../types';

export async function calculateAccuracyMetrics(
  entityId: string,
  period: string
): Promise<AIAccuracyMetrics> {
  // Parse period (e.g., "2026-02-W7") into date range
  const { startDate, endDate } = parsePeriod(period);

  // Triage accuracy: measure from ActionLog overrides
  const triageActions = await prisma.actionLog.findMany({
    where: {
      actionType: 'TRIAGE',
      timestamp: { gte: startDate, lte: endDate },
    },
  });
  const triageOverrides = triageActions.filter(
    (a: any) => a.status === 'ROLLED_BACK'
  ).length;
  const triageAccuracy =
    triageActions.length > 0
      ? Math.round(((triageActions.length - triageOverrides) / triageActions.length) * 100)
      : 100;

  // Draft approval rate: AI drafts approved without edits
  const messages = await prisma.message.findMany({
    where: {
      entityId,
      draftStatus: { in: ['APPROVED', 'SENT', 'DRAFT'] },
      createdAt: { gte: startDate, lte: endDate },
    },
  });
  const drafts = messages.filter((m: any) => m.draftStatus !== null);
  const approved = drafts.filter(
    (m: any) => m.draftStatus === 'APPROVED' || m.draftStatus === 'SENT'
  ).length;
  const draftApprovalRate =
    drafts.length > 0 ? Math.round((approved / drafts.length) * 100) : 100;

  // Prediction accuracy: tasks with deadlines - how many completed on time
  const tasks = await prisma.task.findMany({
    where: {
      entityId,
      dueDate: { not: null, lte: endDate },
      status: 'DONE',
      updatedAt: { gte: startDate, lte: endDate },
    },
  });
  const onTime = tasks.filter(
    (t: any) => t.dueDate && t.updatedAt <= t.dueDate
  ).length;
  const predictionAccuracy =
    tasks.length > 0 ? Math.round((onTime / tasks.length) * 100) : 100;

  // Automation success: workflow success rates
  const workflows = await prisma.workflow.findMany({
    where: {
      entityId,
      status: 'ACTIVE',
    },
  });
  const automationSuccess =
    workflows.length > 0
      ? Math.round(
          workflows.reduce((sum: number, w: any) => sum + w.successRate, 0) / workflows.length
        )
      : 100;

  const overallScore = Math.round(
    (triageAccuracy + draftApprovalRate + predictionAccuracy + automationSuccess) / 4
  );

  return {
    period,
    triageAccuracy,
    draftApprovalRate,
    predictionAccuracy,
    automationSuccess,
    overallScore,
  };
}

export async function getAccuracyTrend(
  entityId: string,
  periods: number
): Promise<AIAccuracyMetrics[]> {
  const results: AIAccuracyMetrics[] = [];
  const now = new Date();

  for (let i = periods - 1; i >= 0; i--) {
    const weekDate = new Date(now);
    weekDate.setDate(weekDate.getDate() - i * 7);
    const year = weekDate.getFullYear();
    const weekNum = getWeekNumber(weekDate);
    const period = `${year}-${String(weekDate.getMonth() + 1).padStart(2, '0')}-W${weekNum}`;

    const metrics = await calculateAccuracyMetrics(entityId, period);
    results.push(metrics);
  }

  return results;
}

function parsePeriod(period: string): { startDate: Date; endDate: Date } {
  // Parse formats like "2026-02-W7" or "2026-02"
  const weekMatch = period.match(/^(\d{4})-(\d{2})-W(\d+)$/);
  if (weekMatch) {
    const year = parseInt(weekMatch[1]);
    const week = parseInt(weekMatch[3]);
    const jan1 = new Date(year, 0, 1);
    const startDate = new Date(jan1.getTime() + (week - 1) * 7 * 86400000);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate.getTime() + 7 * 86400000);
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate };
  }

  // Monthly format "2026-02"
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = parseInt(monthMatch[1]);
    const month = parseInt(monthMatch[2]) - 1;
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { startDate, endDate };
  }

  // Default: last 7 days
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 7 * 86400000);
  return { startDate, endDate };
}

function getWeekNumber(date: Date): number {
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - jan1.getTime()) / 86400000);
  return Math.ceil((days + jan1.getDay() + 1) / 7);
}
