import { prisma } from '@/lib/db';
import type { ActionLog, Message, Task, Workflow } from '@prisma/client';
import type { AIAccuracyMetrics } from '../types';

// --- Existing accuracy metrics (Phase 2) ---

export async function calculateAccuracyMetrics(
  entityId: string,
  period: string
): Promise<AIAccuracyMetrics> {
  const { startDate, endDate } = parsePeriod(period);

  // Triage accuracy: measure from ActionLog overrides
  const triageActions = await prisma.actionLog.findMany({
    where: {
      actionType: 'TRIAGE',
      timestamp: { gte: startDate, lte: endDate },
    },
  });
  const triageOverrides = triageActions.filter(
    (a: ActionLog) => a.status === 'ROLLED_BACK'
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
  const drafts = messages.filter((m: Message) => m.draftStatus !== null);
  const approved = drafts.filter(
    (m: Message) => m.draftStatus === 'APPROVED' || m.draftStatus === 'SENT'
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
    (t: Task) => t.dueDate && t.updatedAt <= t.dueDate
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
          workflows.reduce((sum: number, w: Workflow) => sum + w.successRate, 0) / workflows.length
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

// --- Prediction tracking (Phase 3) ---

export async function trackPrediction(
  entityId: string,
  prediction: {
    module: string;
    predictionType: string;
    predictedValue: unknown;
    confidence: number;
    timestamp: Date;
  }
): Promise<{ id: string }> {
  const details = {
    module: prediction.module,
    predictionType: prediction.predictionType,
    predictedValue: prediction.predictedValue,
    confidence: prediction.confidence,
    entityId,
  };

  const log = await prisma.actionLog.create({
    data: {
      actor: 'AI',
      actionType: 'AI_PREDICTION',
      target: entityId,
      reason: JSON.stringify(details),
      blastRadius: 'LOW',
      reversible: false,
      status: 'PENDING',
      timestamp: prediction.timestamp,
    },
  });

  return { id: log.id };
}

export async function recordOutcome(
  predictionId: string,
  actualValue: unknown
): Promise<void> {
  const log = await prisma.actionLog.findUnique({ where: { id: predictionId } });
  if (!log) throw new Error(`Prediction not found: ${predictionId}`);

  let details: Record<string, unknown> = {};
  try {
    details = JSON.parse(log.reason);
  } catch {
    details = {};
  }

  const predictedValue = details.predictedValue;
  const accurate = JSON.stringify(predictedValue) === JSON.stringify(actualValue);

  details.actualValue = actualValue;
  details.accurate = accurate;

  await prisma.actionLog.update({
    where: { id: predictionId },
    data: {
      reason: JSON.stringify(details),
      status: accurate ? 'COMPLETED' : 'ROLLED_BACK',
    },
  });
}

export async function getAccuracyByModule(
  entityId: string,
  dateRange?: { start: Date; end: Date }
): Promise<{ module: string; accuracy: number; total: number }[]> {
  const where: Record<string, unknown> = {
    actionType: 'AI_PREDICTION',
    target: entityId,
  };
  if (dateRange) {
    where.timestamp = { gte: dateRange.start, lte: dateRange.end };
  }

  const predictions = await prisma.actionLog.findMany({ where });

  const moduleMap = new Map<string, { correct: number; total: number }>();
  for (const pred of predictions) {
    let details: Record<string, unknown> = {};
    try {
      details = JSON.parse(pred.reason);
    } catch {
      continue;
    }

    const moduleName = (details.module as string) ?? 'unknown';
    const existing = moduleMap.get(moduleName) ?? { correct: 0, total: 0 };
    existing.total++;
    if (details.accurate === true) {
      existing.correct++;
    }
    moduleMap.set(moduleName, existing);
  }

  return Array.from(moduleMap.entries()).map(([module, data]) => ({
    module,
    accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
    total: data.total,
  }));
}

export async function getOverallAccuracy(
  entityId: string,
  dateRange?: { start: Date; end: Date }
): Promise<{ accuracy: number; total: number }> {
  const byModule = await getAccuracyByModule(entityId, dateRange);
  const total = byModule.reduce((sum, m) => sum + m.total, 0);
  const correctTotal = byModule.reduce(
    (sum, m) => sum + Math.round((m.accuracy / 100) * m.total),
    0
  );

  return {
    accuracy: total > 0 ? Math.round((correctTotal / total) * 100) : 0,
    total,
  };
}

export async function getAccuracyTrendByPredictions(
  entityId: string,
  periodDays: number
): Promise<{ period: string; accuracy: number; total: number }[]> {
  const now = new Date();
  const results: { period: string; accuracy: number; total: number }[] = [];

  // Calculate 4 rolling periods
  const numPeriods = 4;
  for (let i = numPeriods - 1; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(end.getDate() - i * periodDays);
    const start = new Date(end);
    start.setDate(start.getDate() - periodDays);

    const result = await getOverallAccuracy(entityId, { start, end });
    results.push({
      period: start.toISOString().split('T')[0],
      accuracy: result.accuracy,
      total: result.total,
    });
  }

  return results;
}

// --- Helpers ---

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
