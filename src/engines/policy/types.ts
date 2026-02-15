export type RuleScope = 'GLOBAL' | 'ENTITY' | 'PROJECT' | 'CONTACT' | 'CHANNEL';

export interface RuleCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'matches';
  value: unknown;
  logicalGroup?: 'AND' | 'OR';
}

export interface RuleAction {
  type: 'ESCALATE' | 'AUTO_ASSIGN' | 'NOTIFY' | 'BLOCK' | 'TAG' | 'REDIRECT' | 'LOG' | 'APPROVE' | 'REJECT';
  config: Record<string, unknown>;
}

export interface EvaluatedRule {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  conditionResults: { condition: RuleCondition; passed: boolean }[];
  action: RuleAction | null;
  precedence: number;
  scope: RuleScope;
}

export interface ConflictReport {
  ruleA: string;
  ruleB: string;
  conflictType: 'CONTRADICTORY_ACTIONS' | 'OVERLAPPING_SCOPE' | 'PRECEDENCE_TIE';
  resolution: 'HIGHER_PRECEDENCE' | 'NARROWER_SCOPE' | 'NEWER_VERSION' | 'MANUAL_REQUIRED';
  resolvedWinnerId?: string;
  explanation: string;
}

export interface AuditTrail {
  actionId: string;
  timestamp: Date;
  rulesEvaluated: EvaluatedRule[];
  ruleApplied: string;
  dataSources: string[];
  confidence: number;
  explanation: string;
}

export interface RuleSuggestion {
  suggestedName: string;
  suggestedCondition: RuleCondition[];
  suggestedAction: RuleAction;
  suggestedScope: RuleScope;
  evidence: string;
  correctionCount: number;
  correctionPattern: string;
}
