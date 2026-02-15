// ============================================================================
// Cost Estimation Service
// Estimates costs for individual actions and runbooks
// ============================================================================

import type { CostEstimate, CostBreakdownItem, Runbook } from '../types';
import prisma from '@/lib/db';
import { startOfDay, endOfDay } from 'date-fns';

// --- Cost Catalog ---

const COST_CATALOG: Record<
  string,
  { baseCost: number; unit: string; perUnit?: string }
> = {
  SEND_MESSAGE: { baseCost: 0.001, unit: 'per email' },
  SEND_SMS: { baseCost: 0.01, unit: 'per SMS' },
  SEND_IN_APP: { baseCost: 0, unit: 'per message' },
  CALL_API: { baseCost: 0.01, unit: 'per API call' },
  AI_ANALYSIS: { baseCost: 0.02, unit: 'per 1K tokens' },
  GENERATE_DOCUMENT: { baseCost: 0.05, unit: 'per document' },
  CREATE_TASK: { baseCost: 0, unit: 'per task' },
  UPDATE_RECORD: { baseCost: 0, unit: 'per record' },
  DELETE_RECORD: { baseCost: 0, unit: 'per record' },
  DELETE_CONTACT: { baseCost: 0, unit: 'per contact' },
  DELETE_PROJECT: { baseCost: 0, unit: 'per project' },
  CREATE_CONTACT: { baseCost: 0, unit: 'per contact' },
  CREATE_PROJECT: { baseCost: 0, unit: 'per project' },
  TRIGGER_WORKFLOW: { baseCost: 0.01, unit: 'per workflow run' },
  FINANCIAL_ACTION: { baseCost: 0, unit: 'per transaction' },
  BULK_SEND: { baseCost: 0.001, unit: 'per recipient' },
  BULK_DELETE: { baseCost: 0, unit: 'per record' },
};

// --- Public API ---

export function estimateActionCost(
  actionType: string,
  parameters: Record<string, unknown>
): CostEstimate {
  const breakdown: CostBreakdownItem[] = [];
  let totalCost = 0;

  const catalog = COST_CATALOG[actionType];

  if (!catalog) {
    return {
      actionType,
      estimatedCost: 0,
      currency: 'USD',
      breakdown: [{ item: actionType, cost: 0, unit: 'unknown action type' }],
      confidence: 0.3,
    };
  }

  // Handle message channel variants
  if (actionType === 'SEND_MESSAGE') {
    const channel =
      typeof parameters.channel === 'string' ? parameters.channel : 'EMAIL';
    if (channel === 'SMS') {
      totalCost = 0.01;
      breakdown.push({ item: 'SMS message', cost: 0.01, unit: 'per SMS' });
    } else if (channel === 'EMAIL') {
      totalCost = 0.001;
      breakdown.push({ item: 'Email message', cost: 0.001, unit: 'per email' });
    } else {
      totalCost = 0;
      breakdown.push({
        item: `${channel} message`,
        cost: 0,
        unit: 'per message (in-app)',
      });
    }
  } else if (actionType === 'BULK_SEND') {
    const recipientCount =
      typeof parameters.recipientCount === 'number'
        ? parameters.recipientCount
        : Array.isArray(parameters.recipients)
          ? parameters.recipients.length
          : 1;
    const channel =
      typeof parameters.channel === 'string' ? parameters.channel : 'EMAIL';
    const perRecipientCost = channel === 'SMS' ? 0.01 : 0.001;
    totalCost = perRecipientCost * recipientCount;
    breakdown.push({
      item: `${channel} to ${recipientCount} recipients`,
      cost: totalCost,
      unit: `per ${channel.toLowerCase()}`,
    });
  } else if (actionType === 'AI_ANALYSIS') {
    const tokenCount =
      typeof parameters.tokenCount === 'number'
        ? parameters.tokenCount
        : typeof parameters.tokens === 'number'
          ? parameters.tokens
          : 1000;
    totalCost = (tokenCount / 1000) * 0.02;
    breakdown.push({
      item: 'AI token processing',
      cost: totalCost,
      unit: 'per 1K tokens',
    });
  } else {
    totalCost = catalog.baseCost;
    breakdown.push({
      item: actionType,
      cost: catalog.baseCost,
      unit: catalog.unit,
    });
  }

  // Calculate confidence based on whether we know this action type
  const confidence = catalog.baseCost === 0 ? 0.95 : 0.8;

  return {
    actionType,
    estimatedCost: Math.round(totalCost * 10000) / 10000,
    currency: 'USD',
    breakdown,
    confidence,
  };
}

export function estimateRunbookCost(runbook: Runbook): CostEstimate {
  const breakdown: CostBreakdownItem[] = [];
  let totalCost = 0;

  for (const step of runbook.steps) {
    const stepEstimate = estimateActionCost(step.actionType, step.parameters);
    totalCost += stepEstimate.estimatedCost;
    for (const item of stepEstimate.breakdown) {
      breakdown.push({
        item: `Step ${step.order}: ${item.item}`,
        cost: item.cost,
        unit: item.unit,
      });
    }
  }

  const avgConfidence =
    runbook.steps.length > 0
      ? runbook.steps.reduce((sum, step) => {
          const est = estimateActionCost(step.actionType, step.parameters);
          return sum + est.confidence;
        }, 0) / runbook.steps.length
      : 0.5;

  return {
    actionType: 'RUNBOOK',
    estimatedCost: Math.round(totalCost * 10000) / 10000,
    currency: 'USD',
    breakdown,
    confidence: Math.round(avgConfidence * 100) / 100,
  };
}

export async function getDailyCostSummary(
  entityId: string,
  date: Date
): Promise<{ totalCost: number; breakdown: CostBreakdownItem[] }> {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const actionLogs = await prisma.actionLog.findMany({
    where: {
      timestamp: { gte: dayStart, lte: dayEnd },
      status: 'EXECUTED',
    },
  });

  // Filter by entity via target field or reconstruct from action logs
  const entityLogs = actionLogs.filter(
    (log) =>
      log.target.includes(entityId) ||
      log.actionType.includes(entityId) ||
      true // Include all if no entity filter on ActionLog
  );

  const breakdown: CostBreakdownItem[] = [];
  let totalCost = 0;

  const typeCounts = new Map<string, number>();
  for (const log of entityLogs) {
    const count = typeCounts.get(log.actionType) ?? 0;
    typeCounts.set(log.actionType, count + 1);
    totalCost += log.cost ?? 0;
  }

  for (const [actionType, count] of typeCounts) {
    const catalogEntry = COST_CATALOG[actionType];
    breakdown.push({
      item: `${actionType} x${count}`,
      cost: (catalogEntry?.baseCost ?? 0) * count,
      unit: catalogEntry?.unit ?? 'per action',
    });
  }

  return {
    totalCost: Math.round(totalCost * 10000) / 10000,
    breakdown,
  };
}
