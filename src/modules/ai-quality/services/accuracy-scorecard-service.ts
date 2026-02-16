import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
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
    (a: any) => a.status === 'ROLLED_BACK'
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
    (m: any) => m.draftStatus === 'APPROVED' || m.draftStatus === 'SENT'
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
    (t: any) => t.status !== 'DONE' || (t.dueDate && t.updatedAt > t.dueDate)
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
          workflows.reduce((sum: number, w: any) => sum + w.successRate, 0) /
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

const DEFAULT_SUGGESTIONS: Record<string, string> = {
  'Triage Accuracy': 'Review triage rules and adjust priority thresholds.',
  'Draft Approval Rate': 'Improve draft templates and incorporate user tone preferences.',
  'Deadline Performance': 'Add buffer time to deadline estimates and improve task dependency tracking.',
  'Automation Success': 'Review failed workflow steps and add error handling for edge cases.',
};

export async function getGradeBreakdown(
  scorecard: AccuracyScorecard
): Promise<{ dimension: string; score: number; grade: string; suggestion: string }[]> {
  const dimensions = [
    { dimension: 'Triage Accuracy', score: scorecard.triageAccuracy },
    { dimension: 'Draft Approval Rate', score: scorecard.draftApprovalRate },
    { dimension: 'Deadline Performance', score: 100 - scorecard.missedDeadlineRate },
    { dimension: 'Automation Success', score: scorecard.automationSuccessRate },
  ];

  try {
    const aiSuggestions = await generateJSON<{ suggestions: Record<string, string> }>(
      `You are an AI quality improvement advisor. Analyze these accuracy scorecard dimensions and provide specific improvement suggestions for each.

Scorecard for period ${scorecard.period}:
- Triage Accuracy: ${scorecard.triageAccuracy}% (Grade: ${scoreToGrade(scorecard.triageAccuracy)})
- Draft Approval Rate: ${scorecard.draftApprovalRate}% (Grade: ${scoreToGrade(scorecard.draftApprovalRate)})
- Deadline Performance: ${100 - scorecard.missedDeadlineRate}% (Grade: ${scoreToGrade(100 - scorecard.missedDeadlineRate)})
- Automation Success: ${scorecard.automationSuccessRate}% (Grade: ${scoreToGrade(scorecard.automationSuccessRate)})

Respond with JSON: { "suggestions": { "Triage Accuracy": "...", "Draft Approval Rate": "...", "Deadline Performance": "...", "Automation Success": "..." } }
Each suggestion should be 1-2 sentences with specific, actionable advice.`,
      { temperature: 0.4, maxTokens: 512 }
    );

    return dimensions.map((d) => ({
      ...d,
      grade: scoreToGrade(d.score),
      suggestion: aiSuggestions.suggestions[d.dimension] ?? DEFAULT_SUGGESTIONS[d.dimension] ?? '',
    }));
  } catch {
    return dimensions.map((d) => ({
      ...d,
      grade: scoreToGrade(d.score),
      suggestion: DEFAULT_SUGGESTIONS[d.dimension] ?? '',
    }));
  }
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
