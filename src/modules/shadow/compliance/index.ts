// ============================================================================
// Shadow Voice Agent — Compliance Module Index
// Re-exports all compliance services for convenient importing.
// ============================================================================

export { RedactionPipeline, redactionPipeline } from './redaction';
export type { RedactionEntry, RedactionResult } from './redaction';

export { RetentionService, retentionService } from './retention';
export type { RetentionConfig, RetentionCleanupResult } from './retention';

export { RecordingConsentService, recordingConsentService } from './recording-consent';
export type { ConsentCheckParams, ConsentCheckResult, ConsentConfig } from './recording-consent';

export { DNCChecker, dncChecker } from './dnc-checker';
export type { DNCCheckResult } from './dnc-checker';

export { GDPRService, gdprService } from './gdpr-export';
export type { GDPRExportResult, GDPRDeleteResult, SelectiveDeleteParams } from './gdpr-export';

export { CallPlaybookService, callPlaybookService } from './call-playbook';
export type { Playbook } from './call-playbook';

// P-16 (Sprint 5). The engine that turns a stored playbook into the plan for
// one call, and the DNC/quiet-hours gate in front of it. Both `dnc-checker` and
// `recording-consent` were exported from this barrel already and called by
// nothing -- a barrel proves importability, not reachability.
export { CallPlannerService, callPlannerService } from './call-planner';
export type { CallPlan, PlanCallParams } from './call-planner';
export type { DNCCheckOptions } from './dnc-checker';
