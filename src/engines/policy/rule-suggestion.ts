import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
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

    // Use AI to enhance suggestion quality
    let aiSuggestion: {
      suggestedName?: string;
      suggestedCondition?: RuleCondition[];
      suggestedAction?: RuleAction;
      suggestedScope?: RuleSuggestion['suggestedScope'];
      evidence?: string;
    } | null = null;

    try {
      aiSuggestion = await generateJSON<{
        suggestedName: string;
        suggestedCondition: RuleCondition[];
        suggestedAction: RuleAction;
        suggestedScope: RuleSuggestion['suggestedScope'];
        evidence: string;
      }>(
        `Analyze this correction pattern and suggest an automation rule.

Correction pattern:
- Action type: ${group.actionType}
- Target: ${group.target}
- Number of corrections: ${group.count} in ${lookbackDays} days
- User reasons: ${group.reasons.slice(0, 5).join('; ') || 'No reasons provided'}

Produce a JSON object with:
- suggestedName: A clear, descriptive rule name
- suggestedCondition: Array of RuleCondition objects with fields: field (string), operator ("eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"in"|"contains"|"matches"), value (unknown), logicalGroup ("AND"|"OR" optional)
- suggestedAction: Object with type ("ESCALATE"|"AUTO_ASSIGN"|"NOTIFY"|"BLOCK"|"TAG"|"REDIRECT"|"LOG"|"APPROVE"|"REJECT") and config (object)
- suggestedScope: One of "GLOBAL"|"ENTITY"|"PROJECT"|"CONTACT"|"CHANNEL"
- evidence: A human-readable description of the pattern and why this rule is recommended`,
        { temperature: 0.3 }
      );
    } catch {
      // AI enhancement failed — fall back to basic suggestion
    }

    const suggestion: RuleSuggestion = {
      suggestedName: aiSuggestion?.suggestedName ?? `Auto-rule: ${group.actionType} for ${group.target}`,
      suggestedCondition: aiSuggestion?.suggestedCondition ?? [
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
      suggestedAction: aiSuggestion?.suggestedAction ?? inferAction(group.actionType) as RuleAction,
      suggestedScope: aiSuggestion?.suggestedScope ?? 'ENTITY',
      evidence: aiSuggestion?.evidence ?? `You corrected this ${group.count} times in ${lookbackDays} days`,
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
