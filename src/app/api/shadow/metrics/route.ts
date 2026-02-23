import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/shadow/metrics
 * Returns latency and usage metrics for the Shadow voice agent.
 * Aggregates session data over configurable time periods.
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const periodParam = req.nextUrl.searchParams.get('period') ?? '24h';
      const hoursMap: Record<string, number> = {
        '1h': 1,
        '6h': 6,
        '24h': 24,
        '7d': 168,
        '30d': 720,
      };
      const hours = hoursMap[periodParam] ?? 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      // Get session metrics
      const [
        totalSessions,
        activeSessions,
        totalMessages,
        recentSessions,
      ] = await Promise.all([
        prisma.shadowVoiceSession.count({
          where: {
            userId: session.userId,
            startedAt: { gte: since },
          },
        }),
        prisma.shadowVoiceSession.count({
          where: {
            userId: session.userId,
            status: 'active',
          },
        }),
        prisma.shadowMessage.count({
          where: {
            session: { userId: session.userId },
            createdAt: { gte: since },
          },
        }),
        prisma.shadowVoiceSession.findMany({
          where: {
            userId: session.userId,
            startedAt: { gte: since },
            status: 'ended',
          },
          select: {
            totalDurationSeconds: true,
            messageCount: true,
            currentChannel: true,
          },
        }),
      ]);

      // Calculate averages
      const avgSessionDuration =
        recentSessions.length > 0
          ? recentSessions.reduce((sum, s) => sum + s.totalDurationSeconds, 0) /
            recentSessions.length
          : 0;

      const avgMessagesPerSession =
        recentSessions.length > 0
          ? recentSessions.reduce((sum, s) => sum + s.messageCount, 0) /
            recentSessions.length
          : 0;

      // Channel breakdown
      const channelCounts: Record<string, number> = {};
      for (const s of recentSessions) {
        const ch = s.currentChannel ?? 'unknown';
        channelCounts[ch] = (channelCounts[ch] ?? 0) + 1;
      }

      return success({
        period: periodParam,
        since: since.toISOString(),
        sessions: {
          total: totalSessions,
          active: activeSessions,
          avgDurationSeconds: Math.round(avgSessionDuration),
          avgMessagesPerSession: Math.round(avgMessagesPerSession * 10) / 10,
          byChannel: channelCounts,
        },
        messages: {
          total: totalMessages,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch metrics';
      return error('METRICS_FAILED', message, 500);
    }
  });
}
