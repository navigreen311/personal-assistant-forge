# Worker 15: Security, Privacy & Compliance + Data Governance (M13)

## Branch: ai-feature/w15-security

Create and check out the branch `ai-feature/w15-security` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/security/services/` -- Security, compliance, and data governance services
- `src/modules/security/types/` -- Security-specific TypeScript types
- `src/modules/security/tests/` -- Security module co-located tests
- `src/shared/middleware/security.ts` -- Security middleware (audit logging, input sanitization, rate limiting)
- `src/shared/middleware/compliance.ts` -- Compliance middleware (data classification enforcement, consent checks)
- `tests/unit/security/` -- Security unit tests

**IMPORTANT**: Worker 02 (auth) owns all auth-related files (`src/modules/auth/`, `src/shared/middleware/auth.ts`, etc.). This worker owns security SERVICES and COMPLIANCE logic, NOT authentication or authorization. Do not create any auth middleware or login/session files.

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files. They define the project contracts:

1. **`prisma/schema.prisma`** -- Note `ConsentReceipt` model (actionId, description, reason, impacted[], reversible, rollbackLink, confidence), `ActionLog` model (actor, actorId, actionType, target, reason, blastRadius, reversible, rollbackPath, status, cost), and `Entity` model (complianceProfile[]). The `complianceProfile` field on Entity stores arrays like `['HIPAA', 'GDPR']`.
2. **`src/shared/types/index.ts`** -- Key types: `Sensitivity` (`'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED' | 'REGULATED'`), `ComplianceProfile` (`'HIPAA' | 'GDPR' | 'CCPA' | 'SOX' | 'SEC' | 'REAL_ESTATE' | 'GENERAL'`), `ConsentReceipt`, `ActionLog`, `ActionActor`, `BlastRadius`, `Contact`, `Message`, `Document`, `Entity`.
3. **`src/shared/utils/api-response.ts`** -- Use `success()`, `error()` for API responses.
4. **`src/lib/db/index.ts`** -- Import `prisma` from `@/lib/db` for database operations.
5. **`package.json`** -- Dependencies include `zod`, `uuid`, `date-fns`.
6. **`tsconfig.json`** -- Path alias `@/*` maps to `./src/*`.

## Requirements

### 1. Security Module Types (`src/modules/security/types/index.ts`)

```typescript
// --- Data Classification Types ---

export type DataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED' | 'REGULATED';

export interface ClassificationResult {
  classification: DataClassification;
  confidence: number; // 0-1
  reasons: string[];
  regulatoryFlags: ComplianceFlag[];
  autoApplied: boolean; // was this auto-classified or manual?
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
  value: string; // the matched text
  redactedValue: string; // the redacted version
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export interface RedactionResult {
  originalLength: number;
  redactedText: string;
  matches: SensitiveDataMatch[];
  matchCount: number;
  categories: string[]; // unique categories found
}

// --- Vault Types ---

export interface VaultEntry {
  id: string;
  entityId: string;
  category: 'PASSWORD' | 'FINANCIAL' | 'MEDICAL' | 'LEGAL' | 'PERSONAL' | 'API_KEY';
  label: string;
  encryptedValue: string; // AES-256-GCM encrypted
  iv: string; // initialization vector
  authTag: string; // GCM authentication tag
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
  maxAccessWithoutReauth: number; // re-require auth after N accesses
  allowedCategories: VaultEntry['category'][];
}

// --- Retention Policy Types ---

export interface RetentionPolicy {
  id: string;
  name: string;
  entityId?: string; // null = global
  dataType: string; // e.g., "Message", "ActionLog", "Document"
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
  legalBasis?: string; // GDPR legal basis
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
  entityId?: string; // null = all entities
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  scope: 'FULL' | 'SELECTIVE';
  selectedCategories?: string[];
  affectedSystems: string[];
  retainedData?: string[]; // data retained for legal hold
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
  outputId: string; // ID of the AI-generated output
  outputType: string; // e.g., "DRAFT_EMAIL", "TASK_SUGGESTION", "DOCUMENT"
  sourceDocuments: ProvenanceSource[];
  modelUsed?: string;
  prompt?: string; // redacted version
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
  hash?: string; // for tamper detection
  previousHash?: string; // chain hash for tamper-proofing
}

// --- Cross-Border Types ---

export interface DataResidencyConfig {
  entityId: string;
  primaryRegion: string; // e.g., "us-east-1"
  allowedRegions: string[];
  restrictedRegions: string[];
  dataTypes: Record<string, string>; // dataType -> required region
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
```

### 2. Security Services

#### `src/modules/security/services/classification-service.ts` -- Data Classification

- `classifyContent(content: string, context?: { entityId?: string; dataType?: string; fieldName?: string }): ClassificationResult` -- Auto-classify content based on patterns and entity compliance profile.
- Classification rules (built-in, evaluated in priority order):
  - REGULATED: Content from entities with HIPAA/GDPR compliance profile containing PHI/PII patterns.
  - RESTRICTED: Contains SSN, credit card, bank account, medical record numbers, passwords.
  - CONFIDENTIAL: Contains financial data (amounts > $1000, account references), legal documents, contracts, personnel data.
  - INTERNAL: Business communications, project data, task details, meeting notes.
  - PUBLIC: Marketing content, published documents, public-facing data.
- `classifyRecord(model: string, recordId: string): Promise<ClassificationResult>` -- Classify an existing database record by reading its content.
- `addClassificationRule(rule: Omit<ClassificationRule, 'id'>): ClassificationRule` -- Add custom rule.
- `getClassificationRules(): ClassificationRule[]` -- List all rules.
- `reclassifyEntity(entityId: string): Promise<{ reclassified: number; changes: Array<{ recordId: string; oldClassification: string; newClassification: string }> }>` -- Re-scan all records for an entity.
- Entity compliance awareness: When an entity has `complianceProfile` including `HIPAA`, automatically elevate classification of any content containing health-related terms.

#### `src/modules/security/services/redaction-service.ts` -- Auto-Redaction Pipeline

- `redactContent(content: string, options?: { preserveFormat?: boolean; redactionChar?: string; categories?: ('PII' | 'PHI' | 'PCI' | 'FINANCIAL')[] }): RedactionResult` -- Scan content for sensitive data and redact.
- Detection patterns (regex-based):
  - **SSN**: `\b\d{3}-\d{2}-\d{4}\b` -> `***-**-****`
  - **Credit Card**: `\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b` -> `****-****-****-XXXX` (preserve last 4)
  - **Bank Account**: `\b\d{8,17}\b` in context of "account", "routing" -> `********`
  - **Phone**: `\b(\+1)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b` -> `(***) ***-XXXX` (preserve last 4)
  - **Email**: standard email regex -> `u***@domain.com` (preserve first char and domain)
  - **DOB**: date patterns in context of "born", "birthday", "DOB" -> `**/**/****`
  - **Medical Record Number**: `\bMRN[\s:#]?\d{6,10}\b` -> `MRN:******`
  - **Diagnosis/Medication**: keyword lists for common diagnoses and medications -> `[REDACTED_MEDICAL]`
  - **IP Address**: `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b` -> `***.***.***.***`
  - **Driver's License**: state-specific patterns -> `DL:********`
  - **Address**: multi-line address patterns (number + street + city/state/zip) -> `[REDACTED_ADDRESS]`
- `redactForIndexing(content: string): string` -- Aggressive redaction for search index ingestion: all PII/PHI/PCI removed, only content words remain.
- `detectSensitiveData(content: string): SensitiveDataMatch[]` -- Detect without redacting (for classification use).
- `getRedactionStats(): { totalRedacted: number; byCategory: Record<string, number>; byType: Record<string, number> }` -- Track redaction statistics.

#### `src/modules/security/services/vault-service.ts` -- Sensitive Content Vault

- `storeInVault(params: { entityId: string; category: VaultEntry['category']; label: string; value: string; metadata?: Record<string, string>; expiresAt?: Date; createdBy: string }): Promise<Omit<VaultEntry, 'encryptedValue' | 'iv' | 'authTag'>>` -- Encrypt and store sensitive data. Return entry without the encrypted value.
- `retrieveFromVault(entryId: string, userId: string, reason: string): Promise<{ value: string; entry: VaultEntry }>` -- Decrypt and return. Log access. Require `reason` for audit trail.
- `listVaultEntries(entityId: string, category?: VaultEntry['category']): Promise<Array<Omit<VaultEntry, 'encryptedValue' | 'iv' | 'authTag'>>>` -- List entries without decrypted values.
- `deleteVaultEntry(entryId: string, userId: string, reason: string): Promise<void>` -- Delete with audit log.
- `getVaultAccessLog(entryId: string): Promise<VaultAccessEntry[]>` -- Retrieve access history.
- `rotateEncryptionKey(): Promise<{ reEncrypted: number }>` -- Re-encrypt all entries with new key.
- Encryption: Use Node.js `crypto` module with AES-256-GCM. Key derived from environment variable `VAULT_MASTER_KEY` using PBKDF2. If env var not set, use a placeholder with clear warning log.
- Re-authentication: After `maxAccessWithoutReauth` reads (default: 5), the next read should flag that re-authentication is required (set a boolean; actual re-auth is handled by auth module).

#### `src/modules/security/services/retention-service.ts` -- Retention Policy Engine

- `createPolicy(params: Omit<RetentionPolicy, 'id' | 'createdAt' | 'lastExecuted' | 'nextExecution'>): RetentionPolicy` -- Create retention policy.
- `getPolicy(policyId: string): RetentionPolicy | null` -- Get policy.
- `listPolicies(entityId?: string): RetentionPolicy[]` -- List policies (global + entity-specific).
- `updatePolicy(policyId: string, updates: Partial<RetentionPolicy>): RetentionPolicy` -- Update policy.
- `deletePolicy(policyId: string): void` -- Remove policy.
- `executePolicy(policyId: string): Promise<RetentionExecutionResult>` -- Execute the policy:
  - Query records of the specified `dataType` older than `retentionDays`.
  - If `classification` is specified, only target records matching that classification.
  - Check for legal holds -- skip records under active legal hold.
  - Apply action: DELETE (hard delete), ARCHIVE (move to archive with metadata), ANONYMIZE (replace PII with anonymized values).
  - Log execution in audit trail.
- `executeAllDuePolicies(): Promise<RetentionExecutionResult[]>` -- Run all active policies that are due.
- `previewPolicyExecution(policyId: string): Promise<{ recordCount: number; dataTypes: string[]; oldestRecord: Date; newestRecord: Date; legalHoldConflicts: number }>` -- Preview what would be affected without executing.
- Default policies (created for new entities):
  - ActionLog: 365 days, ARCHIVE.
  - Message (PUBLIC): 180 days, DELETE.
  - Message (CONFIDENTIAL+): 730 days, ARCHIVE.
  - Temporary files: 30 days, DELETE.

#### `src/modules/security/services/consent-service.ts` -- GDPR/CCPA Consent Management

- `recordConsent(params: Omit<ConsentRecord, 'id' | 'version'>): Promise<ConsentRecord>` -- Record a consent grant/revocation. Auto-increment version.
- `getConsent(contactId: string, entityId: string, consentType: ConsentRecord['consentType']): Promise<ConsentRecord | null>` -- Get current consent status.
- `getAllConsents(contactId: string): Promise<ConsentRecord[]>` -- All consent records for a contact.
- `revokeConsent(contactId: string, entityId: string, consentType: ConsentRecord['consentType']): Promise<ConsentRecord>` -- Revoke consent.
- `checkConsent(contactId: string, entityId: string, consentType: ConsentRecord['consentType']): Promise<boolean>` -- Quick check: is consent currently granted?
- `getExpiredConsents(): Promise<ConsentRecord[]>` -- Find consents that have expired and need renewal.
- `requestDataPortability(contactId: string, entityId: string, format: 'JSON' | 'CSV' | 'PDF', categories?: string[]): Promise<DataPortabilityExport>` -- Initiate data export.
- `generateDataExport(exportId: string): Promise<DataPortabilityExport>` -- Generate the export file. Collect all data for the contact across all models (Messages, Tasks, Calls, Documents, etc.), package in requested format.
- `requestDeletion(contactId: string, entityId?: string, scope?: 'FULL' | 'SELECTIVE', categories?: string[]): Promise<DeletionRequest>` -- Initiate right-to-be-forgotten.
- `executeDeletion(deletionId: string): Promise<DeletionRequest>` -- Execute the deletion:
  - Find all records referencing the contact across all models.
  - Check for legal holds -- retain flagged data with notation.
  - Delete or anonymize records.
  - Update all search indexes.
  - Log in audit trail.
  - Update deletion request status.
- `getDeletionStatus(deletionId: string): Promise<DeletionRequest>` -- Check deletion progress.

#### `src/modules/security/services/compliance-service.ts` -- HIPAA & Compliance Mode

- `getComplianceProfile(entityId: string): Promise<ComplianceProfile[]>` -- Read entity's compliance profiles.
- `isHIPAAEntity(entityId: string): Promise<boolean>` -- Quick check for HIPAA compliance requirement.
- `enforceHIPAA(content: string, entityId: string): Promise<{ compliant: boolean; violations: string[]; autoRedacted: string; recommendations: string[] }>` -- Check content for HIPAA compliance. Auto-redact PHI if found. Return violations and recommendations.
- `enforceGDPR(actionType: string, contactId: string, entityId: string): Promise<{ compliant: boolean; violations: string[]; requiredConsents: string[] }>` -- Check if action has required consents under GDPR.
- `enforceCCPA(actionType: string, contactId: string, entityId: string): Promise<{ compliant: boolean; violations: string[]; requiredNotices: string[] }>` -- CCPA compliance check.
- `getComplianceReport(entityId: string): Promise<{ profile: ComplianceProfile[]; status: 'COMPLIANT' | 'AT_RISK' | 'NON_COMPLIANT'; findings: ComplianceFinding[]; score: number }>` -- Overall compliance health check.
- `ComplianceFinding`: `{ regulation, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', description, recommendation, affectedRecords: number }`.
- HIPAA-specific rules:
  - All PHI must be encrypted at rest (vault service).
  - Access to PHI must be logged (audit service).
  - PHI transmission must be flagged if going to non-HIPAA-compliant channels.
  - Minimum necessary standard: only disclose the minimum PHI necessary.

#### `src/modules/security/services/legal-hold-service.ts` -- Legal Hold & eDiscovery

- `createLegalHold(params: Omit<LegalHold, 'id' | 'createdAt' | 'releasedAt'>): Promise<LegalHold>` -- Create a legal hold.
- `releaseLegalHold(holdId: string): Promise<LegalHold>` -- Release the hold.
- `getLegalHold(holdId: string): Promise<LegalHold | null>` -- Get hold details.
- `listLegalHolds(entityId: string, status?: 'ACTIVE' | 'RELEASED'): Promise<LegalHold[]>` -- List holds.
- `isRecordUnderHold(model: string, recordId: string): Promise<boolean>` -- Check if a record is covered by any active legal hold. Evaluate hold scope (contactIds, projectIds, dateRange, dataTypes, keywords) against the record.
- `getHeldRecords(holdId: string): Promise<Array<{ model: string; recordId: string; reason: string }>>` -- List all records under a specific hold.
- `exportForDiscovery(holdId: string, format: 'JSON' | 'CSV'): Promise<{ data: string; recordCount: number }>` -- Export held records for legal review.

#### `src/modules/security/services/provenance-service.ts` -- AI Output Provenance

- `recordProvenance(params: Omit<ProvenanceRecord, 'id' | 'createdAt'>): Promise<ProvenanceRecord>` -- Record the provenance of an AI-generated output.
- `getProvenance(outputId: string): Promise<ProvenanceRecord | null>` -- Get provenance for an output.
- `getSourceUsage(sourceId: string): Promise<ProvenanceRecord[]>` -- Find all outputs that used a specific source.
- `validateProvenance(outputId: string): Promise<{ valid: boolean; missingSource: boolean; sourceAvailable: boolean[] }>` -- Verify that all cited sources still exist and are accessible.

#### `src/modules/security/services/audit-service.ts` -- Tamper-Proof Audit Logging

- `logAuditEntry(params: Omit<AuditLogEntry, 'id' | 'timestamp' | 'hash' | 'previousHash'>): Promise<AuditLogEntry>` -- Create an audit log entry. Calculate SHA-256 hash of the entry content. Chain to previous entry's hash for tamper detection.
- `getAuditLog(filters: { entityId?: string; actor?: string; resource?: string; dateRange?: { from: Date; to: Date }; sensitivityLevel?: DataClassification }, page?: number, pageSize?: number): Promise<{ data: AuditLogEntry[]; total: number }>` -- Paginated audit log.
- `verifyAuditChain(entityId: string, dateRange: { from: Date; to: Date }): Promise<{ valid: boolean; brokenAt?: string; checkedEntries: number }>` -- Verify the hash chain has not been tampered with. Walk through entries chronologically, recalculate each hash, and verify chain links.
- `exportAuditLog(entityId: string, dateRange: { from: Date; to: Date }, format: 'JSON' | 'CSV'): Promise<string>` -- Export for compliance reporting.
- Hash calculation: `SHA-256(JSON.stringify({ timestamp, actor, action, resource, details, previousHash }))`.

### 3. Security Middleware

#### `src/shared/middleware/security.ts`

```typescript
// Audit logging middleware for API routes
export function withAuditLog(handler: NextApiHandler, options?: {
  sensitivityLevel?: DataClassification;
  logRequestBody?: boolean;
  logResponseBody?: boolean;
}): NextApiHandler;

// Input sanitization middleware
export function withInputSanitization(handler: NextApiHandler): NextApiHandler;
// - Strip HTML tags from string inputs
// - Escape special characters
// - Validate and sanitize URL parameters
// - Reject inputs exceeding max length (configurable, default 10000 chars)
// - Detect and block common injection patterns (SQL, XSS, NoSQL)

// API rate limiting middleware
export function withRateLimit(handler: NextApiHandler, config: RateLimitConfig): NextApiHandler;
// - Track requests per window per key (in-memory Map for dev, Redis for prod)
// - Return 429 Too Many Requests with Retry-After header when exceeded
// - Support burst allowance for short traffic spikes
// - Different limits per endpoint

// Combined security middleware (applies all three)
export function withSecurity(handler: NextApiHandler, options?: {
  rateLimit?: RateLimitConfig;
  sensitivityLevel?: DataClassification;
  sanitize?: boolean;
  audit?: boolean;
}): NextApiHandler;
```

#### `src/shared/middleware/compliance.ts`

```typescript
// Data classification enforcement middleware
export function withClassificationEnforcement(handler: NextApiHandler, options: {
  requiredClassification?: DataClassification;
  entityAware?: boolean; // auto-detect from entity's complianceProfile
}): NextApiHandler;
// - Check if the request/response data meets classification requirements
// - Auto-redact sensitive data in responses if classification exceeds allowed level
// - Log classification violations

// Consent verification middleware
export function withConsentCheck(handler: NextApiHandler, options: {
  consentType: ConsentRecord['consentType'];
  contactIdParam: string; // request parameter containing contactId
}): NextApiHandler;
// - Before processing, check if the contact has granted required consent
// - Block processing and return 403 if consent not granted
// - Log consent check in audit trail

// HIPAA guard middleware
export function withHIPAAGuard(handler: NextApiHandler): NextApiHandler;
// - Auto-detect if the entity is HIPAA-regulated
// - If yes: enforce PHI redaction in responses, ensure audit logging, check access authorization
// - If no: pass through without additional checks
```

### 4. No UI Components for This Worker

This worker focuses on backend services and middleware. There are no dashboard pages or UI components. The security features will be consumed by other modules through:
- Direct service imports in their backend code.
- Middleware wrappers on their API routes.
- Types imported from `src/modules/security/types/`.

## Acceptance Criteria

1. All TypeScript types compile without errors.
2. Data classification service correctly classifies content across all 5 levels (PUBLIC through REGULATED).
3. Classification is entity-aware: HIPAA entities auto-elevate health data classification.
4. Redaction service detects and redacts all specified PII/PHI/PCI patterns.
5. Redaction preserves useful partial data where safe (last 4 of CC, first char of email).
6. Vault service encrypts with AES-256-GCM and logs all access.
7. Retention policies execute correctly: delete, archive, and anonymize with legal hold awareness.
8. Consent management supports full GDPR lifecycle: grant, revoke, check, export, delete.
9. Right-to-be-forgotten deletes or anonymizes all contact data across systems.
10. Legal hold prevents deletion of held records.
11. Provenance service links every AI output to its sources.
12. Audit log uses hash chaining for tamper detection, and verification catches tampering.
13. Security middleware: input sanitization blocks injection attacks, rate limiter returns 429 correctly.
14. Compliance middleware: HIPAA guard auto-activates for HIPAA entities, consent check blocks unauthorized processing.
15. All API responses use `success()` and `error()` from shared utils.
16. No modifications to shared types, api-response, db/index, or prisma schema.
17. No auth-related code (owned by Worker 02).
18. All unit tests pass.
19. No `any` types.

## Implementation Steps

1. **Read context files**: Read all files listed in the Context section.
2. **Create branch**: `git checkout -b ai-feature/w15-security`
3. **Create security types**: `src/modules/security/types/index.ts`
4. **Implement classification service**: `src/modules/security/services/classification-service.ts`
5. **Implement redaction service**: `src/modules/security/services/redaction-service.ts`
6. **Implement vault service**: `src/modules/security/services/vault-service.ts`
7. **Implement retention service**: `src/modules/security/services/retention-service.ts`
8. **Implement consent service**: `src/modules/security/services/consent-service.ts`
9. **Implement compliance service**: `src/modules/security/services/compliance-service.ts`
10. **Implement legal hold service**: `src/modules/security/services/legal-hold-service.ts`
11. **Implement provenance service**: `src/modules/security/services/provenance-service.ts`
12. **Implement audit service**: `src/modules/security/services/audit-service.ts`
13. **Implement security middleware**: `src/shared/middleware/security.ts`
14. **Implement compliance middleware**: `src/shared/middleware/compliance.ts`
15. **Write tests**: All test files.
16. **Type-check**: `npx tsc --noEmit`
17. **Run tests**: `npx jest tests/unit/security/`

## Tests

### `tests/unit/security/classification-service.test.ts`
```typescript
describe('ClassificationService', () => {
  describe('classifyContent', () => {
    it('should classify SSN-containing content as RESTRICTED');
    it('should classify credit card numbers as RESTRICTED');
    it('should classify medical record numbers as REGULATED for HIPAA entities');
    it('should classify financial data over $1000 as CONFIDENTIAL');
    it('should classify generic business email as INTERNAL');
    it('should classify marketing content as PUBLIC');
    it('should elevate classification for HIPAA entities when health terms present');
    it('should return confidence and reasons');
    it('should detect multiple regulatory flags');
  });

  describe('addClassificationRule', () => {
    it('should add custom rule and apply it');
    it('should respect rule priority ordering');
  });

  describe('reclassifyEntity', () => {
    it('should reclassify all records for the entity');
    it('should report classification changes');
  });
});
```

### `tests/unit/security/redaction-service.test.ts`
```typescript
describe('RedactionService', () => {
  describe('redactContent', () => {
    it('should redact SSN pattern 123-45-6789 to ***-**-****');
    it('should redact credit card 4111-1111-1111-1234 preserving last 4');
    it('should redact phone numbers preserving last 4');
    it('should redact email preserving first char and domain');
    it('should redact medical record numbers');
    it('should redact IP addresses');
    it('should handle content with multiple sensitive items');
    it('should handle content with no sensitive data (return unchanged)');
    it('should respect category filter (only redact specified categories)');
    it('should return accurate match positions (startIndex, endIndex)');
    it('should count matches by category');
  });

  describe('redactForIndexing', () => {
    it('should aggressively remove all PII/PHI/PCI');
    it('should preserve non-sensitive content words');
  });

  describe('detectSensitiveData', () => {
    it('should detect without modifying content');
    it('should return all matches with types and positions');
  });
});
```

### `tests/unit/security/vault-service.test.ts`
```typescript
describe('VaultService', () => {
  describe('storeInVault', () => {
    it('should encrypt value with AES-256-GCM');
    it('should return entry without encrypted value');
    it('should generate unique IV for each entry');
  });

  describe('retrieveFromVault', () => {
    it('should decrypt and return the original value');
    it('should log access with userId and reason');
    it('should throw for non-existent entry');
    it('should flag re-authentication needed after max accesses');
  });

  describe('listVaultEntries', () => {
    it('should return entries without encrypted values');
    it('should filter by category');
  });

  describe('deleteVaultEntry', () => {
    it('should remove entry and log deletion');
  });
});
```

### `tests/unit/security/retention-service.test.ts`
```typescript
describe('RetentionService', () => {
  describe('executePolicy', () => {
    it('should delete records older than retention period');
    it('should archive records when action is ARCHIVE');
    it('should anonymize records when action is ANONYMIZE');
    it('should skip records under legal hold');
    it('should only target matching classification');
    it('should log execution results');
  });

  describe('previewPolicyExecution', () => {
    it('should return count of affected records without executing');
    it('should report legal hold conflicts');
  });
});
```

### `tests/unit/security/consent-service.test.ts`
```typescript
describe('ConsentService', () => {
  describe('recordConsent', () => {
    it('should create consent record with GRANTED status');
    it('should auto-increment version');
  });

  describe('checkConsent', () => {
    it('should return true for granted consent');
    it('should return false for revoked consent');
    it('should return false for expired consent');
    it('should return false for no consent record');
  });

  describe('requestDeletion', () => {
    it('should create deletion request with PENDING status');
    it('should scope to specific entity or all entities');
  });

  describe('executeDeletion', () => {
    it('should delete all contact data');
    it('should respect legal holds (retain held data)');
    it('should update deletion status to COMPLETED');
    it('should log in audit trail');
  });
});
```

### `tests/unit/security/compliance-service.test.ts`
```typescript
describe('ComplianceService', () => {
  describe('enforceHIPAA', () => {
    it('should detect PHI in content');
    it('should auto-redact PHI');
    it('should return violations for unprotected PHI');
    it('should pass content without PHI');
  });

  describe('enforceGDPR', () => {
    it('should require consent for data processing');
    it('should block processing without consent');
    it('should pass when consent is granted');
  });

  describe('getComplianceReport', () => {
    it('should return COMPLIANT when no violations');
    it('should return AT_RISK with findings');
    it('should calculate compliance score');
  });
});
```

### `tests/unit/security/audit-service.test.ts`
```typescript
describe('AuditService', () => {
  describe('logAuditEntry', () => {
    it('should create entry with SHA-256 hash');
    it('should chain to previous entry hash');
    it('should set timestamp');
  });

  describe('verifyAuditChain', () => {
    it('should return valid for untampered chain');
    it('should detect tampering (modified entry)');
    it('should detect tampering (deleted entry breaking chain)');
    it('should report the entry where chain breaks');
  });

  describe('getAuditLog', () => {
    it('should filter by entity');
    it('should filter by date range');
    it('should filter by sensitivity level');
    it('should paginate results');
  });
});
```

### `tests/unit/security/middleware-security.test.ts`
```typescript
describe('Security Middleware', () => {
  describe('withInputSanitization', () => {
    it('should strip HTML tags from input');
    it('should block SQL injection patterns');
    it('should block XSS script injection');
    it('should reject inputs exceeding max length');
    it('should pass clean inputs unchanged');
  });

  describe('withRateLimit', () => {
    it('should allow requests within limit');
    it('should return 429 when limit exceeded');
    it('should include Retry-After header');
    it('should reset after window expires');
    it('should support burst allowance');
  });

  describe('withAuditLog', () => {
    it('should log request details after handler completes');
    it('should include actor and resource info');
    it('should respect sensitivityLevel option');
  });
});
```

### `tests/unit/security/middleware-compliance.test.ts`
```typescript
describe('Compliance Middleware', () => {
  describe('withConsentCheck', () => {
    it('should allow request when consent is granted');
    it('should block request (403) when consent not granted');
    it('should log consent check in audit');
  });

  describe('withHIPAAGuard', () => {
    it('should activate for HIPAA entities');
    it('should pass through for non-HIPAA entities');
    it('should redact PHI in responses for HIPAA entities');
    it('should enforce audit logging for HIPAA entities');
  });

  describe('withClassificationEnforcement', () => {
    it('should block response data exceeding allowed classification');
    it('should auto-redact when entityAware mode detects sensitive content');
  });
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(security): add comprehensive security, compliance, and data governance types`
   - Files: `src/modules/security/types/index.ts`
2. `feat(security): implement data classification service with entity-aware compliance detection`
   - Files: `src/modules/security/services/classification-service.ts`
3. `feat(security): implement PII/PHI/PCI auto-redaction pipeline with pattern detection`
   - Files: `src/modules/security/services/redaction-service.ts`
4. `feat(security): implement encrypted vault service with AES-256-GCM and access logging`
   - Files: `src/modules/security/services/vault-service.ts`
5. `feat(security): implement retention policy engine with legal hold awareness`
   - Files: `src/modules/security/services/retention-service.ts`
6. `feat(security): implement GDPR/CCPA consent management with data portability and right-to-be-forgotten`
   - Files: `src/modules/security/services/consent-service.ts`
7. `feat(security): implement HIPAA compliance enforcement and compliance reporting`
   - Files: `src/modules/security/services/compliance-service.ts`
8. `feat(security): implement legal hold and eDiscovery support`
   - Files: `src/modules/security/services/legal-hold-service.ts`
9. `feat(security): implement AI output provenance tracking with source linking`
   - Files: `src/modules/security/services/provenance-service.ts`
10. `feat(security): implement tamper-proof audit logging with hash chain verification`
    - Files: `src/modules/security/services/audit-service.ts`
11. `feat(security): add security middleware for audit logging, input sanitization, and rate limiting`
    - Files: `src/shared/middleware/security.ts`
12. `feat(security): add compliance middleware for classification enforcement, consent checks, and HIPAA guard`
    - Files: `src/shared/middleware/compliance.ts`
13. `test(security): add unit tests for classification, redaction, vault, retention, consent, compliance, audit, and middleware`
    - Files: `tests/unit/security/*.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
