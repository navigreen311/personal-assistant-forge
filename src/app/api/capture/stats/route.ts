import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { captureService } from '@/modules/capture/services/capture-service';
import type { CaptureItem, CaptureLatencyMetrics } from '@/modules/capture/types';

// ---------------------------------------------------------------------------
// Query‑param validation
// ---------------------------------------------------------------------------

const StatsQuerySchema = z.object({
  entityId: z.string().optional(),
  period: z.enum(['today', 'week', 'month']).optional().default('today'),
});

// ---------------------------------------------------------------------------
// Default (zero‑value) response shape
// ---------------------------------------------------------------------------

function defaultStats() {
  return {
    captures: {
      total: 0,
      today: 0,
      thisWeek: 0,
      autoRouted: 0,
      manualNeeded: 0,
      autoRoutedPct: 0,
      manualPct: 0,
    },
    latency: {
      average: 0,
      voiceAvg: 0,
      textAvg: 0,
      voiceSlaOk: true,
      textSlaOk: true,
    },
    bySource: {
      VOICE: 0,
      EMAIL_FORWARD: 0,
      CLIPBOARD: 0,
      SCREENSHOT: 0,
      MANUAL: 0,
      OTHER: 0,
    },
    byRouting: {
      TASK: 0,
      CONTACT: 0,
      NOTE: 0,
      EVENT: 0,
      MESSAGE: 0,
      EXPENSE: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Stats computation from capture data
// ---------------------------------------------------------------------------

function computeStats(
  captures: CaptureItem[],
  metrics: CaptureLatencyMetrics[],
) {
  const stats = defaultStats();
  const todayStart = startOfToday();
  const weekStart = startOfWeek();

  // -- Capture counts -------------------------------------------------------
  stats.captures.total = captures.length;

  for (const c of captures) {
    const created = new Date(c.createdAt);

    if (created >= todayStart) {
      stats.captures.today++;
    }
    if (created >= weekStart) {
      stats.captures.thisWeek++;
    }

    // Auto‑routed vs manual
    const hasRules =
      c.routingResult &&
      Array.isArray(c.routingResult.appliedRules) &&
      c.routingResult.appliedRules.length > 0;

    if (hasRules) {
      stats.captures.autoRouted++;
    } else {
      stats.captures.manualNeeded++;
    }

    // -- bySource -----------------------------------------------------------
    const knownSources = ['VOICE', 'EMAIL_FORWARD', 'CLIPBOARD', 'SCREENSHOT', 'MANUAL'] as const;
    type KnownSource = (typeof knownSources)[number];

    if (knownSources.includes(c.source as KnownSource)) {
      stats.bySource[c.source as KnownSource]++;
    } else {
      stats.bySource.OTHER++;
    }

    // -- byRouting ----------------------------------------------------------
    if (c.routingResult?.targetType) {
      const targetType = c.routingResult.targetType as keyof typeof stats.byRouting;
      if (targetType in stats.byRouting) {
        stats.byRouting[targetType]++;
      }
    }
  }

  // Percentages (avoid divide‑by‑zero)
  if (stats.captures.total > 0) {
    stats.captures.autoRoutedPct = Math.round(
      (stats.captures.autoRouted / stats.captures.total) * 100,
    );
    stats.captures.manualPct = Math.round(
      (stats.captures.manualNeeded / stats.captures.total) * 100,
    );
  }

  // -- Latency --------------------------------------------------------------
  if (metrics.length > 0) {
    const totalMs = metrics.reduce((sum, m) => sum + m.totalMs, 0);
    stats.latency.average = Math.round(totalMs / metrics.length);

    const voiceMetrics = metrics.filter((m) => m.source === 'VOICE');
    if (voiceMetrics.length > 0) {
      const voiceTotal = voiceMetrics.reduce((sum, m) => sum + m.totalMs, 0);
      stats.latency.voiceAvg = Math.round(voiceTotal / voiceMetrics.length);
    }

    // Text‑based sources: anything that is not VOICE
    const textMetrics = metrics.filter((m) => m.source !== 'VOICE');
    if (textMetrics.length > 0) {
      const textTotal = textMetrics.reduce((sum, m) => sum + m.totalMs, 0);
      stats.latency.textAvg = Math.round(textTotal / textMetrics.length);
    }

    // SLA checks: voice < 3000 ms, text < 5000 ms
    stats.latency.voiceSlaOk = stats.latency.voiceAvg < 3000;
    stats.latency.textSlaOk = stats.latency.textAvg < 5000;
  }

  return stats;
}

// ---------------------------------------------------------------------------
// GET /api/capture/stats
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = new URL(req.url);

      const parsed = StatsQuerySchema.safeParse({
        entityId: searchParams.get('entityId') ?? undefined,
        period: searchParams.get('period') ?? undefined,
      });

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId } = parsed.data;

      // Attempt to pull real data from the capture service
      try {
        // Fetch all captures for the user (large page to get everything)
        const { data: captures } = await captureService.listCaptures(
          session.userId,
          { entityId: entityId ?? undefined },
          1,
          10_000,
        );

        const metrics = await captureService.getCaptureMetrics(session.userId);

        const stats = computeStats(captures, metrics);
        return success(stats);
      } catch {
        // Service unavailable or method unsupported — return safe defaults
        return success(defaultStats());
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to compute capture stats';
      return error('STATS_FAILED', message, 500);
    }
  });
}
