import { prisma } from '@/lib/db';
import { generateText, chat } from '@/lib/ai';
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

  let actionDescription = `${actionLog.actionType} on ${actionLog.target}: ${actionLog.reason}`;
  let alternatives: ExplainResponse['alternatives'] = [];

  try {
    const aiResult = await generateText(
      `Explain this automated action in plain language for a non-technical user.

Action: ${actionLog.actionType}
Target: ${actionLog.target}
Reason: ${actionLog.reason}
Rules applied: ${rulesApplied.map((r: { ruleName: string; matchReason: string }) => `${r.ruleName}: ${r.matchReason}`).join('; ') || 'No specific rules'}
Data sources: ${dataSources.map((d) => d.description).join('; ')}

Also suggest 2-3 alternative actions that could have been taken instead. Format your response as:
DESCRIPTION: <human-readable description of what was done and why>
ALTERNATIVES:
- <alternative 1>
- <alternative 2>
- <alternative 3>`,
      { temperature: 0.6 }
    );

    const descMatch = aiResult.match(/DESCRIPTION:\s*([\s\S]*?)(?=ALTERNATIVES:|$)/i);
    if (descMatch) {
      actionDescription = descMatch[1].trim();
    }

    const altMatch = aiResult.match(/ALTERNATIVES:\s*([\s\S]*)/i);
    if (altMatch) {
      alternatives = altMatch[1]
        .split('\n')
        .map((line) => line.replace(/^-\s*/, '').trim())
        .filter(Boolean)
        .map((desc) => ({ description: desc }));
    }
  } catch {
    // Fall back to basic description on AI failure
  }

  return {
    actionDescription,
    rulesApplied,
    dataSources,
    confidence: receipts.length > 0 ? receipts[0].confidence : 0.5,
    alternatives,
    timestamp: actionLog.timestamp,
  };
}

export async function explainWithContext(
  actionId: string,
  userQuestion?: string
): Promise<ExplainResponse> {
  const baseExplanation = await explainAction(actionId);

  if (!userQuestion) return baseExplanation;

  // Use AI chat for conversational Q&A about the action
  try {
    const systemContext = `You are a helpful assistant that explains automated actions to users.

Here is the context about the action:
- Action description: ${baseExplanation.actionDescription}
- Rules applied: ${baseExplanation.rulesApplied.map((r) => `${r.ruleName}: ${r.matchReason}`).join('; ') || 'None'}
- Data sources: ${baseExplanation.dataSources.map((d) => `${d.type}: ${d.description}`).join('; ')}
- Confidence: ${baseExplanation.confidence}
- Alternatives considered: ${baseExplanation.alternatives.map((a) => a.description).join('; ') || 'None'}

Answer the user's question about this action in a conversational, clear way.`;

    const aiResponse = await chat(
      [{ role: 'user', content: userQuestion }],
      { system: systemContext, temperature: 0.6 }
    );

    return {
      ...baseExplanation,
      alternatives: [
        ...baseExplanation.alternatives,
        { description: aiResponse },
      ],
    };
  } catch {
    // Fall back to basic keyword-based enhancement
    const alternatives: ExplainResponse['alternatives'] = [];
    const questionLower = userQuestion.toLowerCase();

    if (questionLower.includes('why')) {
      alternatives.push({
        description: `The action was taken because: ${baseExplanation.rulesApplied
          .map((r) => r.matchReason)
          .join('; ') || 'no specific rules matched, default behavior applied'}`,
      });
    }

    return {
      ...baseExplanation,
      alternatives: [...baseExplanation.alternatives, ...alternatives],
    };
  }
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
