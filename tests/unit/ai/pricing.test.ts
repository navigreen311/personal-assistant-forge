/**
 * P-39 — an unknown model does not get a number.
 *
 * The table this replaces (`src/lib/ai/usage.ts`, deleted) ended with
 * `?? DEFAULT_PRICING`, and its test suite contained this case:
 *
 *     it('should use default pricing for unknown models', () => {
 *       const cost = estimateCost('unknown-model', 1000, 500);
 *       const sonnetCost = estimateCost('claude-sonnet-4-5-20250929', 1000, 500);
 *       expect(cost).toBe(sonnetCost);
 *     });
 *
 * A passing test encoding the defect -- the eighteenth consecutive package to
 * find one. Worse, the model it compared against (`claude-sonnet-4-5-20250929`)
 * was ALSO not in the table, so both sides of that assertion came from the
 * fallback and the test would have passed whatever Sonnet cost. Its sibling
 * cases carried comments like "1000 input tokens at $3/million" for a model the
 * table had never heard of.
 *
 * This file asserts the opposite property: no fallback, and `null` for anything
 * the table cannot price.
 */

import { MODEL_PRICING, PRICING_AS_OF, isPriced, priceUsd } from '@/lib/ai/pricing';

describe('P-39: pricing refuses to guess', () => {
  it('returns null for a model it has no price for — not a default', () => {
    expect(priceUsd('definitely-not-a-model', 1000, 500)).toBeNull();
    expect(isPriced('definitely-not-a-model')).toBe(false);
  });

  it('returns null for the models the old table silently priced as Sonnet', () => {
    // `claude-haiku-4-5-20251001` IS priced now (see below). These three are the
    // ones this package could not source a price for, and an unsourced price is
    // exactly the fiction it exists to prevent.
    expect(priceUsd('claude-sonnet-4-5', 1_000_000, 1_000_000)).toBeNull();
    expect(priceUsd('claude-opus-4', 1_000_000, 1_000_000)).toBeNull();
    expect(priceUsd('claude-haiku-3-5-20241022', 1_000_000, 1_000_000)).toBeNull();
  });

  it('prices the two models src/ actually requests at runtime', () => {
    // Measured, not assumed: only these two strings reach
    // `anthropic.messages.create`. `claude-sonnet-4-6` is DEFAULT_MODEL in
    // `lib/ai/client.ts` and in `shadow/agent/core.ts`; the Haiku snapshot is
    // MODEL_MAP.FAST, passed as `options.model` by `routeRequest`.
    expect(priceUsd('claude-sonnet-4-6', 1_000_000, 0)).toBe(3);
    expect(priceUsd('claude-sonnet-4-6', 0, 1_000_000)).toBe(15);
    expect(priceUsd('claude-haiku-4-5-20251001', 1_000_000, 0)).toBe(1);
    expect(priceUsd('claude-haiku-4-5-20251001', 0, 1_000_000)).toBe(5);
  });

  it('prices Haiku well below Sonnet — the error the old default made', () => {
    // The old table had no Haiku 4.5 entry, so a Haiku call fell through to
    // Sonnet pricing. This is the size of the lie that produced: the same call
    // reported at three times its cost, with no error.
    const haiku = priceUsd('claude-haiku-4-5-20251001', 1_000_000, 1_000_000);
    const sonnet = priceUsd('claude-sonnet-4-6', 1_000_000, 1_000_000);
    expect(haiku).not.toBeNull();
    expect(sonnet).not.toBeNull();
    expect(sonnet as number).toBeCloseTo((haiku as number) * 3, 6);
  });

  it('has no entry that could act as a default', () => {
    // A guard against the fix being undone by adding a '*' or 'default' key.
    for (const key of Object.keys(MODEL_PRICING)) {
      expect(key.startsWith('claude-')).toBe(true);
    }
    expect(Object.keys(MODEL_PRICING)).not.toContain('default');
    expect(Object.keys(MODEL_PRICING)).not.toContain('*');
  });

  it('carries the date of the price list, so a cost can be dated', () => {
    expect(PRICING_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is zero for zero tokens on a priced model, and still null on an unpriced one', () => {
    // The distinction the whole design turns on: a zero cost and an unknown
    // cost are different facts and must not both be `0`.
    expect(priceUsd('claude-sonnet-4-6', 0, 0)).toBe(0);
    expect(priceUsd('who-knows', 0, 0)).toBeNull();
  });
});
