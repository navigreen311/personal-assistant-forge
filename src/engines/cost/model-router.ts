import { generateJSON } from '@/lib/ai';
import type { ModelTier, ModelRoutingDecision } from './types';

// Pricing per 1M tokens: [input, output]
const TIER_PRICING: Record<ModelTier, { inputPer1M: number; outputPer1M: number }> = {
  FAST: { inputPer1M: 0.25, outputPer1M: 1.25 },
  BALANCED: { inputPer1M: 3, outputPer1M: 15 },
  POWERFUL: { inputPer1M: 15, outputPer1M: 75 },
};

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
  const estimatedCost = estimateCost(recommendedTier, tokenCount, estimatedOutputTokens);

  return {
    inputComplexity: complexity,
    recommendedTier,
    recommendedModel: MODEL_MAP[recommendedTier],
    reason,
    estimatedCost,
  };
}

export function estimateCost(modelTier: ModelTier, inputTokens: number, outputTokens: number): number {
  const pricing = TIER_PRICING[modelTier];
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // Round to 6 decimal places
}

export function getModelForTier(tier: ModelTier): string {
  return MODEL_MAP[tier];
}
