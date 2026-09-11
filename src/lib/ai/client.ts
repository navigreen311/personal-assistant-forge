/**
 * The one door to Anthropic, and the point at which spend becomes a row.
 *
 * ===========================================================================
 * P-39 — WHY EVERY FUNCTION HERE ENDS IN A DATABASE WRITE
 * ===========================================================================
 *
 * Before this package, nothing recorded what this platform spent on model
 * calls. `lib/ai/usage.ts` held an in-memory tracker with zero importers
 * (P-38's reachability scan: "`src/lib/ai/usage.ts` is imported by NOTHING"),
 * and `engines/cost/usage-metering.ts` persisted to `UsageRecord` but only
 * fired when something POSTed `/api/billing/usage`. Ninety-seven files import
 * from this module or its barrel; none of their calls were metered.
 *
 * Every function below now ends in `recordAiUsage`, which writes a row to
 * `UsageRecord` -- the table whose `model` column is documented "AI model used".
 * The write is awaited rather than fired and forgotten, because a ledger you
 * cannot assert on in a test is the same kind of claim as an in-memory tracker:
 * one insert next to a multi-second model call is not the cost worth trading
 * for it. `recordAiUsage` never throws, so a ledger failure cannot take down
 * the call it was measuring; it reports through P-28's recorder instead.
 *
 * ===========================================================================
 * ATTRIBUTION, AND THE GAP THAT IS LEFT
 * ===========================================================================
 *
 * `UsageRecord.entityId` is a non-null foreign key, so a call made with no
 * entity in scope cannot produce a row at all. `AIOptions` therefore carries
 * `entityId`, `userId` and `module`, and a caller that supplies them gets a
 * metered row. A caller that does not is NOT silently dropped: `recordAiUsage`
 * reports it under the fingerprint `ai_usage:unattributed:<module>`, so the
 * remaining gap is a counter an operator can read.
 *
 * This is stated plainly because it is the honest shape of the change: the seam
 * meters, and the call sites that have not yet been given an entity are
 * countable rather than invisible. Inventing an entity id to satisfy the
 * foreign key would have made the ledger complete and wrong, which is the
 * failure mode this package exists to remove.
 *
 * ===========================================================================
 * THE RAW CLIENT IS A BYPASS, AND IS NOW A LINT ERROR
 * ===========================================================================
 *
 * `anthropic` is still exported: this module needs it, and `createMessage`
 * exists precisely so nobody else does. Importing `anthropic` (or
 * `@anthropic-ai/sdk`) outside `src/lib/ai/**` is an ESLint error -- see the
 * P-39 block in `eslint.config.mjs`, which follows P-34's ban on `@/lib/db` in
 * the Shadow tool router and P-17's single-writer rules for two Shadow tables.
 * Three files held that bypass (`shadow/agent/core.ts`, `intent-classifier.ts`,
 * `outcome-extractor.ts` -- the agent's highest-volume path) and now go through
 * `createMessage`.
 *
 * `export default anthropic` is gone. It had no importers, and a default export
 * is a second door that a reader of an import statement cannot see the name of.
 */

import Anthropic from '@anthropic-ai/sdk';

import { recordAiUsage, type AiCallAttribution, type AiCallOutcome } from './metering';

const globalForAnthropic = globalThis as unknown as { anthropic: Anthropic };

export const anthropic =
  globalForAnthropic.anthropic ??
  new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  });

if (process.env.NODE_ENV !== 'production') globalForAnthropic.anthropic = anthropic;

export type AIMessage = {
  role: 'user' | 'assistant';
  content: string;
};

/**
 * Request parameters for `createMessage`, re-exported so that callers needing
 * tools or multi-block content never have to import `@anthropic-ai/sdk` -- which
 * would be a second way to construct a client and is banned outside this
 * directory for that reason.
 */
export type AIMessageCreateParams = Anthropic.MessageCreateParamsNonStreaming;
export type AIMessageResponse = Anthropic.Message;

export type AIOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
  /**
   * P-39 attribution. Supply `entityId` and the call lands in the `UsageRecord`
   * ledger; omit it and the call is counted as unattributed instead.
   */
  entityId?: string;
  userId?: string;
  /** Which module is spending, e.g. 'inbox'. Becomes `UsageRecord.module`. */
  module?: string;
};

const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * `UsageRecord.module` for a call that did not say which module it was.
 *
 * A constant rather than the prompt or the model name: `module` is indexed and
 * is grouped on by `engines/cost/cost-attribution.ts`, and a high-cardinality
 * value there would turn that grouping into one bucket per call.
 */
const DEFAULT_MODULE = 'ai-client';

function attributionOf(options: AIOptions): AiCallAttribution {
  return {
    entityId: options.entityId,
    userId: options.userId,
    module: options.module ?? DEFAULT_MODULE,
  };
}

/**
 * The metered equivalent of `anthropic.messages.create`.
 *
 * For callers that need the full request surface -- tools, multi-block content,
 * an explicit token budget -- and would otherwise reach for the raw client.
 * Attribution is a REQUIRED second argument rather than an optional field: this
 * function exists to replace the bypass, and an optional attribution would make
 * the replacement as unmetered as the thing it replaced.
 */
export async function createMessage(
  params: AIMessageCreateParams,
  attribution: AiCallAttribution,
): Promise<AIMessageResponse> {
  const startedAt = Date.now();
  let outcome: AiCallOutcome = 'ok';
  try {
    const response = await anthropic.messages.create(params);
    await recordAiUsage({
      model: response.model ?? String(params.model),
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      attribution,
      outcome,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (err) {
    // A call that threw still happened and may still have been billed. The
    // SDK reports no usage on a thrown request, so the row carries zero tokens
    // and says so -- a row with `outcome: 'error'` is a record that a call was
    // attempted, not a claim that it was free.
    outcome = 'error';
    await recordAiUsage({
      model: String(params.model),
      inputTokens: 0,
      outputTokens: 0,
      attribution,
      outcome,
      durationMs: Date.now() - startedAt,
    });
    throw err;
  }
}

export async function generateText(
  prompt: string,
  options: AIOptions = {}
): Promise<string> {
  const response = await createMessage(
    {
      model: options.model ?? DEFAULT_MODEL,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      system: options.system,
      messages: [{ role: 'user', content: prompt }],
    },
    attributionOf(options)
  );

  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}

export async function generateJSON<T>(
  prompt: string,
  options: AIOptions = {}
): Promise<T> {
  // Metered exactly once, by the `generateText` below. Adding a second
  // `recordAiUsage` here would double every JSON call in the ledger.
  const text = await generateText(prompt, {
    ...options,
    system: (options.system ?? '') + '\n\nRespond with valid JSON only. No markdown, no code fences.',
  });

  return JSON.parse(text) as T;
}

export async function chat(
  messages: AIMessage[],
  options: AIOptions = {}
): Promise<string> {
  const response = await createMessage(
    {
      model: options.model ?? DEFAULT_MODEL,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      system: options.system,
      messages,
    },
    attributionOf(options)
  );

  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}

/**
 * Streaming, metered from the stream's own usage events.
 *
 * Input tokens arrive on `message_start` and the running output count on
 * `message_delta`, so the row is accurate without a second request. The write
 * is in a `finally`, which is what makes an ABANDONED stream still produce a
 * row: a consumer that `break`s out of a `for await` calls the generator's
 * `return()`, the `finally` runs, and the partial spend is recorded with
 * `outcome: 'partial'` rather than lost. The one case that still records
 * nothing is a consumer that drives `.next()` by hand and then drops the
 * generator without calling `.return()`; there is no hook for that.
 */
export async function* streamText(
  prompt: string,
  options: AIOptions = {}
): AsyncGenerator<string> {
  const model = options.model ?? DEFAULT_MODEL;
  const startedAt = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let completed = false;
  let failed = false;

  try {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      system: options.system,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'message_start') {
        inputTokens = event.message.usage?.input_tokens ?? 0;
        outputTokens = event.message.usage?.output_tokens ?? 0;
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage?.output_tokens ?? outputTokens;
      } else if (event.type === 'message_stop') {
        completed = true;
      } else if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  } catch (err) {
    // Reached when the request itself throws or the stream errors mid-flight.
    // A consumer's `break` does NOT come through here -- it resumes the
    // generator with a return completion, which goes straight to `finally` and
    // is recorded as `partial`.
    failed = true;
    throw err;
  } finally {
    await recordAiUsage({
      model,
      inputTokens,
      outputTokens,
      attribution: attributionOf(options),
      outcome: failed ? 'error' : completed ? 'ok' : 'partial',
      durationMs: Date.now() - startedAt,
    });
  }
}
