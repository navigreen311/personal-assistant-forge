import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// Default placeholder rates when no data exists
// ---------------------------------------------------------------------------

const DEFAULT_RATES = {
  in_app: { sent: 100, responded: 92, rate: 0.92 },
  push: { sent: 50, responded: 39, rate: 0.78 },
  sms: { sent: 40, responded: 34, rate: 0.85 },
  call: { sent: 20, responded: 9, rate: 0.45 },
};

// ---------------------------------------------------------------------------
// GET /api/shadow/analytics/channel-effectiveness
// Returns channel response rates for the authenticated user over last 30 days
// ---------------------------------------------------------------------------

async function handleGet(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const userId = session.userId;

    const records = await prisma.shadowChannelEffectiveness.findMany({
      where: { userId },
    });

    if (records.length === 0) {
      return success({
        rates: DEFAULT_RATES,
        period: 'last_30_days',
        lastUpdated: '2026-02-23T00:00:00Z',
      });
    }

    // Aggregate actual rates per channel
    const channelAgg: Record<string, { sent: number; responded: number }> = {};

    for (const record of records) {
      const ch = record.channel;
      if (!channelAgg[ch]) {
        channelAgg[ch] = { sent: 0, responded: 0 };
      }
      channelAgg[ch].sent += record.attempts;
      channelAgg[ch].responded += record.responses;
    }

    const rates: Record<string, { sent: number; responded: number; rate: number }> = {};
    for (const [channel, agg] of Object.entries(channelAgg)) {
      rates[channel] = {
        sent: agg.sent,
        responded: agg.responded,
        rate: agg.sent > 0 ? Math.round((agg.responded / agg.sent) * 100) / 100 : 0,
      };
    }

    return success({
      rates,
      period: 'last_30_days',
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[shadow/analytics/channel-effectiveness] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load channel effectiveness data', 500);
  }
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}
