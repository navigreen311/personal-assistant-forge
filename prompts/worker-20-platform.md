# Worker 20: Delegation, Attention, Onboarding, Admin, Documents, Developer Platform (M16 + M17 + M21 + M19 + M27 + M24)

## Branch: ai-feature/w20-platform

Create and check out the branch `ai-feature/w20-platform` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

```
src/modules/delegation/                # Delegation and shared workspace module
src/modules/attention/                 # Attention Governor module
src/modules/onboarding/                # Onboarding and setup wizard module
src/modules/admin/                     # Enterprise Admin module
src/modules/documents/                 # Document Studio module
src/modules/developer/                 # Developer Platform module
src/app/(dashboard)/delegation/        # Dashboard pages for delegation
src/app/(dashboard)/settings/          # Dashboard pages for settings (admin, preferences)
src/app/(dashboard)/onboarding/        # Dashboard pages for onboarding wizard
src/app/(dashboard)/documents/         # Dashboard pages for document studio
src/app/api/delegation/                # API routes for delegation
src/app/api/documents/                 # API routes for document studio
src/app/api/admin/                     # API routes for enterprise admin
tests/unit/platform/                   # All unit tests for this worker
```

## Context (read these first, do NOT modify)

Read and internalize these files before writing any code. They define the shared contracts.

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project-wide dev process, commit conventions, done criteria |
| `src/shared/types/index.ts` | Immutable shared types: `User`, `UserPreferences`, `Entity`, `Task`, `TaskStatus`, `Priority`, `Document`, `DocumentType`, `Citation`, `Workflow`, `WorkflowStep`, `WorkflowTrigger`, `Message`, `MessageChannel`, `Tone`, `Sensitivity`, `AutonomyLevel`, `BrandKit`, `ActionLog`, `ActionActor`, `BlastRadius`, `ApiResponse`, `ApiError`, `ApiMeta` |
| `prisma/schema.prisma` | Database schema: `User`, `Entity`, `Task`, `Document`, `Workflow`, `Message`, `ActionLog` models with fields and relations |
| `src/shared/utils/api-response.ts` | API helpers: `success<T>()`, `error()`, `paginated<T>()` -- use these in every route handler |
| `src/lib/db/index.ts` | Prisma client singleton: `import { prisma } from '@/lib/db'` |
| `package.json` | Stack: Next.js 16, React 19, Prisma 7, Zod 4, date-fns 4, Jest 30, ts-jest, uuid |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

## Requirements

### 1. Delegation Module (M16)

**Types file:** `src/modules/delegation/types.ts`

```typescript
export interface DelegationTask {
  id: string;
  taskId: string;              // links to shared Task
  delegatedBy: string;         // userId
  delegatedTo: string;         // userId or contactId
  contextPack: ContextPack;
  approvalChain: ApprovalStep[];
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  delegatedAt: Date;
  completedAt?: Date;
}

export interface ContextPack {
  summary: string;
  relevantDocuments: string[];
  relevantMessages: string[];
  relevantContacts: string[];
  deadlines: { description: string; date: Date }[];
  notes: string;
  permissions: string[];       // what the delegate can access
}

export interface ApprovalStep {
  order: number;
  approverId: string;
  approverName: string;
  role: 'AI_DRAFT' | 'EA_REVIEW' | 'USER_APPROVE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
  reviewedAt?: Date;
  comments?: string;
}

export interface DelegationInboxItem {
  taskId: string;
  taskTitle: string;
  reason: string;              // why this is delegatable
  suggestedDelegatee: string;
  estimatedTimeSavedMinutes: number;
  confidence: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface DelegationScore {
  delegateeId: string;
  delegateeName: string;
  categories: { category: string; score: number; tasksCompleted: number; averageQuality: number }[];
  overallScore: number;
  bestCategory: string;
  totalTasksDelegated: number;
}

export interface RolePermission {
  roleId: string;
  roleName: string;
  permissions: string[];       // e.g., "tasks.read", "tasks.write", "documents.read"
  entityScope: string[];       // which entities this role can access
  isDefault: boolean;
}
```

**Service file:** `src/modules/delegation/services/delegation-service.ts`

Implement:
- `delegateTask(taskId: string, delegatedBy: string, delegatedTo: string, contextPack: ContextPack): Promise<DelegationTask>` -- Creates a delegation with an auto-generated approval chain: AI_DRAFT -> EA_REVIEW -> USER_APPROVE.
- `getDelegatedTasks(userId: string, direction: 'delegated_by' | 'delegated_to'): Promise<DelegationTask[]>` -- Lists tasks delegated by or to a user.
- `advanceApproval(delegationId: string, stepOrder: number, status: 'APPROVED' | 'REJECTED', comments?: string): Promise<DelegationTask>` -- Advances the approval chain.
- `completeDelegation(delegationId: string): Promise<DelegationTask>` -- Marks the delegation complete.
- `buildContextPack(taskId: string): Promise<ContextPack>` -- Automatically gathers relevant documents, messages, contacts, and deadlines for a task.

**Service file:** `src/modules/delegation/services/delegation-inbox-service.ts`

Implement:
- `generateDelegationInbox(userId: string): Promise<DelegationInboxItem[]>` -- Analyzes user's tasks and identifies ones that can be delegated. Criteria: task is not P0, user has delegates available, task type matches a delegate's strength, task is not in the user's focus areas.
- `getDailySuggestions(userId: string): Promise<DelegationInboxItem[]>` -- Returns top 5 delegation suggestions for today.

**Service file:** `src/modules/delegation/services/delegation-scoring-service.ts`

Implement:
- `calculateScore(delegateeId: string): Promise<DelegationScore>` -- Scores a delegatee based on past delegations: completion rate, quality (approval on first pass), speed, and category performance.
- `getBestDelegate(category: string, entityId: string): Promise<{ delegateeId: string; score: number } | null>` -- Returns the best-scoring delegate for a category within an entity.
- `getScoreboard(entityId: string): Promise<DelegationScore[]>` -- Ranked list of delegates by overall score.

**Service file:** `src/modules/delegation/services/role-service.ts`

Implement:
- `createRole(role: Omit<RolePermission, 'roleId'>): Promise<RolePermission>` -- Creates a role with permissions.
- `getRoles(entityId: string): Promise<RolePermission[]>` -- Lists roles.
- `assignRole(userId: string, roleId: string): Promise<void>` -- Assigns a role to a user.
- `checkPermission(userId: string, permission: string, entityId: string): Promise<boolean>` -- Checks if a user has a specific permission for an entity (least privilege).
- `getDefaultRoles(): RolePermission[]` -- Returns built-in roles: Admin (all permissions), Editor (read + write), Viewer (read only), Delegate (tasks + limited documents).

### 2. Attention Governor (M17)

**Types file:** `src/modules/attention/types.ts`

```typescript
export interface AttentionBudget {
  userId: string;
  dailyBudget: number;        // max interruptions
  usedToday: number;
  remaining: number;
  resetAt: Date;               // midnight in user's timezone
}

export interface PriorityRouting {
  priority: 'P0' | 'P1' | 'P2';
  action: 'INTERRUPT' | 'NEXT_DIGEST' | 'WEEKLY_REVIEW' | 'SILENT';
  channels: string[];
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  source: string;
  priority: 'P0' | 'P1' | 'P2';
  routedAction: 'INTERRUPT' | 'NEXT_DIGEST' | 'WEEKLY_REVIEW' | 'SILENT';
  isRead: boolean;
  isBundled: boolean;
  bundleId?: string;
  createdAt: Date;
}

export interface NotificationBundle {
  id: string;
  userId: string;
  title: string;
  itemCount: number;
  items: NotificationItem[];
  priority: 'P0' | 'P1' | 'P2';
  createdAt: Date;
}

export interface DNDConfig {
  userId: string;
  isActive: boolean;
  mode: 'MANUAL' | 'FOCUS_HOURS' | 'CALENDAR_AWARE' | 'SMART';
  vipBreakthroughEnabled: boolean;
  vipContactIds: string[];
  startTime?: string;          // HH:mm
  endTime?: string;
  reason?: string;
}

export interface OneThingNowState {
  userId: string;
  isActive: boolean;
  currentTask?: { taskId: string; title: string; startedAt: Date };
  blockedNotifications: number;
  sessionDuration: number;      // minutes
}

export interface NotificationLearning {
  userId: string;
  patterns: { source: string; averageOpenRate: number; averageResponseTime: number; preferredTime: string }[];
  suggestions: string[];
}
```

**Service file:** `src/modules/attention/services/attention-budget-service.ts`

Implement:
- `getBudget(userId: string): Promise<AttentionBudget>` -- Returns current attention budget status. Resets at midnight in user's timezone.
- `consumeBudget(userId: string, amount?: number): Promise<{ allowed: boolean; budget: AttentionBudget }>` -- Attempts to consume 1 interruption from the budget. Returns false if budget exhausted.
- `setBudget(userId: string, dailyBudget: number): Promise<AttentionBudget>` -- Updates the daily budget.
- `resetBudget(userId: string): Promise<AttentionBudget>` -- Manually resets the budget.

**Service file:** `src/modules/attention/services/priority-router.ts`

Implement:
- `routeNotification(userId: string, notification: Omit<NotificationItem, 'id' | 'routedAction' | 'isRead' | 'isBundled' | 'createdAt'>): Promise<NotificationItem>` -- Routes a notification based on priority: P0 = INTERRUPT (if budget allows), P1 = NEXT_DIGEST, P2 = WEEKLY_REVIEW. Checks DND and budget before routing.
- `getRoutingConfig(userId: string): Promise<PriorityRouting[]>` -- Returns priority routing rules.
- `updateRoutingConfig(userId: string, config: PriorityRouting[]): Promise<void>` -- Updates routing rules.

**Service file:** `src/modules/attention/services/dnd-service.ts`

Implement:
- `getDNDConfig(userId: string): Promise<DNDConfig>` -- Returns current DND configuration.
- `setDND(userId: string, config: Partial<DNDConfig>): Promise<DNDConfig>` -- Activates/configures DND.
- `isDNDActive(userId: string): Promise<boolean>` -- Checks if DND is currently active (considers mode: MANUAL = check isActive, FOCUS_HOURS = check time range, CALENDAR_AWARE = check if in a meeting, SMART = combine all).
- `checkVIPBreakthrough(userId: string, contactId: string): Promise<boolean>` -- Returns true if the contact is a VIP and breakthrough is enabled.

**Service file:** `src/modules/attention/services/one-thing-now-service.ts`

Implement:
- `activate(userId: string, taskId: string, sessionMinutes?: number): Promise<OneThingNowState>` -- Activates single-task focus mode. Blocks all non-P0 notifications.
- `deactivate(userId: string): Promise<OneThingNowState>` -- Deactivates focus mode, releases blocked notifications.
- `getState(userId: string): Promise<OneThingNowState>` -- Returns current state.

**Service file:** `src/modules/attention/services/notification-bundler.ts`

Implement:
- `bundleNotifications(userId: string): Promise<NotificationBundle[]>` -- Groups unread P1/P2 notifications by source into bundles. E.g., "3 new Slack messages", "5 email updates".
- `getDigest(userId: string): Promise<NotificationBundle[]>` -- Returns the current notification digest (all unbundled P1 items).
- `getWeeklyReview(userId: string): Promise<NotificationBundle[]>` -- Returns bundled P2 items for weekly review.

**Service file:** `src/modules/attention/services/notification-learning-service.ts`

Implement:
- `analyzePatterns(userId: string): Promise<NotificationLearning>` -- Analyzes notification interaction patterns: which sources the user opens, response times, preferred times.
- `getSuggestions(userId: string): Promise<string[]>` -- Generates suggestions like "You rarely open Slack notifications after 6 PM. Mute them?" or "GitHub notifications have 95% open rate. Keep as P1."

**Components in `src/modules/attention/components/`:**

- `AttentionBudgetMeter.tsx` -- Visual meter showing remaining interruptions for the day. Props: `budget: AttentionBudget`.
- `NotificationDigest.tsx` -- Bundled notification list with expand/collapse per bundle. Props: `bundles: NotificationBundle[]`.
- `DNDToggle.tsx` -- DND toggle with mode selector and VIP config. Props: `config: DNDConfig; onChange: (config: DNDConfig) => void`.
- `OneThingNowBanner.tsx` -- Focus mode banner showing current task and timer. Props: `state: OneThingNowState`.
- `PriorityRoutingConfig.tsx` -- Configuration panel for priority routing rules. Props: `config: PriorityRouting[]; onChange: (config: PriorityRouting[]) => void`.
- `NotificationLearningPanel.tsx` -- Shows learned patterns and actionable suggestions. Props: `learning: NotificationLearning`.

### 3. Onboarding Module (M21)

**Types file:** `src/modules/onboarding/types.ts`

```typescript
export interface OnboardingWizard {
  userId: string;
  currentStep: number;
  totalSteps: number;
  steps: OnboardingStep[];
  startedAt: Date;
  completedAt?: Date;
  estimatedMinutesRemaining: number;
}

export interface OnboardingStep {
  id: string;
  order: number;
  title: string;
  description: string;
  category: 'CONNECT' | 'IMPORT' | 'CONFIGURE' | 'LEARN';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'SKIPPED';
  isRequired: boolean;
  completedAt?: Date;
}

export interface DataMigrationSource {
  id: string;
  name: string;
  icon: string;
  category: 'PRODUCTIVITY' | 'CALENDAR' | 'EMAIL' | 'CRM' | 'NOTES';
  isConnected: boolean;
  importedCount?: number;
  status: 'NOT_STARTED' | 'CONNECTING' | 'IMPORTING' | 'COMPLETE' | 'FAILED';
}

export interface PersonalityCalibration {
  userId: string;
  communicationStyle: 'FORMAL' | 'CASUAL' | 'ADAPTIVE';
  decisionSpeed: 'DELIBERATE' | 'BALANCED' | 'QUICK';
  detailPreference: 'HIGH' | 'MEDIUM' | 'LOW';
  riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  autonomyComfort: 'LOW' | 'MEDIUM' | 'HIGH';
  calibrationComplete: boolean;
}

export interface ToneTrainingSample {
  id: string;
  userId: string;
  sampleText: string;
  context: string;
  userRating: number;          // 1-5
  adjustments: string[];
}
```

**Service file:** `src/modules/onboarding/services/wizard-service.ts`

Implement:
- `initializeWizard(userId: string): Promise<OnboardingWizard>` -- Creates a new onboarding wizard with steps:
  1. "Welcome & Profile" (CONFIGURE, required)
  2. "Connect Email" (CONNECT, required)
  3. "Connect Calendar" (CONNECT, required)
  4. "Import Contacts" (IMPORT, optional)
  5. "Import Tasks from Notion/Todoist/Asana" (IMPORT, optional)
  6. "Set Communication Preferences" (CONFIGURE, required)
  7. "Personality Calibration" (CONFIGURE, required)
  8. "Tone Training" (LEARN, optional)
  9. "Create First Entity" (CONFIGURE, required)
  10. "Tour Complete" (LEARN, required)
  Total estimated: 30 minutes.
- `getWizard(userId: string): Promise<OnboardingWizard | null>` -- Returns current wizard state.
- `completeStep(userId: string, stepId: string): Promise<OnboardingWizard>` -- Marks a step complete and advances.
- `skipStep(userId: string, stepId: string): Promise<OnboardingWizard>` -- Skips an optional step.
- `getProgress(userId: string): Promise<{ percent: number; currentStep: string; estimatedMinutesRemaining: number }>`

**Service file:** `src/modules/onboarding/services/migration-service.ts`

Implement:
- `getAvailableSources(): DataMigrationSource[]` -- Returns list of supported migration sources:
  - Notion (NOTES)
  - Todoist (PRODUCTIVITY)
  - Asana (PRODUCTIVITY)
  - Google Calendar (CALENDAR)
  - Outlook Calendar (CALENDAR)
  - Gmail (EMAIL)
  - Outlook Mail (EMAIL)
  - HubSpot (CRM)
  - Salesforce (CRM)
- `initiateImport(userId: string, sourceId: string): Promise<DataMigrationSource>` -- Placeholder that simulates starting a data import. Sets status to IMPORTING.
- `getImportStatus(userId: string, sourceId: string): Promise<DataMigrationSource>` -- Returns current import status.
- `cancelImport(userId: string, sourceId: string): Promise<void>` -- Cancels an in-progress import.

**Service file:** `src/modules/onboarding/services/calibration-service.ts`

Implement:
- `startCalibration(userId: string): Promise<PersonalityCalibration>` -- Initializes calibration with defaults.
- `updateCalibration(userId: string, updates: Partial<PersonalityCalibration>): Promise<PersonalityCalibration>` -- Updates personality settings.
- `getCalibration(userId: string): Promise<PersonalityCalibration>` -- Returns current calibration.
- `completeCalibration(userId: string): Promise<PersonalityCalibration>` -- Marks calibration as complete and applies preferences.

**Service file:** `src/modules/onboarding/services/tone-training-service.ts`

Implement:
- `generateSample(userId: string, context: string): Promise<ToneTrainingSample>` -- Generates a sample message for the user to rate.
- `rateSample(sampleId: string, rating: number, adjustments?: string[]): Promise<ToneTrainingSample>` -- Records user rating and adjustments.
- `getSamples(userId: string): Promise<ToneTrainingSample[]>` -- Returns all training samples.
- `applyTraining(userId: string): Promise<{ toneProfile: Record<string, unknown> }>` -- Synthesizes all ratings into a tone profile.

**Components in `src/modules/onboarding/components/`:**

- `WizardProgress.tsx` -- Step indicator bar showing current position. Props: `wizard: OnboardingWizard`.
- `WizardStep.tsx` -- Single step view with title, description, action area, skip button. Props: `step: OnboardingStep; onComplete: () => void; onSkip: () => void`.
- `MigrationSourceCard.tsx` -- Card for a data source with connect/import button and status badge. Props: `source: DataMigrationSource; onConnect: () => void`.
- `CalibrationForm.tsx` -- Multi-choice form for personality calibration. Props: `calibration: PersonalityCalibration; onUpdate: (updates: Partial<PersonalityCalibration>) => void`.
- `ToneTrainer.tsx` -- Side-by-side sample display with 1-5 star rating. Props: `sample: ToneTrainingSample; onRate: (rating: number) => void`.
- `WelcomeScreen.tsx` -- Welcome page with value proposition and "Get Started" button. Props: `userName: string; onStart: () => void`.

### 4. Enterprise Admin Module (M19)

**Types file:** `src/modules/admin/types.ts`

```typescript
export interface OrgPolicy {
  id: string;
  entityId: string;
  name: string;
  type: 'RETENTION' | 'SHARING' | 'COMPLIANCE' | 'ACCESS' | 'DLP';
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SSOConfig {
  entityId: string;
  provider: 'SAML' | 'OIDC' | 'NONE';
  issuerUrl?: string;
  clientId?: string;
  certificateFingerprint?: string;
  isEnabled: boolean;
}

export interface DLPRule {
  id: string;
  entityId: string;
  name: string;
  pattern: string;             // regex or keyword
  action: 'BLOCK' | 'WARN' | 'LOG' | 'REDACT';
  scope: 'OUTBOUND_MESSAGES' | 'DOCUMENTS' | 'ALL';
  isActive: boolean;
}

export interface EDiscoveryExport {
  id: string;
  entityId: string;
  requestedBy: string;
  dateRange: { start: Date; end: Date };
  dataTypes: string[];
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED';
  downloadUrl?: string;
  requestedAt: Date;
  completedAt?: Date;
}
```

**Service file:** `src/modules/admin/services/org-policy-service.ts`

Implement:
- `createPolicy(policy: Omit<OrgPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<OrgPolicy>`
- `getPolicies(entityId: string, type?: string): Promise<OrgPolicy[]>`
- `updatePolicy(policyId: string, updates: Partial<OrgPolicy>): Promise<OrgPolicy>`
- `deletePolicy(policyId: string): Promise<void>`
- `enforceRetentionPolicy(entityId: string): Promise<{ deletedRecords: number; retainedRecords: number }>` -- Placeholder that simulates applying retention rules.

**Service file:** `src/modules/admin/services/sso-service.ts`

Implement:
- `configureSAML(entityId: string, config: Omit<SSOConfig, 'entityId' | 'isEnabled'>): Promise<SSOConfig>` -- Placeholder SSO configuration.
- `getSSOConfig(entityId: string): Promise<SSOConfig>`
- `testSSOConnection(entityId: string): Promise<{ success: boolean; message: string }>` -- Placeholder test.
- `enableSSO(entityId: string): Promise<SSOConfig>`
- `disableSSO(entityId: string): Promise<SSOConfig>`

**Service file:** `src/modules/admin/services/dlp-service.ts`

Implement:
- `createDLPRule(rule: Omit<DLPRule, 'id'>): Promise<DLPRule>`
- `getDLPRules(entityId: string): Promise<DLPRule[]>`
- `checkContent(entityId: string, content: string, scope: string): Promise<{ passed: boolean; violations: { rule: DLPRule; matchedText: string }[] }>` -- Scans content against DLP rules.
- `deleteDLPRule(ruleId: string): Promise<void>`

**Service file:** `src/modules/admin/services/ediscovery-service.ts`

Implement:
- `requestExport(entityId: string, requestedBy: string, dateRange: { start: Date; end: Date }, dataTypes: string[]): Promise<EDiscoveryExport>` -- Creates an eDiscovery export request.
- `getExportStatus(exportId: string): Promise<EDiscoveryExport>` -- Returns current export status.
- `listExports(entityId: string): Promise<EDiscoveryExport[]>`

### 5. Document Studio (M27)

**Types file:** `src/modules/documents/types.ts`

```typescript
export interface DocumentTemplate {
  id: string;
  name: string;
  type: DocumentType;          // from shared types
  category: string;
  content: string;             // template with {{placeholders}}
  variables: TemplateVariable[];
  brandKitRequired: boolean;
  outputFormats: ('DOCX' | 'PDF' | 'MARKDOWN' | 'HTML')[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateVariable {
  name: string;
  label: string;
  type: 'TEXT' | 'DATE' | 'NUMBER' | 'SELECT' | 'ENTITY_REF' | 'CONTACT_REF';
  required: boolean;
  defaultValue?: string;
  options?: string[];
}

export interface DocumentGeneration {
  templateId: string;
  variables: Record<string, string>;
  entityId: string;
  brandKit?: BrandKit;
  outputFormat: 'DOCX' | 'PDF' | 'MARKDOWN' | 'HTML';
  citationsEnabled: boolean;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  content: string;
  changedBy: string;
  changeDescription: string;
  createdAt: Date;
}

export interface Redline {
  id: string;
  documentId: string;
  version1: number;
  version2: number;
  changes: RedlineChange[];
}

export interface RedlineChange {
  type: 'ADDITION' | 'DELETION' | 'MODIFICATION';
  position: { start: number; end: number };
  originalText?: string;
  newText?: string;
}

export interface ESignRequest {
  id: string;
  documentId: string;
  signers: { name: string; email: string; order: number; status: 'PENDING' | 'SIGNED' | 'DECLINED' }[];
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_SIGNED' | 'COMPLETE' | 'CANCELLED';
  provider: string;            // placeholder: "docusign", "adobe_sign"
  createdAt: Date;
}

export interface BrandKitConfig {
  entityId: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  fontFamily: string;
  headerTemplate?: string;
  footerTemplate?: string;
  watermark?: string;
}

export interface PresentationSlide {
  order: number;
  title: string;
  content: string;
  layout: 'TITLE' | 'CONTENT' | 'TWO_COLUMN' | 'IMAGE' | 'CHART' | 'BLANK';
  notes?: string;
}
```

**Service file:** `src/modules/documents/services/template-service.ts`

Implement:
- `getTemplates(type?: DocumentType, category?: string): Promise<DocumentTemplate[]>` -- Lists available templates.
- `getTemplate(templateId: string): Promise<DocumentTemplate | null>`
- `createTemplate(template: Omit<DocumentTemplate, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<DocumentTemplate>`
- `updateTemplate(templateId: string, updates: Partial<DocumentTemplate>): Promise<DocumentTemplate>` -- Increments version.
- `getDefaultTemplates(): DocumentTemplate[]` -- Returns built-in templates:
  - "Executive Brief" (BRIEF, business)
  - "Internal Memo" (MEMO, business)
  - "Standard Operating Procedure" (SOP, operations)
  - "Meeting Minutes" (MINUTES, meetings)
  - "Invoice" (INVOICE, finance)
  - "Statement of Work" (SOW, legal)
  - "Business Proposal" (PROPOSAL, sales)
  - "Contract Agreement" (CONTRACT, legal)
  - "Quarterly Report" (REPORT, reporting)
  - "Board Deck" (DECK, presentations)

**Service file:** `src/modules/documents/services/document-generation-service.ts`

Implement:
- `generateDocument(request: DocumentGeneration): Promise<Document>` -- Generates a document from a template, substituting variables. Applies brand kit styling if provided. Auto-adds citations if enabled.
- `renderTemplate(template: string, variables: Record<string, string>): string` -- Replaces `{{variableName}}` placeholders with values.
- `applyBrandKit(content: string, brandKit: BrandKit): string` -- Wraps content with brand-kit styling (colors, fonts, header/footer).
- `convertFormat(content: string, fromFormat: string, toFormat: string): string` -- Placeholder for format conversion. For now, returns Markdown/HTML as-is.

**Service file:** `src/modules/documents/services/versioning-service.ts`

Implement:
- `createVersion(documentId: string, content: string, changedBy: string, description: string): Promise<DocumentVersion>` -- Creates a new version.
- `getVersions(documentId: string): Promise<DocumentVersion[]>` -- Lists all versions.
- `getVersion(documentId: string, version: number): Promise<DocumentVersion | null>` -- Gets a specific version.
- `generateRedline(documentId: string, version1: number, version2: number): Promise<Redline>` -- Compares two versions and produces a diff with additions, deletions, and modifications.
- `rollbackToVersion(documentId: string, version: number): Promise<Document>` -- Restores a previous version.

**Service file:** `src/modules/documents/services/esign-service.ts`

Implement:
- `createSignRequest(documentId: string, signers: { name: string; email: string; order: number }[], provider?: string): Promise<ESignRequest>` -- Placeholder that creates a sign request.
- `getSignStatus(requestId: string): Promise<ESignRequest>` -- Returns signing status.
- `cancelSignRequest(requestId: string): Promise<void>`

**Service file:** `src/modules/documents/services/brand-kit-service.ts`

Implement:
- `getBrandKit(entityId: string): Promise<BrandKitConfig | null>` -- Returns entity's brand kit.
- `updateBrandKit(entityId: string, config: Partial<BrandKitConfig>): Promise<BrandKitConfig>` -- Updates brand kit settings.

**Components in `src/modules/documents/components/`:**

- `TemplateSelector.tsx` -- Grid of template cards with type and category filters. Props: `templates: DocumentTemplate[]; onSelect: (id: string) => void`.
- `DocumentEditor.tsx` -- Template variable form with live preview panel. Props: `template: DocumentTemplate; onGenerate: (vars: Record<string, string>) => void`.
- `VersionTimeline.tsx` -- Vertical timeline of document versions with restore buttons. Props: `versions: DocumentVersion[]`.
- `RedlineViewer.tsx` -- Side-by-side diff viewer with color-coded changes. Props: `redline: Redline`.
- `BrandKitEditor.tsx` -- Brand kit configuration form with color pickers and font selector. Props: `config: BrandKitConfig; onSave: (config: BrandKitConfig) => void`.
- `ESignTracker.tsx` -- Signing progress tracker showing each signer's status. Props: `request: ESignRequest`.
- `FormatSelector.tsx` -- Output format radio buttons (DOCX, PDF, Markdown, HTML). Props: `selected: string; onChange: (format: string) => void`.
- `CitationFootnotes.tsx` -- Footnote-style citation display at bottom of document. Props: `citations: Citation[]`.

### 6. Developer Platform (M24)

**Types file:** `src/modules/developer/types.ts`

```typescript
export interface PluginDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  permissions: string[];
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REVOKED';
  entryPoint: string;
  configSchema: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookConfig {
  id: string;
  entityId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  lastTriggered?: Date;
  failureCount: number;
  createdAt: Date;
}

export interface WebhookEvent {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'DELIVERED' | 'FAILED' | 'RETRYING';
  attempts: number;
  lastAttempt?: Date;
  response?: { status: number; body: string };
  createdAt: Date;
}

export interface CustomToolDefinition {
  id: string;
  entityId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  implementation: 'WEBHOOK' | 'FUNCTION' | 'API_CALL';
  config: Record<string, unknown>;
  isActive: boolean;
}

export interface PluginSecurityReview {
  pluginId: string;
  reviewer: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  permissionsVerified: boolean;
  isolationVerified: boolean;
  findings: { severity: string; description: string }[];
  reviewedAt?: Date;
}
```

**Service file:** `src/modules/developer/services/plugin-service.ts`

Implement:
- `registerPlugin(plugin: Omit<PluginDefinition, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<PluginDefinition>` -- Registers a new plugin in DRAFT status.
- `getPlugins(status?: string): Promise<PluginDefinition[]>` -- Lists plugins.
- `submitForReview(pluginId: string): Promise<PluginDefinition>` -- Moves to REVIEW status.
- `approvePlugin(pluginId: string): Promise<PluginDefinition>` -- Moves to APPROVED.
- `revokePlugin(pluginId: string, reason: string): Promise<PluginDefinition>` -- Break-glass revoke (REVOKED status, immediately disables).
- `getPluginSDKStub(): Record<string, string>` -- Returns placeholder SDK documentation/interface definitions.

**Service file:** `src/modules/developer/services/webhook-service.ts`

Implement:
- `createWebhook(entityId: string, direction: string, url: string, events: string[]): Promise<WebhookConfig>` -- Creates a webhook with auto-generated secret.
- `getWebhooks(entityId: string): Promise<WebhookConfig[]>`
- `deleteWebhook(webhookId: string): Promise<void>`
- `triggerWebhook(webhookId: string, event: string, payload: Record<string, unknown>): Promise<WebhookEvent>` -- Sends a webhook event (placeholder: simulates HTTP POST).
- `getWebhookEvents(webhookId: string, limit?: number): Promise<WebhookEvent[]>` -- Returns event history.
- `retryFailedEvent(eventId: string): Promise<WebhookEvent>` -- Retries a failed event.
- `verifyWebhookSignature(payload: string, signature: string, secret: string): boolean` -- HMAC-SHA256 verification.

**Service file:** `src/modules/developer/services/custom-tool-service.ts`

Implement:
- `createTool(tool: Omit<CustomToolDefinition, 'id'>): Promise<CustomToolDefinition>`
- `getTools(entityId: string): Promise<CustomToolDefinition[]>`
- `executeTool(toolId: string, input: Record<string, unknown>): Promise<Record<string, unknown>>` -- Placeholder execution.
- `validateToolInput(toolId: string, input: Record<string, unknown>): Promise<{ valid: boolean; errors: string[] }>` -- Validates input against the tool's inputSchema.

**Service file:** `src/modules/developer/services/security-review-service.ts`

Implement:
- `requestReview(pluginId: string): Promise<PluginSecurityReview>` -- Creates a security review request.
- `conductReview(pluginId: string, reviewer: string): Promise<PluginSecurityReview>` -- Placeholder review that checks: permissions are minimal, isolation is enforced, no dangerous patterns.
- `getReview(pluginId: string): Promise<PluginSecurityReview | null>`
- `breakGlassRevoke(pluginId: string, reason: string): Promise<{ revoked: boolean; affectedUsers: number }>` -- Emergency plugin revocation.

**Components in `src/modules/developer/components/`:**

- `PluginCard.tsx` -- Plugin card with name, version, status badge, permissions list. Props: `plugin: PluginDefinition`.
- `PluginRegistry.tsx` -- Grid of plugin cards with status filter. Props: `plugins: PluginDefinition[]`.
- `WebhookManager.tsx` -- Webhook list with create form, event log, and retry buttons. Props: `webhooks: WebhookConfig[]`.
- `CustomToolEditor.tsx` -- Tool definition form with JSON schema editor. Props: `tool?: CustomToolDefinition; onSave: (tool: Omit<CustomToolDefinition, 'id'>) => void`.
- `SecurityReviewPanel.tsx` -- Review status with findings list and approve/reject buttons. Props: `review: PluginSecurityReview`.

### 7. API Routes

| Route File | Method | Path | Purpose |
|------------|--------|------|---------|
| `src/app/api/delegation/route.ts` | GET | `/api/delegation?userId=&direction=` | List delegated tasks |
| `src/app/api/delegation/route.ts` | POST | `/api/delegation` | Create delegation |
| `src/app/api/delegation/[id]/approve/route.ts` | POST | `/api/delegation/:id/approve` | Advance approval chain |
| `src/app/api/delegation/inbox/route.ts` | GET | `/api/delegation/inbox?userId=` | Get delegation suggestions |
| `src/app/api/delegation/scores/route.ts` | GET | `/api/delegation/scores?entityId=` | Get delegation scoreboard |
| `src/app/api/documents/templates/route.ts` | GET | `/api/documents/templates?type=&category=` | List templates |
| `src/app/api/documents/templates/route.ts` | POST | `/api/documents/templates` | Create template |
| `src/app/api/documents/generate/route.ts` | POST | `/api/documents/generate` | Generate document from template |
| `src/app/api/documents/[id]/versions/route.ts` | GET | `/api/documents/:id/versions` | List document versions |
| `src/app/api/documents/[id]/redline/route.ts` | GET | `/api/documents/:id/redline?v1=&v2=` | Generate redline diff |
| `src/app/api/documents/[id]/sign/route.ts` | POST | `/api/documents/:id/sign` | Create e-sign request |
| `src/app/api/documents/brand-kit/route.ts` | GET | `/api/documents/brand-kit?entityId=` | Get brand kit |
| `src/app/api/documents/brand-kit/route.ts` | PUT | `/api/documents/brand-kit` | Update brand kit |
| `src/app/api/admin/policies/route.ts` | GET | `/api/admin/policies?entityId=` | List org policies |
| `src/app/api/admin/policies/route.ts` | POST | `/api/admin/policies` | Create org policy |
| `src/app/api/admin/dlp/route.ts` | GET | `/api/admin/dlp?entityId=` | List DLP rules |
| `src/app/api/admin/dlp/route.ts` | POST | `/api/admin/dlp` | Create DLP rule |
| `src/app/api/admin/dlp/check/route.ts` | POST | `/api/admin/dlp/check` | Check content against DLP rules |
| `src/app/api/admin/ediscovery/route.ts` | POST | `/api/admin/ediscovery` | Request eDiscovery export |
| `src/app/api/admin/ediscovery/route.ts` | GET | `/api/admin/ediscovery?entityId=` | List exports |
| `src/app/api/admin/sso/route.ts` | GET | `/api/admin/sso?entityId=` | Get SSO config |
| `src/app/api/admin/sso/route.ts` | POST | `/api/admin/sso` | Configure SSO |

All routes MUST:
- Use Zod for request body and query parameter validation
- Use `success()`, `error()`, `paginated()` from `@/shared/utils/api-response`
- Use `prisma` from `@/lib/db`
- Wrap in try/catch returning `error('INTERNAL_ERROR', ...)` on failure
- Return proper HTTP status codes (200, 201, 400, 404, 500)

### 8. Dashboard Pages

**Delegation page:** `src/app/(dashboard)/delegation/page.tsx` -- Delegation inbox, active delegations, scoreboard
**Settings page:** `src/app/(dashboard)/settings/page.tsx` -- Admin settings: org policies, DLP rules, SSO config, eDiscovery
**Onboarding page:** `src/app/(dashboard)/onboarding/page.tsx` -- Onboarding wizard with step-by-step flow
**Documents page:** `src/app/(dashboard)/documents/page.tsx` -- Document studio: template selection, generation, version management

## Acceptance Criteria

- [ ] Delegation creates approval chain with AI_DRAFT -> EA_REVIEW -> USER_APPROVE
- [ ] Delegation inbox generates at least 5 suggestions daily based on task analysis
- [ ] Delegation scoring correctly weights completion rate, quality, and speed
- [ ] Role-based permission check enforces least privilege
- [ ] Attention budget correctly tracks and enforces daily interruption cap
- [ ] DND mode correctly handles all 4 modes (MANUAL, FOCUS_HOURS, CALENDAR_AWARE, SMART)
- [ ] VIP breakthrough works during DND
- [ ] Notification bundling groups by source correctly
- [ ] Onboarding wizard has 10 steps completing in ~30 minutes
- [ ] Template rendering replaces all `{{variables}}`
- [ ] Document versioning creates correct version numbers
- [ ] Redline diff correctly identifies additions, deletions, and modifications
- [ ] DLP content check scans against all active rules
- [ ] Webhook signature verification uses HMAC-SHA256
- [ ] Plugin security review checks permissions and isolation
- [ ] Break-glass revoke immediately disables a plugin
- [ ] All 22 API routes return correct `ApiResponse<T>` shapes
- [ ] All unit tests pass with `npx jest tests/unit/platform/`
- [ ] No imports from other worker-owned paths
- [ ] No modifications to shared/immutable files

## Implementation Steps

1. **Read context files** -- all shared contracts
2. **Create branch**: `git checkout -b ai-feature/w20-platform`
3. **Create type files** for all 6 modules
4. **Build Delegation services** (delegation-service, inbox, scoring, role-service)
5. **Build Attention services** (budget, priority router, DND, one-thing-now, bundler, learning)
6. **Build Onboarding services** (wizard, migration, calibration, tone training)
7. **Build Admin services** (org policy, SSO, DLP, eDiscovery)
8. **Build Document Studio services** (template, generation, versioning, esign, brand kit)
9. **Build Developer Platform services** (plugin, webhook, custom tool, security review)
10. **Build components** for all 6 modules
11. **Build API routes** -- All 22 route files with Zod schemas
12. **Build dashboard pages** -- delegation, settings, onboarding, documents
13. **Write tests** for attention budget and delegation scoring
14. **Verify** -- `npx tsc --noEmit`, `npx jest tests/unit/platform/`, `npx next build`

## Tests

Create these test files in `tests/unit/platform/`:

### `tests/unit/platform/attention-budget.test.ts`

```typescript
describe('getBudget', () => {
  it('should return current budget with remaining count');
  it('should reset at midnight in user timezone');
  it('should handle first-time budget creation with defaults');
});

describe('consumeBudget', () => {
  it('should allow consumption when budget remains');
  it('should deny consumption when budget exhausted');
  it('should decrement remaining by 1');
  it('should handle concurrent consumption attempts');
});

describe('isDNDActive', () => {
  it('should return true during manual DND');
  it('should return true during focus hours');
  it('should return false outside focus hours');
  it('should return true during calendar events (CALENDAR_AWARE)');
  it('should allow VIP breakthrough when enabled');
  it('should block non-VIP during DND');
});

describe('routeNotification', () => {
  it('should route P0 to INTERRUPT when budget available');
  it('should route P0 to INTERRUPT even during DND (for VIP)');
  it('should route P1 to NEXT_DIGEST');
  it('should route P2 to WEEKLY_REVIEW');
  it('should downgrade P0 to NEXT_DIGEST when budget exhausted and not VIP');
});
```

### `tests/unit/platform/delegation-scoring.test.ts`

```typescript
describe('calculateScore', () => {
  it('should calculate score from completion rate, quality, and speed');
  it('should score per category');
  it('should identify best category');
  it('should handle delegate with no history (score 0)');
  it('should weight quality (first-pass approval) highest');
});

describe('getBestDelegate', () => {
  it('should return highest-scoring delegate for category');
  it('should return null when no delegates available');
  it('should scope to entity');
});

describe('generateDelegationInbox', () => {
  it('should not suggest P0 tasks');
  it('should suggest tasks matching delegate strengths');
  it('should include estimated time saved');
  it('should limit to top 5 suggestions');
});
```

### `tests/unit/platform/notification-bundler.test.ts`

```typescript
describe('bundleNotifications', () => {
  it('should group notifications by source');
  it('should only bundle unread items');
  it('should calculate correct item counts');
  it('should not bundle P0 items');
});

describe('getDigest', () => {
  it('should return P1 bundles only');
  it('should sort by priority then recency');
});
```

### `tests/unit/platform/document-versioning.test.ts`

```typescript
describe('createVersion', () => {
  it('should increment version number');
  it('should store content snapshot');
  it('should record change description');
});

describe('generateRedline', () => {
  it('should detect additions');
  it('should detect deletions');
  it('should detect modifications');
  it('should handle identical versions (no changes)');
  it('should return correct position offsets');
});
```

### `tests/unit/platform/webhook-service.test.ts`

```typescript
describe('verifyWebhookSignature', () => {
  it('should verify valid HMAC-SHA256 signature');
  it('should reject invalid signature');
  it('should handle empty payload');
});

describe('triggerWebhook', () => {
  it('should create webhook event with PENDING status');
  it('should increment failure count on failed delivery');
});
```

### `tests/unit/platform/dlp-service.test.ts`

```typescript
describe('checkContent', () => {
  it('should detect regex pattern matches');
  it('should detect keyword matches');
  it('should return all violated rules');
  it('should pass clean content');
  it('should respect scope filtering');
  it('should only check active rules');
});
```

Mock the Prisma client in all tests. Use `jest.mock('@/lib/db')`. No live database required.

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(delegation): add delegation types and delegation service with approval chains
feat(delegation): implement delegation inbox and scoring services
feat(delegation): add role-based permission service
feat(attention): add attention budget service with daily limits
feat(attention): implement priority routing and DND service
feat(attention): add one-thing-now mode and notification bundler
feat(attention): add notification learning service
feat(onboarding): implement 10-step onboarding wizard
feat(onboarding): add data migration placeholders and calibration service
feat(onboarding): add tone training service
feat(admin): implement org policy and SSO services
feat(admin): add DLP rules and eDiscovery export
feat(documents): implement template engine with default templates
feat(documents): add document generation with brand kit styling
feat(documents): implement versioning and redline diff service
feat(documents): add e-sign connector and brand kit management
feat(developer): implement plugin registry and SDK placeholder
feat(developer): add webhook system with HMAC verification
feat(developer): add custom tool definitions and security review
feat(platform): add all components for 6 modules
feat(platform): add all API routes with Zod validation
feat(platform): add dashboard pages for delegation, settings, onboarding, documents
test(platform): add unit tests for attention budget and DND logic
test(platform): add unit tests for delegation scoring and inbox
test(platform): add unit tests for notification bundling
test(platform): add unit tests for document versioning and redline
test(platform): add unit tests for webhook signature and DLP checks
chore(platform): verify build and final cleanup
```

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
