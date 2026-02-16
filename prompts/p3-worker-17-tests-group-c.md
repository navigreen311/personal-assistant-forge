# Worker 17: Tests for Onboarding and Middleware Modules

## Branch

`ai-feature/p3-w17-tests-group-c`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (CREATE only, do NOT modify existing files)

You are strictly limited to **creating** the following test files. Do NOT modify any existing files or create files outside this list:

- `tests/unit/onboarding/migration-service.test.ts`
- `tests/unit/onboarding/tone-training.test.ts`
- `tests/unit/middleware/auth.test.ts`
- `tests/unit/middleware/compliance.test.ts`
- `tests/unit/middleware/security.test.ts`

**DO NOT create or modify:**
- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- `tests/unit/household/*` (Worker 07 owns)
- `tests/unit/travel/*` (Worker 06 owns)
- `tests/unit/onboarding/wizard-service.test.ts` (Worker 12 owns)
- `tests/unit/onboarding/calibration-service.test.ts` (Worker 12 owns)
- `tests/unit/middleware/cors.test.ts` (already exists)
- `tests/unit/middleware/rate-limit.test.ts` (already exists)

## Context (read these first, do NOT modify)

Before writing any tests, read and internalize these source files to understand each module's public API:

1. **`src/modules/onboarding/services/migration-service.ts`** -- Exports: `getAvailableSources`, `initiateImport`, `getImportStatus`, `cancelImport`, `importStore`. No AI or Prisma. Returns `DataMigrationSource` objects with statuses like `NOT_STARTED`, `IMPORTING`. Uses in-memory `Map` keyed by `userId:sourceId`.
2. **`src/modules/onboarding/services/tone-training-service.ts`** -- Exports: `generateSample`, `rateSample`, `getSamples`, `applyTraining`, `sampleStore`. Uses `generateText` and `generateJSON` from `@/lib/ai`. In-memory `Map` store keyed by sample ID.
3. **`src/shared/middleware/auth.ts`** -- Exports: `withAuth`, `withRole`, `withEntityAccess`. Uses `getToken` from `next-auth/jwt` and `prisma` from `@/lib/db`. Uses `error` from `@/shared/utils/api-response`.
   - `withAuth`: Extracts token via `getToken`, returns 401 if no `token.userId`, builds `AuthSession` object, calls handler.
   - `withRole`: Wraps `withAuth`, checks if `session.role` is in allowed `roles` array, returns 403 if not.
   - `withEntityAccess`: Wraps `withAuth`, queries `prisma.entity.findUnique` to verify entity exists and belongs to user, returns 404/403 as appropriate.
4. **`src/shared/middleware/compliance.ts`** -- Exports: `withClassificationEnforcement`, `withConsentCheck`, `withHIPAAGuard`, `classificationExceeds`, `CLASSIFICATION_LEVELS`. Imports from `@/modules/security/services/*` (complianceService, consentService, classificationService, redactionService, auditService).
   - `withClassificationEnforcement`: Wraps handler, classifies JSON response content, auto-redacts if classification exceeds allowed level. Optionally entity-aware.
   - `withConsentCheck`: Extracts entityId from headers and contactId from query/body, checks consent via `consentService.checkConsent`, returns 403 if no consent.
   - `withHIPAAGuard`: Checks if entity is HIPAA-regulated, enforces PHI protection on responses, adds `X-HIPAA-Enforced` headers.
5. **`src/shared/middleware/security.ts`** -- Exports: `withAuditLog`, `withInputSanitization`, `withRateLimit`, `withSecurity`, `checkRateLimit`, `containsInjectionPattern`, `stripHtmlTags`, `checkInputLength`, `rateLimitStore`. Imports `auditService` from security module.
   - `withAuditLog`: Wraps handler, logs request/response details via auditService after handler completes.
   - `withInputSanitization`: Checks POST/PUT/PATCH body for SQL injection, XSS, NoSQL injection patterns. Checks URL params. Returns 400 on violation.
   - `withRateLimit`: Tracks requests per window per key (IP/USER/API_KEY/ENTITY). Returns 429 with Retry-After header when exceeded.
   - `withSecurity`: Composes sanitization + rate limit + audit.
6. **`tests/unit/engines/adoption-coaching.test.ts`** -- Example test showing project patterns for mocking `@/lib/ai`.

**Important patterns:**
- Mock `next-auth/jwt` with `jest.mock('next-auth/jwt', ...)` for auth tests.
- Mock `@/lib/db` with `jest.mock('@/lib/db', ...)` for auth middleware entity lookups.
- Mock `@/shared/utils/api-response` or use real implementation since `error()` returns `Response` objects.
- For middleware tests, create mock `NextRequest` objects with `new NextRequest('http://localhost/test', { ... })`.
- For compliance/security middleware, mock the security service imports.

## Requirements

### 1. `tests/unit/onboarding/migration-service.test.ts`

Read `src/modules/onboarding/services/migration-service.ts` before writing.

No AI/Prisma mocks needed.

Test cases (minimum 5):
1. `getAvailableSources` returns 9 predefined sources with NOT_STARTED status
2. `initiateImport` sets source to IMPORTING with isConnected=true
3. `initiateImport` throws for unknown sourceId
4. `getImportStatus` returns current status for an imported source
5. `getImportStatus` returns default source info when no import has been started
6. `cancelImport` resets source to NOT_STARTED with isConnected=false

### 2. `tests/unit/onboarding/tone-training.test.ts`

Read `src/modules/onboarding/services/tone-training-service.ts` before writing.

Mock `@/lib/ai` with both `generateText` and `generateJSON` stubs.

Test cases (minimum 5):
1. `generateSample` creates a sample with correct userId, context, and default rating of 0
2. `generateSample` calls AI generateText to produce the sample text
3. `generateSample` falls back to template text when AI fails
4. `rateSample` updates userRating and adjustments on existing sample
5. `rateSample` throws for unknown sampleId
6. `getSamples` returns only samples for the given userId
7. `applyTraining` returns tone profile with averageRating, formality, and topAdjustments
8. `applyTraining` calls AI generateJSON to produce enhanced profile; falls back on AI failure

### 3. `tests/unit/middleware/auth.test.ts`

Read `src/shared/middleware/auth.ts` before writing.

Mock `next-auth/jwt` (getToken), `@/lib/db` (prisma.entity.findUnique), and `@/shared/utils/api-response` (error function).

Test cases (minimum 6):
1. `withAuth` returns 401 when `getToken` returns null (no token)
2. `withAuth` returns 401 when token has no `userId` field
3. `withAuth` calls handler with session containing userId, email, name, role when token is valid
4. `withRole` returns 403 when session role is not in allowed roles list
5. `withRole` calls handler when session role matches one of the allowed roles
6. `withEntityAccess` returns 404 when entity is not found in database
7. `withEntityAccess` returns 403 when entity.userId does not match session.userId
8. `withEntityAccess` calls handler when entity exists and belongs to the authenticated user

### 4. `tests/unit/middleware/compliance.test.ts`

Read `src/shared/middleware/compliance.ts` before writing.

Mock all imported security services: `complianceService`, `consentService`, `classificationService`, `redactionService`, `auditService`.

Test cases (minimum 5):
1. `classificationExceeds` returns true when actual classification level is higher than allowed
2. `classificationExceeds` returns false when actual is equal to or lower than allowed
3. `withClassificationEnforcement` passes through non-JSON responses unmodified
4. `withClassificationEnforcement` auto-redacts response when classification exceeds allowed level
5. `withConsentCheck` returns 400 when x-entity-id header is missing
6. `withConsentCheck` returns 400 when contactId param is missing
7. `withConsentCheck` returns 403 when consent is not granted
8. `withConsentCheck` passes through to handler when consent is granted

### 5. `tests/unit/middleware/security.test.ts`

Read `src/shared/middleware/security.ts` before writing.

Mock `@/modules/security/services/audit-service` (auditService.logAuditEntry).

Test cases (minimum 6):
1. `stripHtmlTags` removes all HTML tags from input string
2. `containsInjectionPattern` detects SQL injection patterns (e.g., `SELECT * FROM users`)
3. `containsInjectionPattern` detects XSS patterns (e.g., `<script>alert(1)</script>`)
4. `containsInjectionPattern` returns `{ blocked: false }` for clean input
5. `checkInputLength` returns false when any string in body exceeds max length
6. `withInputSanitization` returns 400 with MALICIOUS_INPUT code when POST body contains SQL injection
7. `withInputSanitization` returns 400 when query params contain injection patterns
8. `withRateLimit` allows requests within the limit and returns 429 when exceeded

## Acceptance Criteria

- [ ] All 5 test files are created in the correct paths under `tests/unit/`.
- [ ] Each test file has 5-8 test cases as specified.
- [ ] All external dependencies (`next-auth/jwt`, `@/lib/db`, `@/lib/ai`, security services) are properly mocked.
- [ ] In-memory stores are cleared in `beforeEach` blocks for test isolation.
- [ ] Tests cover both happy paths and error cases.
- [ ] All tests pass when run with `npx jest tests/unit/onboarding tests/unit/middleware --passWithNoTests`.
- [ ] No modifications to any file outside Owned Paths.
- [ ] No modifications to `jest.config.ts`, `package.json`, `tsconfig.json`, or `prisma/schema.prisma`.
- [ ] Existing test files `tests/unit/middleware/cors.test.ts` and `tests/unit/middleware/rate-limit.test.ts` are not touched.

## Implementation Steps

1. Read all Context source files listed above to understand each module's API.
2. Create `tests/unit/onboarding/` directory if it doesn't exist.
3. Create `tests/unit/onboarding/migration-service.test.ts`:
   a. Import `getAvailableSources`, `initiateImport`, `getImportStatus`, `cancelImport`, `importStore`.
   b. Clear `importStore` in `beforeEach`.
   c. Write test cases as specified.
4. Create `tests/unit/onboarding/tone-training.test.ts`:
   a. Mock `@/lib/ai` with `generateText` and `generateJSON` stubs.
   b. Import `generateSample`, `rateSample`, `getSamples`, `applyTraining`, `sampleStore`.
   c. Clear `sampleStore` and mock state in `beforeEach`.
   d. Write test cases as specified.
5. Create `tests/unit/middleware/` directory if it doesn't exist (it should already exist since `cors.test.ts` and `rate-limit.test.ts` are there).
6. Create `tests/unit/middleware/auth.test.ts`:
   a. Mock `next-auth/jwt` with `getToken` returning configurable tokens.
   b. Mock `@/lib/db` with `prisma.entity.findUnique` returning configurable results.
   c. Mock `@/shared/utils/api-response` with `error` returning proper Response objects.
   d. Create helper function to build mock `NextRequest` objects.
   e. Write test cases as specified. For each test, configure mocks, create request, call middleware, assert response status/body.
7. Create `tests/unit/middleware/compliance.test.ts`:
   a. Mock all security service modules: `@/modules/security/services/compliance-service`, `@/modules/security/services/consent-service`, `@/modules/security/services/classification-service`, `@/modules/security/services/redaction-service`, `@/modules/security/services/audit-service`.
   b. Import `withClassificationEnforcement`, `withConsentCheck`, `withHIPAAGuard`, `classificationExceeds`.
   c. Create helper function to build mock `NextRequest` with configurable headers and URL params.
   d. Write test cases as specified.
8. Create `tests/unit/middleware/security.test.ts`:
   a. Mock `@/modules/security/services/audit-service` with `auditService.logAuditEntry` returning resolved promise.
   b. Import exported helper functions: `containsInjectionPattern`, `stripHtmlTags`, `checkInputLength`, `rateLimitStore`.
   c. Import middleware functions: `withInputSanitization`, `withRateLimit`, `withAuditLog`.
   d. Clear `rateLimitStore` in `beforeEach`.
   e. Create helper function to build mock `NextRequest` with configurable method, body, and query params.
   f. Write test cases as specified.
9. Run all tests: `npx jest tests/unit/onboarding tests/unit/middleware --passWithNoTests`.
10. Fix any failures.

## Tests Required

This worker IS the test worker. All test files listed in Owned Paths must be created and passing.

Verify with:
```bash
npx jest tests/unit/onboarding/migration-service.test.ts tests/unit/onboarding/tone-training.test.ts tests/unit/middleware/auth.test.ts tests/unit/middleware/compliance.test.ts tests/unit/middleware/security.test.ts --passWithNoTests
```

## Commit Strategy

**Commit 1:** `test: add onboarding migration-service and tone-training unit tests`
- Files: `tests/unit/onboarding/migration-service.test.ts`, `tests/unit/onboarding/tone-training.test.ts`

**Commit 2:** `test: add auth middleware unit tests`
- Files: `tests/unit/middleware/auth.test.ts`

**Commit 3:** `test: add compliance and security middleware unit tests`
- Files: `tests/unit/middleware/compliance.test.ts`, `tests/unit/middleware/security.test.ts`
