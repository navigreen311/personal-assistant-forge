// Proactive Intelligence Module — Barrel Export

export {
  MorningBriefingService,
  morningBriefingService,
} from './morning-briefing';
export type {
  BriefingContent,
  BriefingCalendarEvent,
  BriefingTask,
  BriefingRecommendation,
} from './morning-briefing';

export {
  NotificationEscalator,
  notificationEscalator,
} from './notification-escalator';
export type {
  EscalationParams,
  EscalationPriority,
  EscalationState,
  EscalationStep,
  EscalationResult,
} from './notification-escalator';

export {
  SuggestionEngine,
  suggestionEngine,
} from './suggestion-engine';
export type {
  Suggestion,
  TriggerEvaluation,
  TriggerType,
} from './suggestion-engine';

export {
  AdaptiveChannelService,
  adaptiveChannelService,
} from './adaptive-channel';
export type { ChannelStats } from './adaptive-channel';

export {
  DigestOptimizer,
  digestOptimizer,
} from './digest-optimizer';
export type { DigestItem, DigestOutput } from './digest-optimizer';

export {
  WorkflowCompanionService,
  workflowCompanionService,
} from './workflow-companion';
export type {
  CompanionState,
  CompanionStartParams,
  StepChoiceParams,
  NavigateAction,
} from './workflow-companion';

export {
  EntityPersonaService,
  entityPersonaService,
} from './entity-persona';
export type {
  EntityProfile,
  SwitchParams,
  SwitchResult,
} from './entity-persona';
