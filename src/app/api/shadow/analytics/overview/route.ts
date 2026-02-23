import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// GET /api/shadow/analytics/overview
// Returns aggregated stats for the History tab stat cards.
// ---------------------------------------------------------------------------

async function handleGet(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const userId = session.userId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Fetch current-period and previous-period session counts in parallel
    const [
      totalSessions,
      previousPeriodSessions,
      allRecentSessions,
      allPreviousSessions,
      totalMessages,
      previousMessages,
      overrideCount,
    ] = await Promise.all([
      // Total sessions for the user (all time)
      prisma.shadowVoiceSession.count({
        where: { userId },
      }),

      // Sessions from the previous 30-day window (for trend calculation)
      prisma.shadowVoiceSession.count({
        where: {
          userId,
          startedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
      }),

      // Recent sessions (last 30 days) with channel info
      prisma.shadowVoiceSession.findMany({
        where: {
          userId,
          startedAt: { gte: thirtyDaysAgo },
        },
        select: {
          currentChannel: true,
          totalDurationSeconds: true,
          messageCount: true,
        },
      }),

      // Previous-period sessions (30-60 days ago)
      prisma.shadowVoiceSession.findMany({
        where: {
          userId,
          startedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
        select: {
          messageCount: true,
        },
      }),

      // Total messages with actions in recent period
      prisma.shadowMessage.count({
        where: {
          session: { userId },
          createdAt: { gte: thirtyDaysAgo },
          NOT: { actionsTaken: { equals: [] } },
        },
      }),

      // Previous-period messages with actions
      prisma.shadowMessage.count({
        where: {
          session: { userId },
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
          NOT: { actionsTaken: { equals: [] } },
        },
      }),

      // Override count (user overrode Shadow suggestions)
      prisma.shadowOverrideLog.count({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          sessionId: { not: null },
        },
      }),
    ]);

    // Calculate voice percentage from recent sessions
    const recentCount = allRecentSessions.length;
    const voiceSessionCount = allRecentSessions.filter(
      (s) => s.currentChannel === 'voice' || s.currentChannel === 'phone'
    ).length;
    const voicePercent = recentCount > 0
      ? Math.round((voiceSessionCount / recentCount) * 100)
      : 0;

    // Actions executed = messages that had actionsTaken
    const actionsExecuted = totalMessages;

    // Time saved estimation: ~5 min saved per action on average
    const minutesSaved = actionsExecuted * 5;
    const timeSavedHours = Math.round((minutesSaved / 60) * 10) / 10;

    // Approval rate: actions executed vs total actions + overrides
    const totalDecisions = actionsExecuted + overrideCount;
    const approvalRate = totalDecisions > 0
      ? Math.round((actionsExecuted / totalDecisions) * 100)
      : 0;

    // Trends: percentage change vs previous period
    const currentPeriodSessions = recentCount;
    const sessionsTrend = previousPeriodSessions > 0
      ? Math.round(((currentPeriodSessions - previousPeriodSessions) / previousPeriodSessions) * 100)
      : 0;

    const previousActionsCount = previousMessages;
    const actionsTrend = previousActionsCount > 0
      ? Math.round(((actionsExecuted - previousActionsCount) / previousActionsCount) * 100)
      : 0;

    // Hourly rate based on time saved and assumed billing rate
    const hourlyRate = 150; // configurable default

    return success({
      totalSessions,
      voicePercent,
      actionsExecuted,
      timeSavedHours,
      approvalRate,
      sessionsTrend,
      actionsTrend,
      hourlyRate,
    });
  } catch (err) {
    console.error('[shadow/analytics/overview] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load analytics overview', 500);
  }
}

// ---------------------------------------------------------------------------
// Route export
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}
