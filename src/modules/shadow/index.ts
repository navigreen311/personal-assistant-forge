// Shadow Voice Agent — Module Barrel Export
// Re-exports all public APIs for the Shadow agent module.

// Core agent runtime
export { ShadowAgent } from './agent/core';

// Memory system
export { ShadowMemory } from './agent/memory';

// Tool router
export { ToolRouter } from './agent/tool-router';

// Intent classification
export { classifyIntent, getIntentMetadata, getIntentTools } from './agent/intent-classifier';

// Context engine
export { buildContext } from './agent/context-engine';

// Response generation
export { generateResponse } from './agent/response-generator';

// Outcome extraction
export {
  extractOutcomes,
  saveSessionOutcome,
  extractAndSaveOutcomes,
} from './agent/outcome-extractor';

// Risk scoring
export {
  computeRiskScore,
  isBusinessHours,
  getActionsInLastHour,
  isFirstTimeAction,
  isTrustedDevice,
} from './agent/risk-scorer';

// Types
export type {
  ShadowResponse,
  Citation,
  ActionCard,
  NavigationCard,
  DecisionCard,
  ClassifiedIntent,
  IntentCategory,
  AgentContext,
  ToolDefinition,
  ToolResult,
  ToolExecutionParams,
  MessageTelemetry,
  RiskFactors,
  RiskAssessment,
  SessionMessage,
  ExtractedOutcome,
  ConfirmationRequest,
} from './types';
