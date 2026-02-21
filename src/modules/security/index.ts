// RBAC
export {
  ROLE_PERMISSIONS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getPermissions,
} from './rbac';
export type { UserRole, Permission } from './rbac';

// Services
export { AuditService, auditService } from './services/audit-service';
export { ClassificationService, classificationService } from './services/classification-service';
export { ComplianceService, complianceService } from './services/compliance-service';
export { ConsentService, consentService } from './services/consent-service';
export { LegalHoldService, legalHoldService } from './services/legal-hold-service';
export { ProvenanceService, provenanceService } from './services/provenance-service';
export { RedactionService, redactionService } from './services/redaction-service';
export { RetentionService, retentionService } from './services/retention-service';
export { VaultService, vaultService } from './services/vault-service';

// Types
export type {
  DataClassification,
  ClassificationResult,
  ComplianceFlag,
  ClassificationRule,
  ClassificationPattern,
  SensitiveDataType,
  SensitiveDataMatch,
  RedactionResult,
  VaultEntry,
  VaultAccessEntry,
  VaultConfig,
  RetentionPolicy,
  RetentionExecutionResult,
  ConsentRecord,
  DataPortabilityExport,
  DeletionRequest,
  LegalHold,
  LegalHoldScope,
  ProvenanceRecord,
  ProvenanceSource,
  AuditLogEntry,
  DataResidencyConfig,
  RateLimitConfig,
  RateLimitResult,
  ComplianceFinding,
} from './types';
