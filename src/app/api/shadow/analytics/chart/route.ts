import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// GET /api/shadow/analytics/chart
// Returns session-over-time data for the last 30 days.
// ---------------------------------------------------------------------------

async function handleGet(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const userId = session.userId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch all sessions in the last 30 days
    const sessions = await prisma.shadowVoiceSession.findMany({
      where: {
        userId,
        startedAt: { gte: thirtyDaysAgo },
      },
      select: {
        startedAt: true,
      },
      orderBy: {
        startedAt: 'asc',
      },
    });

    // Build a map of date -> count
    const countsByDate = new Map<string, number>();

    // Initialize all 30 days with 0
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      countsByDate.set(dateStr, 0);
    }

    // Populate counts from real data
    for (const s of sessions) {
      const dateStr = s.startedAt.toISOString().split('T')[0];
      if (countsByDate.has(dateStr)) {
        countsByDate.set(dateStr, (countsByDate.get(dateStr) ?? 0) + 1);
      }
    }

    // Convert to sorted array
    const daily = Array.from(countsByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return success({
      daily,
      period: 'last_30_days',
    });
  } catch (err) {
    console.error('[shadow/analytics/chart] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load chart data', 500);
  }
}

// ---------------------------------------------------------------------------
// Route export
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}
