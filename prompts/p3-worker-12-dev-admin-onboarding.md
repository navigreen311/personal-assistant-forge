# Worker 12: Complete Developer + Admin + Onboarding Modules

## Branch

`ai-feature/p3-w12-dev-admin-onboarding`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/developer/services/custom-tool-service.ts`
- `src/modules/developer/services/plugin-service.ts`
- `src/modules/developer/services/security-review-service.ts`
- `src/modules/developer/services/webhook-service.ts`
- `src/modules/admin/services/dlp-service.ts`
- `src/modules/admin/services/ediscovery-service.ts`
- `src/modules/admin/services/org-policy-service.ts`
- `src/modules/admin/services/sso-service.ts`
- `src/modules/onboarding/services/calibration-service.ts`
- `src/modules/onboarding/services/migration-service.ts`
- `src/modules/onboarding/services/tone-training-service.ts`
- `src/modules/onboarding/services/wizard-service.ts`
- `tests/unit/developer/plugin-service.test.ts`
- `tests/unit/developer/custom-tool-service.test.ts`
- `tests/unit/admin/dlp-service.test.ts`
- `tests/unit/admin/sso-service.test.ts`
- `tests/unit/onboarding/wizard-service.test.ts`
- `tests/unit/onboarding/calibration-service.test.ts`

### Do NOT modify

- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- Any files outside the owned paths above

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/lib/ai/index.ts`** -- Exports `generateText(prompt, options?)`, `generateJSON<T>(prompt, options?)`, `chat(messages, options?)`, `streamText(prompt, options?)`. Options include `model`, `maxTokens`, `temperature`, `system`.
2. **`src/lib/db/index.ts`** -- Exports `prisma` client instance. Import as `import { prisma } from '@/lib/db'`.
3. **`src/shared/middleware/auth.ts`** -- Three auth wrappers:
   - `withAuth(req, handler)` -- Validates JWT, passes `AuthSession` to handler. Returns 401.
   - `withRole(req, roles, handler)` -- Checks role. Returns 403.
   - `withEntityAccess(req, entityId, handler)` -- Verifies entity ownership. Returns 403/404.
4. **`prisma/schema.prisma`** -- Database models. Key models for this worker:
   - `Document` model: has `id`, `title`, `entityId`, `type`, `version`, `content` (Json), `metadata` (Json), `createdAt`, `updatedAt`. Use `type` to distinguish: `"PLUGIN"`, `"CUSTOM_TOOL"`, `"GOAL"`, etc.
   - `Rule` model: has `id`, `name`, `scope`, `entityId`, `condition` (Json), `action` (Json), `priority`, `isActive`, `createdAt`, `updatedAt`. Use for DLP rules and org policies.
   - `Entity` model: has `complianceProfile` (Json) for storing SSO config.
   - `User` model: has `preferences` (Json) for storing onboarding progress.
   - `ActionLog` model: for audit trail logging.
5. **`src/modules/developer/types/`** -- Developer types if they exist.
6. **`src/modules/admin/types/`** -- Admin types if they exist.
7. **`src/modules/onboarding/types/`** -- Onboarding types if they exist.
8. All 12 service files listed in owned paths -- read each before modifying.

## Requirements

### Developer Module

#### 1. Plugin Service (`src/modules/developer/services/plugin-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement:

- **`registerPlugin(entityId, manifest)`**: Validate the plugin manifest (must have name, version, description, entryPoint, permissions). Create a `Document` record with `type: "PLUGIN"`, storing manifest in `content` JSON and status/metadata in `metadata` JSON.
- **`listPlugins(entityId, filters?)`**: Query `prisma.document.findMany` where `type: "PLUGIN"` and `entityId` matches. Support filtering by status (active, disabled, pending_review).
- **`getPlugin(pluginId)`**: Get a single plugin by document ID.
- **`enablePlugin(pluginId)`**: Update `metadata.status` to `"active"`.
- **`disablePlugin(pluginId)`**: Update `metadata.status` to `"disabled"`.
- **`validateManifest(manifest)`**: Validate required fields, check permission safety (flag dangerous permissions like `filesystem`, `network`, `admin`). Return `{ valid: boolean, errors: string[], warnings: string[] }`.
- **`unregisterPlugin(pluginId)`**: Delete the plugin Document record.

Keep existing function signatures/exports. Add only what is missing.

#### 2. Custom Tool Service (`src/modules/developer/services/custom-tool-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement:

- **`createTool(entityId, toolDef)`**: Store custom tool definition in `Document` model with `type: "CUSTOM_TOOL"`. Tool definition includes name, description, inputSchema (JSON Schema), handler code or webhook URL.
- **`listTools(entityId)`**: Query all custom tools for the entity.
- **`getTool(toolId)`**: Get a single tool by ID.
- **`updateTool(toolId, updates)`**: Update tool definition. Increment `version`.
- **`deleteTool(toolId)`**: Delete the tool document.
- **`validateToolSchema(inputSchema)`**: Validate the tool's input JSON Schema is well-formed. Return `{ valid: boolean, errors: string[] }`.
- **`testToolExecution(toolId, testInput)`**: Dry-run tool with test input. Validate input against schema, simulate execution, return `{ success: boolean, output: any, errors: string[] }`. Use AI via `generateJSON` to evaluate whether the output makes sense for the given input/schema.

#### 3. Security Review Service (`src/modules/developer/services/security-review-service.ts`)

**Read the file first** -- this was AI-enhanced in Phase 2.

Verify it properly:
- Reviews plugin manifests for security risks (dangerous permissions, known vulnerability patterns)
- Reviews webhook configurations for SSRF risks, insecure endpoints
- Uses AI via `generateJSON` for nuanced security analysis
- Returns structured review results with risk level, findings, recommendations

If any of the above is missing or stubbed, implement it. Do not break existing AI integration.

#### 4. Webhook Service (`src/modules/developer/services/webhook-service.ts`)

**Read the file first** -- this was AI-enhanced in Phase 2.

Verify it properly:
- Registers webhooks with URL, events, secret for signature verification
- Manages webhook delivery with retry logic (exponential backoff)
- Logs delivery attempts and failures
- Supports webhook testing (send test payload)

If any of the above is missing or stubbed, implement it. Do not break existing functionality.

### Admin Module

#### 5. DLP Service (`src/modules/admin/services/dlp-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement:

- **`createRule(entityId, rule)`**: Create a DLP rule using `prisma.rule.create`. The `condition` JSON field stores the detection pattern config: `{ type: "regex" | "keyword" | "ai", pattern: string, dataType: "SSN" | "CREDIT_CARD" | "EMAIL" | "PHONE" | "CUSTOM" }`. The `action` JSON field stores the response: `{ action: "BLOCK" | "REDACT" | "ALERT" | "LOG", notify: string[] }`.
- **`listRules(entityId)`**: Query all DLP rules for the entity.
- **`updateRule(ruleId, updates)`**: Update a DLP rule.
- **`deleteRule(ruleId)`**: Delete a DLP rule (soft delete via `isActive: false`).
- **`scanContent(entityId, content)`**: Scan content against all active DLP rules for the entity. For regex rules, test pattern against content. For keyword rules, check for keyword presence. Return `{ violations: Array<{ ruleId, ruleName, dataType, matches: string[], action }>, clean: boolean }`.
- **`getViolationReport(entityId, dateRange)`**: Query ActionLog for DLP violations within the date range, aggregate by rule and data type.

Built-in regex patterns to include:
- SSN: `/\b\d{3}-\d{2}-\d{4}\b/`
- Credit Card: `/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/`
- Email: `/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/`
- Phone: `/\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/`

#### 6. E-Discovery Service (`src/modules/admin/services/ediscovery-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement:

- **`search(entityId, query)`**: Search across multiple content types. Query parameters: `{ keywords: string[], dateFrom?: Date, dateTo?: Date, contentTypes: ("message" | "document" | "knowledge")[], custodians?: string[] }`. Run parallel Prisma queries against Message, Document, and KnowledgeBase models filtered by entityId and date range. Use full-text search on content fields.
- **`createHold(entityId, holdConfig)`**: Create a legal hold that prevents deletion of matching content. Store hold config in `Rule` model with `scope: "LEGAL_HOLD"`.
- **`exportResults(searchId, format)`**: Export search results as structured JSON. Include metadata: total results, date range, search terms, export timestamp.
- **`getSearchHistory(entityId)`**: Query past searches from ActionLog.

#### 7. Org Policy Service (`src/modules/admin/services/org-policy-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement:

- **`createPolicy(entityId, policy)`**: Create an organizational policy using `prisma.rule.create` with `scope: "ORG_POLICY"`. The `condition` JSON stores policy criteria. The `action` JSON stores enforcement behavior.
- **`listPolicies(entityId)`**: Query all org policies for the entity.
- **`updatePolicy(policyId, updates)`**: Update a policy.
- **`deletePolicy(policyId)`**: Soft delete (set `isActive: false`).
- **`enforcePolicy(entityId, action, context)`**: Check an action against all active policies. Return `{ allowed: boolean, violations: Array<{ policyId, policyName, reason }>, warnings: string[] }`.
- **`getComplianceReport(entityId)`**: Aggregate policy violation data from ActionLog. Return compliance percentage, top violations, trend data.

#### 8. SSO Service (`src/modules/admin/services/sso-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement:

- **`configureSSOProvider(entityId, config)`**: Store SSO configuration in `Entity.complianceProfile` JSON field under a `sso` key. Config includes: `{ provider: "saml" | "oidc", issuer: string, clientId: string, clientSecret: string, callbackUrl: string, metadata?: string }`.
- **`getSSOConfig(entityId)`**: Retrieve SSO configuration for an entity.
- **`updateSSOConfig(entityId, updates)`**: Update SSO configuration fields.
- **`deleteSSOConfig(entityId)`**: Remove SSO configuration from complianceProfile.
- **`validateSSOConfig(config)`**: Validate the SSO configuration. Check required fields, validate URLs, check issuer format. Return `{ valid: boolean, errors: string[] }`.
- **`testConnection(entityId)`**: Simulate an SSO connection test. Validate the stored config, check URL reachability (or simulate). Return `{ success: boolean, responseTime?: number, error?: string }`.

### Onboarding Module

#### 9. Calibration Service (`src/modules/onboarding/services/calibration-service.ts`)

**Read the file first** -- this was AI-enhanced in Phase 2.

Verify it properly:
- Runs calibration exercises to learn user preferences
- Uses AI to analyze user responses and build a preference profile
- Stores calibration results in User.preferences

If any of the above is missing or stubbed, implement it. Do not break existing AI integration.

#### 10. Migration Service (`src/modules/onboarding/services/migration-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement:

- **`startMigration(entityId, source, config)`**: Begin a data import. Source types: `"csv" | "json" | "api"`. Config includes field mapping. Create a migration record in ActionLog with `actionType: "MIGRATION_START"`.
- **`importData(migrationId, data, modelType)`**: Parse incoming data (CSV rows or JSON objects), map fields using the migration config, create records in the appropriate Prisma model. Track progress (processed count, error count).
- **`getMigrationStatus(migrationId)`**: Return progress: total records, processed, succeeded, failed, errors.
- **`validateData(data, schema)`**: Validate imported data against expected schema before writing. Return `{ valid: boolean, errors: Array<{ row: number, field: string, error: string }> }`.
- **`rollbackMigration(migrationId)`**: Delete records created during this migration. Query ActionLog for created record IDs and delete them.

#### 11. Tone Training Service (`src/modules/onboarding/services/tone-training-service.ts`)

**Read the file first** -- this was AI-enhanced in Phase 2.

Verify it properly:
- Presents tone samples to users for preference selection
- Uses AI to generate tone variants
- Stores learned tone preferences in User.preferences

If any of the above is missing or stubbed, implement it. Do not break existing AI integration.

#### 12. Wizard Service (`src/modules/onboarding/services/wizard-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement:

- **`getWizardState(userId)`**: Retrieve onboarding progress from `User.preferences` JSON under an `onboarding` key. Default state: `{ currentStep: 0, completedSteps: [], totalSteps: 7, startedAt: null, completedAt: null }`.
- **`startWizard(userId)`**: Initialize the onboarding wizard. Set `startedAt` to now, `currentStep` to 0.
- **`completeStep(userId, stepId, data?)`**: Mark a step as complete. Add to `completedSteps` array. Advance `currentStep`. Store any step-specific data (e.g., profile info, preferences selected). If all steps complete, set `completedAt`.
- **`skipStep(userId, stepId)`**: Skip a step without completing it. Advance `currentStep` but do not add to `completedSteps`.
- **`getProgress(userId)`**: Calculate completion percentage: `completedSteps.length / totalSteps * 100`. Return `{ percentage: number, currentStep: number, totalSteps: number, completedSteps: string[], isComplete: boolean }`.
- **`resetWizard(userId)`**: Reset onboarding state to initial values.

Onboarding steps (define as constants):
1. `PROFILE_SETUP` -- Basic user profile information
2. `ENTITY_CREATION` -- Create first entity/organization
3. `TONE_CALIBRATION` -- Tone preference selection
4. `NOTIFICATION_PREFERENCES` -- Configure notification settings
5. `INTEGRATION_SETUP` -- Connect external services
6. `FIRST_TASK` -- Create first task as guided exercise
7. `REVIEW_COMPLETE` -- Review settings and complete onboarding

### 13. Tests

Write comprehensive tests for all 6 test files:

#### `tests/unit/developer/plugin-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    document: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  },
}));

describe('registerPlugin', () => {
  it('should create a document with type PLUGIN');
  it('should store manifest in content field');
  it('should set initial status to pending_review');
});
describe('validateManifest', () => {
  it('should pass for valid manifests');
  it('should fail for missing required fields');
  it('should warn about dangerous permissions');
});
describe('enablePlugin / disablePlugin', () => {
  it('should update metadata.status to active');
  it('should update metadata.status to disabled');
});
```

#### `tests/unit/developer/custom-tool-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    document: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('createTool', () => {
  it('should create a document with type CUSTOM_TOOL');
  it('should store tool definition in content');
});
describe('validateToolSchema', () => {
  it('should validate well-formed JSON Schema');
  it('should reject invalid schema');
});
describe('testToolExecution', () => {
  it('should validate input against schema');
  it('should use AI to evaluate output');
  it('should handle AI failure gracefully');
});
```

#### `tests/unit/admin/dlp-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    rule: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    actionLog: { create: jest.fn(), findMany: jest.fn() },
  },
}));

describe('createRule', () => {
  it('should create a rule with condition and action');
});
describe('scanContent', () => {
  it('should detect SSN patterns');
  it('should detect credit card patterns');
  it('should return clean when no violations');
  it('should return all matching violations');
});
describe('getViolationReport', () => {
  it('should aggregate violations by rule and data type');
});
```

#### `tests/unit/admin/sso-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    entity: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

describe('configureSSOProvider', () => {
  it('should store SSO config in entity complianceProfile');
});
describe('validateSSOConfig', () => {
  it('should pass for valid SAML config');
  it('should pass for valid OIDC config');
  it('should fail for missing required fields');
  it('should fail for invalid URLs');
});
describe('testConnection', () => {
  it('should validate stored config');
  it('should return success for valid config');
});
```

#### `tests/unit/onboarding/wizard-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

describe('startWizard', () => {
  it('should initialize onboarding state');
  it('should set startedAt to current time');
});
describe('completeStep', () => {
  it('should add step to completedSteps');
  it('should advance currentStep');
  it('should set completedAt when all steps done');
});
describe('getProgress', () => {
  it('should calculate correct percentage');
  it('should report isComplete when all steps done');
  it('should handle zero completed steps');
});
describe('resetWizard', () => {
  it('should reset to initial state');
});
```

#### `tests/unit/onboarding/calibration-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

describe('calibration exercises', () => {
  it('should run calibration with AI analysis');
  it('should store results in user preferences');
  it('should handle AI failure gracefully');
});
describe('preference profile', () => {
  it('should build preference profile from responses');
  it('should update profile on recalibration');
});
```

## Acceptance Criteria

1. `plugin-service.ts` implements full CRUD for plugins using Document model with type "PLUGIN".
2. `custom-tool-service.ts` implements tool CRUD, schema validation, and AI-powered test execution.
3. `security-review-service.ts` properly reviews plugins/webhooks for security issues (verified, not broken).
4. `webhook-service.ts` properly manages webhook lifecycle with retry logic (verified, not broken).
5. `dlp-service.ts` implements DLP rules with regex pattern scanning and violation reporting.
6. `ediscovery-service.ts` implements cross-content search with legal hold support.
7. `org-policy-service.ts` implements policy CRUD with enforcement and compliance reporting.
8. `sso-service.ts` implements SSO config management in Entity.complianceProfile.
9. `calibration-service.ts` properly runs AI-powered calibration (verified, not broken).
10. `migration-service.ts` implements data import with validation and rollback.
11. `tone-training-service.ts` properly generates tone variants with AI (verified, not broken).
12. `wizard-service.ts` manages onboarding step progress with completion tracking.
13. All 6 test files pass with `npx jest tests/unit/developer/ tests/unit/admin/dlp tests/unit/admin/sso tests/unit/onboarding/`.
14. `jest.config.ts`, `package.json`, `tsconfig.json`, and `prisma/schema.prisma` are NOT modified.
15. All existing function signatures and exports are preserved.

## Implementation Steps

1. **Read all context files** listed above. Pay special attention to current implementation patterns, existing exports, TODO comments, and placeholder annotations in every service file.
2. **Create branch**: `git checkout -b ai-feature/p3-w12-dev-admin-onboarding`
3. **Read and implement `plugin-service.ts`**: Add plugin CRUD using Document model.
4. **Read and implement `custom-tool-service.ts`**: Add tool CRUD, schema validation, AI test execution.
5. **Read and verify `security-review-service.ts`**: Confirm AI security review works. Fix stubs if needed.
6. **Read and verify `webhook-service.ts`**: Confirm webhook management works. Fix stubs if needed.
7. **Read and implement `dlp-service.ts`**: Add DLP rules with regex scanning.
8. **Read and implement `ediscovery-service.ts`**: Add cross-content search.
9. **Read and implement `org-policy-service.ts`**: Add policy CRUD and enforcement.
10. **Read and implement `sso-service.ts`**: Add SSO config management.
11. **Read and verify `calibration-service.ts`**: Confirm AI calibration works. Fix stubs if needed.
12. **Read and implement `migration-service.ts`**: Add data import with validation.
13. **Read and verify `tone-training-service.ts`**: Confirm AI tone training works. Fix stubs if needed.
14. **Read and implement `wizard-service.ts`**: Add onboarding step management.
15. **Write tests**: Create all 6 test files with mocked Prisma and AI dependencies.
16. **Type-check**: `npx tsc --noEmit`
17. **Run tests**: `npx jest tests/unit/developer/ tests/unit/admin/dlp tests/unit/admin/sso tests/unit/onboarding/`
18. **Commit** with conventional commits.

## Tests Required

See Requirement 13 above for detailed test specifications. Each test file must:

- Mock `@/lib/db` with `jest.mock` providing relevant Prisma model mocks
- Mock `@/lib/ai` with `jest.mock` where services use AI
- Test all public functions with happy path + error cases
- Have 3-8 test cases minimum per file

## Commit Strategy

Make atomic commits in this order:

1. `feat(developer): implement plugin service with Document model CRUD`
   - Files: `src/modules/developer/services/plugin-service.ts`
2. `feat(developer): implement custom tool service with schema validation and AI test execution`
   - Files: `src/modules/developer/services/custom-tool-service.ts`
3. `chore(developer): verify security-review and webhook services from Phase 2`
   - Files: `src/modules/developer/services/security-review-service.ts`, `src/modules/developer/services/webhook-service.ts`
4. `feat(admin): implement DLP service with regex pattern scanning and violation reporting`
   - Files: `src/modules/admin/services/dlp-service.ts`
5. `feat(admin): implement ediscovery, org-policy, and SSO services`
   - Files: `src/modules/admin/services/ediscovery-service.ts`, `src/modules/admin/services/org-policy-service.ts`, `src/modules/admin/services/sso-service.ts`
6. `feat(onboarding): implement migration service and wizard with step tracking`
   - Files: `src/modules/onboarding/services/migration-service.ts`, `src/modules/onboarding/services/wizard-service.ts`
7. `chore(onboarding): verify calibration and tone-training services from Phase 2`
   - Files: `src/modules/onboarding/services/calibration-service.ts`, `src/modules/onboarding/services/tone-training-service.ts`
8. `test(developer,admin,onboarding): add unit tests for plugin, custom-tool, dlp, sso, wizard, calibration`
   - Files: All 6 test files

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
