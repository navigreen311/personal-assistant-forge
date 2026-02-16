# Worker 15: Tests for Admin, AI-Quality, Attention, Crisis

## Branch

`ai-feature/p3-w15-tests-group-a`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these:

- `tests/unit/admin/ediscovery-service.test.ts` (create)
- `tests/unit/admin/org-policy-service.test.ts` (create)
- `tests/unit/ai-quality/citation-service.test.ts` (create)
- `tests/unit/ai-quality/confidence-service.test.ts` (create)
- `tests/unit/ai-quality/override-tracking.test.ts` (create)
- `tests/unit/attention/notification-learning.test.ts` (create)
- `tests/unit/attention/one-thing-now.test.ts` (create)
- `tests/unit/crisis/detection-service.test.ts` (create)
- `tests/unit/crisis/escalation-service.test.ts` (create)
- `tests/unit/crisis/dead-man-switch.test.ts` (create)
- `tests/unit/crisis/war-room-service.test.ts` (create)

### Files you must NOT create or modify (owned by other workers)

- `tests/unit/admin/dlp-service.test.ts` -- Owned by Worker 12
- `tests/unit/admin/sso-service.test.ts` -- Owned by Worker 12
- `tests/unit/attention/budget-service.test.ts` -- Owned by Worker 11
- `tests/unit/attention/dnd-service.test.ts` -- Owned by Worker 11
- `tests/unit/ai-quality/accuracy-scorecard.test.ts` -- Already exists, do NOT modify

### Do NOT modify

- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- Any source files under `src/` -- this worker only creates test files
- Any files outside the owned paths above

## Context (read these first, do NOT modify)

Before writing any test, read the corresponding source service file to understand the public API, function signatures, parameters, and return types. Also read these shared files:

1. **`src/lib/ai/index.ts`** -- Exports `generateText(prompt, options?)`, `generateJSON<T>(prompt, options?)`, `chat(messages, options?)`, `streamText(prompt, options?)`.
2. **`src/lib/db/index.ts`** -- Exports `prisma` client instance.
3. **`prisma/schema.prisma`** -- Database models. Key models:
   - `Rule` model: used by DLP, org-policy
   - `Document` model: used by knowledge, plugins
   - `ActionLog` model: used for audit trails
   - `User` model: has `preferences` (Json)
   - `Task` model: used by attention/focus mode
   - `Message`, `Contact`, `Entity` models
   - `Notification` model if it exists

### Source files to read before writing each test group:

**Admin:**
4. **`src/modules/admin/services/ediscovery-service.ts`** -- E-discovery service. Read all exported functions.
5. **`src/modules/admin/services/org-policy-service.ts`** -- Org policy service. Read all exported functions.

**AI-Quality:**
6. **`src/modules/ai-quality/services/citation-service.ts`** -- Citation service. Read all exported functions.
7. **`src/modules/ai-quality/services/confidence-service.ts`** -- Confidence service. Read all exported functions.
8. **`src/modules/ai-quality/services/override-tracking-service.ts`** -- Override tracking service. Read all exported functions.

**Attention:**
9. **`src/modules/attention/services/notification-learning-service.ts`** -- Notification learning service. Read all exported functions.
10. **`src/modules/attention/services/one-thing-now-service.ts`** -- One-thing-now/focus service. Read all exported functions.

**Crisis:**
11. **`src/modules/crisis/services/detection-service.ts`** -- Crisis detection service. Read all exported functions.
12. **`src/modules/crisis/services/escalation-service.ts`** -- Crisis escalation service. Read all exported functions.
13. **`src/modules/crisis/services/dead-man-switch-service.ts`** -- Dead man's switch service. Read all exported functions.
14. **`src/modules/crisis/services/war-room-service.ts`** -- War room service. Read all exported functions.

**Existing test patterns (read for convention reference, do NOT modify):**
15. **`tests/unit/ai-quality/accuracy-scorecard.test.ts`** -- Existing test file. Read to understand test conventions used in this project (import patterns, mock setup, describe/it structure, assertion style).

## Requirements

For each test file, follow this process:

1. **Read the source service file first** to catalog all exported functions, their signatures, parameters, and return types.
2. **Identify dependencies** -- which Prisma models does the service use? Does it use AI functions?
3. **Set up mocks** for `@/lib/db` and `@/lib/ai` as needed.
4. **Write 3-8 test cases minimum** per file covering:
   - Happy path for each public function
   - Error/edge cases (empty results, invalid inputs, AI failures)
   - Return value structure validation
5. **Follow existing test conventions** from the accuracy-scorecard test file.

### Admin Tests

#### `tests/unit/admin/ediscovery-service.test.ts`

Read `src/modules/admin/services/ediscovery-service.ts` first.

```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@/lib/db', () => ({
  prisma: {
    message: { findMany: jest.fn() },
    document: { findMany: jest.fn() },
    // Add other models used by ediscovery
    rule: { create: jest.fn(), findMany: jest.fn() },
    actionLog: { create: jest.fn(), findMany: jest.fn() },
  },
}));

// Test cases to implement:
describe('EDiscoveryService', () => {
  describe('search', () => {
    it('should search across message content');
    it('should search across document content');
    it('should filter results by date range');
    it('should filter results by content type');
    it('should return empty results for no matches');
  });
  describe('createHold', () => {
    it('should create a legal hold rule');
    it('should prevent deletion of matching content');
  });
  describe('exportResults', () => {
    it('should export search results as structured JSON');
    it('should include metadata in export');
  });
});
```

#### `tests/unit/admin/org-policy-service.test.ts`

Read `src/modules/admin/services/org-policy-service.ts` first.

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    rule: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    actionLog: { create: jest.fn(), findMany: jest.fn() },
  },
}));

describe('OrgPolicyService', () => {
  describe('createPolicy', () => {
    it('should create a rule with scope ORG_POLICY');
    it('should store policy criteria in condition field');
  });
  describe('listPolicies', () => {
    it('should return all active policies for entity');
    it('should filter by entity ID');
  });
  describe('enforcePolicy', () => {
    it('should allow action when no policies violated');
    it('should block action when policy violated');
    it('should return violation details');
  });
  describe('getComplianceReport', () => {
    it('should aggregate violation data from ActionLog');
    it('should calculate compliance percentage');
  });
});
```

### AI-Quality Tests

#### `tests/unit/ai-quality/citation-service.test.ts`

Read `src/modules/ai-quality/services/citation-service.ts` first.

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    // Add models used by citation service
    document: { findMany: jest.fn(), findUnique: jest.fn() },
    actionLog: { create: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

describe('CitationService', () => {
  // Write tests based on the actual exported functions found in the service
  // Minimum 3-8 test cases covering:
  // - Citation extraction/verification
  // - Source matching
  // - AI-powered citation analysis if applicable
  // - Error handling
});
```

#### `tests/unit/ai-quality/confidence-service.test.ts`

Read `src/modules/ai-quality/services/confidence-service.ts` first.

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: { create: jest.fn(), findMany: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('ConfidenceService', () => {
  // Write tests based on the actual exported functions found in the service
  // Minimum 3-8 test cases covering:
  // - Confidence score calculation
  // - Threshold checks
  // - Historical confidence tracking
  // - Error handling
});
```

#### `tests/unit/ai-quality/override-tracking.test.ts`

Read `src/modules/ai-quality/services/override-tracking-service.ts` first.

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  },
}));

describe('OverrideTrackingService', () => {
  // Write tests based on the actual exported functions found in the service
  // Minimum 3-8 test cases covering:
  // - Recording user overrides of AI decisions
  // - Override rate calculation
  // - Override pattern analysis
  // - Error handling
});
```

### Attention Tests

#### `tests/unit/attention/notification-learning.test.ts`

Read `src/modules/attention/services/notification-learning-service.ts` first.

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    actionLog: { create: jest.fn(), findMany: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('NotificationLearningService', () => {
  describe('recordAction', () => {
    it('should log notification action in ActionLog');
    it('should handle read action');
    it('should handle dismiss action');
  });
  describe('getPreferences', () => {
    it('should analyze past actions to determine preferences');
    it('should calculate action rate by source');
    it('should handle user with no notification history');
  });
  describe('suggestPriority', () => {
    it('should suggest priority adjustment based on patterns');
    it('should call AI for analysis');
    it('should handle AI failure gracefully');
  });
});
```

#### `tests/unit/attention/one-thing-now.test.ts`

Read `src/modules/attention/services/one-thing-now-service.ts` first.

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    task: { findUnique: jest.fn() },
    actionLog: { create: jest.fn(), findMany: jest.fn() },
  },
}));

describe('OneThingNowService', () => {
  describe('setFocusTask', () => {
    it('should set focus task in user preferences');
    it('should record focus start time');
  });
  describe('getFocusTask', () => {
    it('should return current focus task details');
    it('should return null when no focus task set');
  });
  describe('clearFocusTask', () => {
    it('should clear focus mode from preferences');
    it('should log focus duration in ActionLog');
  });
  describe('shouldInterrupt', () => {
    it('should allow urgent notifications during focus');
    it('should suppress non-urgent notifications during focus');
    it('should allow all notifications when not in focus mode');
  });
});
```

### Crisis Tests

#### `tests/unit/crisis/detection-service.test.ts`

Read `src/modules/crisis/services/detection-service.ts` first.

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    // Add models used by detection service
    actionLog: { create: jest.fn(), findMany: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

describe('DetectionService', () => {
  // Write tests based on the actual exported functions found in the service
  // Minimum 3-8 test cases covering:
  // - Crisis signal detection
  // - Severity assessment
  // - False positive handling
  // - AI-powered analysis if applicable
  // - Error handling
});
```

#### `tests/unit/crisis/escalation-service.test.ts`

Read `src/modules/crisis/services/escalation-service.ts` first.

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findMany: jest.fn() },
    actionLog: { create: jest.fn(), findMany: jest.fn() },
    // Add other models used
  },
}));

describe('EscalationService', () => {
  // Write tests based on the actual exported functions found in the service
  // Minimum 3-8 test cases covering:
  // - Escalation path determination
  // - Notification of escalation targets
  // - Escalation level progression
  // - Error handling
});
```

#### `tests/unit/crisis/dead-man-switch.test.ts`

Read `src/modules/crisis/services/dead-man-switch-service.ts` first.

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    actionLog: { create: jest.fn(), findMany: jest.fn() },
    // Add other models used
  },
}));

describe('DeadManSwitchService', () => {
  // Write tests based on the actual exported functions found in the service
  // Minimum 3-8 test cases covering:
  // - Switch configuration (check-in interval, actions on trigger)
  // - Check-in recording
  // - Missed check-in detection
  // - Trigger action execution
  // - Error handling
});
```

#### `tests/unit/crisis/war-room-service.test.ts`

Read `src/modules/crisis/services/war-room-service.ts` first.

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    // Add models used by war room service
    actionLog: { create: jest.fn(), findMany: jest.fn() },
  },
}));

describe('WarRoomService', () => {
  // Write tests based on the actual exported functions found in the service
  // Minimum 3-8 test cases covering:
  // - War room creation/activation
  // - Participant management
  // - Status tracking
  // - Resolution/deactivation
  // - Error handling
});
```

## Acceptance Criteria

1. All 11 test files are created in the correct paths.
2. Each test file properly mocks `@/lib/db` with `jest.mock` providing relevant Prisma model mocks.
3. Each test file properly mocks `@/lib/ai` with `jest.mock` where the service uses AI functions.
4. Each test file has 3-8 test cases minimum covering happy path and error cases.
5. All tests pass with `npx jest tests/unit/admin/ediscovery tests/unit/admin/org-policy tests/unit/ai-quality/citation tests/unit/ai-quality/confidence tests/unit/ai-quality/override tests/unit/attention/notification-learning tests/unit/attention/one-thing-now tests/unit/crisis/`.
6. `tests/unit/ai-quality/accuracy-scorecard.test.ts` is NOT modified.
7. `tests/unit/admin/dlp-service.test.ts` and `tests/unit/admin/sso-service.test.ts` are NOT created (Worker 12 owns these).
8. `tests/unit/attention/budget-service.test.ts` and `tests/unit/attention/dnd-service.test.ts` are NOT created (Worker 11 owns these).
9. `jest.config.ts`, `package.json`, `tsconfig.json`, and `prisma/schema.prisma` are NOT modified.
10. No source files under `src/` are modified -- this worker only creates test files.
11. Test mock structures match the actual Prisma models used by each service.

## Implementation Steps

1. **Read shared context files**: `src/lib/ai/index.ts`, `src/lib/db/index.ts`, `prisma/schema.prisma`.
2. **Read existing test conventions**: `tests/unit/ai-quality/accuracy-scorecard.test.ts` to match import patterns, mock setup, and assertion style.
3. **Create branch**: `git checkout -b ai-feature/p3-w15-tests-group-a`
4. **Admin tests**:
   a. Read `src/modules/admin/services/ediscovery-service.ts`, catalog all exports.
   b. Create `tests/unit/admin/ediscovery-service.test.ts` with appropriate mocks and tests.
   c. Read `src/modules/admin/services/org-policy-service.ts`, catalog all exports.
   d. Create `tests/unit/admin/org-policy-service.test.ts` with appropriate mocks and tests.
5. **AI-Quality tests**:
   a. Read `src/modules/ai-quality/services/citation-service.ts`, catalog all exports.
   b. Create `tests/unit/ai-quality/citation-service.test.ts`.
   c. Read `src/modules/ai-quality/services/confidence-service.ts`, catalog all exports.
   d. Create `tests/unit/ai-quality/confidence-service.test.ts`.
   e. Read `src/modules/ai-quality/services/override-tracking-service.ts`, catalog all exports.
   f. Create `tests/unit/ai-quality/override-tracking.test.ts`.
6. **Attention tests**:
   a. Read `src/modules/attention/services/notification-learning-service.ts`, catalog all exports.
   b. Create `tests/unit/attention/notification-learning.test.ts`.
   c. Read `src/modules/attention/services/one-thing-now-service.ts`, catalog all exports.
   d. Create `tests/unit/attention/one-thing-now.test.ts`.
7. **Crisis tests**:
   a. Read `src/modules/crisis/services/detection-service.ts`, catalog all exports.
   b. Create `tests/unit/crisis/detection-service.test.ts`.
   c. Read `src/modules/crisis/services/escalation-service.ts`, catalog all exports.
   d. Create `tests/unit/crisis/escalation-service.test.ts`.
   e. Read `src/modules/crisis/services/dead-man-switch-service.ts`, catalog all exports.
   f. Create `tests/unit/crisis/dead-man-switch.test.ts`.
   g. Read `src/modules/crisis/services/war-room-service.ts`, catalog all exports.
   h. Create `tests/unit/crisis/war-room-service.test.ts`.
8. **Ensure test directories exist**: Create `tests/unit/admin/`, `tests/unit/ai-quality/`, `tests/unit/attention/`, `tests/unit/crisis/` directories if they don't exist (use `mkdir -p`).
9. **Run tests**: `npx jest tests/unit/admin/ediscovery tests/unit/admin/org-policy tests/unit/ai-quality/citation tests/unit/ai-quality/confidence tests/unit/ai-quality/override tests/unit/attention/notification-learning tests/unit/attention/one-thing-now tests/unit/crisis/`
10. **Commit** with conventional commits.

## Tests Required

This entire worker IS a test worker. See the Requirements section above for detailed test specifications. Key rules:

- **Read each service file BEFORE writing tests** -- do not guess at function signatures
- Mock `@/lib/db` with `jest.mock` -- provide only the Prisma models that the specific service actually uses
- Mock `@/lib/ai` with `jest.mock` -- only for services that import from `@/lib/ai`
- Test all public/exported functions
- Include both happy path and error/edge cases
- Each test file must have 3-8 test cases minimum
- Use `beforeEach` to reset mocks: `jest.clearAllMocks()`
- Use descriptive test names that explain the expected behavior
- Validate return value shapes, not just truthy/falsy

## Commit Strategy

Make atomic commits in this order, one per module group:

1. `test(admin): add unit tests for ediscovery and org-policy services`
   - Files: `tests/unit/admin/ediscovery-service.test.ts`, `tests/unit/admin/org-policy-service.test.ts`
2. `test(ai-quality): add unit tests for citation, confidence, and override-tracking services`
   - Files: `tests/unit/ai-quality/citation-service.test.ts`, `tests/unit/ai-quality/confidence-service.test.ts`, `tests/unit/ai-quality/override-tracking.test.ts`
3. `test(attention): add unit tests for notification-learning and one-thing-now services`
   - Files: `tests/unit/attention/notification-learning.test.ts`, `tests/unit/attention/one-thing-now.test.ts`
4. `test(crisis): add unit tests for detection, escalation, dead-man-switch, and war-room services`
   - Files: `tests/unit/crisis/detection-service.test.ts`, `tests/unit/crisis/escalation-service.test.ts`, `tests/unit/crisis/dead-man-switch.test.ts`, `tests/unit/crisis/war-room-service.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
