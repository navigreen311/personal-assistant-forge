import { v4 as uuidv4 } from 'uuid';
import type { DLPRule } from '../types';

const dlpStore = new Map<string, DLPRule>();

export async function createDLPRule(rule: Omit<DLPRule, 'id'>): Promise<DLPRule> {
  const newRule: DLPRule = { ...rule, id: uuidv4() };
  dlpStore.set(newRule.id, newRule);
  return newRule;
}

export async function getDLPRules(entityId: string): Promise<DLPRule[]> {
  const results: DLPRule[] = [];
  for (const rule of dlpStore.values()) {
    if (rule.entityId === entityId) results.push(rule);
  }
  return results;
}

export async function checkContent(
  entityId: string,
  content: string,
  scope: string
): Promise<{ passed: boolean; violations: { rule: DLPRule; matchedText: string }[] }> {
  const rules = await getDLPRules(entityId);
  const activeRules = rules.filter((r) => r.isActive && (r.scope === 'ALL' || r.scope === scope));

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

  return {
    passed: violations.length === 0,
    violations,
  };
}

export async function deleteDLPRule(ruleId: string): Promise<void> {
  if (!dlpStore.has(ruleId)) throw new Error(`DLP rule ${ruleId} not found`);
  dlpStore.delete(ruleId);
}

export { dlpStore };
