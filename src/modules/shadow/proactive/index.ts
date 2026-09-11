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

// ---------------------------------------------------------------------------
// P-16 (Sprint 5). The caller, and the piece that had no home.
//
// Note what this barrel could NOT tell you before: every export above it was
// already here, and `notification-escalator`, `adaptive-channel` and
// `digest-optimizer` had zero live callers anyway. A barrel proves a module can
// be imported, not that anything calls it —
// docs/parallel-build/decision-02-throttle.md, the amendment.
// ---------------------------------------------------------------------------

export {
  EndOfDaySummaryService,
  endOfDaySummaryService,
} from './end-of-day';
export type { EodContent, EodTask } from './end-of-day';

export {
  runProactiveTick,
  acknowledgeEscalation,
  effectivenessChannelOf,
  isWithinScheduleWindow,
  localTimeOfDay,
  localDate,
  loadEndOfDayPrefs,
  escalationKey,
} from './proactive-runner';
export type { ProactiveTickResult, ProactiveTickOptions } from './proactive-runner';
