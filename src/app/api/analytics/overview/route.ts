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
 * Prevents the Overview tab from crashing when any individual query fails.
 */
const safeQuery = async <T>(fn: () => Promise<T>, defaultVal: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return defaultVal;
  }
};

/**
 * Safely compute a derived value from already-fetched data.
 * Returns defaultVal if the computation throws.
 */
function safeCompute<T>(fn: () => T, defaultVal: T): T {
  try {
    return fn();
  } catch {
    return defaultVal;
  }
}

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
 * Build an array of ISO week-start labels between start and end dates.
 */
function getWeekLabels(start: Date, end: Date): string[] {
  const labels: string[] = [];
  const current = new Date(start);
  current.setDate(current.getDate() - current.getDay());
  current.setHours(0, 0, 0, 0);
  while (current <= end) {
    labels.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 7);
  }
  return labels;
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }
      const { entityId, period } = parsed.data;
      const { start, end } = getDateRange(period);
      // Determine entity IDs to query
      let entityIds: string[] = [];
      if (entityId) {
        // Verify entity ownership
        const entity = await safeQuery(
          () =>
            (prisma as any).entity.findUnique({
              where: { id: entityId },
              select: { id: true, userId: true },
            }),
          null
        );
        if (!entity) {
          return error('NOT_FOUND', 'Entity not found', 404);
        }
        if (entity.userId !== session.userId) {
          return error('FORBIDDEN', 'You do not have access to this entity', 403);
        }
        entityIds = [entityId];
      } else {
        // Get all entities for the authenticated user
        const entities = await safeQuery(
          () =>
            (prisma as any).entity.findMany({
              where: { userId: session.userId },
              select: { id: true },
            }),
          []
        );
        entityIds = entities.map((e: { id: string }) => e.id);
      }
      // Gather all analytics data in parallel with safe defaults
      const [
        tasksCompleted,
        tasksTotal,
        focusEvents,
        meetingEvents,
        allEvents,
        automatedTasks,
        completedWorkflows,
        aiActions,
        weeklyTaskData,
        weeklyEventData,
        actionLogAccuracy,
      ] = await Promise.all([
        // Tasks completed in period
        safeQuery(
          () =>
            (prisma as any).task.count({
              where: {
                entityId: { in: entityIds },
                status: 'DONE',
                updatedAt: { gte: start, lte: end },
              },
            }),
          0
        ),
        // Total tasks in period
        safeQuery(
          () =>
            (prisma as any).task.count({
              where: {
                entityId: { in: entityIds },
                createdAt: { gte: start, lte: end },
              },
            }),
          0
        ),
        // Focus time events
        safeQuery(
          () =>
            (prisma as any).calendarEvent.findMany({
              where: {
                entityId: { in: entityIds },
                startTime: { gte: start, lte: end },
                title: { contains: 'focus', mode: 'insensitive' },
              },
              select: { startTime: true, endTime: true },
            }),
          [] as { startTime: Date; endTime: Date }[]
        ),
        // Meeting events
        safeQuery(
          () =>
            (prisma as any).calendarEvent.findMany({
              where: {
                entityId: { in: entityIds },
                startTime: { gte: start, lte: end },
                title: { contains: 'meeting', mode: 'insensitive' },
              },
              select: { startTime: true, endTime: true },
            }),
          [] as { startTime: Date; endTime: Date }[]
        ),
        // All calendar events for time audit
        safeQuery(
          () =>
            (prisma as any).calendarEvent.findMany({
              where: {
                entityId: { in: entityIds },
                startTime: { gte: start, lte: end },
              },
              select: { title: true, startTime: true, endTime: true },
            }),
          [] as { title: string; startTime: Date; endTime: Date }[]
        ),
        // Automated tasks
        safeQuery(
          () =>
            (prisma as any).task.count({
              where: {
                entityId: { in: entityIds },
                status: 'DONE',
                createdAt: { gte: start, lte: end },
                NOT: { createdFrom: null },
              },
            }),
          0
        ),
        // Completed workflows
        safeQuery(
          () =>
            (prisma as any).workflow.count({
              where: {
                entityId: { in: entityIds },
                status: 'COMPLETED',
                updatedAt: { gte: start, lte: end },
              },
            }),
          0
        ),
        // AI-assisted action count
        safeQuery(
          () =>
            (prisma as any).actionLog.count({
              where: {
                actorId: session.userId,
                actionType: { in: ['AI_DRAFT', 'AI_TRIAGE', 'AI_SCHEDULE'] },
                timestamp: { gte: start, lte: end },
              },
            }),
          0
        ),
        // Weekly tasks completed
        safeQuery(
          () =>
            (prisma as any).task.findMany({
              where: {
                entityId: { in: entityIds },
                status: 'DONE',
                updatedAt: { gte: start, lte: end },
              },
              select: { updatedAt: true },
            }),
          [] as { updatedAt: Date }[]
        ),
        // Weekly focus events
        safeQuery(
          () =>
            (prisma as any).calendarEvent.findMany({
              where: {
                entityId: { in: entityIds },
                startTime: { gte: start, lte: end },
                title: { contains: 'focus', mode: 'insensitive' },
              },
              select: { startTime: true, endTime: true },
            }),
          [] as { startTime: Date; endTime: Date }[]
        ),
        // AI accuracy action logs
        safeQuery(
          () =>
            (prisma as any).actionLog.findMany({
              where: {
                actorId: session.userId,
                timestamp: { gte: start, lte: end },
                actionType: {
                  in: [
                    'AI_TRIAGE',
                    'AI_DRAFT',
                    'AI_PREDICTION',
                    'AI_CLASSIFICATION',
                    'TRIAGE_OVERRIDE',
                    'DRAFT_REJECTED',
                    'PREDICTION_WRONG',
                    'CLASSIFICATION_OVERRIDE',
                  ],
                },
              },
              select: { actionType: true },
            }),
          [] as { actionType: string }[]
        ),
      ]);      // --- Compute derived metrics ---
      // Focus time achieved (hours)
      const focusTimeAchieved = safeCompute(() => {
        let totalMs = 0;
        for (const evt of focusEvents) {
          const s = new Date(evt.startTime).getTime();
          const e = new Date(evt.endTime).getTime();
          totalMs += e - s;
        }
        return Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10;
      }, 0);
      const focusTimeTarget = 20;
      // Productivity score (0-100)
      const productivityScore = safeCompute(() => {
        const taskRatio = tasksTotal > 0 ? tasksCompleted / tasksTotal : 0;
        const focusRatio =
          focusTimeTarget > 0
            ? Math.min(focusTimeAchieved / focusTimeTarget, 1)
            : 0;
        return Math.round((taskRatio * 50 + focusRatio * 50) * 100) / 100;
      }, 0);
      // Time saved by AI (hours)
      const timeSavedByAI = safeCompute(() => {
        const MINUTES_PER_TASK = 15;
        const MINUTES_PER_WORKFLOW = 30;
        const MINUTES_PER_AI_ACTION = 5;
        const totalMinutes =
          automatedTasks * MINUTES_PER_TASK +
          completedWorkflows * MINUTES_PER_WORKFLOW +
          aiActions * MINUTES_PER_AI_ACTION;
        return Math.round((totalMinutes / 60) * 10) / 10;
      }, 0);
      // Time audit: categorize calendar events by title keywords
      const timeAudit = safeCompute(
        () => {
          const audit = {
            meetings: 0,
            focus: 0,
            admin: 0,
            comms: 0,
            personal: 0,
          };
          for (const evt of allEvents) {
            const title = (evt.title ?? '').toLowerCase();
            const s = new Date(evt.startTime).getTime();
            const e = new Date(evt.endTime).getTime();
            const hours = (e - s) / (1000 * 60 * 60);
            if (
              title.includes('meeting') ||
              title.includes('sync') ||
              title.includes('standup')
            ) {
              audit.meetings += hours;
            } else if (
              title.includes('focus') ||
              title.includes('deep work')
            ) {
              audit.focus += hours;
            } else if (
              title.includes('admin') ||
              title.includes('planning') ||
              title.includes('review')
            ) {
              audit.admin += hours;
            } else if (
              title.includes('email') ||
              title.includes('chat') ||
              title.includes('comms')
            ) {
              audit.comms += hours;
            } else if (
              title.includes('personal') ||
              title.includes('lunch') ||
              title.includes('break')
            ) {
              audit.personal += hours;
            } else {
              audit.admin += hours;
            }
          }
          return {
            meetings: Math.round(audit.meetings * 10) / 10,
            focus: Math.round(audit.focus * 10) / 10,
            admin: Math.round(audit.admin * 10) / 10,
            comms: Math.round(audit.comms * 10) / 10,
            personal: Math.round(audit.personal * 10) / 10,
          };
        },
        { meetings: 0, focus: 0, admin: 0, comms: 0, personal: 0 }
      );
      // Intended time audit (ideal distribution targets in hours)
      const intendedTimeAudit = {
        meetings: 10,
        focus: 20,
        admin: 5,
        comms: 5,
        personal: 5,
      };      // Weekly trends
      const weeklyTrends = safeCompute(() => {
        const weekLabels = getWeekLabels(start, end);
        const trendMap: Record<
          string,
          { tasksCompleted: number; focusHours: number }
        > = {};
        for (const label of weekLabels) {
          trendMap[label] = { tasksCompleted: 0, focusHours: 0 };
        }
        // Bucket completed tasks by week
        for (const task of weeklyTaskData) {
          const taskDate = new Date(task.updatedAt);
          const weekStart = new Date(taskDate);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          weekStart.setHours(0, 0, 0, 0);
          const key = weekStart.toISOString().split('T')[0];
          if (trendMap[key]) {
            trendMap[key].tasksCompleted += 1;
          }
        }
        // Bucket focus hours by week
        for (const evt of weeklyEventData) {
          const evtDate = new Date(evt.startTime);
          const weekStart = new Date(evtDate);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          weekStart.setHours(0, 0, 0, 0);
          const key = weekStart.toISOString().split('T')[0];
          if (trendMap[key]) {
            const s = new Date(evt.startTime).getTime();
            const e = new Date(evt.endTime).getTime();
            trendMap[key].focusHours += (e - s) / (1000 * 60 * 60);
          }
        }
        return weekLabels.map((week) => ({
          week,
          tasksCompleted: trendMap[week]?.tasksCompleted ?? 0,
          focusHours:
            Math.round((trendMap[week]?.focusHours ?? 0) * 10) / 10,
        }));
      }, []);
      // AI accuracy metrics
      const aiAccuracy = safeCompute(
        () => {
          const counts: Record<string, number> = {};
          for (const log of actionLogAccuracy) {
            counts[log.actionType] = (counts[log.actionType] ?? 0) + 1;
          }
          const triageTotal =
            (counts['AI_TRIAGE'] ?? 0) + (counts['TRIAGE_OVERRIDE'] ?? 0);
          const draftTotal =
            (counts['AI_DRAFT'] ?? 0) + (counts['DRAFT_REJECTED'] ?? 0);
          const predictionTotal =
            (counts['AI_PREDICTION'] ?? 0) +
            (counts['PREDICTION_WRONG'] ?? 0);
          const classificationTotal =
            (counts['AI_CLASSIFICATION'] ?? 0) +
            (counts['CLASSIFICATION_OVERRIDE'] ?? 0);
          return {
            triage:
              triageTotal > 0
                ? Math.round(
                    ((counts['AI_TRIAGE'] ?? 0) / triageTotal) * 100
                  )
                : 0,
            draftApproval:
              draftTotal > 0
                ? Math.round(
                    ((counts['AI_DRAFT'] ?? 0) / draftTotal) * 100
                  )
                : 0,
            prediction:
              predictionTotal > 0
                ? Math.round(
                    ((counts['AI_PREDICTION'] ?? 0) / predictionTotal) * 100
                  )
                : 0,
            classification:
              classificationTotal > 0
                ? Math.round(
                    ((counts['AI_CLASSIFICATION'] ?? 0) /
                      classificationTotal) *
                      100
                  )
                : 0,
          };
        },
        { triage: 0, draftApproval: 0, prediction: 0, classification: 0 }
      );
      // All fields guaranteed non-null
      const data = {
        productivityScore,
        focusTimeAchieved,
        focusTimeTarget,
        tasksCompleted,
        tasksTotal,
        timeSavedByAI,
        timeAudit,
        intendedTimeAudit,
        weeklyTrends,
        aiAccuracy,
      };
      return success(data);
    } catch (_err) {
      // Final safety net: return safe defaults so Overview tab never crashes
      return success({
        productivityScore: 0,
        focusTimeAchieved: 0,
        focusTimeTarget: 20,
        tasksCompleted: 0,
        tasksTotal: 0,
        timeSavedByAI: 0,
        timeAudit: { meetings: 0, focus: 0, admin: 0, comms: 0, personal: 0 },
        intendedTimeAudit: {
          meetings: 0,
          focus: 0,
          admin: 0,
          comms: 0,
          personal: 0,
        },
        weeklyTrends: [],
        aiAccuracy: {
          triage: 0,
          draftApproval: 0,
          prediction: 0,
          classification: 0,
        },
      });
    }
  });
}