// ============================================================================
// Second-Order Effects Analyzer — Full Impact Evaluation Service
// DB-backed via Prisma, AI-powered via generateJSON with rule-based fallbacks
// ============================================================================

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import type {
  SecondOrderEffect,
  EffectsTree,
  DecisionOption,
} from '@/modules/decisions/types';

// --- Types for effects analysis ---

interface ImpactPrediction {
  shortTerm: SecondOrderEffect[];
  mediumTerm: SecondOrderEffect[];
  longTerm: SecondOrderEffect[];
  overallSentiment: number;
  confidenceScore: number;
  warnings: string[];
}

interface OutcomeComparison {
  decisionId: string;
  title: string;
  predictedEffects: SecondOrderEffect[];
  actualOutcomes: string[];
  alignmentScore: number;
  surprises: string[];
  lessonsLearned: string[];
}

interface AffectedEntity {
  id: string;
  type: 'contact' | 'project' | 'task' | 'budget' | 'workflow';
  name: string;
  impactLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
}

interface EffectsReport {
  decisionId: string;
  title: string;
  generatedAt: Date;
  summary: string;
  effectsByOrder: {
    firstOrder: SecondOrderEffect[];
    secondOrder: SecondOrderEffect[];
    thirdOrder: SecondOrderEffect[];
  };
  sentimentBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
    net: number;
  };
  affectedAreas: string[];
  riskFlags: string[];
  recommendations: string[];
}

interface ROICalculation {
  decisionId: string;
  title: string;
  totalCost: number;
  totalBenefit: number;
  netReturn: number;
  roiPercentage: number;
  paybackPeriodDays: number | null;
  currency: string;
  breakdown: {
    costItems: { description: string; amount: number }[];
    benefitItems: { description: string; amount: number }[];
  };
  confidence: number;
  notes: string[];
}

interface RippleEffect {
  id: string;
  depth: number;
  description: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  likelihood: number;
  affectedAreas: string[];
  parentId: string | null;
  children: RippleEffect[];
}

interface RippleEffectsResult {
  decisionId: string;
  maxDepth: number;
  rootEffects: RippleEffect[];
  totalEffects: number;
  deepestNegative: RippleEffect | null;
  highestLikelihoodChain: RippleEffect[];
}

// --- Helper to load decision from DB ---

interface DecisionRecord {
  id: string;
  entityId: string;
  title: string;
  type: string;
  status: string;
  options: unknown;
  matrix: unknown;
  outcome: string | null;
  rationale: string | null;
  deadline: Date | null;
  decidedAt: Date | null;
  decidedBy: string | null;
  stakeholders: unknown;
  createdAt: Date;
  updatedAt: Date;
}

async function loadDecision(decisionId: string): Promise<DecisionRecord> {
  const decision = await prisma.decision.findUnique({
    where: { id: decisionId },
  });
  if (!decision) {
    throw new Error(`Decision "${decisionId}" not found`);
  }
  return decision as DecisionRecord;
}

function parseOptions(optionsJson: unknown): DecisionOption[] {
  if (!optionsJson) return [];
  if (Array.isArray(optionsJson)) return optionsJson as DecisionOption[];
  if (typeof optionsJson === 'string') {
    try {
      return JSON.parse(optionsJson) as DecisionOption[];
    } catch {
      return [];
    }
  }
  return [];
}

function getChosenOption(decision: DecisionRecord): DecisionOption | null {
  const options = parseOptions(decision.options);
  if (!decision.outcome) return options[0] ?? null;
  return (
    options.find(
      (o) => o.id === decision.outcome || o.label === decision.outcome
    ) ?? options[0] ?? null
  );
}

// --- Primary exported functions ---

/**
 * Analyze cascading effects of an action. Generates a structured tree
 * of 1st, 2nd, and 3rd order effects.
 *
 * When called with (action, context) strings, uses AI to generate effects
 * with a deterministic fallback if AI is unavailable.
 */
export async function analyzeEffects(
  action: string,
  context: string
): Promise<EffectsTree> {
  let effects: SecondOrderEffect[];

  try {
    effects = await generateEffectsWithAI(action, context);
  } catch {
    effects = generateSampleEffects(action, context);
  }

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
 * Analyze downstream effects of a decision by its ID.
 * Loads the decision from DB, extracts the chosen option's effects,
 * and enriches them with AI analysis.
 */
export async function analyzeDecisionEffects(
  decisionId: string
): Promise<EffectsTree> {
  const decision = await loadDecision(decisionId);
  const chosenOption = getChosenOption(decision);

  if (chosenOption && chosenOption.secondOrderEffects.length > 0) {
    const effects = chosenOption.secondOrderEffects;
    const totalPositive = effects.filter((e) => e.sentiment === 'POSITIVE').length;
    const totalNegative = effects.filter((e) => e.sentiment === 'NEGATIVE').length;
    const total = effects.length || 1;
    const netSentiment = Math.round(((totalPositive - totalNegative) / total) * 100) / 100;

    return {
      rootAction: `${decision.title}: ${chosenOption.label}`,
      effects,
      totalPositive,
      totalNegative,
      netSentiment: Math.max(-1, Math.min(1, netSentiment)),
    };
  }

  const ctx = [
    `Decision type: ${decision.type}`,
    `Status: ${decision.status}`,
    decision.rationale ? `Rationale: ${decision.rationale}` : '',
    decision.outcome ? `Outcome: ${decision.outcome}` : '',
  ]
    .filter(Boolean)
    .join('. ');

  return analyzeEffects(decision.title, ctx);
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

/**
 * Predict impact before making a decision.
 * Uses AI (via generateJSON) to forecast short-term, medium-term, and long-term effects
 * for each option being considered.
 */
export async function predictImpact(
  decision: { title: string; description: string; context: string },
  options: DecisionOption[]
): Promise<ImpactPrediction> {
  try {
    return await predictImpactWithAI(decision, options);
  } catch {
    return predictImpactFallback(decision, options);
  }
}

/**
 * Compare predicted vs actual outcomes for a decided decision.
 * Loads the decision's predicted effects and any journal entries recording
 * actual outcomes, then calculates alignment.
 */
export async function compareOutcomes(
  decisionId: string
): Promise<OutcomeComparison> {
  const decision = await loadDecision(decisionId);
  const chosenOption = getChosenOption(decision);
  const predictedEffects = chosenOption?.secondOrderEffects ?? [];

  const journalDocs = await prisma.document.findMany({
    where: {
      entityId: decision.entityId,
      type: 'REPORT',
    },
    orderBy: { createdAt: 'desc' },
  });

  const actualOutcomes: string[] = [];
  for (const doc of journalDocs) {
    if (!doc.content) continue;
    try {
      const data = JSON.parse(doc.content);
      if (data.decisionId === decisionId && data.actualOutcomes) {
        actualOutcomes.push(...data.actualOutcomes);
      }
    } catch {
      // Skip unparseable documents
    }
  }

  if (predictedEffects.length === 0 && actualOutcomes.length === 0) {
    return {
      decisionId,
      title: decision.title,
      predictedEffects: [],
      actualOutcomes: [],
      alignmentScore: 0,
      surprises: ['No predicted effects or actual outcomes recorded yet'],
      lessonsLearned: ['Record both predictions and actual outcomes to enable comparison'],
    };
  }

  if (predictedEffects.length > 0 && actualOutcomes.length > 0) {
    try {
      return await compareOutcomesWithAI(
        decisionId,
        decision.title,
        predictedEffects,
        actualOutcomes
      );
    } catch {
      // Fall through to rule-based comparison
    }
  }

  const alignmentScore = calculateAlignmentScore(predictedEffects, actualOutcomes);

  return {
    decisionId,
    title: decision.title,
    predictedEffects,
    actualOutcomes,
    alignmentScore,
    surprises: actualOutcomes.length > 0
      ? ['Actual outcomes recorded — use AI analysis for deeper comparison']
      : ['No actual outcomes recorded yet'],
    lessonsLearned: predictedEffects.length > 0
      ? ['Predictions were made — review when actual outcomes are available']
      : ['No predictions recorded for this decision'],
  };
}

/**
 * List all entities/contacts/projects affected by a decision.
 * Searches across contacts, projects, tasks, budgets, and workflows
 * within the decision's entity scope.
 */
export async function getAffectedEntities(
  decisionId: string
): Promise<AffectedEntity[]> {
  const decision = await loadDecision(decisionId);
  const entityId = decision.entityId;
  const affected: AffectedEntity[] = [];

  const stakeholderIds: string[] = [];
  if (decision.stakeholders) {
    const stakeholders = Array.isArray(decision.stakeholders)
      ? decision.stakeholders
      : [];
    for (const s of stakeholders) {
      if (typeof s === 'object' && s !== null && 'userId' in s) {
        stakeholderIds.push((s as { userId: string }).userId);
      }
    }
  }

  const contacts = await prisma.contact.findMany({
    where: { entityId, deletedAt: null },
    take: 50,
  });

  const decisionKeywords = extractKeywords(
    `${decision.title} ${decision.outcome ?? ''} ${decision.rationale ?? ''}`
  );

  for (const contact of contacts) {
    const relevance = calculateContactRelevance(contact, decisionKeywords, stakeholderIds);
    if (relevance.impactLevel !== 'NONE') {
      affected.push({
        id: contact.id,
        type: 'contact',
        name: contact.name,
        impactLevel: relevance.impactLevel as 'LOW' | 'MEDIUM' | 'HIGH',
        description: relevance.reason,
      });
    }
  }

  const projects = await prisma.project.findMany({
    where: { entityId },
    take: 50,
  });

  for (const project of projects) {
    const relevance = calculateProjectRelevance(project, decisionKeywords);
    if (relevance.impactLevel !== 'NONE') {
      affected.push({
        id: project.id,
        type: 'project',
        name: project.name,
        impactLevel: relevance.impactLevel as 'LOW' | 'MEDIUM' | 'HIGH',
        description: relevance.reason,
      });
    }
  }

  const tasks = await prisma.task.findMany({
    where: { entityId, deletedAt: null, status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] } },
    take: 100,
  });

  for (const task of tasks) {
    const relevance = calculateTaskRelevance(task, decisionKeywords);
    if (relevance.impactLevel !== 'NONE') {
      affected.push({
        id: task.id,
        type: 'task',
        name: task.title,
        impactLevel: relevance.impactLevel as 'LOW' | 'MEDIUM' | 'HIGH',
        description: relevance.reason,
      });
    }
  }

  const budgets = await prisma.budget.findMany({
    where: { entityId, status: 'active' },
    take: 20,
  });

  for (const budget of budgets) {
    const relevance = calculateBudgetRelevance(budget, decision);
    if (relevance.impactLevel !== 'NONE') {
      affected.push({
        id: budget.id,
        type: 'budget',
        name: budget.name,
        impactLevel: relevance.impactLevel as 'LOW' | 'MEDIUM' | 'HIGH',
        description: relevance.reason,
      });
    }
  }

  const workflows = await prisma.workflow.findMany({
    where: { entityId, status: 'ACTIVE' },
    take: 20,
  });

  for (const workflow of workflows) {
    const relevance = calculateWorkflowRelevance(workflow, decisionKeywords);
    if (relevance.impactLevel !== 'NONE') {
      affected.push({
        id: workflow.id,
        type: 'workflow',
        name: workflow.name,
        impactLevel: relevance.impactLevel as 'LOW' | 'MEDIUM' | 'HIGH',
        description: relevance.reason,
      });
    }
  }

  const impactOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  affected.sort((a, b) => impactOrder[a.impactLevel] - impactOrder[b.impactLevel]);

  return affected;
}

/**
 * Generate a human-readable effects report for a decision.
 * Combines effects analysis, sentiment breakdown, and actionable recommendations.
 */
export async function generateEffectsReport(
  decisionId: string
): Promise<EffectsReport> {
  const decision = await loadDecision(decisionId);
  const effectsTree = await analyzeDecisionEffects(decisionId);
  const effects = effectsTree.effects;

  const firstOrder = filterByOrder(effects, 1);
  const secondOrder = filterByOrder(effects, 2);
  const thirdOrder = filterByOrder(effects, 3);

  const positive = effects.filter((e) => e.sentiment === 'POSITIVE').length;
  const negative = effects.filter((e) => e.sentiment === 'NEGATIVE').length;
  const neutral = effects.filter((e) => e.sentiment === 'NEUTRAL').length;

  const allAreas = new Set<string>();
  for (const effect of effects) {
    for (const area of effect.affectedAreas) {
      allAreas.add(area);
    }
  }

  const riskFlags: string[] = [];
  const highLikelihoodNegative = effects.filter(
    (e) => e.sentiment === 'NEGATIVE' && e.likelihood >= 0.6
  );
  if (highLikelihoodNegative.length > 0) {
    riskFlags.push(
      `${highLikelihoodNegative.length} high-likelihood negative effect(s) detected`
    );
  }
  if (negative > positive) {
    riskFlags.push('Negative effects outnumber positive effects');
  }
  if (thirdOrder.some((e) => e.sentiment === 'NEGATIVE' && e.likelihood > 0.3)) {
    riskFlags.push('Third-order negative cascading effects identified');
  }

  let summary: string;
  let recommendations: string[];

  try {
    const aiResult = await generateJSON<{
      summary: string;
      recommendations: string[];
    }>(`Generate a concise effects report summary and recommendations for this decision.

Decision: ${decision.title}
Status: ${decision.status}
Outcome: ${decision.outcome ?? 'Not yet decided'}
Rationale: ${decision.rationale ?? 'Not provided'}

Effects breakdown:
- First order (${firstOrder.length}): ${firstOrder.map((e) => `${e.sentiment}: ${e.description}`).join('; ')}
- Second order (${secondOrder.length}): ${secondOrder.map((e) => `${e.sentiment}: ${e.description}`).join('; ')}
- Third order (${thirdOrder.length}): ${thirdOrder.map((e) => `${e.sentiment}: ${e.description}`).join('; ')}

Sentiment: +${positive} / -${negative} / ~${neutral} (net: ${effectsTree.netSentiment.toFixed(2)})
Affected areas: ${[...allAreas].join(', ')}
Risk flags: ${riskFlags.join('; ') || 'None'}

Provide:
- summary: 2-3 sentence overview of the effects landscape
- recommendations: 3-5 specific actionable recommendations`, {
      maxTokens: 768,
      temperature: 0.4,
      system: 'You are a strategic advisor. Provide concise, actionable analysis of decision effects. Be specific and prioritize the most impactful recommendations.',
    });

    summary = aiResult.summary;
    recommendations = aiResult.recommendations;
  } catch {
    summary = buildFallbackSummary(decision, effectsTree, firstOrder, secondOrder, thirdOrder);
    recommendations = buildFallbackRecommendations(riskFlags, effectsTree);
  }

  return {
    decisionId,
    title: decision.title,
    generatedAt: new Date(),
    summary,
    effectsByOrder: {
      firstOrder,
      secondOrder,
      thirdOrder,
    },
    sentimentBreakdown: {
      positive,
      negative,
      neutral,
      net: effectsTree.netSentiment,
    },
    affectedAreas: [...allAreas],
    riskFlags,
    recommendations,
  };
}

/**
 * Calculate return on investment for a decision.
 * Searches for financial records associated with the decision's entity
 * and estimates costs vs benefits based on actual financial data.
 */
export async function calculateROI(
  decisionId: string
): Promise<ROICalculation> {
  const decision = await loadDecision(decisionId);
  const entityId = decision.entityId;

  const financialRecords = await prisma.financialRecord.findMany({
    where: {
      entityId,
      createdAt: { gte: decision.createdAt },
    },
    orderBy: { createdAt: 'asc' },
  });

  const chosenOption = getChosenOption(decision);
  const estimatedCost = chosenOption?.estimatedCost ?? 0;

  const costItems: { description: string; amount: number }[] = [];
  const benefitItems: { description: string; amount: number }[] = [];

  for (const record of financialRecords) {
    const item = {
      description: record.description ?? `${record.type}: ${record.category}`,
      amount: Math.abs(record.amount),
    };

    if (record.type === 'EXPENSE' || record.type === 'BILL') {
      costItems.push(item);
    } else if (record.type === 'PAYMENT' || record.type === 'INVOICE') {
      if (record.status === 'PAID') {
        benefitItems.push(item);
      }
    }
  }

  if (costItems.length === 0 && estimatedCost > 0) {
    costItems.push({
      description: `Estimated cost from option: ${chosenOption?.label ?? 'Selected option'}`,
      amount: estimatedCost,
    });
  }

  const totalCost = costItems.reduce((sum, item) => sum + item.amount, 0);
  const totalBenefit = benefitItems.reduce((sum, item) => sum + item.amount, 0);
  const netReturn = totalBenefit - totalCost;
  const roiPercentage = totalCost > 0
    ? Math.round((netReturn / totalCost) * 10000) / 100
    : 0;

  let paybackPeriodDays: number | null = null;
  if (totalCost > 0 && totalBenefit > 0 && decision.decidedAt) {
    const now = new Date();
    const daysSinceDecision = Math.max(
      1,
      Math.ceil((now.getTime() - decision.decidedAt.getTime()) / (1000 * 60 * 60 * 24))
    );
    const dailyBenefitRate = totalBenefit / daysSinceDecision;
    if (dailyBenefitRate > 0) {
      paybackPeriodDays = Math.ceil(totalCost / dailyBenefitRate);
    }
  }

  const notes: string[] = [];
  if (financialRecords.length === 0) {
    notes.push('No financial records found — ROI based on option estimates only');
  }
  if (!decision.decidedAt) {
    notes.push('Decision not yet finalized — ROI calculation is preliminary');
  }
  if (costItems.length > 0 && benefitItems.length === 0) {
    notes.push('No realized benefits recorded yet — track revenue/savings to measure ROI');
  }

  const confidence = calculateROIConfidence(financialRecords.length, decision);

  return {
    decisionId,
    title: decision.title,
    totalCost,
    totalBenefit,
    netReturn,
    roiPercentage,
    paybackPeriodDays,
    currency: 'USD',
    breakdown: { costItems, benefitItems },
    confidence,
    notes,
  };
}

/**
 * Track cascading ripple effects N levels deep.
 * Builds a tree of cause-and-effect relationships radiating from the decision.
 */
export async function trackRippleEffects(
  decisionId: string,
  depth: number = 3
): Promise<RippleEffectsResult> {
  const clampedDepth = Math.max(1, Math.min(depth, 5));
  const decision = await loadDecision(decisionId);
  const chosenOption = getChosenOption(decision);

  let rootEffects: RippleEffect[];

  try {
    rootEffects = await generateRippleEffectsWithAI(decision, chosenOption, clampedDepth);
  } catch {
    rootEffects = generateRippleEffectsFallback(decision, chosenOption, clampedDepth);
  }

  const allEffects = collectAllRippleEffects(rootEffects);
  const totalEffects = allEffects.length;

  const negativeEffects = allEffects.filter((e) => e.sentiment === 'NEGATIVE');
  const deepestNegative = negativeEffects.length > 0
    ? negativeEffects.reduce((deepest, e) => (e.depth > deepest.depth ? e : deepest))
    : null;

  const highestLikelihoodChain = findHighestLikelihoodChain(rootEffects);

  return {
    decisionId,
    maxDepth: clampedDepth,
    rootEffects,
    totalEffects,
    deepestNegative,
    highestLikelihoodChain,
  };
}

// --- AI-Powered Generators ---

async function generateEffectsWithAI(
  action: string,
  context: string
): Promise<SecondOrderEffect[]> {
  const result = await generateJSON<{
    effects: Array<{
      description: string;
      order: 1 | 2 | 3;
      sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
      likelihood: number;
      affectedAreas: string[];
      parentIndex?: number;
    }>;
  }>(`Analyze the cascading effects of this action and generate a structured effects tree.

Action: ${action}
Context: ${context}

Generate 5-8 effects across 3 orders:
- Order 1 (direct/immediate effects): 2-3 effects
- Order 2 (secondary consequences): 2-3 effects caused by first-order effects
- Order 3 (tertiary ripples): 1-2 effects caused by second-order effects

For each effect provide:
- description: clear description of the effect
- order: 1, 2, or 3
- sentiment: POSITIVE, NEGATIVE, or NEUTRAL
- likelihood: 0.0 to 1.0
- affectedAreas: array of business areas affected
- parentIndex: for order 2+, the index (0-based) of the parent effect in this array`, {
    maxTokens: 1024,
    temperature: 0.5,
    system: 'You are a strategic analyst. Generate realistic, specific cascading effects. Consider both positive and negative outcomes. Be concrete about affected business areas.',
  });

  const baseId = action.replace(/\s+/g, '-').toLowerCase().slice(0, 20);

  return (result.effects || []).map((e, i) => ({
    id: `${baseId}-${e.order}${String.fromCharCode(97 + i)}`,
    description: e.description,
    order: e.order,
    sentiment: e.sentiment || 'NEUTRAL',
    likelihood: Math.max(0, Math.min(1, e.likelihood ?? 0.5)),
    affectedAreas: e.affectedAreas || [],
    parentEffectId:
      e.parentIndex !== undefined && e.parentIndex < i
        ? `${baseId}-${result.effects[e.parentIndex].order}${String.fromCharCode(97 + e.parentIndex)}`
        : undefined,
  }));
}

async function predictImpactWithAI(
  decision: { title: string; description: string; context: string },
  options: DecisionOption[]
): Promise<ImpactPrediction> {
  const result = await generateJSON<{
    shortTermEffects: Array<{
      description: string;
      sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
      likelihood: number;
      affectedAreas: string[];
    }>;
    mediumTermEffects: Array<{
      description: string;
      sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
      likelihood: number;
      affectedAreas: string[];
    }>;
    longTermEffects: Array<{
      description: string;
      sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
      likelihood: number;
      affectedAreas: string[];
    }>;
    overallSentiment: number;
    confidenceScore: number;
    warnings: string[];
  }>(`Predict the impact of this decision across three time horizons.

Decision: ${decision.title}
Description: ${decision.description}
Context: ${decision.context}

Options being considered:
${options.map((o) => `- ${o.label} (${o.strategy}): ${o.description} | Risk: ${o.riskLevel} | Cost: $${o.estimatedCost} | Timeline: ${o.estimatedTimeline}`).join('\n')}

Generate impact predictions:
- shortTermEffects (1-30 days): 2-3 immediate impacts
- mediumTermEffects (1-6 months): 2-3 medium-term consequences
- longTermEffects (6+ months): 1-2 long-term ripple effects
- overallSentiment: -1.0 to 1.0 (negative to positive)
- confidenceScore: 0.0 to 1.0
- warnings: 2-4 specific risk warnings

For each effect: description, sentiment (POSITIVE/NEGATIVE/NEUTRAL), likelihood (0-1), affectedAreas.`, {
    maxTokens: 1536,
    temperature: 0.5,
    system: 'You are a strategic impact analyst. Predict realistic, specific impacts. Balance optimism with caution. Consider second and third-order effects across all time horizons.',
  });

  const mapEffects = (
    effects: Array<{
      description: string;
      sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
      likelihood: number;
      affectedAreas: string[];
    }>,
    order: 1 | 2 | 3
  ): SecondOrderEffect[] =>
    (effects || []).map((e, i) => ({
      id: `impact-${order}-${i}`,
      description: e.description,
      order,
      sentiment: e.sentiment || 'NEUTRAL',
      likelihood: Math.max(0, Math.min(1, e.likelihood ?? 0.5)),
      affectedAreas: e.affectedAreas || [],
    }));

  return {
    shortTerm: mapEffects(result.shortTermEffects, 1),
    mediumTerm: mapEffects(result.mediumTermEffects, 2),
    longTerm: mapEffects(result.longTermEffects, 3),
    overallSentiment: Math.max(-1, Math.min(1, result.overallSentiment ?? 0)),
    confidenceScore: Math.max(0, Math.min(1, result.confidenceScore ?? 0.5)),
    warnings: result.warnings || [],
  };
}

async function compareOutcomesWithAI(
  decisionId: string,
  title: string,
  predictedEffects: SecondOrderEffect[],
  actualOutcomes: string[]
): Promise<OutcomeComparison> {
  const result = await generateJSON<{
    alignmentScore: number;
    surprises: string[];
    lessonsLearned: string[];
  }>(`Compare predicted effects against actual outcomes for this decision.

Decision: ${title}

Predicted effects:
${predictedEffects.map((e) => `- [${e.sentiment}, ${Math.round(e.likelihood * 100)}% likely] ${e.description}`).join('\n')}

Actual outcomes:
${actualOutcomes.map((o) => `- ${o}`).join('\n')}

Analyze:
- alignmentScore: 0.0 to 1.0 — how well did predictions match reality?
- surprises: list of unexpected outcomes or effects that were not predicted
- lessonsLearned: actionable takeaways for future decisions`, {
    maxTokens: 768,
    temperature: 0.4,
    system: 'You are a decision review analyst. Compare predictions to reality objectively. Identify specific lessons that improve future decision-making. Be honest about misses.',
  });

  return {
    decisionId,
    title,
    predictedEffects,
    actualOutcomes,
    alignmentScore: Math.max(0, Math.min(1, result.alignmentScore ?? 0.5)),
    surprises: result.surprises || [],
    lessonsLearned: result.lessonsLearned || [],
  };
}

async function generateRippleEffectsWithAI(
  decision: DecisionRecord,
  chosenOption: DecisionOption | null,
  depth: number
): Promise<RippleEffect[]> {
  const result = await generateJSON<{
    ripples: Array<{
      description: string;
      sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
      likelihood: number;
      affectedAreas: string[];
      children: Array<{
        description: string;
        sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
        likelihood: number;
        affectedAreas: string[];
        children: Array<{
          description: string;
          sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
          likelihood: number;
          affectedAreas: string[];
        }>;
      }>;
    }>;
  }>(`Generate cascading ripple effects for this decision, ${depth} levels deep.

Decision: ${decision.title}
Type: ${decision.type}
Status: ${decision.status}
Chosen option: ${chosenOption?.label ?? 'Not selected'}
${chosenOption ? `Option details: ${chosenOption.description}` : ''}
Outcome: ${decision.outcome ?? 'Pending'}
Rationale: ${decision.rationale ?? 'Not provided'}

Generate 2-3 root-level ripple effects, each with 1-2 children, each child with 0-1 grandchildren (up to depth ${depth}).
For each ripple: description, sentiment (POSITIVE/NEGATIVE/NEUTRAL), likelihood (0-1), affectedAreas.
Represent as a nested tree structure.`, {
    maxTokens: 1536,
    temperature: 0.5,
    system: 'You are a systems thinking analyst. Generate realistic cascading cause-and-effect chains. Each level should represent a plausible consequence of its parent. Decrease likelihood at deeper levels.',
  });

  type RippleInput = {
    description: string;
    sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    likelihood: number;
    affectedAreas: string[];
    children?: RippleInput[];
  };

  const buildTree = (
    items: RippleInput[],
    currentDepth: number,
    parentId: string | null
  ): RippleEffect[] =>
    (items || []).map((item, i) => {
      const id = `ripple-${currentDepth}-${i}-${Date.now()}`;
      const children =
        currentDepth < depth && item.children
          ? buildTree(item.children, currentDepth + 1, id)
          : [];
      return {
        id,
        depth: currentDepth,
        description: item.description,
        sentiment: item.sentiment || 'NEUTRAL',
        likelihood: Math.max(0, Math.min(1, item.likelihood ?? 0.5)),
        affectedAreas: item.affectedAreas || [],
        parentId,
        children,
      };
    });

  return buildTree(result.ripples || [], 1, null);
}

// --- Fallback Rule-Based Generators ---

type ActionCategory = 'finance' | 'hr' | 'tech' | 'market' | 'generic';

function detectActionCategory(action: string): ActionCategory {
  const lower = action.toLowerCase();

  const financeTerms = ['cost', 'budget', 'revenue', 'price', 'invest', 'expense', 'profit', 'financial', 'funding', 'capital'];
  const hrTerms = ['hire', 'fire', 'team', 'staff', 'recruit', 'employee', 'personnel', 'workforce', 'talent', 'onboard'];
  const techTerms = ['deploy', 'migrate', 'upgrade', 'build', 'develop', 'infrastructure', 'system', 'software', 'platform', 'architecture'];
  const marketTerms = ['launch', 'market', 'compete', 'customer', 'brand', 'campaign', 'advertise', 'audience', 'segment', 'positioning'];

  const countMatches = (terms: string[]) => terms.filter((t) => lower.includes(t)).length;

  const scores: [ActionCategory, number][] = [
    ['finance', countMatches(financeTerms)],
    ['hr', countMatches(hrTerms)],
    ['tech', countMatches(techTerms)],
    ['market', countMatches(marketTerms)],
  ];

  const best = scores.sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : 'generic';
}

function generateSampleEffects(action: string, _context: string): SecondOrderEffect[] {
  const baseId = action.replace(/\s+/g, '-').toLowerCase().slice(0, 20);
  const category = detectActionCategory(action);

  switch (category) {
    case 'finance':
      return generateFinanceEffects(baseId, action);
    case 'hr':
      return generateHREffects(baseId, action);
    case 'tech':
      return generateTechEffects(baseId, action);
    case 'market':
      return generateMarketEffects(baseId, action);
    default:
      return generateGenericEffects(baseId, action);
  }
}

function generateFinanceEffects(baseId: string, action: string): SecondOrderEffect[] {
  const first1: SecondOrderEffect = {
    id: `${baseId}-1a`,
    description: `Immediate cash flow impact from: ${action}`,
    order: 1,
    sentiment: 'NEGATIVE',
    likelihood: 0.9,
    affectedAreas: ['Budget', 'Cash Flow'],
  };

  const first2: SecondOrderEffect = {
    id: `${baseId}-1b`,
    description: `Financial reporting adjustments required for: ${action}`,
    order: 1,
    sentiment: 'NEUTRAL',
    likelihood: 0.8,
    affectedAreas: ['Accounting', 'Compliance'],
  };

  const first3: SecondOrderEffect = {
    id: `${baseId}-1c`,
    description: `Stakeholder confidence shift from financial change: ${action}`,
    order: 1,
    sentiment: 'NEUTRAL',
    likelihood: 0.6,
    affectedAreas: ['Investor Relations', 'Board'],
  };

  const second1: SecondOrderEffect = {
    id: `${baseId}-2a`,
    description: 'Budget reallocation enables strategic investment opportunities',
    order: 2,
    sentiment: 'POSITIVE',
    likelihood: 0.6,
    affectedAreas: ['Strategy', 'Investment'],
    parentEffectId: first1.id,
  };

  const second2: SecondOrderEffect = {
    id: `${baseId}-2b`,
    description: 'Tighter financial constraints may limit operational flexibility',
    order: 2,
    sentiment: 'NEGATIVE',
    likelihood: 0.5,
    affectedAreas: ['Operations', 'Procurement'],
    parentEffectId: first2.id,
  };

  const third1: SecondOrderEffect = {
    id: `${baseId}-3a`,
    description: 'Improved financial discipline may strengthen long-term profitability',
    order: 3,
    sentiment: 'POSITIVE',
    likelihood: 0.4,
    affectedAreas: ['Profitability', 'Growth'],
    parentEffectId: second1.id,
  };

  const third2: SecondOrderEffect = {
    id: `${baseId}-3b`,
    description: 'Prolonged constraints could impact talent retention and morale',
    order: 3,
    sentiment: 'NEGATIVE',
    likelihood: 0.3,
    affectedAreas: ['HR', 'Morale'],
    parentEffectId: second2.id,
  };

  return [first1, first2, first3, second1, second2, third1, third2];
}

function generateHREffects(baseId: string, action: string): SecondOrderEffect[] {
  const first1: SecondOrderEffect = {
    id: `${baseId}-1a`,
    description: `Team dynamics shift from: ${action}`,
    order: 1,
    sentiment: 'NEUTRAL',
    likelihood: 0.9,
    affectedAreas: ['Team', 'Culture'],
  };

  const first2: SecondOrderEffect = {
    id: `${baseId}-1b`,
    description: `Onboarding and training requirements from: ${action}`,
    order: 1,
    sentiment: 'NEGATIVE',
    likelihood: 0.8,
    affectedAreas: ['HR', 'Training', 'Budget'],
  };

  const first3: SecondOrderEffect = {
    id: `${baseId}-1c`,
    description: `Productivity adjustment period following: ${action}`,
    order: 1,
    sentiment: 'NEGATIVE',
    likelihood: 0.7,
    affectedAreas: ['Productivity', 'Operations'],
  };

  const second1: SecondOrderEffect = {
    id: `${baseId}-2a`,
    description: 'New team capabilities unlock previously blocked initiatives',
    order: 2,
    sentiment: 'POSITIVE',
    likelihood: 0.7,
    affectedAreas: ['Capacity', 'Innovation'],
    parentEffectId: first1.id,
  };

  const second2: SecondOrderEffect = {
    id: `${baseId}-2b`,
    description: 'Knowledge transfer gaps may create temporary skill deficits',
    order: 2,
    sentiment: 'NEGATIVE',
    likelihood: 0.5,
    affectedAreas: ['Knowledge Management', 'Quality'],
    parentEffectId: first2.id,
  };

  const third1: SecondOrderEffect = {
    id: `${baseId}-3a`,
    description: 'Stronger team composition improves organizational resilience',
    order: 3,
    sentiment: 'POSITIVE',
    likelihood: 0.5,
    affectedAreas: ['Retention', 'Employer Brand'],
    parentEffectId: second1.id,
  };

  const third2: SecondOrderEffect = {
    id: `${baseId}-3b`,
    description: 'Cultural shifts may affect existing employee satisfaction',
    order: 3,
    sentiment: 'NEUTRAL',
    likelihood: 0.4,
    affectedAreas: ['Culture', 'Morale'],
    parentEffectId: second2.id,
  };

  return [first1, first2, first3, second1, second2, third1, third2];
}

function generateTechEffects(baseId: string, action: string): SecondOrderEffect[] {
  const first1: SecondOrderEffect = {
    id: `${baseId}-1a`,
    description: `System changes and downtime risk from: ${action}`,
    order: 1,
    sentiment: 'NEGATIVE',
    likelihood: 0.8,
    affectedAreas: ['Infrastructure', 'Reliability'],
  };

  const first2: SecondOrderEffect = {
    id: `${baseId}-1b`,
    description: `Development resource allocation for: ${action}`,
    order: 1,
    sentiment: 'NEUTRAL',
    likelihood: 0.9,
    affectedAreas: ['Engineering', 'Sprint Planning'],
  };

  const first3: SecondOrderEffect = {
    id: `${baseId}-1c`,
    description: `Technical debt considerations from: ${action}`,
    order: 1,
    sentiment: 'POSITIVE',
    likelihood: 0.7,
    affectedAreas: ['Code Quality', 'Architecture'],
  };

  const second1: SecondOrderEffect = {
    id: `${baseId}-2a`,
    description: 'Improved system performance enables better user experience',
    order: 2,
    sentiment: 'POSITIVE',
    likelihood: 0.7,
    affectedAreas: ['User Experience', 'Performance'],
    parentEffectId: first1.id,
  };

  const second2: SecondOrderEffect = {
    id: `${baseId}-2b`,
    description: 'Integration complexity may introduce new failure points',
    order: 2,
    sentiment: 'NEGATIVE',
    likelihood: 0.5,
    affectedAreas: ['Reliability', 'Monitoring'],
    parentEffectId: first2.id,
  };

  const third1: SecondOrderEffect = {
    id: `${baseId}-3a`,
    description: 'Modern tech stack attracts stronger engineering talent',
    order: 3,
    sentiment: 'POSITIVE',
    likelihood: 0.4,
    affectedAreas: ['Hiring', 'Innovation'],
    parentEffectId: second1.id,
  };

  const third2: SecondOrderEffect = {
    id: `${baseId}-3b`,
    description: 'Accumulated integration complexity may slow future development velocity',
    order: 3,
    sentiment: 'NEGATIVE',
    likelihood: 0.3,
    affectedAreas: ['Velocity', 'Technical Debt'],
    parentEffectId: second2.id,
  };

  return [first1, first2, first3, second1, second2, third1, third2];
}

function generateMarketEffects(baseId: string, action: string): SecondOrderEffect[] {
  const first1: SecondOrderEffect = {
    id: `${baseId}-1a`,
    description: `Market visibility change from: ${action}`,
    order: 1,
    sentiment: 'POSITIVE',
    likelihood: 0.8,
    affectedAreas: ['Brand', 'Market Presence'],
  };

  const first2: SecondOrderEffect = {
    id: `${baseId}-1b`,
    description: `Competitive response triggered by: ${action}`,
    order: 1,
    sentiment: 'NEGATIVE',
    likelihood: 0.7,
    affectedAreas: ['Competition', 'Pricing'],
  };

  const first3: SecondOrderEffect = {
    id: `${baseId}-1c`,
    description: `Customer expectations shift from: ${action}`,
    order: 1,
    sentiment: 'NEUTRAL',
    likelihood: 0.8,
    affectedAreas: ['Customer Relations', 'Support'],
  };

  const second1: SecondOrderEffect = {
    id: `${baseId}-2a`,
    description: 'Increased market share drives revenue growth',
    order: 2,
    sentiment: 'POSITIVE',
    likelihood: 0.6,
    affectedAreas: ['Revenue', 'Growth'],
    parentEffectId: first1.id,
  };

  const second2: SecondOrderEffect = {
    id: `${baseId}-2b`,
    description: 'Competitor retaliation may erode initial market gains',
    order: 2,
    sentiment: 'NEGATIVE',
    likelihood: 0.5,
    affectedAreas: ['Market Share', 'Pricing Strategy'],
    parentEffectId: first2.id,
  };

  const third1: SecondOrderEffect = {
    id: `${baseId}-3a`,
    description: 'Market leadership position enables premium pricing and partnerships',
    order: 3,
    sentiment: 'POSITIVE',
    likelihood: 0.4,
    affectedAreas: ['Partnerships', 'Pricing Power'],
    parentEffectId: second1.id,
  };

  const third2: SecondOrderEffect = {
    id: `${baseId}-3b`,
    description: 'Sustained competitive pressure may require ongoing marketing investment',
    order: 3,
    sentiment: 'NEGATIVE',
    likelihood: 0.4,
    affectedAreas: ['Marketing Budget', 'ROI'],
    parentEffectId: second2.id,
  };

  return [first1, first2, first3, second1, second2, third1, third2];
}

function generateGenericEffects(baseId: string, action: string): SecondOrderEffect[] {
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

function predictImpactFallback(
  decision: { title: string; description: string; context: string },
  options: DecisionOption[]
): ImpactPrediction {
  const avgRisk = options.reduce((sum, o) => {
    const riskScore = o.riskLevel === 'HIGH' ? 0.8 : o.riskLevel === 'MEDIUM' ? 0.5 : 0.2;
    return sum + riskScore;
  }, 0) / (options.length || 1);

  const shortTerm: SecondOrderEffect[] = [
    {
      id: 'impact-1-0',
      description: `Immediate resource allocation for: ${decision.title}`,
      order: 1,
      sentiment: 'NEUTRAL',
      likelihood: 0.9,
      affectedAreas: ['Operations', 'Budget'],
    },
    {
      id: 'impact-1-1',
      description: 'Team adjustment period during implementation',
      order: 1,
      sentiment: avgRisk > 0.6 ? 'NEGATIVE' : 'NEUTRAL',
      likelihood: 0.8,
      affectedAreas: ['Team', 'Productivity'],
    },
  ];

  const mediumTerm: SecondOrderEffect[] = [
    {
      id: 'impact-2-0',
      description: 'Operational efficiency changes become measurable',
      order: 2,
      sentiment: 'POSITIVE',
      likelihood: 0.6,
      affectedAreas: ['Operations', 'Metrics'],
    },
    {
      id: 'impact-2-1',
      description: 'Stakeholder confidence shift based on early results',
      order: 2,
      sentiment: avgRisk > 0.5 ? 'NEUTRAL' : 'POSITIVE',
      likelihood: 0.5,
      affectedAreas: ['Reputation', 'Strategy'],
    },
  ];

  const longTerm: SecondOrderEffect[] = [
    {
      id: 'impact-3-0',
      description: 'Strategic positioning effects materialize',
      order: 3,
      sentiment: 'POSITIVE',
      likelihood: 0.4,
      affectedAreas: ['Strategy', 'Market Position'],
    },
  ];

  const allEffects = [...shortTerm, ...mediumTerm, ...longTerm];
  const positiveCount = allEffects.filter((e) => e.sentiment === 'POSITIVE').length;
  const negativeCount = allEffects.filter((e) => e.sentiment === 'NEGATIVE').length;
  const total = allEffects.length;
  const overallSentiment = total > 0
    ? Math.round(((positiveCount - negativeCount) / total) * 100) / 100
    : 0;

  return {
    shortTerm,
    mediumTerm,
    longTerm,
    overallSentiment,
    confidenceScore: 0.4,
    warnings: [
      `Average risk level across options: ${Math.round(avgRisk * 100)}%`,
      'Impact prediction based on heuristics — AI analysis unavailable',
      options.some((o) => o.reversibility === 'IRREVERSIBLE')
        ? 'At least one option is irreversible — proceed with caution'
        : 'All options appear reversible',
    ].filter(Boolean),
  };
}

function generateRippleEffectsFallback(
  decision: DecisionRecord,
  chosenOption: DecisionOption | null,
  depth: number
): RippleEffect[] {
  const timestamp = Date.now();
  const riskLevel = chosenOption?.riskLevel ?? 'MEDIUM';
  const isHighRisk = riskLevel === 'HIGH';

  const buildChildren = (
    parentId: string,
    currentDepth: number,
    parentSentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
  ): RippleEffect[] => {
    if (currentDepth > depth) return [];

    const effects: RippleEffect[] = [];
    const baseLikelihood = Math.max(0.2, 0.8 - currentDepth * 0.15);

    effects.push({
      id: `ripple-${currentDepth}-0-${timestamp}`,
      depth: currentDepth,
      description:
        currentDepth === 2
          ? 'Downstream process adjustments from primary changes'
          : `${currentDepth}th-order operational ripple effects`,
      sentiment: parentSentiment,
      likelihood: Math.round(baseLikelihood * 100) / 100,
      affectedAreas: ['Operations'],
      parentId,
      children: buildChildren(
        `ripple-${currentDepth}-0-${timestamp}`,
        currentDepth + 1,
        parentSentiment
      ),
    });

    if (currentDepth <= 2) {
      effects.push({
        id: `ripple-${currentDepth}-1-${timestamp}`,
        depth: currentDepth,
        description:
          currentDepth === 2
            ? 'Stakeholder sentiment shifts from visible changes'
            : 'Cascading perception changes across organization',
        sentiment: isHighRisk ? 'NEGATIVE' : 'NEUTRAL',
        likelihood: Math.round((baseLikelihood * 0.7) * 100) / 100,
        affectedAreas: ['Reputation', 'Morale'],
        parentId,
        children: [],
      });
    }

    return effects;
  };

  const root1: RippleEffect = {
    id: `ripple-1-0-${timestamp}`,
    depth: 1,
    description: `Direct operational impact of "${decision.title}"`,
    sentiment: 'POSITIVE',
    likelihood: 0.85,
    affectedAreas: ['Operations', 'Team'],
    parentId: null,
    children: buildChildren(`ripple-1-0-${timestamp}`, 2, 'POSITIVE'),
  };

  const root2: RippleEffect = {
    id: `ripple-1-1-${timestamp}`,
    depth: 1,
    description: `Resource reallocation required for "${decision.title}"`,
    sentiment: isHighRisk ? 'NEGATIVE' : 'NEUTRAL',
    likelihood: 0.75,
    affectedAreas: ['Budget', 'Resources'],
    parentId: null,
    children: buildChildren(`ripple-1-1-${timestamp}`, 2, isHighRisk ? 'NEGATIVE' : 'NEUTRAL'),
  };

  return [root1, root2];
}

// --- Internal Helpers ---

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'for', 'and', 'nor', 'but',
    'or', 'yet', 'so', 'in', 'on', 'at', 'to', 'of', 'with', 'by', 'from',
    'this', 'that', 'these', 'those', 'it', 'its', 'not', 'no',
  ]);

  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

function calculateContactRelevance(
  contact: { name: string; tags: string[]; email: string | null },
  decisionKeywords: string[],
  stakeholderIds: string[]
): { impactLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'; reason: string } {
  if (stakeholderIds.includes(contact.name)) {
    return { impactLevel: 'HIGH', reason: 'Direct stakeholder in this decision' };
  }

  const tagOverlap = contact.tags.filter((tag) =>
    decisionKeywords.some((kw) => tag.toLowerCase().includes(kw))
  );

  if (tagOverlap.length >= 2) {
    return { impactLevel: 'MEDIUM', reason: `Tags overlap with decision: ${tagOverlap.join(', ')}` };
  }
  if (tagOverlap.length === 1) {
    return { impactLevel: 'LOW', reason: `Related tag: ${tagOverlap[0]}` };
  }

  const nameLower = contact.name.toLowerCase();
  if (decisionKeywords.some((kw) => nameLower.includes(kw))) {
    return { impactLevel: 'LOW', reason: 'Name matches decision keywords' };
  }

  return { impactLevel: 'NONE', reason: '' };
}

function calculateProjectRelevance(
  project: { name: string; description: string | null; status: string },
  decisionKeywords: string[]
): { impactLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'; reason: string } {
  const projectText = `${project.name} ${project.description ?? ''}`.toLowerCase();
  const matchCount = decisionKeywords.filter((kw) => projectText.includes(kw)).length;

  if (matchCount >= 3) {
    return { impactLevel: 'HIGH', reason: 'Strong keyword overlap with decision context' };
  }
  if (matchCount >= 2) {
    return { impactLevel: 'MEDIUM', reason: 'Moderate keyword overlap with decision context' };
  }
  if (matchCount >= 1) {
    return { impactLevel: 'LOW', reason: 'Some keyword overlap with decision context' };
  }

  return { impactLevel: 'NONE', reason: '' };
}

function calculateTaskRelevance(
  task: { title: string; description: string | null; tags: string[] },
  decisionKeywords: string[]
): { impactLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'; reason: string } {
  const taskText = `${task.title} ${task.description ?? ''}`.toLowerCase();
  const textMatch = decisionKeywords.filter((kw) => taskText.includes(kw)).length;
  const tagMatch = task.tags.filter((tag) =>
    decisionKeywords.some((kw) => tag.toLowerCase().includes(kw))
  ).length;
  const totalMatch = textMatch + tagMatch;

  if (totalMatch >= 3) {
    return { impactLevel: 'HIGH', reason: 'Strongly related to decision scope' };
  }
  if (totalMatch >= 2) {
    return { impactLevel: 'MEDIUM', reason: 'Moderately related to decision scope' };
  }
  if (totalMatch >= 1) {
    return { impactLevel: 'LOW', reason: 'Loosely related to decision scope' };
  }

  return { impactLevel: 'NONE', reason: '' };
}

function calculateBudgetRelevance(
  budget: { name: string; category: string; amount: number },
  decision: DecisionRecord
): { impactLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'; reason: string } {
  const isFinancialDecision = decision.type === 'financial';
  const budgetText = `${budget.name} ${budget.category}`.toLowerCase();
  const decisionText = `${decision.title} ${decision.outcome ?? ''}`.toLowerCase();

  if (isFinancialDecision) {
    return { impactLevel: 'HIGH', reason: 'Financial decision directly affects budget allocation' };
  }

  const budgetKeywords = extractKeywords(budgetText);
  const decisionKeywords = extractKeywords(decisionText);
  const overlap = budgetKeywords.filter((kw) => decisionKeywords.includes(kw)).length;

  if (overlap >= 2) {
    return { impactLevel: 'MEDIUM', reason: 'Budget category aligns with decision scope' };
  }
  if (overlap >= 1) {
    return { impactLevel: 'LOW', reason: 'Budget may be indirectly affected' };
  }

  return { impactLevel: 'NONE', reason: '' };
}

function calculateWorkflowRelevance(
  workflow: { name: string },
  decisionKeywords: string[]
): { impactLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'; reason: string } {
  const workflowName = workflow.name.toLowerCase();
  const matchCount = decisionKeywords.filter((kw) => workflowName.includes(kw)).length;

  if (matchCount >= 2) {
    return { impactLevel: 'MEDIUM', reason: 'Workflow name closely matches decision keywords' };
  }
  if (matchCount >= 1) {
    return { impactLevel: 'LOW', reason: 'Workflow may be affected by decision outcome' };
  }

  return { impactLevel: 'NONE', reason: '' };
}

function calculateAlignmentScore(
  predictedEffects: SecondOrderEffect[],
  actualOutcomes: string[]
): number {
  if (predictedEffects.length === 0 || actualOutcomes.length === 0) return 0;

  const predictedKeywords = new Set<string>();
  for (const effect of predictedEffects) {
    for (const kw of extractKeywords(effect.description)) {
      predictedKeywords.add(kw);
    }
  }

  const actualKeywords = new Set<string>();
  for (const outcome of actualOutcomes) {
    for (const kw of extractKeywords(outcome)) {
      actualKeywords.add(kw);
    }
  }

  if (predictedKeywords.size === 0 || actualKeywords.size === 0) return 0;

  let overlap = 0;
  for (const kw of predictedKeywords) {
    if (actualKeywords.has(kw)) overlap++;
  }

  const union = new Set([...predictedKeywords, ...actualKeywords]).size;
  return Math.round((overlap / union) * 100) / 100;
}

function calculateROIConfidence(
  financialRecordCount: number,
  decision: DecisionRecord
): number {
  let confidence = 0.2;

  if (financialRecordCount > 0) confidence += 0.2;
  if (financialRecordCount > 5) confidence += 0.1;
  if (decision.decidedAt) confidence += 0.15;
  if (decision.outcome) confidence += 0.1;
  if (decision.rationale) confidence += 0.05;

  if (decision.decidedAt) {
    const daysSince = Math.ceil(
      (Date.now() - decision.decidedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince > 30) confidence += 0.1;
    if (daysSince > 90) confidence += 0.1;
  }

  return Math.round(Math.min(1, confidence) * 100) / 100;
}

function buildFallbackSummary(
  decision: DecisionRecord,
  tree: EffectsTree,
  firstOrder: SecondOrderEffect[],
  secondOrder: SecondOrderEffect[],
  thirdOrder: SecondOrderEffect[]
): string {
  const sentiment =
    tree.netSentiment > 0.2
      ? 'predominantly positive'
      : tree.netSentiment < -0.2
        ? 'predominantly negative'
        : 'mixed';

  return (
    `Decision "${decision.title}" shows ${sentiment} effects across ${tree.effects.length} identified impacts. ` +
    `${firstOrder.length} direct effect(s), ${secondOrder.length} secondary consequence(s), ` +
    `and ${thirdOrder.length} tertiary ripple(s) were identified. ` +
    `Net sentiment score: ${tree.netSentiment.toFixed(2)}.`
  );
}

function buildFallbackRecommendations(
  riskFlags: string[],
  tree: EffectsTree
): string[] {
  const recommendations: string[] = [];

  if (riskFlags.length > 0) {
    recommendations.push(
      'Address identified risk flags before proceeding with full implementation'
    );
  }

  if (tree.netSentiment < 0) {
    recommendations.push(
      'Consider mitigation strategies for negative effects before execution'
    );
  }

  recommendations.push(
    'Establish monitoring checkpoints at 30, 60, and 90 days post-decision'
  );
  recommendations.push(
    'Document actual outcomes against these predictions for future calibration'
  );

  if (tree.effects.some((e) => e.order === 3 && e.sentiment === 'NEGATIVE')) {
    recommendations.push(
      'Third-order negative effects detected — plan contingencies for long-term risks'
    );
  }

  return recommendations;
}

function collectAllRippleEffects(effects: RippleEffect[]): RippleEffect[] {
  const result: RippleEffect[] = [];
  for (const effect of effects) {
    result.push(effect);
    result.push(...collectAllRippleEffects(effect.children));
  }
  return result;
}

function findHighestLikelihoodChain(rootEffects: RippleEffect[]): RippleEffect[] {
  let bestChain: RippleEffect[] = [];
  let bestScore = 0;

  function traverse(
    effect: RippleEffect,
    chain: RippleEffect[],
    cumulativeLikelihood: number
  ): void {
    const newChain = [...chain, effect];
    const newScore = cumulativeLikelihood * effect.likelihood;

    if (effect.children.length === 0) {
      if (newScore > bestScore) {
        bestScore = newScore;
        bestChain = newChain;
      }
      return;
    }

    for (const child of effect.children) {
      traverse(child, newChain, newScore);
    }
  }

  for (const root of rootEffects) {
    traverse(root, [], 1);
  }

  return bestChain;
}
