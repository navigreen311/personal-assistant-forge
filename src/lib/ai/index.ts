// P-39: `anthropic` is still re-exported, and importing it outside
// `src/lib/ai/**` is an ESLint error -- see the P-39 block in eslint.config.mjs.
// The raw client is unmetered; `createMessage` is the metered equivalent and
// takes the attribution that turns a call into a `UsageRecord` row.
export {
  anthropic,
  createMessage,
  generateText,
  generateJSON,
  chat,
  streamText,
} from './client';
export type {
  AIMessage,
  AIOptions,
  AIMessageCreateParams,
  AIMessageResponse,
} from './client';
export {
  AI_USAGE_KIND,
  RESERVED_MODULES,
  getAiSpend,
  isAiUsageMetadata,
  recordAiUsage,
  summariseAiUsage,
} from './metering';
export type {
  AiCallAttribution,
  AiCallOutcome,
  AiSpendSummary,
  AiUsageMetadata,
  RecordAiUsageParams,
  RecordAiUsageResult,
} from './metering';
export { MODEL_PRICING, PRICING_AS_OF, isPriced, priceUsd } from './pricing';
export type { ModelPricing } from './pricing';
