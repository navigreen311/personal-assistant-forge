// ============================================================================
// Sentiment storage helper
// ----------------------------------------------------------------------------
// Persists a VAF SentimentResult onto a ShadowMessage row by writing the
// canonical { overall, emotions, riskFlags } shape into shadowMessage.sentiment
// (JSONB). Intentionally narrow: VoiceForge call code can call this from
// inside the live sentiment loop or once a call ends. The helper swallows
// "no such row" errors as warnings via Promise rejection so callers can
// decide whether to ignore — see writeSentimentToMessage's contract below.
// ============================================================================

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { SentimentResult } from '@/lib/vaf/sentiment-client';

/**
 * Update `shadowMessage.sentiment` for the given message id with the
 * canonical { overall, emotions, riskFlags } shape that the schema docs
 * describe. Other SentimentResult fields (confidence, suggestedAction)
 * are intentionally NOT persisted — they are call-control hints, not
 * historical record.
 *
 * Throws on prisma errors (e.g. record not found). Callers that want
 * fire-and-forget behavior should wrap in try/catch or attach a
 * `.catch()` handler.
 */
export async function writeSentimentToMessage(
  messageId: string,
  sentiment: SentimentResult,
): Promise<void> {
  // Cast through Prisma.InputJsonValue: SentimentEmotions has structural
  // numeric fields, but TS doesn't see it as JSON-shaped without a hint.
  const persistedSentiment: Prisma.InputJsonValue = {
    overall: sentiment.overall,
    emotions: { ...sentiment.emotions },
    riskFlags: [...sentiment.riskFlags],
  };

  await prisma.shadowMessage.update({
    where: { id: messageId },
    data: { sentiment: persistedSentiment },
  });
}
