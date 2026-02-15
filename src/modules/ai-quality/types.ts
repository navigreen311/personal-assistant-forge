export interface AccuracyScorecard {
  entityId: string;
  period: string;
  triageAccuracy: number;
  draftApprovalRate: number;
  missedDeadlineRate: number;
  automationSuccessRate: number;
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface GoldenTestCase {
  id: string;
  category: 'TRIAGE' | 'DRAFT' | 'CLASSIFICATION' | 'PREDICTION' | 'EXTRACTION';
  input: Record<string, unknown>;
  expectedOutput: Record<string, unknown>;
  tolerance?: number;           // allowed deviation for numeric outputs
  tags: string[];
  createdAt: Date;
  lastRun?: Date;
  lastResult?: 'PASS' | 'FAIL';
}

export interface GoldenTestSuite {
  id: string;
  name: string;
  description: string;
  testCases: GoldenTestCase[];
  lastRunDate?: Date;
  passRate: number;
  totalRuns: number;
}

export interface GoldenTestResult {
  testCaseId: string;
  passed: boolean;
  actualOutput: Record<string, unknown>;
  deviation?: number;
  runDuration: number;
  modelVersion: string;
  timestamp: Date;
}

export interface ConfidenceScore {
  actionId: string;
  confidence: number;           // 0-1
  factors: { factor: string; weight: number; value: number }[];
  recommendation: 'AUTO_EXECUTE' | 'REVIEW_RECOMMENDED' | 'HUMAN_REQUIRED';
}

export interface OverrideRecord {
  id: string;
  actionId: string;
  userId: string;
  originalOutput: string;
  overriddenOutput: string;
  reason: 'INCORRECT' | 'INCOMPLETE' | 'WRONG_TONE' | 'POLICY_VIOLATION' | 'PREFERENCE' | 'OTHER';
  reasonDetail?: string;
  timestamp: Date;
}

export interface OverrideAnalysis {
  totalOverrides: number;
  byReason: Record<string, number>;
  overrideRate: number;         // overrides / total actions
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING';
  topPatterns: { pattern: string; count: number; suggestedFix: string }[];
}

export interface BiasReport {
  entityId: string;
  period: string;
  dimensions: BiasDimension[];
  overallBiasScore: number;     // 0 = no bias, 1 = severe bias
  alerts: string[];
}

export interface BiasDimension {
  name: string;                 // e.g., "entity_bias", "contact_bias", "channel_bias"
  score: number;                // 0-1
  description: string;
  affectedGroups: { group: string; deviation: number }[];
}

export interface CitationRecord {
  claimId: string;
  claim: string;
  sourceType: 'DOCUMENT' | 'MESSAGE' | 'KNOWLEDGE' | 'WEB';
  sourceId: string;
  sourceExcerpt: string;
  confidence: number;
  verified: boolean;
}

export interface ProvenanceChain {
  outputId: string;
  citations: CitationRecord[];
  uncitedClaims: string[];
  citationCoveragePercent: number;
}
