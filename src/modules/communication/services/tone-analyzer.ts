// ============================================================================
// Tone Analyzer Service
// Pure functions for detecting and shifting message tone.
// ============================================================================

import type { Tone } from '@/shared/types';
import type { ToneAnalysis } from '@/modules/communication/types';
import { generateJSON, generateText } from '@/lib/ai';

// --- Keyword dictionaries for tone detection ---

const TONE_KEYWORDS: Record<Tone, string[]> = {
  FIRM: ['must', 'require', 'deadline', 'expect', 'immediately', 'unacceptable', 'non-negotiable', 'demand', 'insist', 'obligated'],
  DIPLOMATIC: ['perhaps', 'consider', 'suggest', 'mutual', 'understand', 'perspective', 'compromise', 'navigate', 'respectfully', 'collaborative'],
  WARM: ['happy', 'glad', 'wonderful', 'appreciate', 'grateful', 'delighted', 'thank', 'love', 'enjoy', 'pleasure'],
  DIRECT: ['need', 'want', 'do', 'now', 'action', 'specifically', 'bottom line', 'straightforward', 'plain', 'simply'],
  CASUAL: ['hey', 'cool', 'awesome', 'yeah', 'gonna', 'btw', 'lol', 'no worries', 'chill', 'sounds good'],
  FORMAL: ['hereby', 'pursuant', 'accordingly', 'furthermore', 'henceforth', 'esteemed', 'distinguished', 'respectfully', 'cordially', 'sincerely'],
  EMPATHETIC: ['understand', 'feel', 'difficult', 'sorry', 'care', 'support', 'here for you', 'concern', 'compassion', 'listen'],
  AUTHORITATIVE: ['decided', 'determined', 'final', 'authority', 'directive', 'mandate', 'policy', 'effective immediately', 'approved', 'decree'],
};

const TONE_FORMALITY: Record<Tone, number> = {
  FIRM: 7,
  DIPLOMATIC: 7,
  WARM: 4,
  DIRECT: 5,
  CASUAL: 2,
  FORMAL: 9,
  EMPATHETIC: 5,
  AUTHORITATIVE: 8,
};

const TONE_ASSERTIVENESS: Record<Tone, number> = {
  FIRM: 9,
  DIPLOMATIC: 5,
  WARM: 3,
  DIRECT: 8,
  CASUAL: 2,
  FORMAL: 6,
  EMPATHETIC: 3,
  AUTHORITATIVE: 10,
};

const TONE_EMPATHY: Record<Tone, number> = {
  FIRM: 2,
  DIPLOMATIC: 6,
  WARM: 9,
  DIRECT: 3,
  CASUAL: 5,
  FORMAL: 3,
  EMPATHETIC: 10,
  AUTHORITATIVE: 2,
};

const TONE_SHIFT_PREFIXES: Record<Tone, string> = {
  FIRM: 'I want to be clear: ',
  DIPLOMATIC: 'I appreciate your perspective, and ',
  WARM: 'I hope this finds you well. ',
  DIRECT: '',
  CASUAL: 'Hey, ',
  FORMAL: 'Dear colleague, ',
  EMPATHETIC: 'I understand this may be challenging. ',
  AUTHORITATIVE: 'After careful consideration, ',
};

const TONE_SHIFT_SUFFIXES: Record<Tone, string> = {
  FIRM: ' Please ensure this is addressed promptly.',
  DIPLOMATIC: ' I look forward to finding a mutually beneficial path forward.',
  WARM: ' Thank you so much for your time and consideration!',
  DIRECT: '',
  CASUAL: ' Let me know what you think!',
  FORMAL: ' I remain at your disposal for any further clarification.',
  EMPATHETIC: ' Please don\'t hesitate to reach out if you need any support.',
  AUTHORITATIVE: ' This is effective immediately.',
};

/**
 * Analyze the tone of a given text.
 * Uses keyword matching to detect the dominant tone and compute metrics.
 */
export function analyzeTone(text: string): ToneAnalysis {
  if (!text || text.trim().length === 0) {
    return {
      detectedTone: 'DIRECT',
      confidence: 0,
      suggestions: ['Provide text to analyze'],
      formality: 5,
      assertiveness: 5,
      empathy: 5,
    };
  }

  const lowerText = text.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [tone, keywords] of Object.entries(TONE_KEYWORDS)) {
    scores[tone] = keywords.reduce((count, keyword) => {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = lowerText.match(regex);
      return count + (matches ? matches.length : 0);
    }, 0);
  }

  const totalMatches = Object.values(scores).reduce((sum, s) => sum + s, 0);
  const entries = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const [detectedTone, topScore] = entries[0] as [Tone, number];

  const confidence = totalMatches > 0
    ? Math.min(topScore / Math.max(totalMatches, 1), 1)
    : 0;

  const suggestions = generateSuggestions(detectedTone, scores);

  return {
    detectedTone,
    confidence: Math.round(confidence * 100) / 100,
    suggestions,
    formality: TONE_FORMALITY[detectedTone] ?? 5,
    assertiveness: TONE_ASSERTIVENESS[detectedTone] ?? 5,
    empathy: TONE_EMPATHY[detectedTone] ?? 5,
  };
}

/**
 * Shift the tone of a text to a target tone.
 * Wraps the text with tone-appropriate prefix/suffix and adjusts phrasing.
 */
export function shiftTone(text: string, targetTone: Tone): string {
  if (!text || text.trim().length === 0) {
    return text;
  }

  let shifted = text.trim();

  // Remove existing casual/formal markers
  shifted = shifted.replace(/^(hey|hi|hello|dear colleague),?\s*/i, '');
  shifted = shifted.replace(/\s*(thanks!?|cheers!?|best,?|sincerely,?)\s*$/i, '');

  const prefix = TONE_SHIFT_PREFIXES[targetTone] ?? '';
  const suffix = TONE_SHIFT_SUFFIXES[targetTone] ?? '';

  shifted = `${prefix}${shifted}${suffix}`;

  // Apply tone-specific transformations
  if (targetTone === 'FORMAL') {
    shifted = shifted.replace(/\bdon't\b/g, 'do not');
    shifted = shifted.replace(/\bcan't\b/g, 'cannot');
    shifted = shifted.replace(/\bwon't\b/g, 'will not');
    shifted = shifted.replace(/\bit's\b/g, 'it is');
  } else if (targetTone === 'CASUAL') {
    shifted = shifted.replace(/\bdo not\b/g, "don't");
    shifted = shifted.replace(/\bcannot\b/g, "can't");
    shifted = shifted.replace(/\bwill not\b/g, "won't");
  }

  return shifted;
}

/**
 * Analyze tone using AI with keyword-based fallback.
 */
export async function analyzeToneWithAI(text: string): Promise<ToneAnalysis> {
  if (!text || text.trim().length === 0) {
    return analyzeTone(text);
  }

  try {
    const result = await generateJSON<{
      detectedTone: string;
      confidence: number;
      formality: number;
      assertiveness: number;
      empathy: number;
      suggestions: string[];
    }>(`Analyze the tone of this text.

Text: "${text.substring(0, 2000)}"

Return JSON with:
- detectedTone: one of FIRM, DIPLOMATIC, WARM, DIRECT, CASUAL, FORMAL, EMPATHETIC, AUTHORITATIVE
- confidence: 0-1
- formality: 1-10
- assertiveness: 1-10
- empathy: 1-10
- suggestions: array of tone improvement suggestions`, {
      maxTokens: 256,
      temperature: 0.2,
      system: 'You are a communication tone analyst. Analyze text tone accurately with precise metrics.',
    });

    return {
      detectedTone: result.detectedTone as Tone,
      confidence: result.confidence,
      formality: result.formality,
      assertiveness: result.assertiveness,
      empathy: result.empathy,
      suggestions: result.suggestions,
    };
  } catch {
    return analyzeTone(text);
  }
}

/**
 * Rewrite text to match a target tone using AI, with rule-based fallback.
 */
export async function shiftToneWithAI(text: string, targetTone: Tone): Promise<string> {
  if (!text || text.trim().length === 0) {
    return text;
  }

  try {
    const result = await generateText(
      `Rewrite the following text to match the ${targetTone} tone. Preserve the original meaning and key information.

Original text: "${text}"

Return ONLY the rewritten text, nothing else.`,
      {
        maxTokens: 1024,
        temperature: 0.6,
        system: `You are a professional writing assistant. Rewrite text to match the specified tone:
- FIRM: Clear expectations, direct language
- DIPLOMATIC: Balanced, considerate, seeking mutual ground
- WARM: Friendly, appreciative, positive
- DIRECT: Concise, no filler, action-oriented
- CASUAL: Relaxed, conversational
- FORMAL: Professional, structured, proper
- EMPATHETIC: Understanding, supportive, compassionate
- AUTHORITATIVE: Commanding, decisive, policy-like`,
      }
    );

    return result || shiftTone(text, targetTone);
  } catch {
    return shiftTone(text, targetTone);
  }
}

function generateSuggestions(detectedTone: Tone, scores: Record<string, number>): string[] {
  const suggestions: string[] = [];
  const sortedTones = Object.entries(scores).sort(([, a], [, b]) => b - a);

  if (sortedTones.length >= 2 && sortedTones[0][1] === sortedTones[1][1]) {
    suggestions.push(`Tone is ambiguous between ${sortedTones[0][0]} and ${sortedTones[1][0]}. Consider clarifying intent.`);
  }

  if (detectedTone === 'FIRM' || detectedTone === 'AUTHORITATIVE') {
    suggestions.push('Consider softening language if the recipient may perceive this as aggressive.');
  }
  if (detectedTone === 'CASUAL') {
    suggestions.push('Consider a more formal tone for professional or first-time contacts.');
  }
  if (detectedTone === 'EMPATHETIC') {
    suggestions.push('Ensure the message still includes a clear call to action.');
  }

  if (suggestions.length === 0) {
    suggestions.push(`Tone detected as ${detectedTone}. No changes recommended.`);
  }

  return suggestions;
}
