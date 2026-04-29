// ============================================================================
// Tests — buildSentimentCoachingMessage (pure rules)
// Spec source: PAF/VAF integration spec, section 3.3.
// ============================================================================

import { buildSentimentCoachingMessage } from '@/lib/shadow/voice/sentiment-coaching';
import type { SentimentResult } from '@/lib/vaf/sentiment-client';

function buildSentiment(overrides: Partial<SentimentResult> = {}): SentimentResult {
  const base: SentimentResult = {
    overall: 'neutral',
    confidence: 0.8,
    emotions: {
      anger: 0,
      frustration: 0,
      anxiety: 0,
      satisfaction: 0,
      confusion: 0,
      urgency: 0,
    },
    riskFlags: [],
  };
  return {
    ...base,
    ...overrides,
    emotions: { ...base.emotions, ...(overrides.emotions ?? {}) },
  };
}

describe('buildSentimentCoachingMessage', () => {
  // ---------------------------------------------------------------------
  // Rule 1: threats route to escalation, NOT coaching → null.
  // ---------------------------------------------------------------------
  it('returns null when riskFlags includes "threatening" (handled by escalation)', () => {
    expect(
      buildSentimentCoachingMessage(
        buildSentiment({ riskFlags: ['threatening'] }),
      ),
    ).toBeNull();
  });

  it('returns null on threatening even when anger is also high (escalation wins)', () => {
    expect(
      buildSentimentCoachingMessage(
        buildSentiment({
          riskFlags: ['threatening'],
          emotions: { anger: 0.95 } as SentimentResult['emotions'],
          overall: 'hostile',
        }),
      ),
    ).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Rule 2: hostility / anger → frustration callout.
  // ---------------------------------------------------------------------
  it('warns about frustration when overall === "hostile"', () => {
    const out = buildSentimentCoachingMessage(
      buildSentiment({ overall: 'hostile' }),
    );
    expect(out).toMatch(/frustrated|Anger is rising/i);
    expect(out).toMatch(/callback/i);
  });

  it('warns about frustration when anger > 0.8', () => {
    const out = buildSentimentCoachingMessage(
      buildSentiment({
        emotions: { anger: 0.9 } as SentimentResult['emotions'],
      }),
    );
    expect(out).toMatch(/frustrated/i);
  });

  it('does NOT warn when anger is exactly at the 0.8 threshold (strict >)', () => {
    expect(
      buildSentimentCoachingMessage(
        buildSentiment({
          emotions: { anger: 0.8 } as SentimentResult['emotions'],
        }),
      ),
    ).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Rule 3: confusion narration.
  // ---------------------------------------------------------------------
  it('narrates confusion when confusion > 0.7', () => {
    const out = buildSentimentCoachingMessage(
      buildSentiment({
        emotions: { confusion: 0.9 } as SentimentResult['emotions'],
      }),
    );
    expect(out).toMatch(/confused/i);
    expect(out).toMatch(/simplifying/i);
  });

  it('does NOT narrate confusion at the 0.7 threshold (strict >)', () => {
    expect(
      buildSentimentCoachingMessage(
        buildSentiment({
          emotions: { confusion: 0.7 } as SentimentResult['emotions'],
        }),
      ),
    ).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Rule 4: satisfaction narration.
  // ---------------------------------------------------------------------
  it('narrates satisfaction when satisfaction > 0.8', () => {
    const out = buildSentimentCoachingMessage(
      buildSentiment({
        emotions: { satisfaction: 0.95 } as SentimentResult['emotions'],
      }),
    );
    expect(out).toMatch(/going well|receptive/i);
    expect(out).toMatch(/commitment/i);
  });

  it('does NOT narrate satisfaction at the 0.8 threshold (strict >)', () => {
    expect(
      buildSentimentCoachingMessage(
        buildSentiment({
          emotions: { satisfaction: 0.8 } as SentimentResult['emotions'],
        }),
      ),
    ).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Rule 5: nothing notable → null.
  // ---------------------------------------------------------------------
  it('returns null on a neutral, low-emotion frame', () => {
    expect(
      buildSentimentCoachingMessage(buildSentiment({ overall: 'neutral' })),
    ).toBeNull();
  });

  it('returns null on a positive frame that does not clear satisfaction threshold', () => {
    expect(
      buildSentimentCoachingMessage(
        buildSentiment({
          overall: 'positive',
          emotions: { satisfaction: 0.5 } as SentimentResult['emotions'],
        }),
      ),
    ).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Precedence: anger beats confusion beats satisfaction.
  // ---------------------------------------------------------------------
  it('prefers anger callout over confusion when both are high', () => {
    const out = buildSentimentCoachingMessage(
      buildSentiment({
        emotions: {
          anger: 0.95,
          confusion: 0.95,
        } as SentimentResult['emotions'],
      }),
    );
    expect(out).toMatch(/frustrated/i);
    expect(out).not.toMatch(/confused/i);
  });

  it('prefers confusion callout over satisfaction when both are high', () => {
    const out = buildSentimentCoachingMessage(
      buildSentiment({
        emotions: {
          confusion: 0.9,
          satisfaction: 0.9,
        } as SentimentResult['emotions'],
      }),
    );
    expect(out).toMatch(/confused/i);
    expect(out).not.toMatch(/going well/i);
  });

  // ---------------------------------------------------------------------
  // Defensive guards.
  // ---------------------------------------------------------------------
  it('returns null on null/undefined input', () => {
    expect(
      buildSentimentCoachingMessage(null as unknown as SentimentResult),
    ).toBeNull();
    expect(
      buildSentimentCoachingMessage(undefined as unknown as SentimentResult),
    ).toBeNull();
  });
});
