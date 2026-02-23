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
export type { Playbook, PlaybookStep } from './call-playbook';
