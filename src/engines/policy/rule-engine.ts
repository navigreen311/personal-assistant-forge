import { prisma } from '@/lib/db';
import { generateText } from '@/lib/ai';
import type { Rule } from '@/shared/types';
import type {
  RuleCondition,
  RuleAction,
  RuleScope,
  EvaluatedRule,
  ConflictReport,
  AuditTrail,
} from './types';

const SCOPE_PRIORITY: Record<RuleScope, number> = {
  GLOBAL: 0,
  ENTITY: 1,
  PROJECT: 2,
  CONTACT: 3,
  CHANNEL: 4,
};

const CONTRADICTORY_PAIRS: [string, string][] = [
  ['BLOCK', 'APPROVE'],
  ['BLOCK', 'AUTO_ASSIGN'],
  ['REJECT', 'APPROVE'],
];

export async function evaluateRules(
  context: Record<string, unknown>,
  entityId?: string
): Promise<EvaluatedRule[]> {
  const where: Record<string, unknown> = { isActive: true };
  if (entityId) {
    where.OR = [{ entityId }, { entityId: null }];
  }

  const rules = await prisma.rule.findMany({
    where,
    orderBy: { precedence: 'desc' },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rules.map((rule: any) => evaluateSingleRule(rule, context));
}

function evaluateSingleRule(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rule: any,
  context: Record<string, unknown>
): EvaluatedRule {
  const conditions = parseConditions(rule.condition);
  const conditionResults = conditions.map((cond) => ({
    condition: cond,
    passed: evaluateCondition(cond, context),
  }));

  const matched = resolveLogicalGroups(conditionResults);
  const action = matched ? parseAction(rule.action) : null;

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    matched,
    conditionResults,
    action,
    precedence: rule.precedence,
    scope: rule.scope as RuleScope,
  };
}

function parseConditions(condition: unknown): RuleCondition[] {
  if (Array.isArray(condition)) return condition as RuleCondition[];
  if (condition && typeof condition === 'object' && 'field' in condition) {
    return [condition as RuleCondition];
  }
  return [];
}

function parseAction(action: unknown): RuleAction | null {
  if (action && typeof action === 'object' && 'type' in action) {
    return action as RuleAction;
  }
  return null;
}

function resolveLogicalGroups(
  results: { condition: RuleCondition; passed: boolean }[]
): boolean {
  if (results.length === 0) return false;

  // Group by logicalGroup. Default to AND.
  let currentResult = results[0].passed;

  for (let i = 1; i < results.length; i++) {
    const group = results[i].condition.logicalGroup ?? 'AND';
    if (group === 'OR') {
      currentResult = currentResult || results[i].passed;
    } else {
      currentResult = currentResult && results[i].passed;
    }
  }

  return currentResult;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function evaluateCondition(
  cond: RuleCondition,
  context: Record<string, unknown>
): boolean {
  const fieldValue = getNestedValue(context, cond.field);

  switch (cond.operator) {
    case 'eq':
      return fieldValue === cond.value;
    case 'neq':
      return fieldValue !== cond.value;
    case 'gt':
      return typeof fieldValue === 'number' && typeof cond.value === 'number' && fieldValue > cond.value;
    case 'gte':
      return typeof fieldValue === 'number' && typeof cond.value === 'number' && fieldValue >= cond.value;
    case 'lt':
      return typeof fieldValue === 'number' && typeof cond.value === 'number' && fieldValue < cond.value;
    case 'lte':
      return typeof fieldValue === 'number' && typeof cond.value === 'number' && fieldValue <= cond.value;
    case 'in':
      return Array.isArray(cond.value) && cond.value.includes(fieldValue);
    case 'contains':
      return typeof fieldValue === 'string' && typeof cond.value === 'string' && fieldValue.includes(cond.value);
    case 'matches':
      if (typeof fieldValue === 'string' && typeof cond.value === 'string') {
        try {
          return new RegExp(cond.value).test(fieldValue);
        } catch {
          return false;
        }
      }
      return false;
    default:
      return false;
  }
}

export async function resolveConflicts(evaluatedRules: EvaluatedRule[]): Promise<ConflictReport[]> {
  const matchedRules = evaluatedRules.filter((r) => r.matched && r.action);
  const conflicts: ConflictReport[] = [];

  for (let i = 0; i < matchedRules.length; i++) {
    for (let j = i + 1; j < matchedRules.length; j++) {
      const a = matchedRules[i];
      const b = matchedRules[j];
      const conflict = detectConflict(a, b);
      if (conflict) conflicts.push(conflict);
    }
  }

  // Enhance MANUAL_REQUIRED conflicts with AI-generated explanations
  for (const conflict of conflicts) {
    if (conflict.resolution === 'MANUAL_REQUIRED') {
      try {
        const aiExplanation = await generateText(
          `Two automation rules conflict and cannot be auto-resolved. Explain to a non-technical user why manual resolution is needed and what they should consider.

Rule A: "${conflict.ruleA}"
Rule B: "${conflict.ruleB}"
Conflict type: ${conflict.conflictType}
Current explanation: ${conflict.explanation}

Provide a clear, concise explanation (2-3 sentences) of why these rules conflict and what the user should do to resolve it.`,
          { temperature: 0.5 }
        );
        conflict.explanation = aiExplanation;
      } catch {
        // Keep the existing static explanation on AI failure
      }
    }
  }

  return conflicts;
}

function detectConflict(a: EvaluatedRule, b: EvaluatedRule): ConflictReport | null {
  const aType = a.action?.type;
  const bType = b.action?.type;

  // Check contradictory actions
  const isContradictory = CONTRADICTORY_PAIRS.some(
    ([x, y]) =>
      (aType === x && bType === y) || (aType === y && bType === x)
  );

  if (isContradictory) {
    return buildConflictReport(a, b, 'CONTRADICTORY_ACTIONS');
  }

  // Check overlapping scope with same action type
  if (aType === bType && a.scope === b.scope) {
    return buildConflictReport(a, b, 'OVERLAPPING_SCOPE');
  }

  // Check precedence tie
  if (a.precedence === b.precedence && aType === bType) {
    return buildConflictReport(a, b, 'PRECEDENCE_TIE');
  }

  return null;
}

function buildConflictReport(
  a: EvaluatedRule,
  b: EvaluatedRule,
  conflictType: ConflictReport['conflictType']
): ConflictReport {
  // Resolution hierarchy: precedence > scope > version > manual
  if (a.precedence !== b.precedence) {
    const winner = a.precedence > b.precedence ? a : b;
    return {
      ruleA: a.ruleId,
      ruleB: b.ruleId,
      conflictType,
      resolution: 'HIGHER_PRECEDENCE',
      resolvedWinnerId: winner.ruleId,
      explanation: `Rule "${winner.ruleName}" wins with precedence ${winner.precedence}`,
    };
  }

  const aScopePriority = SCOPE_PRIORITY[a.scope];
  const bScopePriority = SCOPE_PRIORITY[b.scope];

  if (aScopePriority !== bScopePriority) {
    const winner = aScopePriority > bScopePriority ? a : b;
    return {
      ruleA: a.ruleId,
      ruleB: b.ruleId,
      conflictType,
      resolution: 'NARROWER_SCOPE',
      resolvedWinnerId: winner.ruleId,
      explanation: `Rule "${winner.ruleName}" wins with narrower scope (${winner.scope})`,
    };
  }

  // When precedence and scope are tied, flag for manual resolution.
  // Version-based resolution requires DB access (rule version), handled at caller level.
  return {
    ruleA: a.ruleId,
    ruleB: b.ruleId,
    conflictType,
    resolution: 'MANUAL_REQUIRED',
    explanation: `Rules "${a.ruleName}" and "${b.ruleName}" conflict with same precedence and scope; manual resolution required`,
  };
}

export function getWinningAction(evaluatedRules: EvaluatedRule[]): EvaluatedRule | null {
  const matched = evaluatedRules.filter((r) => r.matched && r.action);
  if (matched.length === 0) return null;

  // Sort by precedence desc, then by scope narrowness desc
  matched.sort((a, b) => {
    if (b.precedence !== a.precedence) return b.precedence - a.precedence;
    return SCOPE_PRIORITY[b.scope] - SCOPE_PRIORITY[a.scope];
  });

  return matched[0];
}

export async function buildAuditTrail(
  actionId: string,
  evaluatedRules: EvaluatedRule[],
  dataSources: string[]
): Promise<AuditTrail> {
  const winner = getWinningAction(evaluatedRules);
  const matchedRules = evaluatedRules.filter((r) => r.matched);
  const totalRules = evaluatedRules.length;
  const confidence = matchedRules.length > 0 ? 1 / matchedRules.length : 0;

  const fallbackExplanation = winner
    ? `Action taken based on rule "${winner.ruleName}" (${winner.scope} scope, precedence ${winner.precedence}). ` +
      `Evaluated ${totalRules} rules, ${matchedRules.length} matched. ` +
      `Action type: ${winner.action?.type}.`
    : `No matching rules found among ${totalRules} evaluated rules.`;

  let explanation = fallbackExplanation;

  try {
    const rulesDescription = matchedRules
      .map((r) => `- "${r.ruleName}" (scope: ${r.scope}, precedence: ${r.precedence}, action: ${r.action?.type})`)
      .join('\n');

    explanation = await generateText(
      `Produce a clear, non-technical explanation of why an automated action was taken. This will be shown to users who ask "Why did you do that?"

Evaluated rules:
${rulesDescription || 'No rules matched.'}

Winning rule: ${winner ? `"${winner.ruleName}" with action ${winner.action?.type}` : 'None'}
Data sources used: ${dataSources.join(', ') || 'None'}
Total rules evaluated: ${totalRules}, matched: ${matchedRules.length}

Write a brief, human-readable explanation (2-3 sentences).`,
      { temperature: 0.5 }
    );
  } catch {
    // Fall back to static explanation on AI failure
  }

  return {
    actionId,
    timestamp: new Date(),
    rulesEvaluated: evaluatedRules,
    ruleApplied: winner?.ruleId ?? '',
    dataSources,
    confidence: Math.min(confidence, 1),
    explanation,
  };
}

export async function getInheritedRules(
  entityId: string,
  projectId?: string,
  contactId?: string
): Promise<Rule[]> {
  const scopeFilters: Record<string, unknown>[] = [
    { scope: 'GLOBAL', isActive: true },
    { scope: 'ENTITY', entityId, isActive: true },
  ];

  if (projectId) {
    scopeFilters.push({ scope: 'PROJECT', entityId, isActive: true });
  }
  if (contactId) {
    scopeFilters.push({ scope: 'CONTACT', entityId, isActive: true });
  }

  const rules = await prisma.rule.findMany({
    where: { OR: scopeFilters },
    orderBy: [{ scope: 'asc' }, { precedence: 'desc' }],
  });

  // Apply inheritance: narrower scope overrides broader for same condition
  const ruleMap = new Map<string, Rule>();

  // Sort by scope breadth (GLOBAL first, CONTACT last)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortedRules = rules.sort(
    (a: any, b: any) => SCOPE_PRIORITY[a.scope as RuleScope] - SCOPE_PRIORITY[b.scope as RuleScope]
  );

  for (const raw of sortedRules) {
    const conditionKey = JSON.stringify(raw.condition);
    // Narrower scope overwrites broader scope
    ruleMap.set(conditionKey, {
      id: raw.id,
      name: raw.name,
      scope: raw.scope as Rule['scope'],
      entityId: raw.entityId ?? undefined,
      condition: raw.condition as Record<string, unknown>,
      action: raw.action as Record<string, unknown>,
      precedence: raw.precedence,
      createdBy: raw.createdBy as Rule['createdBy'],
      version: raw.version,
      isActive: raw.isActive,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  // Return in inheritance order (GLOBAL first)
  return Array.from(ruleMap.values()).sort(
    (a, b) => SCOPE_PRIORITY[a.scope as RuleScope] - SCOPE_PRIORITY[b.scope as RuleScope]
  );
}
