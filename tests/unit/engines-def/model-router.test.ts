/**
 * P-43 — the tier price is the ledger's price, and there is no second table.
 *
 * The three `estimateCost` cases below used to read:
 *
 *     // FAST: $0.25/1M input + $1.25/1M output
 *     expect(estimateCost('FAST', 1000, 1000)).toBeCloseTo(0.0015, 4);
 *     // POWERFUL: $15/1M input + $75/1M output
 *     expect(estimateCost('POWERFUL', 1000, 1000)).toBeCloseTo(0.09, 4);
 *
 * Both passed, and both were wrong: those comments priced Haiku 3.5 and Opus 3,
 * while `MODEL_MAP` routes FAST to `claude-haiku-4-5-20251001` ($1/$5) and
 * POWERFUL to `claude-opus-4-6` ($5/$25). A nineteenth passing test encoding the
 * defect -- and the most complete kind, because it restated the wrong number in
 * a comment so a reader would check the arithmetic and stop there.
 *
 * The numbers are no longer restated here either. Each case asserts the figure
 * AND that the figure equals `priceUsd(getModelForTier(tier), ...)`, so the day
 * the ledger moves, a hardcoded expectation fails loudly instead of a second
 * table drifting quietly. The last case in the file reads the router's own
 * source to fail if a tier-keyed price table comes back.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { routeRequest, estimateCost, getModelForTier } from '@/engines/cost/model-router';
import { MODEL_PRICING, PRICING_AS_OF, isPriced, priceUsd } from '@/lib/ai/pricing';
import type { ModelTier } from '@/engines/cost/types';

const ALL_TIERS: ModelTier[] = ['FAST', 'BALANCED', 'POWERFUL'];

describe('routeRequest', () => {
  it('should route short simple queries to FAST tier', async () => {
    const result = await routeRequest('What is the status?');
    expect(result.inputComplexity).toBe('SIMPLE');
    expect(result.recommendedTier).toBe('FAST');
  });

  it('should route moderate queries to BALANCED tier', async () => {
    const result = await routeRequest(
      'Can you help me organize my inbox and set up some basic filters for common email types?'
    );
    expect(result.recommendedTier).toBe('BALANCED');
  });

  it('should route complex queries to POWERFUL tier', async () => {
    const longInput = 'Analyze and compare the following quarterly financial reports, evaluate trends across all departments, and design a comprehensive strategy for reducing operational costs while maintaining service quality. ' +
      'Consider the impact on customer satisfaction metrics, employee retention, and long-term growth projections. ' +
      'This analysis should include specific recommendations for each department head, along with a timeline and risk assessment. '.repeat(3);
    const result = await routeRequest(longInput);
    expect(result.inputComplexity).toBe('COMPLEX');
    expect(result.recommendedTier).toBe('POWERFUL');
  });

  it('should route draft tasks to BALANCED tier', async () => {
    const result = await routeRequest('Write a quick thank you note', 'draft');
    expect(result.recommendedTier).toBe('BALANCED');
    expect(result.inputComplexity).toBe('MODERATE');
  });

  it('should include estimated cost', async () => {
    const result = await routeRequest('Hello');
    expect(result.estimatedCost).toBeGreaterThanOrEqual(0);
    expect(typeof result.estimatedCost).toBe('number');
  });

  it('should include recommended model', async () => {
    const result = await routeRequest('Hi');
    expect(result.recommendedModel).toBeDefined();
    expect(result.recommendedModel.length).toBeGreaterThan(0);
  });

  it('prices the decision as the model it recommends, and stamps the price list', async () => {
    // The whole point: the cost a caller is shown is the cost of the model the
    // same payload names. If these two ever disagree, a user is quoted one
    // model's price for another model's call.
    const result = await routeRequest('Hello');
    expect(result.recommendedModel).toBe(getModelForTier(result.recommendedTier));
    expect(result.estimatedCost).toBe(priceUsd(result.recommendedModel, 2, 4));
    expect(result.estimatedCostAsOf).toBe(PRICING_AS_OF);
  });
});

describe('estimateCost — derived from the ledger, not declared here', () => {
  // 1000 input + 1000 output at each tier's mapped model, as `src/lib/ai/pricing.ts`
  // prices it on PRICING_AS_OF 2026-06-24.
  const expected: Array<[ModelTier, string, number]> = [
    ['FAST', 'claude-haiku-4-5-20251001', 0.006],
    ['BALANCED', 'claude-sonnet-4-6', 0.018],
    ['POWERFUL', 'claude-opus-4-6', 0.03],
  ];

  it.each(expected)('%s costs what %s costs', (tier, model, cost) => {
    // Three assertions, and all three are load-bearing. The first pins the tier
    // to the model id. The second is the derivation: a reintroduced literal
    // table would pass only while it happened to agree with the ledger. The
    // third pins the absolute figure, so a silent ledger edit is visible here.
    expect(getModelForTier(tier)).toBe(model);
    expect(estimateCost(tier, 1000, 1000)).toBe(priceUsd(model, 1000, 1000));
    expect(estimateCost(tier, 1000, 1000)).toBeCloseTo(cost, 6);
  });

  it('the ledger prices every tier the router can recommend', () => {
    // If a future MODEL_MAP edit points a tier at a model the ledger does not
    // price, this fails and names it -- rather than `estimateCost` quietly
    // returning `null` for a whole tier and a UI showing a blank.
    const unpriced = ALL_TIERS.filter((tier) => !isPriced(getModelForTier(tier)));
    expect(unpriced).toEqual([]);
  });

  it('FAST is Haiku 4.5 money, not the Haiku 3.5 figure this file used to assert', () => {
    // The regression, stated as the difference it makes. $0.25/$1.25 would have
    // produced 0.0015 for this call; the model actually routed to costs four
    // times that. Keep this case: it is the only place the old number appears,
    // and it appears as something that must NOT come back.
    expect(estimateCost('FAST', 1000, 1000)).not.toBeCloseTo(0.0015, 6);
    expect(MODEL_PRICING['claude-haiku-4-5-20251001']).toEqual({
      inputPerMillion: 1,
      outputPerMillion: 5,
    });
  });

  it('POWERFUL is Opus 4.6 money, not the Opus 3 figure this file used to assert', () => {
    // $15/$75 overstated a COMPLEX estimate by 3x against `claude-opus-4-6`.
    expect(estimateCost('POWERFUL', 1000, 1000)).not.toBeCloseTo(0.09, 6);
    expect(MODEL_PRICING['claude-opus-4-6']).toEqual({
      inputPerMillion: 5,
      outputPerMillion: 25,
    });
  });
});

describe('estimateCost — a tier the ledger cannot price', () => {
  // The branch `routeRequest` cannot currently reach, because all three mapped
  // models are priced today. It is exercised against the REAL ledger with one
  // row removed -- which is exactly the state POWERFUL would be in if
  // `claude-opus-4-6` were retired from the price list, or if MODEL_MAP were
  // repointed at a model nobody sourced a price for.
  //
  // P-39's rule is the thing under test: no default, no zero, `null`.
  const narrowedPricing = () => {
    const actual = jest.requireActual<typeof import('@/lib/ai/pricing')>('@/lib/ai/pricing');
    const narrowed: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
      ...actual.MODEL_PRICING,
    };
    delete narrowed['claude-opus-4-6'];
    return {
      ...actual,
      MODEL_PRICING: narrowed,
      // The ledger's own semantics over the narrowed table, so this fake cannot
      // be the thing that returns null for a reason of its own.
      priceUsd: (model: string, input: number, output: number): number | null =>
        narrowed[model] ? actual.priceUsd(model, input, output) : null,
    };
  };

  afterEach(() => {
    jest.dontMock('@/lib/ai/pricing');
  });

  it('returns null for the unpriced tier and a real number for the priced one', async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('@/lib/ai/pricing', narrowedPricing);
      const router = await import('@/engines/cost/model-router');
      expect(router.estimateCost('POWERFUL', 1000, 1000)).toBeNull();
      // Not 0, and not a fallback to another tier's rate.
      expect(router.estimateCost('POWERFUL', 1000, 1000)).not.toBe(0);
      expect(router.estimateCost('FAST', 1000, 1000)).toBeCloseTo(0.006, 6);
    });
  });

  it('says so in the decision instead of handing back a blank cost', async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('@/lib/ai/pricing', narrowedPricing);
      const router = await import('@/engines/cost/model-router');
      const longInput = 'Analyze and compare the following quarterly financial reports, evaluate trends across all departments, and design a comprehensive strategy for reducing operational costs while maintaining service quality. ' +
        'Consider the impact on customer satisfaction metrics, employee retention, and long-term growth projections. ' +
        'This analysis should include specific recommendations for each department head, along with a timeline and risk assessment. '.repeat(3);
      const decision = await router.routeRequest(longInput);
      expect(decision.recommendedTier).toBe('POWERFUL');
      expect(decision.estimatedCost).toBeNull();
      // A null cost with no `asOf` is the honest pair: there is no price list
      // this figure came from, because there is no figure.
      expect(decision.estimatedCostAsOf).toBeNull();
      expect(decision.reason).toContain('Cost estimate unavailable');
      expect(decision.reason).toContain('claude-opus-4-6');
    });
  });
});

describe('getModelForTier', () => {
  it('should return haiku model for FAST tier', () => {
    expect(getModelForTier('FAST')).toContain('haiku');
  });

  it('should return sonnet model for BALANCED tier', () => {
    expect(getModelForTier('BALANCED')).toContain('sonnet');
  });

  it('should return opus model for POWERFUL tier', () => {
    expect(getModelForTier('POWERFUL')).toContain('opus');
  });
});

describe('P-43: the router holds no price table of its own', () => {
  it('imports the ledger and declares no per-tier rates', () => {
    // Two tables that agree today are two tables that disagree after the next
    // price change -- which is precisely how $0.25/$1.25 survived here. The
    // assertion is structural rather than numeric, because a numeric one passes
    // for as long as the copy happens to be current.
    const source = readFileSync(
      join(__dirname, '..', '..', '..', 'src', 'engines', 'cost', 'model-router.ts'),
      'utf8'
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(code).toContain("from '@/lib/ai/pricing'");
    // The old table's field names, and the shape of any replacement for it.
    expect(code).not.toMatch(/inputPer1M|outputPer1M/);
    expect(code).not.toMatch(/TIER_PRICING/);
    // No tier name may sit next to a number in executable code.
    expect(code).not.toMatch(/(FAST|BALANCED|POWERFUL)\s*:\s*\{[^}]*\d/);
  });
});
