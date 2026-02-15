// ============================================================================
// Decision Matrix — Weighted Scoring (Pure Functions, No DB)
// ============================================================================

import type {
  MatrixCriterion,
  MatrixScore,
  MatrixResult,
  SensitivityResult,
} from '@/modules/decisions/types';

/**
 * Validates that criteria weights sum to 1.0 within tolerance.
 */
export function validateWeights(
  criteria: MatrixCriterion[]
): { valid: boolean; error?: string } {
  if (criteria.length === 0) {
    return { valid: false, error: 'At least one criterion is required' };
  }

  for (const c of criteria) {
    if (c.weight < 0) {
      return { valid: false, error: `Criterion "${c.name}" has negative weight` };
    }
  }

  const sum = criteria.reduce((acc, c) => acc + c.weight, 0);
  if (Math.abs(sum - 1.0) > 0.01) {
    return {
      valid: false,
      error: `Weights sum to ${sum.toFixed(4)}, must sum to 1.0 (±0.01)`,
    };
  }

  return { valid: true };
}

/**
 * Calculate weighted totals for each option, rank, and return full matrix result.
 */
export function createMatrix(
  decisionId: string,
  criteria: MatrixCriterion[],
  scores: MatrixScore[]
): MatrixResult {
  const validation = validateWeights(criteria);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Build weight lookup
  const weightMap = new Map<string, number>();
  for (const c of criteria) {
    weightMap.set(c.id, c.weight);
  }

  // Gather unique option IDs
  const optionIds = [...new Set(scores.map((s) => s.optionId))];

  // Calculate weighted totals per option
  const totals = optionIds.map((optionId) => {
    const optionScores = scores.filter((s) => s.optionId === optionId);
    const weightedTotal = optionScores.reduce((sum, s) => {
      const weight = weightMap.get(s.criterionId) ?? 0;
      return sum + s.score * weight;
    }, 0);
    return { optionId, label: optionId, weightedTotal };
  });

  // Sort descending by total
  totals.sort((a, b) => b.weightedTotal - a.weightedTotal);

  // Assign ranks
  const optionScores = totals.map((t, i) => ({ ...t, rank: i + 1 }));

  const sensitivityAnalysis = runSensitivityAnalysis(criteria, scores);

  const winner = optionScores[0]?.optionId ?? '';
  const margin =
    optionScores.length >= 2
      ? optionScores[0].weightedTotal - optionScores[1].weightedTotal
      : optionScores[0]?.weightedTotal ?? 0;

  return {
    optionScores,
    sensitivityAnalysis,
    winner,
    margin: Math.round(margin * 1000) / 1000,
  };
}

/**
 * Sensitivity analysis: for each criterion, vary its weight ±20%
 * (redistributing the delta proportionally among other criteria)
 * and check if the winner changes.
 */
export function runSensitivityAnalysis(
  criteria: MatrixCriterion[],
  scores: MatrixScore[]
): SensitivityResult[] {
  // Determine baseline winner
  const baselineWinner = getWinner(criteria, scores);

  return criteria.map((criterion) => {
    let tippingWeight: number | null = null;
    let winnerChanged = false;

    // Test weight adjustments from -20% to +20% in steps
    for (const delta of [-0.2, -0.15, -0.1, -0.05, 0.05, 0.1, 0.15, 0.2]) {
      const adjustedCriteria = adjustWeight(criteria, criterion.id, delta);
      if (!adjustedCriteria) continue;

      const newWinner = getWinner(adjustedCriteria, scores);
      if (newWinner !== baselineWinner) {
        winnerChanged = true;
        tippingWeight = adjustedCriteria.find((c) => c.id === criterion.id)!.weight;
        break;
      }
    }

    const impactOnRanking: 'NONE' | 'MINOR' | 'MAJOR' = !winnerChanged
      ? 'NONE'
      : Math.abs((tippingWeight ?? criterion.weight) - criterion.weight) > 0.1
        ? 'MINOR'
        : 'MAJOR';

    return {
      criterionId: criterion.id,
      criterionName: criterion.name,
      tippingWeight,
      impactOnRanking,
    };
  });
}

// --- Internal helpers ---

function getWinner(criteria: MatrixCriterion[], scores: MatrixScore[]): string {
  const weightMap = new Map<string, number>();
  for (const c of criteria) {
    weightMap.set(c.id, c.weight);
  }

  const optionIds = [...new Set(scores.map((s) => s.optionId))];
  let bestId = '';
  let bestTotal = -Infinity;

  for (const optionId of optionIds) {
    const total = scores
      .filter((s) => s.optionId === optionId)
      .reduce((sum, s) => sum + s.score * (weightMap.get(s.criterionId) ?? 0), 0);

    if (total > bestTotal) {
      bestTotal = total;
      bestId = optionId;
    }
  }

  return bestId;
}

function adjustWeight(
  criteria: MatrixCriterion[],
  criterionId: string,
  delta: number
): MatrixCriterion[] | null {
  const target = criteria.find((c) => c.id === criterionId);
  if (!target) return null;

  const newWeight = target.weight + delta;
  if (newWeight < 0 || newWeight > 1) return null;

  const otherTotal = criteria
    .filter((c) => c.id !== criterionId)
    .reduce((sum, c) => sum + c.weight, 0);

  if (otherTotal === 0) return null;

  const remaining = 1 - newWeight;
  const scale = remaining / otherTotal;

  return criteria.map((c) => {
    if (c.id === criterionId) {
      return { ...c, weight: newWeight };
    }
    return { ...c, weight: c.weight * scale };
  });
}
