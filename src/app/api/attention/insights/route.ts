import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

const querySchema = z.object({
  period: z
    .enum(['thisWeek', 'thisMonth', 'thisQuarter'])
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
    default: {
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    }
  }
  return { start, end };
}

/** Build a 12x5 zero-filled heatmap (12 hours x 5 weekdays). */
function emptyHeatmap(): number[][] {
  return Array.from({ length: 12 }, () => Array.from({ length: 5 }, () => 0));
}

/** Default safe response shape. */
function getDefaults() {
  return {
    totalInterrupts: 0,
    blockedDND: 0,
    avgFocusSession: 0,
    attentionScore: 0,
    heatmap: emptyHeatmap(),
    topInterrupters: [] as { source: string; count: number; percentOfTotal: number; avgPriority: number }[],
    recommendations: [
      { text: 'Enable Do Not Disturb during your peak focus hours to reduce interruptions.' },
      { text: 'Batch-check notifications at scheduled intervals instead of reacting in real-time.' },
      { text: 'Set VIP breakthrough rules so only critical contacts can interrupt deep work.' },
    ],
  };
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { period } = parsed.data;
      const { start, end } = getDateRange(period);

      // Fetch interrupt / notification events in parallel with safe defaults
      const [interruptEvents, dndBlocked, focusSessions] = await Promise.all([
        // All interrupt-type notifications in range
        safeQuery(
          () =>
            (prisma as any).notification.findMany({
              where: {
                userId: session.userId,
                createdAt: { gte: start, lte: end },
              },
              select: {
                id: true,
                source: true,
                priority: true,
                createdAt: true,
                blocked: true,
              },
            }),
          [] as { id: string; source: string; priority: number; createdAt: Date; blocked: boolean }[],
        ),
        // Notifications blocked by DND
        safeQuery(
          () =>
            (prisma as any).notification.count({
              where: {
                userId: session.userId,
                createdAt: { gte: start, lte: end },
                blocked: true,
              },
            }),
          0,
        ),
        // Focus sessions for average duration
        safeQuery(
          () =>
            (prisma as any).focusSession.findMany({
              where: {
                userId: session.userId,
                startTime: { gte: start, lte: end },
              },
              select: { startTime: true, endTime: true },
            }),
          [] as { startTime: Date; endTime: Date }[],
        ),
      ]);

      const totalInterrupts = interruptEvents.length;
      const blockedDND = typeof dndBlocked === 'number' ? dndBlocked : 0;

      // Average focus session length in minutes
      let avgFocusSession = 0;
      if (focusSessions.length > 0) {
        let totalMinutes = 0;
        for (const s of focusSessions) {
          const startMs = new Date(s.startTime).getTime();
          const endMs = new Date(s.endTime).getTime();
          totalMinutes += (endMs - startMs) / (1000 * 60);
        }
        avgFocusSession = Math.round((totalMinutes / focusSessions.length) * 10) / 10;
      }

      // Attention score (0-100): higher is better
      // Simple heuristic: base 100, subtract 2 per unblocked interrupt, add 0.5 per minute of avg focus
      const unblockedInterrupts = Math.max(totalInterrupts - blockedDND, 0);
      const attentionScore = Math.max(
        0,
        Math.min(100, Math.round(100 - unblockedInterrupts * 2 + avgFocusSession * 0.5)),
      );

      // Build heatmap: 12 rows (hours 8-19) x 5 cols (Mon-Fri)
      const heatmap = emptyHeatmap();
      for (const evt of interruptEvents) {
        const d = new Date(evt.createdAt);
        const hour = d.getHours();
        const day = d.getDay(); // 0=Sun..6=Sat
        if (day >= 1 && day <= 5 && hour >= 8 && hour <= 19) {
          heatmap[hour - 8][day - 1] += 1;
        }
      }

      // Top interrupters
      const sourceMap: Record<string, { count: number; totalPriority: number }> = {};
      for (const evt of interruptEvents) {
        const src = evt.source ?? 'unknown';
        if (!sourceMap[src]) {
          sourceMap[src] = { count: 0, totalPriority: 0 };
        }
        sourceMap[src].count += 1;
        sourceMap[src].totalPriority += typeof evt.priority === 'number' ? evt.priority : 0;
      }
      const topInterrupters = Object.entries(sourceMap)
        .map(([source, { count, totalPriority }]) => ({
          source,
          count,
          percentOfTotal: totalInterrupts > 0 ? Math.round((count / totalInterrupts) * 100) : 0,
          avgPriority: count > 0 ? Math.round((totalPriority / count) * 10) / 10 : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Recommendations
      const recommendations = [
        { text: 'Enable Do Not Disturb during your peak focus hours to reduce interruptions.' },
        { text: 'Batch-check notifications at scheduled intervals instead of reacting in real-time.' },
        { text: 'Set VIP breakthrough rules so only critical contacts can interrupt deep work.' },
      ];

      const data = {
        totalInterrupts,
        blockedDND,
        avgFocusSession,
        attentionScore,
        heatmap,
        topInterrupters,
        recommendations,
      };

      return success(data);
    } catch {
      // Outer safety net: return safe defaults so the UI never crashes
      return success(getDefaults());
    }
  });
}
