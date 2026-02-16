// ============================================================================
// Decision Framework Service — 3-Option Brief Generator (DB-Backed)
// ============================================================================

import { prisma } from '@/lib/db';
import type {
  DecisionRequest,
  DecisionBrief,
  DecisionOption,
  SecondOrderEffect,
} from '@/modules/decisions/types';

/**
 * Create a decision brief with exactly 3 options (conservative, moderate, aggressive),
 * persist it in the Document table, and return the structured brief.
 */
export async function createDecisionBrief(
  request: DecisionRequest
): Promise<DecisionBrief> {
  const options = generateThreeOptions(request);
  const recommendation = deriveRecommendation(options, request);
  const confidenceScore = computeConfidence(request);
  const blindSpots = identifyBlindSpots(request);

  const brief: Omit<DecisionBrief, 'id' | 'createdAt'> = {
    title: request.title,
    options,
    recommendation,
    confidenceScore,
    blindSpots,
  };

  const doc = await prisma.document.create({
    data: {
      title: request.title,
      entityId: request.entityId,
      type: 'BRIEF',
      content: JSON.stringify({
        ...brief,
        request: {
          description: request.description,
          context: request.context,
          deadline: request.deadline,
          stakeholders: request.stakeholders,
          constraints: request.constraints,
          blastRadius: request.blastRadius,
        },
      }),
      citations: [],
      status: 'DRAFT',
    },
  });

  return {
    id: doc.id,
    ...brief,
    createdAt: doc.createdAt,
  };
}

/**
 * Retrieve a decision brief by ID from the Document table.
 */
export async function getDecisionBrief(
  id: string
): Promise<DecisionBrief | null> {
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || doc.type !== 'BRIEF' || !doc.content) return null;

  const data = JSON.parse(doc.content);
  return {
    id: doc.id,
    title: doc.title,
    options: data.options ?? [],
    recommendation: data.recommendation ?? '',
    confidenceScore: data.confidenceScore ?? 0,
    blindSpots: data.blindSpots ?? [],
    createdAt: doc.createdAt,
  };
}

/**
 * List decision briefs for an entity with pagination.
 */
export async function listDecisionBriefs(
  entityId: string,
  page: number,
  pageSize: number
): Promise<{ briefs: DecisionBrief[]; total: number }> {
  const where = { entityId, type: 'BRIEF' as const };

  const [docs, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.document.count({ where }),
  ]);

  const briefs: DecisionBrief[] = docs.map((doc: { id: string; title: string; content: string | null; createdAt: Date }) => {
    const data = doc.content ? JSON.parse(doc.content) : {};
    return {
      id: doc.id,
      title: doc.title,
      options: data.options ?? [],
      recommendation: data.recommendation ?? '',
      confidenceScore: data.confidenceScore ?? 0,
      blindSpots: data.blindSpots ?? [],
      createdAt: doc.createdAt,
    };
  });

  return { briefs, total };
}

// --- Internal Generators ---

function generateThreeOptions(request: DecisionRequest): DecisionOption[] {
  const conservative: DecisionOption = {
    id: `opt-conservative-${Date.now()}`,
    label: 'Conservative Approach',
    strategy: 'CONSERVATIVE',
    description: `Take a cautious approach to "${request.title}". Focus on proven methods with minimal disruption.`,
    pros: [
      'Lower risk of failure',
      'Minimal disruption to existing operations',
      'Easier to reverse if needed',
    ],
    cons: [
      'Slower time to results',
      'May not fully address the problem',
      'Could lose competitive advantage',
    ],
    estimatedCost: 1000,
    estimatedTimeline: '3-6 months',
    riskLevel: 'LOW',
    reversibility: 'EASY',
    secondOrderEffects: generateOptionEffects('conservative'),
  };

  const moderate: DecisionOption = {
    id: `opt-moderate-${Date.now()}`,
    label: 'Balanced Approach',
    strategy: 'MODERATE',
    description: `Take a balanced approach to "${request.title}". Combine proven methods with targeted innovation.`,
    pros: [
      'Balanced risk-reward ratio',
      'Reasonable timeline',
      'Addresses core problem effectively',
    ],
    cons: [
      'Moderate complexity',
      'Requires sustained commitment',
      'Partial disruption to current workflows',
    ],
    estimatedCost: 5000,
    estimatedTimeline: '2-4 months',
    riskLevel: 'MEDIUM',
    reversibility: 'MODERATE',
    secondOrderEffects: generateOptionEffects('moderate'),
  };

  const aggressive: DecisionOption = {
    id: `opt-aggressive-${Date.now()}`,
    label: 'Aggressive Approach',
    strategy: 'AGGRESSIVE',
    description: `Take a bold approach to "${request.title}". Pursue maximum impact with full commitment.`,
    pros: [
      'Fastest time to results',
      'Maximum potential impact',
      'Strong competitive positioning',
    ],
    cons: [
      'Highest risk of failure',
      'Significant resource commitment',
      'Difficult to reverse',
    ],
    estimatedCost: 15000,
    estimatedTimeline: '1-2 months',
    riskLevel: 'HIGH',
    reversibility: 'DIFFICULT',
    secondOrderEffects: generateOptionEffects('aggressive'),
  };

  return [conservative, moderate, aggressive];
}

function generateOptionEffects(strategy: string): SecondOrderEffect[] {
  return [
    {
      id: `effect-${strategy}-1`,
      description: `Primary impact of ${strategy} strategy`,
      order: 1,
      sentiment: strategy === 'conservative' ? 'NEUTRAL' : 'POSITIVE',
      likelihood: strategy === 'aggressive' ? 0.6 : 0.8,
      affectedAreas: ['Operations'],
    },
    {
      id: `effect-${strategy}-2`,
      description: `Secondary ripple from ${strategy} strategy`,
      order: 2,
      sentiment: strategy === 'aggressive' ? 'NEGATIVE' : 'NEUTRAL',
      likelihood: 0.5,
      affectedAreas: ['Budget'],
      parentEffectId: `effect-${strategy}-1`,
    },
  ];
}

function deriveRecommendation(
  options: DecisionOption[],
  request: DecisionRequest
): string {
  if (request.blastRadius === 'CRITICAL' || request.blastRadius === 'HIGH') {
    return `Recommend the Conservative Approach given the ${request.blastRadius} blast radius. ` +
      'A cautious strategy minimizes downside risk for high-impact decisions.';
  }

  return 'Recommend the Balanced Approach as it offers the best risk-reward ratio ' +
    'for this decision context. It addresses the core problem without excessive risk.';
}

function computeConfidence(request: DecisionRequest): number {
  let score = 0.5;

  // More context → higher confidence
  if (request.context.length > 100) score += 0.1;
  if (request.constraints.length > 0) score += 0.1;
  if (request.stakeholders.length > 0) score += 0.1;
  if (request.deadline) score += 0.05;

  // Higher blast radius → lower confidence (more unknowns)
  if (request.blastRadius === 'CRITICAL') score -= 0.15;
  else if (request.blastRadius === 'HIGH') score -= 0.1;

  return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
}

function identifyBlindSpots(request: DecisionRequest): string[] {
  const spots: string[] = [];

  if (request.stakeholders.length === 0) {
    spots.push('No stakeholders identified — potential alignment risks');
  }
  if (request.constraints.length === 0) {
    spots.push('No constraints specified — hidden constraints may surface later');
  }
  if (!request.deadline) {
    spots.push('No deadline set — urgency level unclear');
  }
  spots.push('External market conditions not analyzed');
  spots.push('Team capacity and morale not assessed');

  return spots;
}
