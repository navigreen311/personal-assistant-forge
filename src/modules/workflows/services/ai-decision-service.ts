// ============================================================================
// AI Decision Service
// Handles AI decision nodes: classify, score, draft, summarize, recommend, extract
// Wired to Anthropic AI via generateJSON/generateText with mock fallbacks
// ============================================================================

import { generateJSON, generateText } from '@/lib/ai';
import type { AIDecisionNodeConfig } from '@/modules/workflows/types';

export interface AIDecisionResult {
  decision: Record<string, unknown>;
  confidence: number;
  requiresHumanReview: boolean;
}

export interface ClassifyResult {
  category: string;
  confidence: number;
}

export interface ScoreResult {
  score: number;
  breakdown: Record<string, number>;
}

export interface DraftResult {
  content: string;
  confidence: number;
}

export interface SummaryResult {
  summary: string;
}

export async function executeAIDecision(
  config: AIDecisionNodeConfig,
  context: Record<string, unknown>
): Promise<AIDecisionResult> {
  let decision: Record<string, unknown>;
  let confidence: number;

  switch (config.decisionType) {
    case 'CLASSIFY': {
      const result = await classifyInput(
        config.prompt,
        JSON.stringify(context),
        Object.keys(config.outputMapping)
      );
      decision = { category: result.category };
      confidence = result.confidence;
      break;
    }
    case 'SCORE': {
      const result = await scoreInput(
        config.prompt,
        JSON.stringify(context),
        Object.keys(config.outputMapping)
      );
      decision = { score: result.score, breakdown: result.breakdown };
      confidence = result.score / 100;
      break;
    }
    case 'DRAFT': {
      const result = await draftContent(config.prompt, JSON.stringify(context));
      decision = { content: result.content };
      confidence = result.confidence;
      break;
    }
    case 'SUMMARIZE': {
      const result = await summarizeInput(config.prompt, JSON.stringify(context));
      decision = { summary: result.summary };
      confidence = 0.9;
      break;
    }
    case 'RECOMMEND': {
      const result = await generateRecommendation(config.prompt, JSON.stringify(context));
      decision = result;
      confidence = (result.confidence as number) ?? 0.78;
      break;
    }
    case 'EXTRACT': {
      const result = await extractEntities(
        config.prompt,
        JSON.stringify(context),
        Object.keys(config.outputMapping)
      );
      decision = result;
      confidence = (result.confidence as number) ?? 0.88;
      break;
    }
    default:
      decision = {};
      confidence = 0;
  }

  // Map output fields according to config
  const mappedDecision: Record<string, unknown> = {};
  for (const [outputKey, contextKey] of Object.entries(config.outputMapping)) {
    mappedDecision[contextKey] = decision[outputKey] ?? null;
  }

  const requiresHumanReview =
    config.confidenceThreshold !== undefined && confidence < config.confidenceThreshold;

  return {
    decision: { ...decision, ...mappedDecision },
    confidence,
    requiresHumanReview,
  };
}

export async function classifyInput(
  prompt: string,
  input: string,
  categories: string[]
): Promise<ClassifyResult> {
  try {
    const result = await generateJSON<{ category: string; confidence: number }>(
      `${prompt}\n\nInput: ${input}\n\nClassify into one of: ${categories.join(', ')}`,
      {
        maxTokens: 256,
        temperature: 0.3,
        system: 'You are a classification engine. Return JSON with the best matching category and your confidence 0-1.',
      }
    );
    return {
      category: result.category,
      confidence: result.confidence,
    };
  } catch {
    // Fallback: return first category with zero confidence
    return {
      category: categories.length > 0 ? categories[0] : 'UNKNOWN',
      confidence: 0,
    };
  }
}

export async function scoreInput(
  prompt: string,
  input: string,
  dimensions: string[]
): Promise<ScoreResult> {
  try {
    const result = await generateJSON<{ score: number; breakdown: Record<string, number> }>(
      `${prompt}\n\nInput: ${input}\n\nScore on dimensions: ${dimensions.join(', ')}. Each dimension 0-100. Overall score is weighted average.`,
      {
        maxTokens: 512,
        temperature: 0.3,
        system: 'You are a scoring engine. Return JSON with an overall score (0-100) and a breakdown object mapping each dimension to its score.',
      }
    );
    return result;
  } catch {
    // Fallback: deterministic mock scores
    const breakdown: Record<string, number> = {};
    let total = 0;
    for (const dim of dimensions) {
      const score = 50;
      breakdown[dim] = score;
      total += score;
    }
    return {
      score: dimensions.length > 0 ? Math.round(total / dimensions.length) : 50,
      breakdown,
    };
  }
}

export async function draftContent(
  prompt: string,
  contextJson: string
): Promise<DraftResult> {
  try {
    const content = await generateText(
      `${prompt}\n\nContext: ${contextJson}`,
      {
        maxTokens: 1024,
        temperature: 0.7,
        system: 'You are a content drafting assistant. Produce high-quality, contextually appropriate content.',
      }
    );
    return { content, confidence: 0.8 };
  } catch {
    return {
      content: `[Draft unavailable] Prompt: "${prompt}". AI service temporarily unavailable.`,
      confidence: 0,
    };
  }
}

export async function summarizeInput(
  prompt: string,
  input: string,
  maxLength?: number
): Promise<SummaryResult> {
  try {
    const summary = await generateText(
      `${prompt}\n\nContent to summarize: ${input}${maxLength ? `\n\nMax length: ${maxLength} characters` : ''}`,
      {
        maxTokens: 512,
        temperature: 0.3,
        system: 'You are a summarization engine. Be concise and capture key points.',
      }
    );
    return { summary };
  } catch {
    // Fallback: truncation-based summary
    const truncated = input.substring(0, maxLength ?? 200);
    return {
      summary: `[Summary unavailable] ${truncated}${input.length > (maxLength ?? 200) ? '...' : ''}`,
    };
  }
}

async function generateRecommendation(
  prompt: string,
  contextJson: string
): Promise<Record<string, unknown>> {
  try {
    const result = await generateJSON<{
      recommendation: string;
      alternatives: string[];
      reasoning: string;
      confidence: number;
    }>(
      `${prompt}\n\nContext: ${contextJson}\n\nProvide a recommendation with alternatives and reasoning.`,
      {
        maxTokens: 512,
        temperature: 0.5,
        system: 'You are a recommendation engine. Provide a primary recommendation, 2-3 alternatives, and clear reasoning. Return JSON with recommendation, alternatives array, reasoning, and confidence (0-1).',
      }
    );
    return result;
  } catch {
    return {
      recommendation: 'Unable to generate recommendation — AI service unavailable.',
      alternatives: [],
      reasoning: 'Fallback: AI call failed.',
      confidence: 0,
    };
  }
}

async function extractEntities(
  prompt: string,
  input: string,
  fields: string[]
): Promise<Record<string, unknown>> {
  try {
    const result = await generateJSON<Record<string, unknown>>(
      `${prompt}\n\nInput: ${input}\n\nExtract these fields: ${fields.join(', ')}`,
      {
        maxTokens: 512,
        temperature: 0.2,
        system: 'You are an entity extraction engine. Extract the requested fields from the input. Return JSON mapping each field name to its extracted value. Include a confidence field (0-1).',
      }
    );
    return { ...result, confidence: result.confidence ?? 0.8 };
  } catch {
    const fallback: Record<string, unknown> = { confidence: 0 };
    for (const field of fields) {
      fallback[field] = null;
    }
    return fallback;
  }
}
