export interface PermissionSet {
  integrationId: string;
  integrationName: string;
  read: boolean;
  draft: boolean;
  execute: boolean;
}

export interface ExplainResponse {
  actionDescription: string;
  rulesApplied: { ruleId: string; ruleName: string; matchReason: string }[];
  dataSources: { type: string; id: string; description: string }[];
  confidence: number;
  alternatives: { description: string; ruleId?: string }[];
  timestamp: Date;
}

export interface SensitiveDataPreview {
  originalText: string;
  redactedText: string;
  redactions: { start: number; end: number; type: string; replacement: string }[];
  sensitivityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface TrustScoreBreakdown {
  domain: string;
  overallScore: number;
  dimensions: {
    accuracy: number;
    transparency: number;
    reversibility: number;
    userOverrideRate: number;
  };
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  sampleSize: number;
}
