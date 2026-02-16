// ============================================================================
// Pre-Mortem Analysis Service
// ============================================================================

import type {
  PreMortemRequest,
  PreMortemResult,
  FailureScenario,
  MitigationStep,
  FailureCategory,
  RiskLevel,
} from '@/modules/decisions/types';

const PROBABILITY_WEIGHT: Record<RiskLevel, number> = {
  LOW: 0.2,
  MEDIUM: 0.5,
  HIGH: 0.8,
};

const IMPACT_WEIGHT: Record<RiskLevel, number> = {
  LOW: 0.2,
  MEDIUM: 0.5,
  HIGH: 0.8,
};

/**
 * Run a pre-mortem analysis on a chosen decision option.
 *
 * ASSUMPTION: This is a placeholder that generates structured scenarios.
 * In production, this would call an LLM to produce domain-specific analysis.
 */
export async function runPreMortem(
  request: PreMortemRequest
): Promise<PreMortemResult> {
  const failureScenarios = generateFailureScenarios(request);
  const mitigationPlan = generateMitigations(failureScenarios, request);
  const overallRiskScore = calculateRiskScore(failureScenarios);
  const killSignals = generateKillSignals(request.timeHorizon);

  return {
    failureScenarios,
    mitigationPlan,
    overallRiskScore,
    killSignals,
  };
}

/**
 * Calculate a 0-100 risk score from failure scenarios.
 * Uses weighted average of probability × impact.
 */
export function calculateRiskScore(scenarios: FailureScenario[]): number {
  if (scenarios.length === 0) return 0;

  const totalWeighted = scenarios.reduce((sum, s) => {
    return sum + PROBABILITY_WEIGHT[s.probability] * IMPACT_WEIGHT[s.impact];
  }, 0);

  // Max possible per scenario is 0.8 * 0.8 = 0.64
  const maxPossible = scenarios.length * 0.64;
  const normalized = (totalWeighted / maxPossible) * 100;

  return Math.round(Math.min(100, Math.max(0, normalized)));
}

// --- Internal Generators ---

const CATEGORIES: FailureCategory[] = [
  'FINANCIAL',
  'OPERATIONAL',
  'REPUTATIONAL',
  'LEGAL',
  'TECHNICAL',
];

function generateFailureScenarios(request: PreMortemRequest): FailureScenario[] {
  const horizonMultiplier = getHorizonMultiplier(request.timeHorizon);
  const baseScenarios: Omit<FailureScenario, 'id'>[] = [
    {
      description: 'Budget overrun exceeds projected costs by 50%+',
      probability: 'MEDIUM',
      impact: 'HIGH',
      category: 'FINANCIAL',
      rootCause: 'Underestimated complexity or scope creep',
    },
    {
      description: 'Key team members leave during implementation',
      probability: 'LOW',
      impact: 'HIGH',
      category: 'OPERATIONAL',
      rootCause: 'Insufficient retention strategy or burnout',
    },
    {
      description: 'Stakeholder resistance derails adoption',
      probability: 'MEDIUM',
      impact: 'MEDIUM',
      category: 'REPUTATIONAL',
      rootCause: 'Inadequate change management communication',
    },
    {
      description: 'Regulatory compliance issue discovered mid-execution',
      probability: 'LOW',
      impact: 'HIGH',
      category: 'LEGAL',
      rootCause: 'Incomplete compliance review during planning',
    },
    {
      description: 'Technical infrastructure cannot handle the requirements',
      probability: 'MEDIUM',
      impact: 'HIGH',
      category: 'TECHNICAL',
      rootCause: 'Architecture limitations not identified in planning',
    },
  ];

  // For longer time horizons, include more scenarios
  const count = Math.min(baseScenarios.length, 3 + horizonMultiplier);

  return baseScenarios.slice(0, count).map((s, i) => ({
    ...s,
    id: `scenario-${request.decisionId}-${i + 1}`,
  }));
}

function generateMitigations(
  scenarios: FailureScenario[],
  request: PreMortemRequest
): MitigationStep[] {
  return scenarios.map((s) => ({
    scenarioId: s.id,
    action: getMitigationAction(s.category),
    owner: 'TBD — assign during review',
  }));
}

function generateKillSignals(timeHorizon: PreMortemRequest['timeHorizon']): string[] {
  const signals = [
    'Actual costs exceed estimates by more than 25%',
    'Key milestones missed by more than 2 weeks',
    'Stakeholder engagement drops below 50%',
  ];

  if (timeHorizon === '1_YEAR' || timeHorizon === '3_YEARS') {
    signals.push(
      'Quarterly review shows declining ROI trend',
      'Competitor launches a superior alternative'
    );
  }

  return signals;
}

function getHorizonMultiplier(horizon: PreMortemRequest['timeHorizon']): number {
  switch (horizon) {
    case '30_DAYS': return 0;
    case '90_DAYS': return 1;
    case '1_YEAR': return 2;
    case '3_YEARS': return 2;
  }
}

function getMitigationAction(category: FailureCategory): string {
  switch (category) {
    case 'FINANCIAL':
      return 'Establish contingency budget of 20% and monthly cost reviews';
    case 'OPERATIONAL':
      return 'Cross-train team members and document key processes';
    case 'REPUTATIONAL':
      return 'Create stakeholder communication plan with regular updates';
    case 'LEGAL':
      return 'Engage compliance counsel for thorough regulatory review';
    case 'TECHNICAL':
      return 'Conduct architecture stress-test and prototype critical paths';
  }
}
