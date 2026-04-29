// ============================================================================
// Sentiment-aware coaching message builder
// ----------------------------------------------------------------------------
// Pure function. Translates a single VAF SentimentResult frame into a
// human-readable coaching string for the "Talk me through this" panel, or
// null when this frame doesn't warrant surfacing a new coaching update.
//
// Spec source: PAF/VAF integration spec, section 3.3 (Sentiment in Shadow's
// Coaching). The wording here intentionally matches the spec's tone — Shadow
// is narrating the call to the user, not annotating raw sentiment values.
//
// Why a separate helper from `monitorCallSentiment` (call-monitor.ts):
//   - call-monitor's onInsight strings are short cues for the *agent's*
//     internal coaching loop ("Caller seems confused — Shadow may want to
//     simplify the message").
//   - This builder generates richer, user-facing prose for the
//     TalkMeThroughButton panel ("Caller seems confused — VoiceForge is
//     simplifying the message. You can step in if you want.").
//   - Keeping them separate avoids WS09 (call-monitor owner) needing to
//     change strings every time the UI tone evolves.
// ============================================================================

import type { SentimentResult } from '@/lib/vaf/sentiment-client';

// ---------------------------------------------------------------------------
// Thresholds — match call-monitor.ts so the two layers stay in sync.
// ---------------------------------------------------------------------------

const ANGER_COACHING_THRESHOLD = 0.8;
const CONFUSION_COACHING_THRESHOLD = 0.7;
const SATISFACTION_COACHING_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a user-facing coaching string for the TalkMeThrough panel.
 *
 * Returns `null` when no coaching update is warranted for this frame. The
 * caller should treat null as "skip — don't append anything to the feed."
 *
 * Rule precedence (matches spec 3.3):
 *   1. Threatening risk flag → null. Threats are an *escalation* path
 *      handled elsewhere; the coaching panel must not narrate over them.
 *   2. Hostile / high anger → frustration heads-up + offer callback.
 *   3. High confusion → narration that VoiceForge is simplifying.
 *   4. High satisfaction → narration that this is a good moment to commit.
 *   5. Otherwise → null (no coaching update).
 */
export function buildSentimentCoachingMessage(
  sentiment: SentimentResult,
): string | null {
  // Defensive: spec says emotions is always present, but keep the helper
  // tolerant of malformed frames so callers don't have to pre-validate.
  if (!sentiment || typeof sentiment !== 'object') return null;
  const emotions = sentiment.emotions ?? {
    anger: 0,
    frustration: 0,
    anxiety: 0,
    satisfaction: 0,
    confusion: 0,
    urgency: 0,
  };
  const riskFlags = Array.isArray(sentiment.riskFlags) ? sentiment.riskFlags : [];

  // Rule 1 — threats route to escalation, not coaching.
  if (riskFlags.includes('threatening')) {
    return null;
  }

  // Rule 2 — hostility / anger.
  if (sentiment.overall === 'hostile' || emotions.anger > ANGER_COACHING_THRESHOLD) {
    return 'Heads up — the caller is getting frustrated. Anger is rising. Want me to have VoiceForge offer a callback instead?';
  }

  // Rule 3 — confusion.
  if (emotions.confusion > CONFUSION_COACHING_THRESHOLD) {
    return 'Caller seems confused — VoiceForge is simplifying the message. You can step in if you want.';
  }

  // Rule 4 — satisfaction.
  if (emotions.satisfaction > SATISFACTION_COACHING_THRESHOLD) {
    return 'The call is going well — caller sounds receptive. Good moment to ask for a commitment.';
  }

  // Rule 5 — nothing notable in this frame.
  return null;
}
