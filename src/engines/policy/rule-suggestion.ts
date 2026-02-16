import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { Rule } from '@/shared/types';
import type { RuleCondition, RuleAction, RuleSuggestion } from './types';

const DEFAULT_LOOKBACK_DAYS = 30;
const MIN_CORRECTIONS_FOR_SUGGESTION = 3;

export async function detectCorrectionPattern(
  userId: string,
  lookbackDays = DEFAULT_LOOKBACK_DAYS
): Promise<RuleSuggestion[]> {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  // Find action logs where the user overrode/corrected an AI action
  const corrections = await prisma.actionLog.findMany({
    where: {
      actorId: userId,
      actor: 'HUMAN',
      timestamp: { gte: since },
      // Corrections are logged when a human overrides a previous AI action
      actionType: { contains: 'OVERRIDE' },
    },
    orderBy: { timestamp: 'desc' },
  });

  // Group corrections by target + actionType pattern
  const patternGroups = new Map<
    string,
    { target: string; actionType: string; count: number; reasons: string[] }
  >();

  for (const log of corrections) {
    const key = `${log.target}:${log.actionType}`;
    const group: { target: string; actionType: string; count: number; reasons: string[] } = patternGroups.get(key) ?? {
      target: log.target as string,
      actionType: log.actionType as string,
      count: 0,
      reasons: [] as string[],
    };
    group.count++;
    if (log.reason) group.reasons.push(log.reason as string);
    patternGroups.set(key, group);
  }

  const suggestions: RuleSuggestion[] = [];

  for (const [, group] of patternGroups) {
    if (group.count < MIN_CORRECTIONS_FOR_SUGGESTION) continue;

    const suggestion: RuleSuggestion = {
      suggestedName: `Auto-rule: ${group.actionType} for ${group.target}`,
      suggestedCondition: [
        {
          field: 'actionType',
          operator: 'eq',
          value: group.actionType,
        },
        {
          field: 'target',
          operator: 'eq',
          value: group.target,
          logicalGroup: 'AND',
        },
      ] as RuleCondition[],
      suggestedAction: inferAction(group.actionType) as RuleAction,
      suggestedScope: 'ENTITY',
      evidence: `You corrected this ${group.count} times in ${lookbackDays} days`,
      correctionCount: group.count,
      correctionPattern: `${group.actionType}:${group.target}`,
    };

    suggestions.push(suggestion);
  }

  return suggestions;
}

export async function createRuleFromSuggestion(
  suggestion: RuleSuggestion,
  userId: string
): Promise<Rule> {
  const rule = await prisma.rule.create({
    data: {
      name: suggestion.suggestedName,
      scope: suggestion.suggestedScope,
      condition: suggestion.suggestedCondition as unknown as Prisma.InputJsonValue,
      action: suggestion.suggestedAction as unknown as Prisma.InputJsonValue,
      precedence: 50,
      createdBy: 'AI',
      version: 1,
      isActive: true,
    },
  });

  // Log the rule creation
  await prisma.actionLog.create({
    data: {
      actor: 'AI',
      actorId: userId,
      actionType: 'CREATE_RULE_FROM_SUGGESTION',
      target: rule.id,
      reason: suggestion.evidence,
      blastRadius: 'LOW',
      reversible: true,
      status: 'EXECUTED',
    },
  });

  return {
    id: rule.id,
    name: rule.name,
    scope: rule.scope as Rule['scope'],
    entityId: rule.entityId ?? undefined,
    condition: rule.condition as Record<string, unknown>,
    action: rule.action as Record<string, unknown>,
    precedence: rule.precedence,
    createdBy: rule.createdBy as Rule['createdBy'],
    version: rule.version,
    isActive: rule.isActive,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

function inferAction(actionType: string): RuleAction {
  // Map correction patterns to appropriate rule actions
  if (actionType.includes('BLOCK') || actionType.includes('REJECT')) {
    return { type: 'BLOCK', config: {} };
  }
  if (actionType.includes('ESCALATE')) {
    return { type: 'ESCALATE', config: {} };
  }
  if (actionType.includes('REDIRECT')) {
    return { type: 'REDIRECT', config: {} };
  }
  return { type: 'NOTIFY', config: {} };
}
