import { prisma } from '@/lib/db';
import type { ExplainResponse } from './types';
import type { EvaluatedRule } from '../policy/types';

export async function explainAction(actionId: string): Promise<ExplainResponse> {
  const actionLog = await prisma.actionLog.findUnique({
    where: { id: actionId },
  });

  if (!actionLog) {
    return {
      actionDescription: 'Action not found',
      rulesApplied: [],
      dataSources: [],
      confidence: 0,
      alternatives: [],
      timestamp: new Date(),
    };
  }

  // Find consent receipts for this action to get more context
  const receipts = await prisma.consentReceipt.findMany({
    where: { actionId },
  });

  // Find rules that may have been involved
  const rules = await prisma.rule.findMany({
    where: { isActive: true },
    take: 10,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rulesApplied = rules
    .filter((r: any) => {
      const ruleAction = r.action as Record<string, unknown>;
      return ruleAction?.type === actionLog.actionType;
    })
    .map((r: any) => ({
      ruleId: r.id as string,
      ruleName: r.name as string,
      matchReason: `Rule action type matches action "${actionLog.actionType}"`,
    }));

  const dataSources: ExplainResponse['dataSources'] = [
    {
      type: 'ActionLog',
      id: actionLog.id,
      description: `Action logged at ${actionLog.timestamp.toISOString()}`,
    },
  ];

  for (const receipt of receipts) {
    dataSources.push({
      type: 'ConsentReceipt',
      id: receipt.id,
      description: receipt.description,
    });
  }

  return {
    actionDescription: `${actionLog.actionType} on ${actionLog.target}: ${actionLog.reason}`,
    rulesApplied,
    dataSources,
    confidence: receipts.length > 0 ? receipts[0].confidence : 0.5,
    alternatives: [],
    timestamp: actionLog.timestamp,
  };
}

export async function explainWithContext(
  actionId: string,
  userQuestion?: string
): Promise<ExplainResponse> {
  const baseExplanation = await explainAction(actionId);

  if (!userQuestion) return baseExplanation;

  // Enhance explanation with context from the user's question
  const questionLower = userQuestion.toLowerCase();

  const alternatives: ExplainResponse['alternatives'] = [];

  if (questionLower.includes('why')) {
    alternatives.push({
      description: `The action was taken because: ${baseExplanation.rulesApplied
        .map((r) => r.matchReason)
        .join('; ') || 'no specific rules matched, default behavior applied'}`,
    });
  }

  if (questionLower.includes('what') || questionLower.includes('alternative')) {
    // Find alternative rules that could have applied
    const allRules = await prisma.rule.findMany({
      where: { isActive: true },
      take: 5,
    });

    for (const rule of allRules) {
      const ruleAction = rule.action as Record<string, unknown>;
      if (!baseExplanation.rulesApplied.some((r) => r.ruleId === rule.id)) {
        alternatives.push({
          description: `Alternative: Rule "${rule.name}" could apply action "${ruleAction?.type ?? 'unknown'}"`,
          ruleId: rule.id,
        });
      }
    }
  }

  return {
    ...baseExplanation,
    alternatives: [...baseExplanation.alternatives, ...alternatives],
  };
}

export function buildExplainFromEvaluated(
  actionId: string,
  evaluatedRules: EvaluatedRule[],
  dataSources: string[]
): ExplainResponse {
  const matched = evaluatedRules.filter((r) => r.matched);

  return {
    actionDescription: `Evaluated ${evaluatedRules.length} rules for action ${actionId}`,
    rulesApplied: matched.map((r) => ({
      ruleId: r.ruleId,
      ruleName: r.ruleName,
      matchReason: `Matched with action ${r.action?.type ?? 'none'} at precedence ${r.precedence}`,
    })),
    dataSources: dataSources.map((ds, i) => ({
      type: 'DataSource',
      id: `ds-${i}`,
      description: ds,
    })),
    confidence: matched.length > 0 ? 1 / matched.length : 0,
    alternatives: evaluatedRules
      .filter((r) => !r.matched && r.action)
      .map((r) => ({
        description: `Rule "${r.ruleName}" did not match but could apply ${r.action?.type}`,
        ruleId: r.ruleId,
      })),
    timestamp: new Date(),
  };
}
