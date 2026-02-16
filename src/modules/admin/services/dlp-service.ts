import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { DLPRule } from '../types';

export const dlpStore = new Map<string, DLPRule>();

const BUILT_IN_PATTERNS: Record<string, RegExp> = {
  SSN: /\b\d{3}-\d{2}-\d{4}\b/g,
  CREDIT_CARD: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  PHONE: /\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
};

function ruleToDLP(rule: {
  id: string;
  name: string;
  entityId: string | null;
  condition: unknown;
  action: unknown;
  isActive: boolean;
}): DLPRule {
  const condition = rule.condition as Record<string, unknown>;
  const actionObj = rule.action as Record<string, unknown>;
  return {
    id: rule.id,
    entityId: rule.entityId ?? '',
    name: rule.name,
    pattern: (condition.pattern as string) ?? '',
    action: (actionObj.action as DLPRule['action']) ?? 'LOG',
    scope: (condition.scope as DLPRule['scope']) ?? 'ALL',
    isActive: rule.isActive,
  };
}

export async function createDLPRule(rule: Omit<DLPRule, 'id'>): Promise<DLPRule> {
  const created = await prisma.rule.create({
    data: {
      name: rule.name,
      scope: 'DLP',
      entityId: rule.entityId,
      condition: {
        type: 'regex',
        pattern: rule.pattern,
        dataType: 'CUSTOM',
        scope: rule.scope,
      },
      action: {
        action: rule.action,
        notify: [],
      },
      isActive: rule.isActive,
    },
  });

  const result = ruleToDLP(created);
  dlpStore.set(result.id, result);
  return result;
}

export async function getDLPRules(entityId: string): Promise<DLPRule[]> {
  const rules = await prisma.rule.findMany({
    where: {
      scope: 'DLP',
      entityId,
    },
  });

  return rules.map(ruleToDLP);
}

export async function listRules(entityId: string): Promise<DLPRule[]> {
  return getDLPRules(entityId);
}

export async function updateRule(ruleId: string, updates: Partial<DLPRule>): Promise<DLPRule> {
  const existing = await prisma.rule.findUnique({ where: { id: ruleId } });
  if (!existing) throw new Error(`DLP rule ${ruleId} not found`);

  const currentCondition = existing.condition as Record<string, unknown>;
  const currentAction = existing.action as Record<string, unknown>;

  const updated = await prisma.rule.update({
    where: { id: ruleId },
    data: {
      name: updates.name ?? existing.name,
      condition: {
        ...currentCondition,
        pattern: updates.pattern ?? currentCondition.pattern,
        scope: updates.scope ?? currentCondition.scope,
      } as Prisma.InputJsonValue,
      action: {
        ...currentAction,
        action: updates.action ?? currentAction.action,
      } as Prisma.InputJsonValue,
      isActive: updates.isActive ?? existing.isActive,
    },
  });

  return ruleToDLP(updated);
}

export async function deleteDLPRule(ruleId: string): Promise<void> {
  const existing = await prisma.rule.findUnique({ where: { id: ruleId } });
  if (!existing) throw new Error(`DLP rule ${ruleId} not found`);

  await prisma.rule.update({
    where: { id: ruleId },
    data: { isActive: false },
  });

  dlpStore.delete(ruleId);
}

export async function checkContent(
  entityId: string,
  content: string,
  scope: string
): Promise<{ passed: boolean; violations: { rule: DLPRule; matchedText: string }[] }> {
  return scanContent(entityId, content, scope);
}

export async function scanContent(
  entityId: string,
  content: string,
  scope?: string
): Promise<{ passed: boolean; violations: { rule: DLPRule; matchedText: string }[] }> {
  const rules = await getDLPRules(entityId);
  const activeRules = rules.filter(
    (r) => r.isActive && (!scope || r.scope === 'ALL' || r.scope === scope)
  );

  const violations: { rule: DLPRule; matchedText: string }[] = [];

  for (const rule of activeRules) {
    try {
      const regex = new RegExp(rule.pattern, 'gi');
      const matches = content.match(regex);
      if (matches) {
        for (const match of matches) {
          violations.push({ rule, matchedText: match });
        }
      }
    } catch {
      // If pattern is not valid regex, treat as keyword search
      if (content.toLowerCase().includes(rule.pattern.toLowerCase())) {
        violations.push({ rule, matchedText: rule.pattern });
      }
    }
  }

  if (violations.length > 0) {
    await prisma.actionLog.create({
      data: {
        actor: 'DLP_SCANNER',
        actionType: 'DLP_VIOLATION',
        target: entityId,
        reason: `Found ${violations.length} DLP violation(s)`,
        status: 'COMPLETED',
      },
    }).catch(() => {});
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

export async function getViolationReport(
  entityId: string,
  dateRange: { start: Date; end: Date }
): Promise<{
  totalViolations: number;
  byRule: Record<string, number>;
  byDataType: Record<string, number>;
  violations: Array<{ timestamp: Date; reason: string }>;
}> {
  const logs = await prisma.actionLog.findMany({
    where: {
      actionType: 'DLP_VIOLATION',
      target: entityId,
      timestamp: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
    },
    orderBy: { timestamp: 'desc' },
  });

  const byRule: Record<string, number> = {};
  const byDataType: Record<string, number> = {};

  for (const log of logs) {
    const key = log.reason || 'unknown';
    byRule[key] = (byRule[key] || 0) + 1;
    byDataType['CUSTOM'] = (byDataType['CUSTOM'] || 0) + 1;
  }

  return {
    totalViolations: logs.length,
    byRule,
    byDataType,
    violations: logs.map((l) => ({ timestamp: l.timestamp, reason: l.reason })),
  };
}
