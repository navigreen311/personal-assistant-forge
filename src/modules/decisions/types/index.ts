// ============================================================================
// Decision Support Engine — Module-Specific Types
// ============================================================================

import type { BlastRadius } from '@/shared/types';

// --- Decision Framework ---

export interface DecisionRequest {
  entityId: string;
  title: string;
  description: string;
  context: string;
  deadline?: Date;
  stakeholders: string[];
  constraints: string[];
  blastRadius: BlastRadius;
}

export interface DecisionBrief {
  id: string;
  title: string;
  options: DecisionOption[];
  recommendation: string;
  confidenceScore: number;
  blindSpots: string[];
  createdAt: Date;
}

export type StrategyType = 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type Reversibility = 'EASY' | 'MODERATE' | 'DIFFICULT' | 'IRREVERSIBLE';

export interface DecisionOption {
  id: string;
  label: string;
  strategy: StrategyType;
  description: string;
  pros: string[];
  cons: string[];
  estimatedCost: number;
  estimatedTimeline: string;
  riskLevel: RiskLevel;
  reversibility: Reversibility;
  secondOrderEffects: SecondOrderEffect[];
}

// --- Decision Matrix ---

export interface MatrixCriterion {
  id: string;
  name: string;
  weight: number;
  description?: string;
}

export interface MatrixScore {
  criterionId: string;
  optionId: string;
  score: number;
  rationale: string;
}

export interface OptionScore {
  optionId: string;
  label: string;
  weightedTotal: number;
  rank: number;
}

export interface MatrixResult {
  optionScores: OptionScore[];
  sensitivityAnalysis: SensitivityResult[];
  winner: string;
  margin: number;
}

export interface SensitivityResult {
  criterionId: string;
  criterionName: string;
  tippingWeight: number | null;
  impactOnRanking: 'NONE' | 'MINOR' | 'MAJOR';
}

// --- Pre-Mortem ---

export type TimeHorizon = '30_DAYS' | '90_DAYS' | '1_YEAR' | '3_YEARS';
export type FailureCategory = 'FINANCIAL' | 'OPERATIONAL' | 'REPUTATIONAL' | 'LEGAL' | 'TECHNICAL';

export interface PreMortemRequest {
  decisionId: string;
  chosenOptionId: string;
  timeHorizon: TimeHorizon;
}

export interface PreMortemResult {
  failureScenarios: FailureScenario[];
  mitigationPlan: MitigationStep[];
  overallRiskScore: number;
  killSignals: string[];
}

export interface FailureScenario {
  id: string;
  description: string;
  probability: RiskLevel;
  impact: RiskLevel;
  category: FailureCategory;
  rootCause: string;
}

export interface MitigationStep {
  scenarioId: string;
  action: string;
  owner: string;
  deadline?: Date;
  cost?: number;
}

// --- Second-Order Effects ---

export interface SecondOrderEffect {
  id: string;
  description: string;
  order: 1 | 2 | 3;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  likelihood: number;
  affectedAreas: string[];
  parentEffectId?: string;
}

export interface EffectsTree {
  rootAction: string;
  effects: SecondOrderEffect[];
  totalPositive: number;
  totalNegative: number;
  netSentiment: number;
}

// --- Decision Journal ---

export type JournalStatus = 'PENDING_REVIEW' | 'REVIEWED_CORRECT' | 'REVIEWED_INCORRECT' | 'REVIEWED_MIXED';

export interface JournalEntry {
  id: string;
  entityId: string;
  decisionId?: string;
  title: string;
  context: string;
  optionsConsidered: string[];
  chosenOption: string;
  rationale: string;
  expectedOutcomes: string[];
  actualOutcomes?: string[];
  reviewDate: Date;
  status: JournalStatus;
  lessonsLearned?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DecisionAccuracy {
  total: number;
  correct: number;
  incorrect: number;
  mixed: number;
  accuracy: number;
}

// --- Research Agent ---

export type ResearchDepth = 'QUICK' | 'STANDARD' | 'DEEP';
export type SourceType = 'WEB' | 'DOCUMENT' | 'KNOWLEDGE';

export interface ResearchRequest {
  query: string;
  entityId: string;
  depth: ResearchDepth;
  sourceTypes: SourceType[];
  maxSources: number;
}

export type SourceQuality = 'ai' | 'knowledge-base' | 'generated';

export interface ResearchReport {
  id: string;
  query: string;
  summary: string;
  findings: ResearchFinding[];
  sources: ResearchSource[];
  confidenceScore: number;
  gaps: string[];
  sourceQuality: SourceQuality;
  createdAt: Date;
}

export interface ResearchFinding {
  claim: string;
  evidence: string;
  sourceIds: string[];
  confidence: number;
}

export interface ResearchSource {
  id: string;
  type: SourceType;
  title: string;
  url?: string;
  credibilityScore: number;
  excerpt: string;
  accessedAt: Date;
}

export interface DocumentAnalysis {
  keyTerms: string[];
  risks: { description: string; severity: RiskLevel }[];
  obligations: { party: string; obligation: string; deadline?: string }[];
  summary: string;
}
