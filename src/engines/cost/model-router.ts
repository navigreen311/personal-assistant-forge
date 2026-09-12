/**
 * P-43 — a tier costs what the model it routes to costs.
 *
 * ===========================================================================
 * WHAT THIS FILE USED TO SAY, AND WHY IT WAS WRONG
 * ===========================================================================
 *
 * There was a second price table here:
 *
 *     const TIER_PRICING = {
 *       FAST:     { inputPer1M: 0.25, outputPer1M: 1.25 },   // Haiku 3.5
 *       BALANCED: { inputPer1M: 3,    outputPer1M: 15   },   // correct
 *       POWERFUL: { inputPer1M: 15,   outputPer1M: 75   },   // Opus 3
 *     };
 *
 * Two of the three were wrong, and wrong in the expensive direction for the
 * reader: `MODEL_MAP.FAST` is `claude-haiku-4-5-20251001`, which the ledger
 * prices at $1/$5 -- four times the figure above -- and `MODEL_MAP.POWERFUL` is
 * `claude-opus-4-6`, priced at $5/$25, so the old table overstated a COMPLEX
 * estimate by 3x. The numbers were Haiku-3.5-era and Opus-3-era: exactly the
 * rows P-39 deliberately did not carry into `src/lib/ai/pricing.ts` because it
 * could not source them. The tier table kept them alive one directory over.
 *
 * Nothing billed from them -- `estimateCost` predicts, it does not meter, and
 * `recommendedModel` is returned to `/api/billing/model-route` and never fed to
 * a call. But the figure is shown to a user as a cost estimate, and "plausible
 * number nobody can distinguish from a real one" is the defect this whole run
 * keeps finding.
 *
 * ===========================================================================
 * WHY THERE IS NO TABLE HERE ANY MORE, AND MUST NOT BE ONE AGAIN
 * ===========================================================================
 *
 * The disagreement did not arise from carelessness. It arose from having two
 * tables: they agreed the day the second was written and drifted the first time
 * one of them was updated. Copying today's ledger figures into a fresh
 * `TIER_PRICING` would reproduce the bug with a later date on it.
 *
 * So a tier is priced by looking up the model it actually routes to, through
 * the `MODEL_MAP` that already decided which model that is, in the one ledger
 * that bills: `src/lib/ai/pricing.ts`. There is exactly one place a price can
 * change, and a tier cannot disagree with the model it names.
 *
 * `tests/unit/engines-def/model-router.test.ts` asserts this structurally --
 * every tier's estimate equals `priceUsd(getModelForTier(tier), ...)` -- and
 * reads this file's own source to fail if a literal price table reappears.
 *
 * ===========================================================================
 * AND IF THE LEDGER CANNOT PRICE A TIER, THE ESTIMATE IS `null`
 * ===========================================================================
 *
 * P-39's rule applies unchanged here: an unpriced model gets `null`, never a
 * default and never `0`. A predictive router that cannot price a tier says so.
 * `estimateCost` therefore returns `number | null` and `ModelRoutingDecision`
 * carries `estimatedCost: number | null`; the unpriced case is also said in
 * words in `reason`, because a blank cost in a UI is indistinguishable from a
 * free one.
 *
 * All three tiers ARE priced by the ledger as of PRICING_AS_OF 2026-06-24
 * ($1/$5, $3/$15, $5/$25). The null path is not currently reachable through
 * `routeRequest` -- which is precisely why it is tested directly, against a
 * ledger narrowed to drop Opus, rather than left as an untried branch.
 */

import { generateJSON } from '@/lib/ai';
import { PRICING_AS_OF, priceUsd } from '@/lib/ai/pricing';
import type { ModelTier, ModelRoutingDecision } from './types';

const MODEL_MAP: Record<ModelTier, string> = {
  FAST: 'claude-haiku-4-5-20251001',
  BALANCED: 'claude-sonnet-4-6',
  POWERFUL: 'claude-opus-4-6',
};

const SIMPLE_INTENTS = [
  'greeting', 'yes', 'no', 'ok', 'thanks', 'lookup', 'status',
  'list', 'count', 'confirm', 'cancel',
];

function estimateTokenCount(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

function classifyComplexity(inputText: string, taskType?: string): 'SIMPLE' | 'MODERATE' | 'COMPLEX' {
  if (taskType === 'draft') return 'MODERATE';

  const tokenCount = estimateTokenCount(inputText);
  const lower = inputText.toLowerCase().trim();

  // Simple: short queries with simple intent
  if (tokenCount < 100) {
    const isSimpleIntent = SIMPLE_INTENTS.some(intent => lower.includes(intent));
    const isQuestion = lower.split(' ').length <= 10;
    if (isSimpleIntent || isQuestion) return 'SIMPLE';
  }

  // Complex: long, multi-part, creative, or analytical
  if (tokenCount > 500) return 'COMPLEX';

  const complexIndicators = [
    'analyze', 'compare', 'evaluate', 'design', 'architect',
    'create', 'write', 'compose', 'generate', 'plan',
    'research', 'investigate', 'summarize a long',
    'multi-step', 'step by step', 'comprehensive',
  ];
  const hasComplexIndicator = complexIndicators.some(ind => lower.includes(ind));
  if (hasComplexIndicator && tokenCount > 150) return 'COMPLEX';
  if (hasComplexIndicator) return 'MODERATE';

  return 'MODERATE';
}

export async function routeRequest(inputText: string, taskType?: string): Promise<ModelRoutingDecision> {
  let complexity = classifyComplexity(inputText, taskType);
  const tokenCount = estimateTokenCount(inputText);

  // Use AI as optional refinement when rule-based classifier returns MODERATE
  if (complexity === 'MODERATE') {
    try {
      const startTime = Date.now();
      const aiResult = await generateJSON<{ complexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX' }>(
        `Classify the complexity of this task. Return JSON with "complexity": "SIMPLE", "MODERATE", or "COMPLEX".

Task: "${inputText.slice(0, 200)}"${taskType ? `\nType: ${taskType}` : ''}`,
        { temperature: 0.1, maxTokens: 50, model: MODEL_MAP.FAST }
      );
      const elapsed = Date.now() - startTime;

      // Only use AI result if response was fast enough (<200ms)
      if (elapsed < 200 && aiResult.complexity) {
        complexity = aiResult.complexity;
      }
    } catch {
      // Fall back to rule-based classification
    }
  }

  let recommendedTier: ModelTier;
  let reason: string;

  switch (complexity) {
    case 'SIMPLE':
      recommendedTier = 'FAST';
      reason = `Simple query (${tokenCount} est. tokens). Using fast model for efficiency.`;
      break;
    case 'MODERATE':
      recommendedTier = 'BALANCED';
      reason = taskType === 'draft'
        ? 'Draft tasks use balanced tier for quality and speed.'
        : `Moderate complexity (${tokenCount} est. tokens). Using balanced model.`;
      break;
    case 'COMPLEX':
      recommendedTier = 'POWERFUL';
      reason = `Complex query (${tokenCount} est. tokens). Using powerful model for best results.`;
      break;
  }

  // Estimate output as 2x input for cost estimation
  const estimatedOutputTokens = tokenCount * 2;
  const recommendedModel = MODEL_MAP[recommendedTier];
  const estimatedCost = estimateCost(recommendedTier, tokenCount, estimatedOutputTokens);

  if (estimatedCost === null) {
    // Say it, rather than hand back a blank a reader will mistake for cheap.
    // See the header: no default, no zero.
    reason += ` Cost estimate unavailable: no list price is recorded for ${recommendedModel}.`;
  }

  return {
    inputComplexity: complexity,
    recommendedTier,
    recommendedModel,
    reason,
    estimatedCost,
    estimatedCostAsOf: estimatedCost === null ? null : PRICING_AS_OF,
  };
}

/**
 * Predicted USD cost of a call at this tier, or `null` when the ledger has no
 * price for the model the tier routes to.
 *
 * Derived, never declared: the tier is resolved to a model id by `MODEL_MAP` --
 * the same map `routeRequest` returns to the caller -- and the price comes from
 * `priceUsd` in `src/lib/ai/pricing.ts`, which is the table that bills. Do not
 * reintroduce a tier-keyed price table here, and do not coerce the `null` to
 * `0` at a call site: an unknown cost and a zero cost are different facts.
 */
export function estimateCost(
  modelTier: ModelTier,
  inputTokens: number,
  outputTokens: number,
): number | null {
  return priceUsd(MODEL_MAP[modelTier], inputTokens, outputTokens);
}

export function getModelForTier(tier: ModelTier): string {
  return MODEL_MAP[tier];
}
