/**
 * P-39 — what a model costs, and what happens when we do not know.
 *
 * ===========================================================================
 * THE RULE THIS FILE EXISTS TO ENFORCE
 * ===========================================================================
 *
 * An unknown model does not get a price. It gets `null`.
 *
 * The table this replaces (`src/lib/ai/usage.ts`, deleted by this package) did
 * the opposite:
 *
 *     const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;  // Sonnet
 *
 * Three models were listed. `claude-haiku-4-5-20251001` -- the one model the
 * cost router actually requests besides the default -- was not one of them, so
 * every Haiku call would have been reported at Sonnet's rate. Haiku 4.5 lists
 * at $1/$5 per MTok against Sonnet 4.6's $3/$15, so the reported figure would
 * have been roughly triple the real one, with no error, no warning, and no way
 * for a reader to tell it apart from a true number.
 *
 * That is the shape of every phantom this run has found: a plausible number
 * nobody can distinguish from a real one. `/api/attention/insights` served a
 * constant 100 to every user for months on the same principle. A cost figure is
 * worse than an insights score, because someone eventually divides by it.
 *
 * So: `priceUsd` returns `null` rather than guessing, and every caller has to
 * decide what to do with a `null` instead of receiving a number that looks
 * finished. `src/lib/ai/metering.ts` writes the row anyway -- the token counts
 * are real and must not be lost -- but flags it `priced: false`, keeps it out
 * of the cost sum, and reports it through P-28's recorder so an operator sees
 * the gap as a counter rather than as silence.
 *
 * ===========================================================================
 * PROVENANCE, BECAUSE THIS REPOSITORY CANNOT VERIFY A LIST PRICE
 * ===========================================================================
 *
 * Nothing inside this repository knows what Anthropic charges. There is no
 * pricing endpoint in the SDK, no invoice, no fixture. The numbers below were
 * transcribed from Anthropic's published model pricing as of the date in
 * `PRICING_AS_OF`, and that date is stamped into the metadata of every row
 * `recordAiUsage` writes -- so a cost figure always carries the age of the
 * price list that produced it.
 *
 * **Confirming these three numbers against a current invoice is a data
 * question for the owner, and this package does not claim to have answered
 * it.** What this package does guarantee is narrower and is the part that can
 * be guaranteed from inside the repository: a model with no entry here never
 * produces a number that looks priced.
 *
 * Deliberately NOT carried over from the deleted table:
 *
 *   `claude-haiku-3-5-20241022` -- retired. Nothing in `src/` requests it.
 *   `claude-opus-4-20250514`    -- deprecated. Nothing in `src/` requests it.
 *
 * Both had prices in the old table that this package cannot source. Dropping
 * them moves them from "priced, possibly wrong, silently" to "unpriced,
 * loudly", which is the safe direction: if either is ever requested again, the
 * unpriced counter fires instead of a confident figure appearing.
 *
 * ===========================================================================
 * WHAT `src/` ACTUALLY REQUESTS, MEASURED RATHER THAN ASSUMED
 * ===========================================================================
 *
 * Only two model strings reach `anthropic.messages.create` at runtime:
 *
 *   `claude-sonnet-4-6`            DEFAULT_MODEL in lib/ai/client.ts and in
 *                                  shadow/agent/core.ts; hardcoded in
 *                                  intent-classifier.ts and outcome-extractor.ts
 *   `claude-haiku-4-5-20251001`    MODEL_MAP.FAST, passed as `options.model`
 *                                  by `routeRequest` in engines/cost/model-router.ts
 *
 * The bare ids `claude-haiku-4-5`, `claude-sonnet-4-5` and `claude-opus-4` also
 * appear in `src/`, but ONLY as `<option>` values in three dashboard pages and
 * as constants in the stub routes those pages read (`/api/engines/triage`,
 * `/api/engines/draft`, `/api/engines/classification`, each of which returns a
 * hardcoded config alongside hardcoded stats). No request is ever made with
 * them. They are listed here anyway -- with `claude-opus-4-6` from
 * MODEL_MAP.POWERFUL, which `routeRequest` returns but never calls -- so that
 * the day one of those dropdowns is wired to a real call, the call is priced
 * rather than counted as unpriced. `claude-sonnet-4-5` and `claude-opus-4` are
 * NOT listed, because this package could not source their prices.
 */

export interface ModelPricing {
  /** USD per 1,000,000 input tokens. */
  inputPerMillion: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMillion: number;
}

/**
 * The date the prices below were read from Anthropic's published pricing.
 *
 * Stamped into every priced row's metadata. It is not decoration: a cost
 * reported from a list that is a year old is a different claim from one
 * reported from today's, and the row should say which it is.
 */
export const PRICING_AS_OF = '2026-06-24';

/**
 * Every model this platform has a price for. There is no default entry and
 * there must never be one -- see the header.
 */
export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = Object.freeze({
  'claude-sonnet-4-6': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-haiku-4-5': { inputPerMillion: 1, outputPerMillion: 5 },
  'claude-haiku-4-5-20251001': { inputPerMillion: 1, outputPerMillion: 5 },
  'claude-opus-4-6': { inputPerMillion: 5, outputPerMillion: 25 },
});

/** Whether a cost can be computed for this model at all. */
export function isPriced(model: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODEL_PRICING, model);
}

/**
 * Cost in USD for a call, or `null` when the model has no list price here.
 *
 * `null` is the whole point of this function. Do not add a fallback, and do not
 * coerce the `null` to `0` at a call site: a zero cost and an unknown cost are
 * different facts, and `0` is indistinguishable from a cheap call once it is in
 * the ledger.
 */
export function priceUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Number((inputCost + outputCost).toFixed(6));
}
