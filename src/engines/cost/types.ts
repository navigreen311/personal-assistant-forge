export type UsageMetricType = 'TOKENS' | 'VOICE_MINUTES' | 'STORAGE_MB' | 'WORKFLOW_RUNS' | 'API_CALLS';

export interface UsageRecord {
  id: string;
  entityId: string;
  metricType: UsageMetricType;
  amount: number;
  unitCost: number;
  totalCost: number;
  source: string;
  timestamp: Date;
}

export interface BudgetConfig {
  entityId: string;
  monthlyCapUsd: number;
  alertThresholds: number[];
  overageBehavior: 'BLOCK' | 'WARN' | 'ALLOW_WITH_APPROVAL';
  currentSpend: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface BudgetAlert {
  entityId: string;
  threshold: number;
  currentSpend: number;
  monthlyCapUsd: number;
  percentUsed: number;
  message: string;
  triggeredAt: Date;
}

export type ModelTier = 'FAST' | 'BALANCED' | 'POWERFUL';

export interface ModelRoutingDecision {
  inputComplexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX';
  recommendedTier: ModelTier;
  recommendedModel: string;
  reason: string;
  estimatedCost: number;
}

export interface ProviderHealth {
  providerId: string;
  providerName: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  latencyMs: number;
  errorRate: number;
  lastChecked: Date;
}

export interface ProviderFallback {
  primaryProviderId: string;
  fallbackProviderId: string;
  triggerCondition: 'DOWN' | 'DEGRADED' | 'SLOW' | 'ERROR_RATE_HIGH';
  isAutomatic: boolean;
  isActive: boolean;
}

export interface WorkflowCostAttribution {
  workflowId: string;
  workflowName: string;
  totalCostUsd: number;
  costPerRun: number;
  totalRuns: number;
  breakdown: { metricType: UsageMetricType; cost: number; amount: number }[];
  lastRunDate: Date;
}
