import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  period: z
    .enum(['thisWeek', 'thisMonth', 'thisQuarter', 'thisYear'])
    .optional()
    .default('thisWeek'),
});

/**
 * Safely execute a query, returning a default value on failure.
 */
const safeQuery = async <T>(fn: () => Promise<T>, defaultVal: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return defaultVal;
  }
};

/**
 * Compute the start and end dates for a given period.
 */
function getDateRange(period: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  let start: Date;
  switch (period) {
    case 'thisWeek': {
      start = new Date(now);
      const day = start.getDay();
      start.setDate(start.getDate() - day);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'thisMonth': {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    }
    case 'thisQuarter': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), quarterStartMonth, 1);
      break;
    }
    case 'thisYear': {
      start = new Date(now.getFullYear(), 0, 1);
      break;
    }
    default: {
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    }
  }
  return { start, end };
}

/**
 * Compute a letter grade from a numeric score (0-100).
 */
function computeGrade(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'B+';
  if (score >= 80) return 'B';
  if (score >= 75) return 'C+';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/** Default safe response when everything fails. */
const DEFAULT_RESPONSE = {
  grade: 'B',
  overallScore: 85,
  metrics: { triage: 92, draftApproval: 85, deadline: 88, automation: 88 },
  moduleBreakdown: [] as {
    module: string;
    accuracy: number;
    trend: string;
    volume: number;
    topIssue: string;
  }[],
  confidenceDistribution: [
    { bucket: '0-20%', count: 0 },
    { bucket: '20-40%', count: 0 },
    { bucket: '40-60%', count: 0 },
    { bucket: '60-80%', count: 0 },
    { bucket: '80-90%', count: 0 },
    { bucket: '90-100%', count: 0 },
  ],
  alerts: [] as { message: string; severity: string }[],
  totalDecisions: 0,
  avgConfidence: 0,
  overrideRate: 0,
};

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId, period } = parsed.data;
      // Underscore-prefixed since P-19: the two queries that consumed the date
      // range were removed (see below). The range is still computed because
      // `period` is part of the validated request contract.
      const { start: _start, end: _end } = getDateRange(period);

      // Determine entity IDs to query. Nothing reads the resulting list any
      // more (again, see below) but the ownership check must stay: it is what
      // answers 404 for an entity the caller does not own.
      let _entityIds: string[] = [];

      if (entityId) {
        // Verify entity ownership
        const entity = await prisma.entity.findFirst({
          where: { id: entityId, userId: session.userId },
        });
        if (!entity) {
          return error('NOT_FOUND', 'Entity not found or access denied', 404);
        }
        _entityIds = [entityId];
      } else {
        const entities = await safeQuery(
          () =>
            prisma.entity.findMany({
              where: { userId: session.userId },
              select: { id: true },
            }),
          [] as { id: string }[]
        );
        _entityIds = entities.map((e: { id: string }) => e.id);
      }

      // P-19. Both queries that used to stand here ran through
      // `(prisma as any)` and selected columns that do not exist:
      //
      //   prisma.actionLog.findMany({ select: { module, confidence, metadata } })
      //       -> ActionLog has none of those three.
      //   prisma.task.findMany({ select: { completedAt, module } })
      //       -> Task has neither.
      //
      // Verified against a real Postgres on this schema: both throw
      // `Unknown field ... for select statement`. `safeQuery` swallowed both,
      // so `actionLogs` and `aiDecisions` have been `[]` on every request since
      // the route was written -- which means every metric below fell to its
      // literal else-branch and this endpoint has always answered
      // grade "B+", overallScore 88, triage 92, draftApproval 85, deadline 88,
      // automation 88, totalDecisions 0, with an empty module breakdown. Those
      // are invented figures, presented as measurements, to every user on every
      // request: the same failure shape as `/api/health/dashboard`.
      //
      // The schema is frozen for this run, so the columns cannot be added here.
      // Following the P-10/T-026 precedent (crisis/config, delegation/stats,
      // execution/stats, voice/stats, household/dashboard, trip-service), the
      // dead calls are removed rather than left pretending to consult a store
      // that cannot answer. The response is byte-identical to what the route
      // has always returned; what changes is that the code no longer claims
      // otherwise, and `src/` loses four `any`s.
      //
      // FLAGGED TO THE COORDINATOR: making AI-quality real needs
      // `ActionLog.module`, `ActionLog.confidence`, `ActionLog.metadata` and
      // `Task.completedAt` -- a migration, and therefore a separate package.
      const actionLogs: {
        actionType: string;
        module: string | null;
        confidence: number | null;
        metadata: unknown;
        timestamp: Date;
      }[] = [];
      const aiDecisions: {
        status: string;
        dueDate: Date | null;
        completedAt: Date | null;
        module: string | null;
      }[] = [];

      // --- Compute metrics ---
      const counts: Record<string, number> = {};
      for (const log of actionLogs) {
        counts[log.actionType] = (counts[log.actionType] ?? 0) + 1;
      }

      // Triage accuracy
      const triageTotal =
        (counts['AI_TRIAGE'] ?? 0) + (counts['TRIAGE_OVERRIDE'] ?? 0);
      const triageAccuracy =
        triageTotal > 0
          ? Math.round(((counts['AI_TRIAGE'] ?? 0) / triageTotal) * 100)
          : 92;

      // Draft approval rate
      const draftTotal =
        (counts['AI_DRAFT'] ?? 0) + (counts['DRAFT_REJECTED'] ?? 0);
      const draftApproval =
        draftTotal > 0
          ? Math.round(((counts['AI_DRAFT'] ?? 0) / draftTotal) * 100)
          : 85;

      // Deadline accuracy (tasks completed on or before due date)
      const tasksWithDueDate = aiDecisions.filter(
        (t: { dueDate: Date | null }) => t.dueDate !== null
      );
      const tasksOnTime = tasksWithDueDate.filter(
        (t: { status: string; dueDate: Date | null; completedAt: Date | null }) => {
          if (t.status !== 'DONE' || !t.completedAt || !t.dueDate) return false;
          return new Date(t.completedAt) <= new Date(t.dueDate);
        }
      );
      const deadlineAccuracy =
        tasksWithDueDate.length > 0
          ? Math.round((tasksOnTime.length / tasksWithDueDate.length) * 100)
          : 88;

      // Automation accuracy
      const automationTotal =
        (counts['AI_AUTOMATION'] ?? 0) + (counts['AUTOMATION_OVERRIDE'] ?? 0);
      const automationAccuracy =
        automationTotal > 0
          ? Math.round(
              ((counts['AI_AUTOMATION'] ?? 0) / automationTotal) * 100
            )
          : 88;

      const metrics = {
        triage: triageAccuracy,
        draftApproval,
        deadline: deadlineAccuracy,
        automation: automationAccuracy,
      };

      // Overall score (weighted average of metrics)
      const overallScore = Math.round(
        metrics.triage * 0.3 +
          metrics.draftApproval * 0.25 +
          metrics.deadline * 0.25 +
          metrics.automation * 0.2
      );

      const grade = computeGrade(overallScore);

      // --- Module breakdown ---
      const moduleMap: Record<
        string,
        { correct: number; overridden: number; volume: number; issues: Record<string, number> }
      > = {};

      for (const log of actionLogs) {
        const mod = (log.module as string) ?? 'general';
        if (!moduleMap[mod]) {
          moduleMap[mod] = { correct: 0, overridden: 0, volume: 0, issues: {} };
        }
        moduleMap[mod].volume += 1;

        const isOverride =
          (log.actionType as string).includes('OVERRIDE') ||
          (log.actionType as string).includes('REJECTED') ||
          (log.actionType as string).includes('WRONG');

        if (isOverride) {
          moduleMap[mod].overridden += 1;
          const issue = log.actionType as string;
          moduleMap[mod].issues[issue] = (moduleMap[mod].issues[issue] ?? 0) + 1;
        } else {
          moduleMap[mod].correct += 1;
        }
      }

      const moduleBreakdown = Object.entries(moduleMap).map(([module, data]) => {
        const total = data.correct + data.overridden;
        const accuracy = total > 0 ? Math.round((data.correct / total) * 100) : 100;
        const topIssueEntry = Object.entries(data.issues).sort(
          ([, a], [, b]) => b - a
        )[0];
        return {
          module,
          accuracy,
          trend: accuracy >= 85 ? 'stable' : accuracy >= 70 ? 'declining' : 'critical',
          volume: data.volume,
          topIssue: topIssueEntry ? topIssueEntry[0] : 'none',
        };
      });

      // --- Confidence distribution ---
      const buckets = [
        { bucket: '0-20%', min: 0, max: 20, count: 0 },
        { bucket: '20-40%', min: 20, max: 40, count: 0 },
        { bucket: '40-60%', min: 40, max: 60, count: 0 },
        { bucket: '60-80%', min: 60, max: 80, count: 0 },
        { bucket: '80-90%', min: 80, max: 90, count: 0 },
        { bucket: '90-100%', min: 90, max: 101, count: 0 },
      ];

      let totalConfidence = 0;
      let confidenceCount = 0;

      for (const log of actionLogs) {
        const conf = log.confidence as number | null;
        if (conf != null && typeof conf === 'number') {
          const pct = conf <= 1 ? conf * 100 : conf;
          totalConfidence += pct;
          confidenceCount += 1;
          for (const b of buckets) {
            if (pct >= b.min && pct < b.max) {
              b.count += 1;
              break;
            }
          }
        }
      }

      const confidenceDistribution = buckets.map(({ bucket, count }) => ({
        bucket,
        count,
      }));

      const avgConfidence =
        confidenceCount > 0
          ? Math.round((totalConfidence / confidenceCount) * 10) / 10
          : 0;

      // --- Total decisions and override rate ---
      const totalDecisions = actionLogs.length;
      const totalOverrides = actionLogs.filter(
        (l: { actionType: string }) =>
          l.actionType.includes('OVERRIDE') ||
          l.actionType.includes('REJECTED') ||
          l.actionType.includes('WRONG')
      ).length;
      const overrideRate =
        totalDecisions > 0
          ? Math.round((totalOverrides / totalDecisions) * 1000) / 10
          : 0;

      // --- Alerts ---
      const alerts: { message: string; severity: string }[] = [];

      if (overallScore < 70) {
        alerts.push({
          message: 'AI quality score is below acceptable threshold (70)',
          severity: 'critical',
        });
      } else if (overallScore < 80) {
        alerts.push({
          message: 'AI quality score is declining — review recent overrides',
          severity: 'warning',
        });
      }

      if (overrideRate > 30) {
        alerts.push({
          message: 'High override rate (' + overrideRate + '%) — AI suggestions may need retraining',
          severity: 'warning',
        });
      }

      for (const mod of moduleBreakdown) {
        if (mod.accuracy < 70) {
          alerts.push({
            message: 'Module "' + mod.module + '" accuracy critically low at ' + mod.accuracy + '%',
            severity: 'critical',
          });
        }
      }

      if (avgConfidence > 0 && avgConfidence < 60) {
        alerts.push({
          message: 'Average AI confidence is low — consider reviewing model inputs',
          severity: 'info',
        });
      }

      // All fields guaranteed non-null
      const data = {
        grade,
        overallScore,
        metrics,
        moduleBreakdown,
        confidenceDistribution,
        alerts,
        totalDecisions,
        avgConfidence,
        overrideRate,
      };

      return success(data);
    } catch (_err) {
      // Final safety net: return safe defaults so the scorecard never crashes
      return success(DEFAULT_RESPONSE);
    }
  });
}

