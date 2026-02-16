# Worker 11: Complete Delegation + Attention Modules

## Branch

`ai-feature/p3-w11-delegation-attention`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/delegation/services/delegation-inbox-service.ts`
- `src/modules/delegation/services/delegation-scoring-service.ts`
- `src/modules/delegation/services/delegation-service.ts`
- `src/modules/delegation/services/role-service.ts`
- `src/modules/attention/services/attention-budget-service.ts`
- `src/modules/attention/services/dnd-service.ts`
- `src/modules/attention/services/notification-bundler.ts`
- `src/modules/attention/services/notification-learning-service.ts`
- `src/modules/attention/services/one-thing-now-service.ts`
- `src/modules/attention/services/priority-router.ts`
- `tests/unit/delegation/delegation-inbox.test.ts`
- `tests/unit/delegation/role-service.test.ts`
- `tests/unit/attention/budget-service.test.ts`
- `tests/unit/attention/dnd-service.test.ts`

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
   - `withAuth(req, handler)` -- Validates JWT, passes `AuthSession` (userId, email, name, role, activeEntityId) to handler. Returns 401.
   - `withRole(req, roles, handler)` -- Checks role. Returns 403.
   - `withEntityAccess(req, entityId, handler)` -- Verifies entity ownership. Returns 403/404.
4. **`prisma/schema.prisma`** -- Database models for Task, User, Entity, Contact, ActionLog. Pay attention to:
   - `Task` model: has `assigneeId`, `status`, `priority`, `createdFrom` (Json), `entityId`
   - `User` model: has `preferences` (Json), `role`, `entityMemberships`
   - `Entity` model: organization-level grouping
5. **`src/modules/delegation/types/`** -- Delegation types if they exist. Read to understand interfaces.
6. **`src/modules/attention/types/`** -- Attention types if they exist. Read to understand interfaces.
7. **`src/modules/delegation/services/delegation-inbox-service.ts`** -- Current implementation. May be stub or partial.
8. **`src/modules/delegation/services/delegation-scoring-service.ts`** -- Current implementation.
9. **`src/modules/delegation/services/delegation-service.ts`** -- Current implementation.
10. **`src/modules/delegation/services/role-service.ts`** -- Current implementation.
11. **`src/modules/attention/services/attention-budget-service.ts`** -- Current implementation.
12. **`src/modules/attention/services/dnd-service.ts`** -- Current implementation.
13. **`src/modules/attention/services/notification-bundler.ts`** -- Was AI-enhanced in Phase 2.
14. **`src/modules/attention/services/notification-learning-service.ts`** -- Current implementation.
15. **`src/modules/attention/services/one-thing-now-service.ts`** -- Current implementation.
16. **`src/modules/attention/services/priority-router.ts`** -- Was AI-enhanced in Phase 2.

## Requirements

### 1. Delegation Inbox Service (`src/modules/delegation/services/delegation-inbox-service.ts`)

**Read the file first** to understand the current implementation.

If returning empty arrays or using stubs, implement the following:

- **`getDelegatableTasks(entityId: string)`**: Query `prisma.task.findMany` where `assigneeId` is null and `entityId` matches. For each task, call the delegation scoring service to score delegatability. Store scores in `Task.createdFrom` JSON field (merge with existing data).
- **`getInboxForDelegate(userId: string, entityId: string)`**: Query tasks assigned to the user that need attention (status IN_PROGRESS or PENDING, ordered by priority and dueDate).
- **`assignTask(taskId: string, assigneeId: string, assignedBy: string)`**: Update task's `assigneeId`, set status to PENDING, log the delegation in ActionLog.
- **`getDelegationStats(entityId: string)`**: Return counts of delegated tasks by status, average completion time, delegation success rate.

Use `import { prisma } from '@/lib/db'` for all database queries. Use `import { generateJSON } from '@/lib/ai'` if AI scoring is needed. Keep existing function signatures and exports intact. Wrap AI calls in try/catch.

### 2. Delegation Scoring Service (`src/modules/delegation/services/delegation-scoring-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement a scoring algorithm:

- **`scoreDelegatability(task, delegates)`**: Score each potential delegate for a task. Consider:
  - Task complexity (derived from description length, subtask count, priority)
  - Delegate skill match (from user preferences or role metadata)
  - Current workload balance (count of active tasks per delegate)
  - Past performance (query ActionLog for completed delegated tasks)
- **`scoreTask(task)`**: Return a delegatability score (0-1) indicating how suitable a task is for delegation.
- Use AI via `generateJSON` for nuanced scoring when simple heuristics are insufficient. Build a prompt including task details and delegate profiles.
- Wrap AI calls in try/catch; fall back to heuristic scoring on failure.

### 3. Delegation Service (`src/modules/delegation/services/delegation-service.ts`)

**Read the file first** to understand the current implementation.

Ensure the service properly manages the delegation lifecycle:

- **`delegateTask(taskId, assigneeId, assignedBy, notes?)`**: Assign a task to a delegate. Update `Task.assigneeId`, set status to PENDING, record in ActionLog with `actionType: 'DELEGATE'`.
- **`trackDelegation(taskId)`**: Get delegation status -- who it's assigned to, when, current status, any blockers.
- **`completeDelegation(taskId, completedBy)`**: Mark task as COMPLETED, update ActionLog with completion timestamp.
- **`revokeDelegation(taskId, reason)`**: Unassign task (set `assigneeId` to null), set status back to TODO, log revocation.
- Keep existing function signatures/exports intact. Add new functions only if they don't exist.

### 4. Role Service (`src/modules/delegation/services/role-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement role management:

- **`createRole(entityId, name, permissions)`**: Store role definition. Use a consistent storage approach -- if the module uses a specific model, use that; otherwise store in `prisma.document.create` with `type: 'ROLE_DEFINITION'` and role data in the `content` JSON field.
- **`getRoles(entityId)`**: List all roles for an entity.
- **`assignRole(userId, roleId, entityId)`**: Assign a user to a role. Update user preferences or entity membership with the role reference.
- **`checkPermission(userId, permission, entityId)`**: Check if a user has a specific permission through their assigned roles. Return boolean.
- **`removeRole(userId, roleId, entityId)`**: Remove a role assignment from a user.

### 5. Attention Budget Service (`src/modules/attention/services/attention-budget-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement daily attention budget tracking:

- **`getBudget(userId)`**: Retrieve the user's current attention budget for today. Store budget config in `User.preferences` JSON (e.g., `{ attentionBudget: { daily: 100, remaining: 75, lastReset: "2026-02-16" } }`).
- **`deductBudget(userId, amount, reason)`**: Subtract from today's budget. Log the deduction. If budget was already at 0, still allow but flag as over-budget.
- **`resetBudget(userId)`**: Reset to daily limit. Called at start of each day (check `lastReset` date).
- **`setBudgetLimit(userId, dailyLimit)`**: Configure the daily budget limit.
- **`getBudgetHistory(userId, days)`**: Query ActionLog for budget deductions over the past N days.
- **`isLowBudget(userId, threshold?)`**: Check if remaining budget is below threshold (default 20%). Return boolean and remaining amount.

Use `prisma.user.update` to persist budget state in `preferences` JSON.

### 6. DND Service (`src/modules/attention/services/dnd-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement Do Not Disturb:

- **`enableDND(userId, config?)`**: Turn on DND. Config includes optional duration (in minutes), exception list (contact IDs or urgency levels that bypass DND).
- **`disableDND(userId)`**: Turn off DND manually.
- **`isDNDActive(userId)`**: Check if DND is currently active. Consider:
  - Manual toggle state
  - Scheduled quiet hours (e.g., 10pm-7am)
  - Duration-based auto-expire
- **`setQuietHours(userId, startHour, endHour, timezone)`**: Configure recurring quiet hours.
- **`addException(userId, contactId)`**: Add a contact to the DND exception list.
- **`shouldSuppress(userId, notification)`**: Main logic -- given a notification, return whether it should be suppressed based on DND state, quiet hours, and exception list.

Store DND configuration in `User.preferences` JSON (e.g., `{ dnd: { enabled: false, quietHours: { start: 22, end: 7, timezone: "America/New_York" }, exceptions: ["contact-id-1"], expiresAt: null } }`).

### 7. Notification Bundler (`src/modules/attention/services/notification-bundler.ts`)

**Read the file first** -- this was AI-enhanced in Phase 2.

Verify the following functionality works correctly:
- Groups notifications by priority level (urgent, high, normal, low)
- Groups notifications by topic/source
- Respects bundling windows (e.g., batch low-priority notifications every 30 minutes)
- AI-generated bundle summaries via `generateText` or `generateJSON`

If any of the above is missing or stubbed, implement it. Do not break existing AI integration.

### 8. Notification Learning Service (`src/modules/attention/services/notification-learning-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement notification preference learning:

- **`recordAction(userId, notificationId, action)`**: Track what the user does with each notification (read, dismiss, act, snooze). Store in ActionLog with `actionType: 'NOTIFICATION_ACTION'`.
- **`getPreferences(userId)`**: Analyze past actions to determine learned preferences. Calculate:
  - Action rate by notification source/type (what % are acted on vs dismissed)
  - Preferred notification times (when does user typically act on notifications)
  - Priority accuracy (do users agree with assigned priorities)
- **`suggestPriority(userId, notification)`**: Based on learned preferences, suggest a priority adjustment. Use AI via `generateJSON` to analyze patterns and suggest.
- **`getInsights(userId)`**: Generate human-readable insights about notification habits.

Store learning data aggregates in `User.preferences` under a `notificationLearning` key.

### 9. One-Thing-Now Service (`src/modules/attention/services/one-thing-now-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement focus mode:

- **`setFocusTask(userId, taskId)`**: Select one active focus task. Store in `User.preferences` under `focusMode: { taskId, startedAt, suppressNonUrgent: true }`.
- **`getFocusTask(userId)`**: Return the current focus task details (join with Task model).
- **`clearFocusTask(userId)`**: End focus mode. Calculate and log the focus duration in ActionLog.
- **`getFocusStats(userId)`**: Return focus session history -- average duration, tasks completed during focus, interruption count.
- **`shouldInterrupt(userId, notification)`**: During focus mode, determine if a notification is urgent enough to interrupt. Only URGENT priority or exception-listed contacts should break through.

### 10. Priority Router (`src/modules/attention/services/priority-router.ts`)

**Read the file first** -- this was AI-enhanced in Phase 2.

Verify the routing logic works correctly:
- Routes notifications to the appropriate priority queue based on content analysis
- Uses AI for ambiguous priority determination
- Integrates with notification learning service for personalized routing
- Falls back to rule-based routing on AI failure

If any of the above is missing or stubbed, implement it. Do not break existing AI integration.

### 11. Tests

Write comprehensive tests for the following:

#### `tests/unit/delegation/delegation-inbox.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    task: { findMany: jest.fn(), update: jest.fn() },
    actionLog: { create: jest.fn(), findMany: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

// Test cases (3-8 minimum):
describe('getDelegatableTasks', () => {
  it('should query tasks with null assigneeId');
  it('should score each task for delegatability');
  it('should return empty array when no unassigned tasks');
});
describe('assignTask', () => {
  it('should update task assigneeId and status');
  it('should log delegation in ActionLog');
  it('should handle non-existent task gracefully');
});
```

#### `tests/unit/delegation/role-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    document: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    user: { update: jest.fn(), findUnique: jest.fn() },
  },
}));

// Test cases (3-8 minimum):
describe('createRole', () => {
  it('should create a role definition document');
  it('should reject duplicate role names for same entity');
});
describe('checkPermission', () => {
  it('should return true when user has the permission');
  it('should return false when user lacks the permission');
  it('should check all assigned roles for the permission');
});
```

#### `tests/unit/attention/budget-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    actionLog: { create: jest.fn(), findMany: jest.fn() },
  },
}));

// Test cases (3-8 minimum):
describe('getBudget', () => {
  it('should return current budget for today');
  it('should auto-reset if lastReset is yesterday');
  it('should initialize budget if none exists');
});
describe('deductBudget', () => {
  it('should subtract amount from remaining budget');
  it('should flag as over-budget when remaining is 0');
  it('should log deduction in ActionLog');
});
describe('isLowBudget', () => {
  it('should return true when below threshold');
  it('should return false when above threshold');
});
```

#### `tests/unit/attention/dnd-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

// Test cases (3-8 minimum):
describe('enableDND', () => {
  it('should set DND enabled in user preferences');
  it('should accept optional duration and exceptions');
});
describe('isDNDActive', () => {
  it('should return true when manually enabled');
  it('should return true during quiet hours');
  it('should return false when DND is disabled and outside quiet hours');
  it('should auto-expire after duration');
});
describe('shouldSuppress', () => {
  it('should suppress normal notifications during DND');
  it('should allow exception contacts during DND');
  it('should not suppress when DND is inactive');
});
```

## Acceptance Criteria

1. `delegation-inbox-service.ts` queries Prisma for unassigned tasks and scores them for delegation.
2. `delegation-scoring-service.ts` implements a multi-factor scoring algorithm with AI fallback.
3. `delegation-service.ts` manages the full delegation lifecycle (assign, track, complete, revoke) with ActionLog entries.
4. `role-service.ts` provides CRUD for roles and permission checking.
5. `attention-budget-service.ts` tracks daily attention budget with persistence in `User.preferences`.
6. `dnd-service.ts` implements DND with manual toggle, quiet hours, and exception lists.
7. `notification-bundler.ts` properly groups notifications by priority and topic (verified, not broken).
8. `notification-learning-service.ts` tracks notification actions and learns preferences.
9. `one-thing-now-service.ts` implements focus mode with task selection and interruption filtering.
10. `priority-router.ts` properly routes notifications with AI-powered priority determination (verified, not broken).
11. All 4 test files pass with `npx jest tests/unit/delegation/ tests/unit/attention/budget-service tests/unit/attention/dnd-service`.
12. `jest.config.ts`, `package.json`, `tsconfig.json`, and `prisma/schema.prisma` are NOT modified.
13. All existing function signatures and exports are preserved.

## Implementation Steps

1. **Read all context files** listed above. Pay special attention to current implementation patterns, existing exports, TODO comments, and placeholder annotations.
2. **Create branch**: `git checkout -b ai-feature/p3-w11-delegation-attention`
3. **Read and implement `delegation-scoring-service.ts`**: Implement multi-factor scoring with AI fallback.
4. **Read and implement `delegation-inbox-service.ts`**: Wire Prisma queries for unassigned task discovery and scoring.
5. **Read and implement `delegation-service.ts`**: Ensure full delegation lifecycle management.
6. **Read and implement `role-service.ts`**: Implement role CRUD and permission checking.
7. **Read and verify `notification-bundler.ts`**: Confirm AI-enhanced bundling works. Fix any stubs.
8. **Read and verify `priority-router.ts`**: Confirm AI-enhanced routing works. Fix any stubs.
9. **Read and implement `attention-budget-service.ts`**: Implement budget tracking with User.preferences persistence.
10. **Read and implement `dnd-service.ts`**: Implement DND with quiet hours and exceptions.
11. **Read and implement `notification-learning-service.ts`**: Implement action tracking and preference learning.
12. **Read and implement `one-thing-now-service.ts`**: Implement focus mode.
13. **Write tests**: Create all 4 test files with mocked Prisma and AI dependencies.
14. **Type-check**: `npx tsc --noEmit`
15. **Run tests**: `npx jest tests/unit/delegation/ tests/unit/attention/`
16. **Commit** with conventional commits.

## Tests Required

See Requirement 11 above for detailed test specifications. Each test file must:

- Mock `@/lib/db` with `jest.mock` providing relevant Prisma model mocks
- Mock `@/lib/ai` with `jest.mock` where services use AI
- Test all public functions with happy path + error cases
- Have 3-8 test cases minimum per file

## Commit Strategy

Make atomic commits in this order:

1. `feat(delegation): implement delegation scoring algorithm with AI fallback`
   - Files: `src/modules/delegation/services/delegation-scoring-service.ts`
2. `feat(delegation): implement delegation inbox with Prisma task queries`
   - Files: `src/modules/delegation/services/delegation-inbox-service.ts`
3. `feat(delegation): complete delegation lifecycle management`
   - Files: `src/modules/delegation/services/delegation-service.ts`
4. `feat(delegation): implement role management with permission checking`
   - Files: `src/modules/delegation/services/role-service.ts`
5. `feat(attention): implement attention budget tracking with User.preferences persistence`
   - Files: `src/modules/attention/services/attention-budget-service.ts`
6. `feat(attention): implement DND with quiet hours, exceptions, and auto-expire`
   - Files: `src/modules/attention/services/dnd-service.ts`
7. `feat(attention): implement notification learning and one-thing-now focus mode`
   - Files: `src/modules/attention/services/notification-learning-service.ts`, `src/modules/attention/services/one-thing-now-service.ts`, `src/modules/attention/services/notification-bundler.ts`, `src/modules/attention/services/priority-router.ts`
8. `test(delegation,attention): add unit tests for delegation-inbox, role-service, budget, dnd`
   - Files: `tests/unit/delegation/delegation-inbox.test.ts`, `tests/unit/delegation/role-service.test.ts`, `tests/unit/attention/budget-service.test.ts`, `tests/unit/attention/dnd-service.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
