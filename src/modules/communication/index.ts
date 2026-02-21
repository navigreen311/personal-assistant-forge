// Services
export {
  renderTemplate,
  validateRecipients,
  sendBroadcast,
  scheduleBroadcast,
  getBroadcastHistory,
} from './services/broadcast-manager';
export {
  setCadence,
  getOverdueFollowUps,
  escalateFollowUp,
  getNextFollowUps,
  triggerCadenceReminders,
  getCadenceStatus,
} from './services/cadence-engine';
export {
  addCommitment,
  getOpenCommitments,
  markFulfilled,
  getOverdueCommitments,
  extractCommitmentsFromText,
  extractAndSaveCommitments,
} from './services/commitment-tracker';
export {
  generateDrafts,
  adaptToAudience,
  analyzeToneWithAI,
  analyzePowerDynamics,
  scanCompliance,
} from './services/drafting-engine';
export {
  calculateRelationshipScore,
  getRelationshipGraph,
  detectGhosting,
  suggestReengagement,
  getRelationshipInsights,
  getContactsNeedingAttention,
} from './services/relationship-intelligence';
export {
  analyzeTone,
  shiftTone,
  analyzeToneWithAI as analyzeToneWithAIService,
  shiftToneWithAI,
} from './services/tone-analyzer';

// Types
export type {
  RelationshipNode,
  RelationshipEdge,
  GhostingAnalysis,
  ReengagementStrategy,
  RecipientAnalysis,
  PowerDynamicAnalysis,
  DraftRequest,
  DraftVariant,
  DraftResponse,
  ComplianceScanResult,
  ComplianceFlag,
  ToneAnalysis,
  CadenceFrequency,
  FollowUpCadence,
  BroadcastRequest,
  BroadcastResult,
} from './types';
