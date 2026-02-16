# Worker 18: Integration Tests

## Branch

`ai-feature/p3-w18-integration-tests`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (CREATE only)

You are strictly limited to **creating** the following test files. Do NOT modify any existing files or create files outside this list:

- `tests/integration/inbox-flow.test.ts`
- `tests/integration/task-lifecycle.test.ts`
- `tests/integration/workflow-execution.test.ts`
- `tests/integration/calendar-scheduling.test.ts`
- `tests/integration/finance-flow.test.ts`

**DO NOT modify:**
- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- Any file in `src/`
- Any file in `tests/unit/`

## Context (read these first, do NOT modify)

Before writing integration tests, read these source files to understand the service APIs being tested across module boundaries:

### Inbox Flow
1. **`src/modules/inbox/services/triage-service.ts`** -- AI-powered email triage. Key exports: `triageMessage`, `batchTriage`, `getTriageHistory`.
2. **`src/modules/inbox/services/draft-service.ts`** -- AI-powered draft generation. Key exports: `generateDraft`, `refineDraft`.
3. **`src/modules/inbox/services/message-service.ts`** -- Message CRUD. Key exports: `createMessage`, `getMessages`, `getMessage`, `updateMessage`.

### Task Lifecycle
4. **`src/modules/tasks/services/task-service.ts`** -- Task CRUD and NLP parsing. Key exports: `createTask`, `updateTask`, `getTask`, `getTasks`.
5. **`src/modules/tasks/services/priority-service.ts`** -- Priority scoring. Key exports: `calculatePriority`, `reprioritizeTasks`.

### Workflow Execution
6. **`src/modules/workflows/services/workflow-service.ts`** -- Workflow CRUD and execution. Key exports: `createWorkflow`, `executeWorkflow`, `getWorkflow`.
7. **`src/modules/workflows/services/trigger-service.ts`** -- Trigger evaluation. Key exports: `evaluateTrigger`, `registerTrigger`.

### Calendar Scheduling
8. **`src/modules/calendar/services/event-service.ts`** -- Calendar event CRUD. Key exports: `createEvent`, `getEvents`, `updateEvent`.
9. **`src/modules/calendar/services/scheduling-service.ts`** -- Scheduling and availability. Key exports: `findAvailableSlots`, `scheduleEvent`.
10. **`src/modules/calendar/services/prep-service.ts`** -- Meeting prep packets. Key exports: `generatePrepPacket`.

### Finance Flow
11. **`src/modules/finance/services/invoice-service.ts`** -- Invoice CRUD. Key exports: `createInvoice`, `getInvoices`, `updateInvoice`.
12. **`src/modules/finance/services/budget-service.ts`** -- Budget tracking. Key exports: `getBudget`, `updateBudget`.
13. **`src/modules/finance/services/pnl-service.ts`** -- P&L reports. Key exports: `generatePnLReport`.

**Important observations:**
- The `tests/integration/` directory exists but is empty.
- Integration tests should test cross-module interactions, not individual functions.
- All database calls should be mocked via `jest.mock('@/lib/db', ...)`.
- All AI calls should be mocked via `jest.mock('@/lib/ai', ...)`.
- Focus on verifying that modules call each other correctly and data flows between services.

**Testing pattern for integration tests:**
```typescript
// Mock infrastructure at the top
jest.mock('@/lib/db', () => ({
  prisma: {
    message: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    task: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    // ... add models as needed
  },
}));
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
  generateJSON: jest.fn(),
  chat: jest.fn(),
}));

// Import services AFTER mocks
import { triageMessage } from '@/modules/inbox/services/triage-service';
import { generateDraft } from '@/modules/inbox/services/draft-service';
// ...
```

## Requirements

### 1. `tests/integration/inbox-flow.test.ts`

Test the full inbox flow: receive message -> triage -> draft reply -> send.

Read the inbox module services first. Mock Prisma and AI.

Test cases (minimum 4):
1. **Full triage-to-draft flow**: Create a mock incoming message, triage it (verify triage assigns priority/category), then generate a draft reply (verify draft references original message).
2. **Batch triage flow**: Create multiple mock messages, batch triage them, verify each gets a priority and category assigned.
3. **Draft refinement flow**: Generate initial draft, refine it with feedback, verify the refined draft incorporates the feedback.
4. **Error resilience**: Simulate AI failure during triage, verify service falls back gracefully (doesn't throw, returns reasonable defaults).

### 2. `tests/integration/task-lifecycle.test.ts`

Test task lifecycle: create -> prioritize -> update -> complete.

Read the tasks module services first. Mock Prisma and AI.

Test cases (minimum 4):
1. **Create and prioritize**: Create a task with NLP-parsed input, verify priority score is calculated and assigned.
2. **Status transitions**: Create task -> update to IN_PROGRESS -> update to COMPLETED, verify each status transition is valid.
3. **Reprioritize after update**: Change task due date, call reprioritize, verify priority score changes accordingly.
4. **Multi-task prioritization**: Create 3 tasks with different urgencies, reprioritize all, verify correct ordering.

### 3. `tests/integration/workflow-execution.test.ts`

Test workflow execution: trigger -> evaluate -> execute -> log results.

Read the workflows module services first. Mock Prisma and AI.

Test cases (minimum 4):
1. **Simple workflow execution**: Create a workflow with one trigger and one action, trigger it, verify the action is executed and result is logged.
2. **Multi-step workflow**: Create a workflow with 3 sequential steps, trigger it, verify all steps execute in order.
3. **Conditional execution**: Create a workflow with a condition step, trigger with data that meets the condition, verify subsequent steps execute. Trigger with data that doesn't meet the condition, verify they don't.
4. **Workflow failure handling**: Simulate a step failure, verify the workflow logs the error and doesn't proceed to subsequent steps.

### 4. `tests/integration/calendar-scheduling.test.ts`

Test calendar scheduling: parse request -> check availability -> create event -> prep packet.

Read the calendar module services first. Mock Prisma and AI.

Test cases (minimum 4):
1. **Schedule from availability**: Find available slots, schedule event in first available slot, verify event is created with correct time.
2. **Prep packet generation**: Create an event, generate prep packet, verify packet contains attendee context and agenda.
3. **Conflict detection**: Create two events, attempt to schedule a third overlapping one, verify conflict is detected.
4. **Event update flow**: Create event, update its time, verify the updated event reflects the new time.

### 5. `tests/integration/finance-flow.test.ts`

Test finance flow: create invoice -> track payment -> update budget -> generate P&L.

Read the finance module services first. Mock Prisma and AI.

Test cases (minimum 4):
1. **Invoice creation to budget impact**: Create an invoice, verify budget is updated to reflect the expected revenue.
2. **Payment tracking**: Create invoice, mark as paid, verify payment status and amount are tracked.
3. **P&L report generation**: Create invoices (revenue) and expenses, generate P&L report, verify it includes both and calculates net correctly.
4. **Multi-period finance flow**: Create invoices across two periods, generate P&L for each, verify period-specific totals.

## Acceptance Criteria

- [ ] All 5 integration test files are created in `tests/integration/`.
- [ ] Each test file has 4+ test cases that test cross-module interactions.
- [ ] Tests mock `@/lib/db` and `@/lib/ai` at the top of each file.
- [ ] Tests verify that data flows correctly between 2-3 services per test.
- [ ] Tests include both happy paths and error/edge cases.
- [ ] All tests pass when run with `npx jest tests/integration --passWithNoTests`.
- [ ] No modifications to any file outside Owned Paths.
- [ ] No modifications to `jest.config.ts`, `package.json`, `tsconfig.json`, or `prisma/schema.prisma`.

## Implementation Steps

1. Read all Context source files listed above to understand each service's API and how modules interact.
2. For each test file:
   a. Read the 2-3 source service files that will be tested together.
   b. Understand what Prisma models and AI functions each service uses.
   c. Set up comprehensive mocks that cover all database queries and AI calls.
   d. Write tests that call service functions in sequence, verifying that outputs from one service are correctly consumed by the next.
3. Create `tests/integration/inbox-flow.test.ts`:
   a. Mock Prisma models: `message`, `actionLog`.
   b. Mock AI: `generateText`, `generateJSON`.
   c. Write flow tests connecting triage -> draft -> send.
4. Create `tests/integration/task-lifecycle.test.ts`:
   a. Mock Prisma models: `task`.
   b. Mock AI: `generateJSON` (for NLP parsing and priority).
   c. Write lifecycle tests: create -> prioritize -> update -> complete.
5. Create `tests/integration/workflow-execution.test.ts`:
   a. Mock Prisma models: `workflow`, `workflowRun`, `actionLog`.
   b. Mock AI: `generateJSON`.
   c. Write execution tests: trigger -> condition -> action -> log.
6. Create `tests/integration/calendar-scheduling.test.ts`:
   a. Mock Prisma models: `calendarEvent`.
   b. Mock AI: `generateText`, `generateJSON`.
   c. Write scheduling tests: availability -> create -> prep packet.
7. Create `tests/integration/finance-flow.test.ts`:
   a. Mock Prisma models: `invoice`, `budget`, `transaction`.
   b. Write finance flow tests: invoice -> payment -> budget -> P&L.
8. Run all integration tests: `npx jest tests/integration --passWithNoTests`.
9. Fix any failures.

## Tests Required

This worker IS the test worker. All test files listed in Owned Paths must be created and passing.

Verify with:
```bash
npx jest tests/integration/inbox-flow.test.ts tests/integration/task-lifecycle.test.ts tests/integration/workflow-execution.test.ts tests/integration/calendar-scheduling.test.ts tests/integration/finance-flow.test.ts --passWithNoTests
```

## Commit Strategy

**Commit 1:** `test: add inbox-flow integration test`
- Files: `tests/integration/inbox-flow.test.ts`

**Commit 2:** `test: add task-lifecycle integration test`
- Files: `tests/integration/task-lifecycle.test.ts`

**Commit 3:** `test: add workflow-execution integration test`
- Files: `tests/integration/workflow-execution.test.ts`

**Commit 4:** `test: add calendar-scheduling integration test`
- Files: `tests/integration/calendar-scheduling.test.ts`

**Commit 5:** `test: add finance-flow integration test`
- Files: `tests/integration/finance-flow.test.ts`
