# Worker 16: Tests for Delegation, Developer, and Documents Modules

## Branch

`ai-feature/p3-w16-tests-group-b`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (CREATE only, do NOT modify existing files)

You are strictly limited to **creating** the following test files. Do NOT modify any existing files or create files outside this list:

- `tests/unit/delegation/delegation-service.test.ts`
- `tests/unit/delegation/scoring-service.test.ts`
- `tests/unit/developer/webhook-service.test.ts`
- `tests/unit/developer/security-review.test.ts`
- `tests/unit/documents/template-service.test.ts`
- `tests/unit/documents/esign-service.test.ts`
- `tests/unit/documents/brand-kit-service.test.ts`
- `tests/unit/documents/generation-service.test.ts`

**DO NOT create or modify:**
- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- `tests/unit/delegation/delegation-inbox.test.ts` (Worker 11 owns)
- `tests/unit/delegation/role-service.test.ts` (Worker 11 owns)
- `tests/unit/developer/plugin-service.test.ts` (Worker 12 owns)
- `tests/unit/developer/custom-tool-service.test.ts` (Worker 12 owns)
- Any `tests/unit/health/*` (Worker 05 owns)

## Context (read these first, do NOT modify)

Before writing any tests, read and internalize these source files to understand each service's public API, types, and dependencies:

1. **`src/modules/delegation/services/delegation-service.ts`** -- Exports: `delegateTask`, `getDelegatedTasks`, `advanceApproval`, `completeDelegation`, `buildContextPack`, `delegationStore`. Uses `prisma` from `@/lib/db` and `generateText` from `@/lib/ai` (only in `buildContextPack`). Uses in-memory `Map` store for delegations.
2. **`src/modules/delegation/services/delegation-scoring-service.ts`** -- Exports: `calculateScore`, `getBestDelegate`, `getScoreboard`. Imports `delegationStore` from `delegation-service`. Pure computation on in-memory data; no Prisma or AI calls.
3. **`src/modules/developer/services/webhook-service.ts`** -- Exports: `createWebhook`, `getWebhooks`, `deleteWebhook`, `triggerWebhook`, `getWebhookEvents`, `retryFailedEvent`, `getDebuggingSuggestions`, `verifyWebhookSignature`, `webhookStore`, `webhookEventStore`. Uses `generateText` from `@/lib/ai` (in `getDebuggingSuggestions` only). In-memory stores.
4. **`src/modules/developer/services/security-review-service.ts`** -- Exports: `requestReview`, `conductReview`, `getReview`, `breakGlassRevoke`, `reviewStore`. Imports `pluginStore` from `plugin-service`. Uses `generateJSON` from `@/lib/ai` (in `conductReview`). In-memory stores.
5. **`src/modules/documents/services/template-service.ts`** -- Exports: `getDefaultTemplates`, `getTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `templateStore`. No AI or Prisma calls. In-memory store seeded with 10 default templates.
6. **`src/modules/documents/services/esign-service.ts`** -- Exports: `createSignRequest`, `getSignStatus`, `cancelSignRequest`, `esignStore`. No AI or Prisma. In-memory store.
7. **`src/modules/documents/services/brand-kit-service.ts`** -- Exports: `getBrandKit`, `updateBrandKit`, `brandKitStore`. No AI or Prisma. In-memory store.
8. **`src/modules/documents/services/document-generation-service.ts`** -- Exports: `generateDocument`, `renderTemplate`, `applyBrandKit`, `convertFormat`. Uses `generateText` and `generateJSON` from `@/lib/ai`. Calls `getTemplate` from `template-service`.
9. **`tests/__mocks__/uuid.ts`** -- Mock for `uuid.v4()` returning deterministic `mock-uuid-N-timestamp` strings.
10. **`tests/unit/engines/adoption-coaching.test.ts`** -- Example test file showing the project's testing pattern: mock `@/lib/ai` with `jest.mock`, then import functions, use `jest.MockedFunction`, clear mocks in `beforeEach`.

**Important patterns to follow:**
- Import the service under test first, then mock dependencies.
- Use `jest.mock('@/lib/ai', () => ({ ... }))` at the top level.
- Use `jest.mock('@/lib/db', () => ({ prisma: { ... } }))` when Prisma is used.
- Clear in-memory stores in `beforeEach` using the exported store references (e.g., `delegationStore.clear()`).
- Use `describe` / `it` blocks with descriptive names.

## Requirements

### 1. `tests/unit/delegation/delegation-service.test.ts`

Read `src/modules/delegation/services/delegation-service.ts` before writing.

Mock `@/lib/db` (Prisma) and `@/lib/ai` (generateText) since `buildContextPack` uses both.

Test cases (minimum 5):
1. `delegateTask` creates a delegation with PENDING status, 3-step approval chain, and correct delegatedBy/delegatedTo
2. `getDelegatedTasks` with direction `delegated_by` returns only tasks delegated by the given user
3. `getDelegatedTasks` with direction `delegated_to` returns only tasks delegated to the given user
4. `advanceApproval` with APPROVED status updates the step and sets delegation to IN_REVIEW when not all steps are approved
5. `advanceApproval` with REJECTED status sets overall delegation status to REJECTED
6. `advanceApproval` when all steps approved sets overall status to APPROVED
7. `completeDelegation` sets status to COMPLETED and sets completedAt
8. `buildContextPack` calls Prisma for task, documents, messages and calls AI for summary

### 2. `tests/unit/delegation/scoring-service.test.ts`

Read `src/modules/delegation/services/delegation-scoring-service.ts` before writing.

No mocks needed for AI/Prisma (pure computation). Import and manipulate `delegationStore` directly.

Test cases (minimum 4):
1. `calculateScore` returns zero score for delegatee with no delegations
2. `calculateScore` returns correct score for delegatee with completed/approved delegations
3. `getBestDelegate` returns the highest-scoring delegatee
4. `getScoreboard` returns all delegatees sorted by score descending

### 3. `tests/unit/developer/webhook-service.test.ts`

Read `src/modules/developer/services/webhook-service.ts` before writing.

Mock `@/lib/ai` (generateText used in `getDebuggingSuggestions`).

Test cases (minimum 5):
1. `createWebhook` creates webhook with correct fields, active status, and zero failure count
2. `getWebhooks` returns only webhooks for the given entityId
3. `deleteWebhook` removes the webhook; throws for unknown ID
4. `triggerWebhook` creates an event with DELIVERED status and updates lastTriggered
5. `getWebhookEvents` returns events for a webhook sorted by createdAt descending
6. `retryFailedEvent` increments attempts and sets status to DELIVERED
7. `verifyWebhookSignature` returns true for valid HMAC and false for invalid
8. `getDebuggingSuggestions` returns success message for non-FAILED events

### 4. `tests/unit/developer/security-review.test.ts`

Read `src/modules/developer/services/security-review-service.ts` before writing.

Mock `@/lib/ai` (generateJSON used in `conductReview`). Also mock `@/modules/developer/services/plugin-service` to provide a mock `pluginStore`.

Test cases (minimum 4):
1. `requestReview` creates a PENDING review for an existing plugin
2. `conductReview` with safe permissions returns APPROVED status
3. `conductReview` with dangerous permissions (e.g., `admin.all`) returns REJECTED with HIGH findings
4. `conductReview` with path traversal in entryPoint returns REJECTED with CRITICAL finding
5. `breakGlassRevoke` sets plugin status to REVOKED
6. `getReview` returns null for unknown pluginId

### 5. `tests/unit/documents/template-service.test.ts`

Read `src/modules/documents/services/template-service.ts` before writing.

No AI/Prisma mocks needed.

Test cases (minimum 4):
1. `getDefaultTemplates` returns 10 default templates
2. `getTemplates` with no filter returns all templates; with type filter returns matching only
3. `getTemplate` returns the template for a known ID and null for unknown
4. `createTemplate` creates a new template with generated ID, version 1, and timestamps
5. `updateTemplate` increments version and updates the template; throws for unknown ID

### 6. `tests/unit/documents/esign-service.test.ts`

Read `src/modules/documents/services/esign-service.ts` before writing.

No AI/Prisma mocks needed.

Test cases (minimum 3):
1. `createSignRequest` creates a request with DRAFT status and signers with PENDING status
2. `getSignStatus` returns the request for known ID; throws for unknown
3. `cancelSignRequest` sets status to CANCELLED; throws for unknown

### 7. `tests/unit/documents/brand-kit-service.test.ts`

Read `src/modules/documents/services/brand-kit-service.ts` before writing.

No AI/Prisma mocks needed.

Test cases (minimum 3):
1. `getBrandKit` returns null for entity with no brand kit
2. `updateBrandKit` creates a brand kit with defaults when none exists
3. `updateBrandKit` merges partial updates into existing brand kit

### 8. `tests/unit/documents/generation-service.test.ts`

Read `src/modules/documents/services/document-generation-service.ts` before writing.

Mock `@/lib/ai` (generateText and generateJSON).

Test cases (minimum 4):
1. `renderTemplate` replaces `{{variable}}` placeholders with provided values
2. `applyBrandKit` prepends style tag and optional logo header
3. `generateDocument` calls getTemplate, renders, and returns a Document with DRAFT status
4. `generateDocument` with `citationsEnabled` includes AI-suggested citations
5. `generateDocument` throws when template not found
6. `convertFormat` returns content as-is (placeholder behavior)

## Acceptance Criteria

- [ ] All 8 test files are created in the correct paths under `tests/unit/`.
- [ ] Each test file has 3-8 test cases minimum as specified.
- [ ] All `@/lib/db` and `@/lib/ai` dependencies are mocked with `jest.mock`.
- [ ] In-memory stores are cleared in `beforeEach` blocks to ensure test isolation.
- [ ] Tests cover both happy paths and error cases (e.g., not found, invalid input).
- [ ] All tests pass when run with `npx jest tests/unit/delegation tests/unit/developer tests/unit/documents --passWithNoTests`.
- [ ] No modifications to any file outside Owned Paths.
- [ ] No modifications to `jest.config.ts`, `package.json`, `tsconfig.json`, or `prisma/schema.prisma`.

## Implementation Steps

1. Read all Context source files listed above to understand each service's API.
2. Create `tests/unit/delegation/` directory if it doesn't exist.
3. Create `tests/unit/delegation/delegation-service.test.ts`:
   a. Mock `@/lib/db` with Prisma stubs for `task.findUnique`, `document.findMany`, `message.findMany`.
   b. Mock `@/lib/ai` with `generateText` stub.
   c. Import `delegateTask`, `getDelegatedTasks`, `advanceApproval`, `completeDelegation`, `buildContextPack`, `delegationStore`.
   d. Clear `delegationStore` in `beforeEach`.
   e. Write test cases as specified.
4. Create `tests/unit/delegation/scoring-service.test.ts`:
   a. Import `calculateScore`, `getBestDelegate`, `getScoreboard` and `delegationStore`.
   b. Seed `delegationStore` with test data in `beforeEach`.
   c. Write test cases as specified.
5. Create `tests/unit/developer/` directory if it doesn't exist.
6. Create `tests/unit/developer/webhook-service.test.ts`:
   a. Mock `@/lib/ai` with `generateText` stub.
   b. Import all webhook service functions and stores.
   c. Clear stores in `beforeEach`.
   d. Write test cases as specified.
7. Create `tests/unit/developer/security-review.test.ts`:
   a. Mock `@/lib/ai` with `generateJSON` stub.
   b. Mock `@/modules/developer/services/plugin-service` exporting a mock `pluginStore`.
   c. Import review service functions and stores.
   d. Seed `pluginStore` with test plugins in `beforeEach`.
   e. Write test cases as specified.
8. Create `tests/unit/documents/` directory if it doesn't exist.
9. Create `tests/unit/documents/template-service.test.ts`:
   a. Import template service functions and store.
   b. Write test cases as specified.
10. Create `tests/unit/documents/esign-service.test.ts`:
    a. Import esign service functions and store.
    b. Clear store in `beforeEach`.
    c. Write test cases as specified.
11. Create `tests/unit/documents/brand-kit-service.test.ts`:
    a. Import brand kit service functions and store.
    b. Clear store in `beforeEach`.
    c. Write test cases as specified.
12. Create `tests/unit/documents/generation-service.test.ts`:
    a. Mock `@/lib/ai` with `generateText` and `generateJSON` stubs.
    b. Import generation service functions.
    c. Write test cases as specified.
13. Run all tests: `npx jest tests/unit/delegation tests/unit/developer tests/unit/documents --passWithNoTests`.
14. Fix any failures.

## Tests Required

This worker IS the test worker. All test files listed in Owned Paths must be created and passing.

Verify with:
```bash
npx jest tests/unit/delegation/delegation-service.test.ts tests/unit/delegation/scoring-service.test.ts tests/unit/developer/webhook-service.test.ts tests/unit/developer/security-review.test.ts tests/unit/documents/template-service.test.ts tests/unit/documents/esign-service.test.ts tests/unit/documents/brand-kit-service.test.ts tests/unit/documents/generation-service.test.ts --passWithNoTests
```

## Commit Strategy

**Commit 1:** `test: add delegation-service and scoring-service unit tests`
- Files: `tests/unit/delegation/delegation-service.test.ts`, `tests/unit/delegation/scoring-service.test.ts`

**Commit 2:** `test: add webhook-service and security-review unit tests`
- Files: `tests/unit/developer/webhook-service.test.ts`, `tests/unit/developer/security-review.test.ts`

**Commit 3:** `test: add documents module unit tests (template, esign, brand-kit, generation)`
- Files: `tests/unit/documents/template-service.test.ts`, `tests/unit/documents/esign-service.test.ts`, `tests/unit/documents/brand-kit-service.test.ts`, `tests/unit/documents/generation-service.test.ts`
