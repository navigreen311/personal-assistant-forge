// Services
export {
  generateScorecard,
  getScorecardHistory,
  getGradeBreakdown,
  scoreToGrade,
} from './services/accuracy-scorecard-service';
export { detectBias, getAffectedGroups } from './services/bias-detection-service';
export {
  addCitation,
  getProvenance,
  verifyCitation,
} from './services/citation-service';
export {
  calculateConfidence,
  getConfidenceDistribution,
} from './services/confidence-service';
export {
  createTestSuite,
  addTestCase,
  runTestSuite,
  getTestSuites,
  getRegressionReport,
  compareOutputs,
} from './services/golden-test-service';
export {
  recordOverride,
  analyzeOverrides,
  getOverridePatterns,
} from './services/override-tracking-service';

// Types
export type {
  AccuracyScorecard,
  GoldenTestCase,
  GoldenTestSuite,
  GoldenTestResult,
  ConfidenceScore,
  OverrideRecord,
  OverrideAnalysis,
  BiasReport,
  BiasDimension,
  CitationRecord,
  ProvenanceChain,
} from './types';
