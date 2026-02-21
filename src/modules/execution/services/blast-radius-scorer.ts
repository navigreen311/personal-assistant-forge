// ============================================================================
// Blast Radius Scoring Service
// Calculates risk scores for actions based on weighted factors
// ============================================================================

import type { BlastRadius } from '@/shared/types';
import type { BlastRadiusScore, BlastRadiusFactor } from '../types';

// --- Scoring Weights ---

const WEIGHTS = {
  reversibility: 0.25,
  scope: 0.20,
  sensitivity: 0.20,
  externalReach: 0.15,
  financialImpact: 0.10,
  stakeholderImpact: 0.10,
} as const;

// --- Action Reversibility Map ---

const REVERSIBILITY_SCORES: Record<string, number> = {
  CREATE_TASK: 10,
  UPDATE_RECORD: 20,
  CREATE_CONTACT: 10,
  CREATE_PROJECT: 10,
  TRIGGER_WORKFLOW: 30,
  GENERATE_DOCUMENT: 15,
  SEND_MESSAGE: 60,
  CALL_API: 50,
  FINANCIAL_ACTION: 70,
  DELETE_RECORD: 80,
  DELETE_CONTACT: 85,
  DELETE_PROJECT: 85,
  BULK_DELETE: 95,
  BULK_SEND: 90,
};

// --- Threshold Constants ---

const BLAST_RADIUS_THRESHOLDS = {
  LOW: 25,
  MEDIUM: 50,
  HIGH: 75,
} as const;

function classifyScore(score: number): BlastRadius {
  if (score <= BLAST_RADIUS_THRESHOLDS.LOW) return 'LOW';
  if (score <= BLAST_RADIUS_THRESHOLDS.MEDIUM) return 'MEDIUM';
  if (score <= BLAST_RADIUS_THRESHOLDS.HIGH) return 'HIGH';
  return 'CRITICAL';
}

// --- Factor Scoring Functions ---

function scoreReversibility(actionType: string): BlastRadiusFactor {
  const score = REVERSIBILITY_SCORES[actionType] ?? 50;
  const reversible = score <= 30;
  return {
    name: 'Reversibility',
    weight: WEIGHTS.reversibility,
    score,
    reason: reversible
      ? `${actionType} is easily reversible`
      : score >= 70
        ? `${actionType} is difficult or impossible to reverse`
        : `${actionType} has limited reversibility`,
  };
}

function scoreScope(
  parameters: Record<string, unknown>
): BlastRadiusFactor {
  const recipientCount =
    typeof parameters.recipientCount === 'number'
      ? parameters.recipientCount
      : typeof parameters.recipients === 'object' &&
          Array.isArray(parameters.recipients)
        ? parameters.recipients.length
        : 1;

  const recordCount =
    typeof parameters.recordCount === 'number'
      ? parameters.recordCount
      : typeof parameters.recordIds === 'object' &&
          Array.isArray(parameters.recordIds)
        ? parameters.recordIds.length
        : 1;

  const affectedCount = Math.max(recipientCount, recordCount);

  let score: number;
  if (affectedCount <= 1) score = 10;
  else if (affectedCount <= 10) score = 30;
  else if (affectedCount <= 50) score = 50;
  else if (affectedCount <= 100) score = 70;
  else score = 90;

  return {
    name: 'Scope',
    weight: WEIGHTS.scope,
    score,
    reason: `Action affects ${affectedCount} record(s)/recipient(s)`,
  };
}

function scoreSensitivity(
  parameters: Record<string, unknown>
): BlastRadiusFactor {
  const sensitivity =
    typeof parameters.sensitivity === 'string'
      ? parameters.sensitivity
      : 'INTERNAL';
  const complianceProfiles =
    Array.isArray(parameters.complianceProfiles)
      ? (parameters.complianceProfiles as string[])
      : [];

  let score = 10;
  const reasons: string[] = [];

  switch (sensitivity) {
    case 'PUBLIC':
      score = 10;
      reasons.push('Public data');
      break;
    case 'INTERNAL':
      score = 20;
      reasons.push('Internal data');
      break;
    case 'CONFIDENTIAL':
      score = 60;
      reasons.push('Confidential data');
      break;
    case 'RESTRICTED':
      score = 80;
      reasons.push('Restricted data');
      break;
    case 'REGULATED':
      score = 90;
      reasons.push('Regulated data');
      break;
  }

  if (complianceProfiles.includes('HIPAA')) {
    score = Math.max(score, 85);
    reasons.push('HIPAA regulated');
  }
  if (complianceProfiles.includes('GDPR')) {
    score = Math.max(score, 80);
    reasons.push('GDPR regulated');
  }
  if (complianceProfiles.includes('SOX')) {
    score = Math.max(score, 75);
    reasons.push('SOX regulated');
  }

  return {
    name: 'Sensitivity',
    weight: WEIGHTS.sensitivity,
    score: Math.min(score, 100),
    reason: reasons.join(', '),
  };
}

function scoreExternalReach(
  actionType: string,
  parameters: Record<string, unknown>
): BlastRadiusFactor {
  const isExternal =
    actionType === 'SEND_MESSAGE' ||
    actionType === 'CALL_API' ||
    actionType === 'BULK_SEND' ||
    parameters.external === true;

  const channel =
    typeof parameters.channel === 'string' ? parameters.channel : '';

  let score = 5;
  let reason = 'Internal operation only';

  if (isExternal) {
    score = 50;
    reason = 'Action reaches outside the system';
  }
  if (channel === 'EMAIL' || channel === 'SMS') {
    score = 60;
    reason = `Sends external ${channel} communication`;
  }
  if (actionType === 'BULK_SEND') {
    score = 85;
    reason = 'Mass external communication';
  }
  if (actionType === 'CALL_API') {
    score = 40;
    reason = 'External API call';
  }

  return {
    name: 'External Reach',
    weight: WEIGHTS.externalReach,
    score,
    reason,
  };
}

function scoreFinancialImpact(
  parameters: Record<string, unknown>
): BlastRadiusFactor {
  const amount =
    typeof parameters.amount === 'number'
      ? parameters.amount
      : typeof parameters.cost === 'number'
        ? parameters.cost
        : typeof parameters.contractValue === 'number'
          ? parameters.contractValue
          : 0;

  let score: number;
  let reason: string;

  if (amount === 0) {
    score = 0;
    reason = 'No financial impact';
  } else if (amount < 100) {
    score = 10;
    reason = `Low financial impact: $${amount}`;
  } else if (amount < 1000) {
    score = 30;
    reason = `Moderate financial impact: $${amount}`;
  } else if (amount < 10000) {
    score = 50;
    reason = `Significant financial impact: $${amount}`;
  } else if (amount < 100000) {
    score = 75;
    reason = `High financial impact: $${amount}`;
  } else {
    score = 95;
    reason = `Critical financial impact: $${amount}`;
  }

  return {
    name: 'Financial Impact',
    weight: WEIGHTS.financialImpact,
    score,
    reason,
  };
}

function scoreStakeholderImpact(
  parameters: Record<string, unknown>
): BlastRadiusFactor {
  const isVip = parameters.isVip === true || parameters.vip === true;
  const isBoardMember = parameters.isBoardMember === true;
  const isExternalPartner = parameters.isExternalPartner === true;
  const contactTags = Array.isArray(parameters.contactTags)
    ? (parameters.contactTags as string[])
    : [];

  let score = 10;
  let reasons: string[] = ['Standard stakeholder'];

  if (contactTags.includes('VIP') || isVip) {
    score = 60;
    reasons = ['VIP contact affected'];
  }
  if (contactTags.includes('BOARD') || isBoardMember) {
    score = 80;
    reasons = ['Board member affected'];
  }
  if (isExternalPartner) {
    score = Math.max(score, 50);
    reasons.push('External partner affected');
  }

  return {
    name: 'Stakeholder Impact',
    weight: WEIGHTS.stakeholderImpact,
    score,
    reason: reasons.join(', '),
  };
}

// --- Public API ---

export async function scoreAction(
  actionType: string,
  target: string,
  parameters: Record<string, unknown>,
  _entityId: string
): Promise<BlastRadiusScore> {
  const factors: BlastRadiusFactor[] = [
    scoreReversibility(actionType),
    scoreScope(parameters),
    scoreSensitivity(parameters),
    scoreExternalReach(actionType, parameters),
    scoreFinancialImpact(parameters),
    scoreStakeholderImpact(parameters),
  ];

  const totalScore = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  );

  const clampedScore = Math.max(0, Math.min(100, totalScore));
  const overall = classifyScore(clampedScore);

  const reversibilityFactor = factors.find((f) => f.name === 'Reversibility');
  const reversibilityScore = reversibilityFactor
    ? 1 - reversibilityFactor.score / 100
    : 0.5;

  const affectedCount =
    typeof parameters.recipientCount === 'number'
      ? parameters.recipientCount
      : typeof parameters.recipients === 'object' &&
          Array.isArray(parameters.recipients)
        ? parameters.recipients.length
        : typeof parameters.recordCount === 'number'
          ? parameters.recordCount
          : 1;

  const financialImpact =
    typeof parameters.amount === 'number'
      ? parameters.amount
      : typeof parameters.cost === 'number'
        ? parameters.cost
        : 0;

  return {
    overall,
    factors,
    totalScore: clampedScore,
    reversibilityScore: Math.round(reversibilityScore * 100) / 100,
    affectedEntitiesCount: 1,
    affectedContactsCount: Math.max(0, affectedCount),
    financialImpact,
    recommendation: getRecommendation(overall, target),
  };
}

export async function scoreBulkAction(
  actions: Array<{
    actionType: string;
    target: string;
    parameters: Record<string, unknown>;
  }>,
  entityId: string
): Promise<BlastRadiusScore> {
  if (actions.length === 0) {
    return {
      overall: 'LOW',
      factors: [],
      totalScore: 0,
      reversibilityScore: 1,
      affectedEntitiesCount: 0,
      affectedContactsCount: 0,
      financialImpact: 0,
      recommendation: 'No actions to evaluate.',
    };
  }

  const individualScores = await Promise.all(
    actions.map((a) => scoreAction(a.actionType, a.target, a.parameters, entityId))
  );

  const avgScore =
    individualScores.reduce((sum, s) => sum + s.totalScore, 0) /
    individualScores.length;

  // Mass operations get a multiplier based on count
  const massMultiplier = actions.length > 10 ? 1.3 : actions.length > 5 ? 1.15 : 1;
  const adjustedScore = Math.min(100, Math.round(avgScore * massMultiplier));

  const overall = classifyScore(adjustedScore);

  const totalFinancialImpact = individualScores.reduce(
    (sum, s) => sum + s.financialImpact,
    0
  );
  const totalContactsAffected = individualScores.reduce(
    (sum, s) => sum + s.affectedContactsCount,
    0
  );
  const minReversibility = Math.min(
    ...individualScores.map((s) => s.reversibilityScore)
  );

  const allFactors = individualScores.flatMap((s) => s.factors);
  const aggregatedFactors = aggregateFactors(allFactors);

  // Add mass operation factor
  aggregatedFactors.push({
    name: 'Mass Operation',
    weight: 0.15,
    score: actions.length > 100 ? 90 : actions.length > 50 ? 70 : actions.length > 10 ? 50 : 20,
    reason: `Batch of ${actions.length} actions`,
  });

  return {
    overall,
    factors: aggregatedFactors,
    totalScore: adjustedScore,
    reversibilityScore: minReversibility,
    affectedEntitiesCount: new Set(actions.map((a) => a.target)).size,
    affectedContactsCount: totalContactsAffected,
    financialImpact: totalFinancialImpact,
    recommendation: `Bulk operation with ${actions.length} actions. ${getRecommendation(overall, 'bulk operation')}`,
  };
}

export function getScoreExplanation(score: BlastRadiusScore): string {
  const lines: string[] = [
    `Blast Radius: ${score.overall} (Score: ${score.totalScore}/100)`,
    `Reversibility: ${Math.round(score.reversibilityScore * 100)}%`,
    '',
    'Contributing Factors:',
  ];

  for (const factor of score.factors) {
    lines.push(
      `  - ${factor.name} (weight: ${(factor.weight * 100).toFixed(0)}%): ${factor.score}/100 — ${factor.reason}`
    );
  }

  if (score.financialImpact > 0) {
    lines.push(`\nFinancial Impact: $${score.financialImpact.toLocaleString()}`);
  }
  if (score.affectedContactsCount > 0) {
    lines.push(`Affected Contacts: ${score.affectedContactsCount}`);
  }

  lines.push(`\nRecommendation: ${score.recommendation}`);

  return lines.join('\n');
}

// --- Helpers ---

function getRecommendation(overall: BlastRadius, target: string): string {
  switch (overall) {
    case 'LOW':
      return `Safe to execute action on ${target}. Low risk of unintended consequences.`;
    case 'MEDIUM':
      return `Review recommended before executing action on ${target}. Moderate risk level.`;
    case 'HIGH':
      return `Manual approval required for action on ${target}. High risk — verify all parameters before proceeding.`;
    case 'CRITICAL':
      return `Action on ${target} is flagged as CRITICAL risk. Requires senior approval and should be simulated first.`;
  }
}

function aggregateFactors(factors: BlastRadiusFactor[]): BlastRadiusFactor[] {
  const grouped = new Map<string, BlastRadiusFactor[]>();
  for (const f of factors) {
    const existing = grouped.get(f.name) ?? [];
    existing.push(f);
    grouped.set(f.name, existing);
  }

  return Array.from(grouped.entries()).map(([name, group]) => {
    const maxScore = Math.max(...group.map((f) => f.score));
    const avgWeight = group.reduce((s, f) => s + f.weight, 0) / group.length;
    const worstReason = group.reduce((worst, f) =>
      f.score > worst.score ? f : worst
    );
    return {
      name,
      weight: avgWeight,
      score: maxScore,
      reason: worstReason.reason,
    };
  });
}
