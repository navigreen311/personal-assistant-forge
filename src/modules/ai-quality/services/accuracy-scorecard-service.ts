import { prisma } from '@/lib/db';
import type { AccuracyScorecard } from '../types';

export async function generateScorecard(
  entityId: string,
  period: string
): Promise<AccuracyScorecard> {
  const { startDate, endDate } = parsePeriod(period);

  // Triage accuracy from ActionLog overrides
  const triageActions = await prisma.actionLog.findMany({
    where: {
      actionType: 'TRIAGE',
      timestamp: { gte: startDate, lte: endDate },
    },
  });
  const triageOverrides = triageActions.filter(
    (a) => a.status === 'ROLLED_BACK'
  ).length;
  const triageAccuracy =
    triageActions.length > 0
      ? Math.round(
          ((triageActions.length - triageOverrides) / triageActions.length) * 100
        )
      : 100;

  // Draft approval rate from Messages
  const messages = await prisma.message.findMany({
    where: {
      entityId,
      draftStatus: { not: null },
      createdAt: { gte: startDate, lte: endDate },
    },
  });
  const approved = messages.filter(
    (m) => m.draftStatus === 'APPROVED' || m.draftStatus === 'SENT'
  ).length;
  const draftApprovalRate =
    messages.length > 0
      ? Math.round((approved / messages.length) * 100)
      : 100;

  // Missed deadline rate from Tasks
  const tasksWithDeadline = await prisma.task.findMany({
    where: {
      entityId,
      dueDate: { not: null, lte: endDate },
      updatedAt: { gte: startDate },
    },
  });
  const missed = tasksWithDeadline.filter(
    (t) => t.status !== 'DONE' || (t.dueDate && t.updatedAt > t.dueDate)
  ).length;
  const missedDeadlineRate =
    tasksWithDeadline.length > 0
      ? Math.round((missed / tasksWithDeadline.length) * 100)
      : 0;

  // Automation success rate from Workflows
  const workflows = await prisma.workflow.findMany({
    where: { entityId, status: 'ACTIVE' },
  });
  const automationSuccessRate =
    workflows.length > 0
      ? Math.round(
          workflows.reduce((sum, w) => sum + w.successRate, 0) /
            workflows.length
        )
      : 100;

  // Overall = average of (triage, draft, 100-missed, automation)
  const overallScore = Math.round(
    (triageAccuracy +
      draftApprovalRate +
      (100 - missedDeadlineRate) +
      automationSuccessRate) /
      4
  );

  const overallGrade = scoreToGrade(overallScore);

  return {
    entityId,
    period,
    triageAccuracy,
    draftApprovalRate,
    missedDeadlineRate,
    automationSuccessRate,
    overallGrade,
  };
}

export async function getScorecardHistory(
  entityId: string,
  periods: number
): Promise<AccuracyScorecard[]> {
  const results: AccuracyScorecard[] = [];
  const now = new Date();

  for (let i = periods - 1; i >= 0; i--) {
    const weekDate = new Date(now);
    weekDate.setDate(weekDate.getDate() - i * 7);
    const year = weekDate.getFullYear();
    const weekNum = getWeekNumber(weekDate);
    const period = `${year}-${String(weekDate.getMonth() + 1).padStart(2, '0')}-W${weekNum}`;

    const scorecard = await generateScorecard(entityId, period);
    results.push(scorecard);
  }

  return results;
}

export function getGradeBreakdown(
  scorecard: AccuracyScorecard
): { dimension: string; score: number; grade: string; suggestion: string }[] {
  const dimensions = [
    {
      dimension: 'Triage Accuracy',
      score: scorecard.triageAccuracy,
      suggestion: 'Review triage rules and adjust priority thresholds.',
    },
    {
      dimension: 'Draft Approval Rate',
      score: scorecard.draftApprovalRate,
      suggestion:
        'Improve draft templates and incorporate user tone preferences.',
    },
    {
      dimension: 'Deadline Performance',
      score: 100 - scorecard.missedDeadlineRate,
      suggestion:
        'Add buffer time to deadline estimates and improve task dependency tracking.',
    },
    {
      dimension: 'Automation Success',
      score: scorecard.automationSuccessRate,
      suggestion:
        'Review failed workflow steps and add error handling for edge cases.',
    },
  ];

  return dimensions.map((d) => ({
    ...d,
    grade: scoreToGrade(d.score),
  }));
}

export function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function parsePeriod(period: string): { startDate: Date; endDate: Date } {
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

  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = parseInt(monthMatch[1]);
    const month = parseInt(monthMatch[2]) - 1;
    return {
      startDate: new Date(year, month, 1),
      endDate: new Date(year, month + 1, 0, 23, 59, 59, 999),
    };
  }

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 7 * 86400000);
  return { startDate, endDate };
}

function getWeekNumber(date: Date): number {
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - jan1.getTime()) / 86400000);
  return Math.ceil((days + jan1.getDay() + 1) / 7);
}
