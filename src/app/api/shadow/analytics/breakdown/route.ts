import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// GET /api/shadow/analytics/breakdown
// Returns channel breakdown, top actions, peak hours, and override rate.
// ---------------------------------------------------------------------------

// Default top actions when no real data exists
const DEFAULT_TOP_ACTIONS = [
  { action: 'read_data', count: 0 },
  { action: 'navigate', count: 0 },
  { action: 'draft_email', count: 0 },
  { action: 'create_task', count: 0 },
  { action: 'send_email', count: 0 },
];

// Default peak hours when no real data exists
const DEFAULT_PEAK_HOURS: string[] = [];

async function handleGet(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const userId = session.userId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch recent sessions, messages with actions, and override count in parallel
    const [recentSessions, recentMessages, totalActions, overrideCount] = await Promise.all([
      prisma.shadowVoiceSession.findMany({
        where: {
          userId,
          startedAt: { gte: thirtyDaysAgo },
        },
        select: {
          currentChannel: true,
          startedAt: true,
        },
      }),

      prisma.shadowMessage.findMany({
        where: {
          session: { userId },
          createdAt: { gte: thirtyDaysAgo },
          NOT: { actionsTaken: { equals: [] } },
        },
        select: {
          actionsTaken: true,
        },
      }),

      // Total actions executed (for override rate denominator)
      prisma.shadowMessage.count({
        where: {
          session: { userId },
          createdAt: { gte: thirtyDaysAgo },
          NOT: { actionsTaken: { equals: [] } },
        },
      }),

      prisma.shadowOverrideLog.count({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          sessionId: { not: null },
        },
      }),
    ]);

    // --- Channel breakdown ---
    const channelCounts: Record<string, number> = {};
    for (const s of recentSessions) {
      const ch = s.currentChannel ?? 'web';
      channelCounts[ch] = (channelCounts[ch] ?? 0) + 1;
    }

    const totalSessionCount = recentSessions.length;
    const channels: Record<string, { count: number; percent: number }> = {};

    if (totalSessionCount > 0) {
      for (const [channel, count] of Object.entries(channelCounts)) {
        channels[channel] = {
          count,
          percent: Math.round((count / totalSessionCount) * 100),
        };
      }
    } else {
      // Return zeroed-out defaults when no sessions exist
      channels.web = { count: 0, percent: 0 };
      channels.voice = { count: 0, percent: 0 };
      channels.phone = { count: 0, percent: 0 };
    }

    // --- Top actions ---
    const actionCounts: Record<string, number> = {};
    for (const msg of recentMessages) {
      const actions = msg.actionsTaken as Array<{ type?: string; action?: string; name?: string }>;
      if (Array.isArray(actions)) {
        for (const a of actions) {
          const actionName = a.type ?? a.action ?? a.name ?? 'unknown';
          actionCounts[actionName] = (actionCounts[actionName] ?? 0) + 1;
        }
      }
    }

    let topActions: Array<{ action: string; count: number }>;
    const actionEntries = Object.entries(actionCounts);
    if (actionEntries.length > 0) {
      topActions = actionEntries
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([action, count]) => ({ action, count }));
    } else {
      topActions = DEFAULT_TOP_ACTIONS;
    }

    // --- Peak hours ---
    const hourCounts: Record<number, number> = {};
    for (const s of recentSessions) {
      const hour = s.startedAt.getHours();
      hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
    }

    let peakHours: string[];
    const hourEntries = Object.entries(hourCounts);
    if (hourEntries.length > 0) {
      peakHours = hourEntries
        .sort(([, a], [, b]) => Number(b) - Number(a))
        .slice(0, 2)
        .map(([hour]) => {
          const h = Number(hour);
          const startLabel = h === 0 ? '12' : h > 12 ? String(h - 12) : String(h);
          const endHour = (h + 1) % 24;
          const endLabel = endHour === 0 ? '12' : endHour > 12 ? String(endHour - 12) : String(endHour);
          const startPeriod = h < 12 ? 'AM' : 'PM';
          const endPeriod = endHour < 12 ? 'AM' : 'PM';
          return `${startLabel}-${endLabel} ${endPeriod}`;
        });
    } else {
      peakHours = DEFAULT_PEAK_HOURS;
    }

    // --- Override rate ---
    const totalDecisions = totalActions + overrideCount;
    const overrideRate = totalDecisions > 0
      ? Math.round((overrideCount / totalDecisions) * 100)
      : 0;

    return success({
      channels,
      topActions,
      peakHours,
      overrideRate,
    });
  } catch (err) {
    console.error('[shadow/analytics/breakdown] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load analytics breakdown', 500);
  }
}

// ---------------------------------------------------------------------------
// Route export
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}
