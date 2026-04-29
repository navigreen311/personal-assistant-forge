/**
 * VAF fallback telemetry helpers.
 *
 * VAF (VisionAudioForge) is the preferred provider for STT, TTS, sentiment,
 * audio quality, meeting intelligence, and vision. When VAF is unavailable
 * we fall back to other providers (Whisper, Browser SpeechSynthesis, etc.)
 * — and we want to know how often that happens, by user and by feature, so
 * the SRE side can spot regressions and the product side can tell whether
 * the VAF investment is paying off.
 *
 * WHY no new prisma model: schema ownership lives on WS04 in this round.
 * Until WS04 lands a dedicated `VafFallbackEvent` table, this module:
 *   - records fallbacks via `console.warn` with a structured prefix so
 *     log aggregators (Datadog, etc.) can pick them up immediately, and
 *   - aggregates from the existing ShadowMessage rows for the dashboard
 *     read path. ShadowMessage has the `sttProvider` + `ttsProvider`
 *     columns already — anything other than 'vaf' counts as a fallback
 *     for the corresponding feature.
 *
 * `recordVafFallback` is a side-effect-only writer (warn + TODO). The
 * production wiring of the metric is a follow-up once WS04 ships the
 * event table.
 *
 * `getVafFallbackRate` is a read helper that the dashboard / SRE alerts
 * call. It only covers STT and TTS today (the columns on ShadowMessage)
 * — sentiment / audio_quality / meeting / vision aggregation will follow
 * once we have an explicit event table.
 */

import { prisma } from '@/lib/db';

export type VafFeature =
  | 'stt'
  | 'tts'
  | 'sentiment'
  | 'audio_quality'
  | 'meeting'
  | 'vision';

export interface RecordVafFallbackParams {
  userId: string;
  feature: VafFeature;
  reason: string;
}

export interface GetVafFallbackRateParams {
  /** undefined = global across all users. */
  userId?: string;
  feature?: string;
  /** Default 24. */
  windowHours?: number;
}

export interface VafFallbackRate {
  totalAttempts: number;
  fallbacks: number;
  rate: number;
}

/**
 * Record a single VAF fallback occurrence.
 *
 * Today this is a structured `console.warn`. A log aggregator can grep
 * for the `[vaf-fallback]` prefix to pull the stream into a dashboard.
 *
 * TODO(post-WS04): replace with prisma.vafFallbackEvent.create once the
 * dedicated table exists. Keep the signature stable so callers do not
 * need to change.
 */
export async function recordVafFallback(
  params: RecordVafFallbackParams
): Promise<void> {
  const payload = {
    userId: params.userId,
    feature: params.feature,
    reason: params.reason,
    timestamp: new Date().toISOString(),
  };
  // Structured prefix → easy to grep / route in log aggregators.
  console.warn('[vaf-fallback]', JSON.stringify(payload));
}

/**
 * Compute the VAF fallback rate over the last `windowHours` hours.
 *
 * Aggregates from ShadowMessage:
 *   - "attempt" = a ShadowMessage row whose feature column is set
 *     (sttProvider non-null for stt, ttsProvider non-null for tts).
 *   - "fallback" = same row where the column value is anything other
 *     than 'vaf'.
 *
 * Single groupBy + filter — no per-row scan.
 *
 * If `feature` is unset or 'all', stt + tts are summed. Other VAF
 * features (sentiment / audio_quality / meeting / vision) are not yet
 * covered by ShadowMessage columns and return zero counts; once a
 * dedicated event table exists they will be folded into the same shape.
 */
export async function getVafFallbackRate(
  params: GetVafFallbackRateParams = {}
): Promise<VafFallbackRate> {
  const windowHours = params.windowHours ?? 24;
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  // We pull two grouped result sets — one for STT, one for TTS — and
  // sum them. Doing it as two groupBys keeps the query plan simple
  // (single-column index) and lets us show a per-feature breakdown
  // later without a new query.
  const wantStt = !params.feature || params.feature === 'stt' || params.feature === 'all';
  const wantTts = !params.feature || params.feature === 'tts' || params.feature === 'all';

  let totalAttempts = 0;
  let fallbacks = 0;

  if (wantStt) {
    const sttGroups = await prisma.shadowMessage.groupBy({
      by: ['sttProvider'],
      where: {
        sttProvider: { not: null },
        createdAt: { gte: since },
        ...(params.userId
          ? { session: { userId: params.userId } }
          : {}),
      },
      _count: { _all: true },
    });
    for (const g of sttGroups as Array<{
      sttProvider: string | null;
      _count: { _all: number };
    }>) {
      const count = g._count?._all ?? 0;
      totalAttempts += count;
      if (g.sttProvider !== 'vaf') fallbacks += count;
    }
  }

  if (wantTts) {
    const ttsGroups = await prisma.shadowMessage.groupBy({
      by: ['ttsProvider'],
      where: {
        ttsProvider: { not: null },
        createdAt: { gte: since },
        ...(params.userId
          ? { session: { userId: params.userId } }
          : {}),
      },
      _count: { _all: true },
    });
    for (const g of ttsGroups as Array<{
      ttsProvider: string | null;
      _count: { _all: number };
    }>) {
      const count = g._count?._all ?? 0;
      totalAttempts += count;
      if (g.ttsProvider !== 'vaf') fallbacks += count;
    }
  }

  const rate = totalAttempts > 0 ? fallbacks / totalAttempts : 0;
  return { totalAttempts, fallbacks, rate };
}
