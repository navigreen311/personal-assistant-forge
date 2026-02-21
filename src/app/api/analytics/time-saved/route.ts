import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

const querySchema = z.object({
  userId: z.string().min(1).optional(),
  period: z.enum(['7d', '30d', '90d']).optional().default('30d'),
});

const PERIOD_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const MINUTES_PER_TASK = 15;
const MINUTES_PER_WORKFLOW = 30;
const MINUTES_PER_AI_ACTION = 5;

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const userId = parsed.data.userId ?? session.userId;
      const period = parsed.data.period;
      const days = PERIOD_DAYS[period];

      const since = new Date();
      since.setDate(since.getDate() - days);

      // Find all entities belonging to this user
      const entities = await prisma.entity.findMany({
        where: { userId },
        select: { id: true },
      });
      const entityIds = entities.map((e: { id: string }) => e.id);

      // 1. Count automated tasks (status DONE, created via automation)
      const automatedTasks = await prisma.task.count({
        where: {
          entityId: { in: entityIds },
          status: 'DONE',
          createdAt: { gte: since },
          createdFrom: { not: Prisma.DbNull },
        },
      });

      // 2. Count completed workflows
      const completedWorkflows = await prisma.workflow.count({
        where: {
          entityId: { in: entityIds },
          status: 'COMPLETED',
          updatedAt: { gte: since },
        },
      });

      // 3. Count AI-assisted actions from action logs
      const aiActions = await prisma.actionLog.findMany({
        where: {
          actorId: userId,
          actionType: { in: ['AI_DRAFT', 'AI_TRIAGE', 'AI_SCHEDULE'] },
          timestamp: { gte: since },
        },
        select: { id: true, timestamp: true, actionType: true },
      });

      // Calculate time saved
      const taskMinutes = automatedTasks * MINUTES_PER_TASK;
      const workflowMinutes = completedWorkflows * MINUTES_PER_WORKFLOW;
      const aiMinutes = aiActions.length * MINUTES_PER_AI_ACTION;
      const totalMinutesSaved = taskMinutes + workflowMinutes + aiMinutes;

      // Build by-source breakdown
      const bySource = [
        { source: 'Task Automation', minutes: taskMinutes },
        { source: 'Workflows', minutes: workflowMinutes },
        { source: 'AI Assistance', minutes: aiMinutes },
      ].filter((s) => s.minutes > 0);

      // Build daily trend from AI action timestamps
      const dailyMap: Record<string, number> = {};
      for (let d = 0; d < days; d++) {
        const date = new Date(since);
        date.setDate(since.getDate() + d);
        dailyMap[date.toISOString().split('T')[0]] = 0;
      }

      // Distribute task/workflow savings evenly across the period
      const dailyTaskAvg = Math.round(taskMinutes / days);
      const dailyWorkflowAvg = Math.round(workflowMinutes / days);
      for (const dateKey of Object.keys(dailyMap)) {
        dailyMap[dateKey] += dailyTaskAvg + dailyWorkflowAvg;
      }

      // Add AI action minutes to their specific days
      for (const action of aiActions) {
        const dateKey = new Date(action.timestamp).toISOString().split('T')[0];
        if (dailyMap[dateKey] !== undefined) {
          dailyMap[dateKey] += MINUTES_PER_AI_ACTION;
        }
      }

      const dailyTrend = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, minutes]) => ({ date, minutes }));

      // Calculate trend: compare last half of period to first half
      const midpoint = Math.floor(dailyTrend.length / 2);
      const firstHalf = dailyTrend.slice(0, midpoint);
      const secondHalf = dailyTrend.slice(midpoint);
      const firstAvg =
        firstHalf.length > 0
          ? firstHalf.reduce((sum, d) => sum + d.minutes, 0) / firstHalf.length
          : 0;
      const secondAvg =
        secondHalf.length > 0
          ? secondHalf.reduce((sum, d) => sum + d.minutes, 0) / secondHalf.length
          : 0;
      const trend = firstAvg > 0 ? Math.round(((secondAvg - firstAvg) / firstAvg) * 100) : 0;

      return success({
        userId,
        totalMinutesSaved,
        bySource,
        dailyTrend,
        breakdown: {
          automatedTasks,
          workflows: completedWorkflows,
          aiAssisted: aiActions.length,
        },
        trend,
        period,
      });
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to calculate time saved', 500);
    }
  });
}
