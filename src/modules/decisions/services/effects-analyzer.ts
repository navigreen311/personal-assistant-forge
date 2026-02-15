// ============================================================================
// Second-Order Effects Analyzer (Pure Functions + Placeholder Async)
// ============================================================================

import type { SecondOrderEffect, EffectsTree } from '@/modules/decisions/types';

/**
 * Analyze cascading effects of an action. Generates a structured tree
 * of 1st, 2nd, and 3rd order effects.
 *
 * ASSUMPTION: This is a placeholder that generates deterministic sample effects.
 * In production, this would call an LLM or analysis engine.
 */
export async function analyzeEffects(
  action: string,
  context: string
): Promise<EffectsTree> {
  const effects = generateSampleEffects(action, context);
  const totalPositive = effects.filter((e) => e.sentiment === 'POSITIVE').length;
  const totalNegative = effects.filter((e) => e.sentiment === 'NEGATIVE').length;
  const total = effects.length || 1;
  const netSentiment = Math.round(((totalPositive - totalNegative) / total) * 100) / 100;

  return {
    rootAction: action,
    effects,
    totalPositive,
    totalNegative,
    netSentiment: Math.max(-1, Math.min(1, netSentiment)),
  };
}

/**
 * Flatten an effects tree into a flat array (already flat in our structure,
 * but ensures correct ordering: 1st -> 2nd -> 3rd).
 */
export function flattenEffectsTree(tree: EffectsTree): SecondOrderEffect[] {
  return [...tree.effects].sort((a, b) => a.order - b.order);
}

/**
 * Filter effects by order (1, 2, or 3).
 */
export function filterByOrder(
  effects: SecondOrderEffect[],
  order: number
): SecondOrderEffect[] {
  return effects.filter((e) => e.order === order);
}

// --- Internal ---

function generateSampleEffects(action: string, _context: string): SecondOrderEffect[] {
  const baseId = action.replace(/\s+/g, '-').toLowerCase().slice(0, 20);

  const first1: SecondOrderEffect = {
    id: `${baseId}-1a`,
    description: `Direct impact of: ${action}`,
    order: 1,
    sentiment: 'POSITIVE',
    likelihood: 0.9,
    affectedAreas: ['Operations'],
  };

  const first2: SecondOrderEffect = {
    id: `${baseId}-1b`,
    description: `Resource allocation changes from: ${action}`,
    order: 1,
    sentiment: 'NEGATIVE',
    likelihood: 0.7,
    affectedAreas: ['Budget', 'Team'],
  };

  const first3: SecondOrderEffect = {
    id: `${baseId}-1c`,
    description: `Stakeholder perception shift from: ${action}`,
    order: 1,
    sentiment: 'NEUTRAL',
    likelihood: 0.6,
    affectedAreas: ['Reputation'],
  };

  const second1: SecondOrderEffect = {
    id: `${baseId}-2a`,
    description: 'Increased efficiency leads to capacity for new initiatives',
    order: 2,
    sentiment: 'POSITIVE',
    likelihood: 0.7,
    affectedAreas: ['Strategy', 'Growth'],
    parentEffectId: first1.id,
  };

  const second2: SecondOrderEffect = {
    id: `${baseId}-2b`,
    description: 'Budget pressure may delay other planned projects',
    order: 2,
    sentiment: 'NEGATIVE',
    likelihood: 0.5,
    affectedAreas: ['Planning', 'Morale'],
    parentEffectId: first2.id,
  };

  const third1: SecondOrderEffect = {
    id: `${baseId}-3a`,
    description: 'New initiatives may attract additional investment or partnerships',
    order: 3,
    sentiment: 'POSITIVE',
    likelihood: 0.4,
    affectedAreas: ['Revenue', 'Partnerships'],
    parentEffectId: second1.id,
  };

  const third2: SecondOrderEffect = {
    id: `${baseId}-3b`,
    description: 'Project delays could impact competitive positioning',
    order: 3,
    sentiment: 'NEGATIVE',
    likelihood: 0.3,
    affectedAreas: ['Market Position'],
    parentEffectId: second2.id,
  };

  return [first1, first2, first3, second1, second2, third1, third2];
}
