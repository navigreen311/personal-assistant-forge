// ============================================================================
// Security, Privacy & Compliance — Type Definitions
// Worker 15: Data classification, redaction, vault, retention, consent,
// compliance, legal hold, provenance, audit logging
// ============================================================================

// --- Data Classification Types ---

export type DataClassification =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'CONFIDENTIAL'
  | 'RESTRICTED'
  | 'REGULATED';

export interface ClassificationResult {
  classification: DataClassification;
  confidence: number; // 0-1
  reasons: string[];
  regulatoryFlags: ComplianceFlag[];
  autoApplied: boolean;
}

export interface ComplianceFlag {
  regulation: 'HIPAA' | 'GDPR' | 'CCPA' | 'SOX' | 'SEC' | 'PCI';
  category: string; // e.g., "PHI", "PII", "Financial"
  description: string;
  requiredActions: string[];
}

export interface ClassificationRule {
  id: string;
  name: string;
  patterns: ClassificationPattern[];
  resultClassification: DataClassification;
  regulatoryFlags: ComplianceFlag[];
  priority: number;
  isActive: boolean;
}

export interface ClassificationPattern {
  type: 'KEYWORD' | 'REGEX' | 'FIELD_NAME' | 'CONTENT_TYPE' | 'ENTITY_COMPLIANCE';
  value: string;
}

// --- PII/PHI/PCI Detection Types ---

export type SensitiveDataType =
  | 'SSN'
  | 'CREDIT_CARD'
  | 'BANK_ACCOUNT'
  | 'DRIVERS_LICENSE'
  | 'PASSPORT'
  | 'DOB'
  | 'PHONE'
  | 'EMAIL'
  | 'ADDRESS'
  | 'MEDICAL_RECORD_NUMBER'
  | 'DIAGNOSIS'
  | 'MEDICATION'
  | 'HEALTH_CONDITION'
  | 'INSURANCE_ID'
  | 'IP_ADDRESS'
  | 'BIOMETRIC'
  | 'GENETIC'
  | 'TAX_ID';

export interface SensitiveDataMatch {
  type: SensitiveDataType;
  category: 'PII' | 'PHI' | 'PCI' | 'FINANCIAL';
  value: string;
  redactedValue: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export interface RedactionResult {
  originalLength: number;
  redactedText: string;
  matches: SensitiveDataMatch[];
  matchCount: number;
  categories: string[];
}

// --- Vault Types ---

export interface VaultEntry {
  id: string;
  entityId: string;
  category: 'PASSWORD' | 'FINANCIAL' | 'MEDICAL' | 'LEGAL' | 'PERSONAL' | 'API_KEY';
  label: string;
  encryptedValue: string;
  iv: string;
  authTag: string;
  metadata: Record<string, string>;
  classification: DataClassification;
  accessLog: VaultAccessEntry[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface VaultAccessEntry {
  userId: string;
  accessType: 'READ' | 'WRITE' | 'DELETE';
  timestamp: Date;
  reason: string;
  ipAddress?: string;
}

export interface VaultConfig {
  encryptionAlgorithm: 'aes-256-gcm';
  keyDerivation: 'pbkdf2' | 'argon2';
  keyRotationDays: number;
  maxAccessWithoutReauth: number;
  allowedCategories: VaultEntry['category'][];
}

// --- Retention Policy Types ---

export interface RetentionPolicy {
  id: string;
  name: string;
  entityId?: string;
  dataType: string;
  classification?: DataClassification;
  retentionDays: number;
  action: 'DELETE' | 'ARCHIVE' | 'ANONYMIZE';
  isActive: boolean;
  lastExecuted?: Date;
  nextExecution?: Date;
  createdAt: Date;
}

export interface RetentionExecutionResult {
  policyId: string;
  policyName: string;
  recordsProcessed: number;
  recordsDeleted: number;
  recordsArchived: number;
  recordsAnonymized: number;
  errors: string[];
  executedAt: Date;
}

// --- Consent Management Types ---

export interface ConsentRecord {
  id: string;
  contactId: string;
  entityId: string;
  consentType: 'DATA_PROCESSING' | 'MARKETING' | 'DATA_SHARING' | 'PROFILING' | 'AUTOMATED_DECISIONS';
  status: 'GRANTED' | 'REVOKED' | 'EXPIRED' | 'PENDING';
  grantedAt?: Date;
  revokedAt?: Date;
  expiresAt?: Date;
  method: 'EXPLICIT' | 'IMPLICIT' | 'OPT_OUT';
  purpose: string;
  legalBasis?: string;
  version: number;
  ipAddress?: string;
}

export interface DataPortabilityExport {
  id: string;
  contactId: string;
  entityId: string;
  format: 'JSON' | 'CSV' | 'PDF';
  status: 'PENDING' | 'GENERATING' | 'READY' | 'DOWNLOADED' | 'EXPIRED';
  dataCategories: string[];
  downloadUrl?: string;
  expiresAt?: Date;
  requestedAt: Date;
  completedAt?: Date;
}

export interface DeletionRequest {
  id: string;
  contactId: string;
  entityId?: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  scope: 'FULL' | 'SELECTIVE';
  selectedCategories?: string[];
  affectedSystems: string[];
  retainedData?: string[];
  requestedAt: Date;
  completedAt?: Date;
  verificationToken?: string;
}

// --- Legal Hold Types ---

export interface LegalHold {
  id: string;
  name: string;
  entityId: string;
  reason: string;
  scope: LegalHoldScope;
  status: 'ACTIVE' | 'RELEASED' | 'EXPIRED';
  createdBy: string;
  createdAt: Date;
  releasedAt?: Date;
  expiresAt?: Date;
}

export interface LegalHoldScope {
  contactIds?: string[];
  projectIds?: string[];
  dateRange?: { from: Date; to: Date };
  dataTypes?: string[];
  keywords?: string[];
}

// --- Provenance Types ---

export interface ProvenanceRecord {
  id: string;
  outputId: string;
  outputType: string;
  sourceDocuments: ProvenanceSource[];
  modelUsed?: string;
  prompt?: string;
  confidence: number;
  createdAt: Date;
}

export interface ProvenanceSource {
  sourceType: 'DOCUMENT' | 'MESSAGE' | 'KNOWLEDGE' | 'WEB' | 'USER_INPUT';
  sourceId: string;
  relevanceScore: number;
  excerpt?: string;
}

// --- Audit Types ---

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  actor: string;
  actorId?: string;
  action: string;
  resource: string;
  resourceId: string;
  entityId: string;
  ipAddress?: string;
  userAgent?: string;
  requestMethod: string;
  requestPath: string;
  statusCode: number;
  sensitivityLevel: DataClassification;
  details: Record<string, unknown>;
  hash?: string;
  previousHash?: string;
}

// --- Cross-Border Types ---

export interface DataResidencyConfig {
  entityId: string;
  primaryRegion: string;
  allowedRegions: string[];
  restrictedRegions: string[];
  dataTypes: Record<string, string>;
}

// --- Rate Limiting Types ---

export interface RateLimitConfig {
  endpoint: string;
  windowMs: number;
  maxRequests: number;
  keyGenerator: 'IP' | 'USER' | 'API_KEY' | 'ENTITY';
  burstAllowance?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterMs?: number;
}

// --- Compliance Finding Type ---

export interface ComplianceFinding {
  regulation: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  recommendation: string;
  affectedRecords: number;
}
