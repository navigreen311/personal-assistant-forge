# Worker 02: Persist Cost Engine to Database

## Branch

`ai-feature/p3-w02-cost-engine`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside this list:

- `src/engines/cost/budget-service.ts`
- `src/engines/cost/usage-metering.ts`
- `src/engines/cost/cost-attribution.ts`
- `src/engines/cost/provider-failover.ts`
- `tests/unit/engines-def/budget-service.test.ts`

**DO NOT modify:**
- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- `src/engines/cost/types.ts`
- `src/engines/cost/model-router.ts`
- Any file outside the Owned Paths

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`prisma/schema.prisma`** -- Contains the `Budget` model and the new `UsageRecord` model. Key fields:

   **Budget model:**
   ```
   id          String   @id @default(cuid())
   entityId    String
   entity      Entity   @relation(...)
   name        String
   amount      Float    // total budget amount in cents
   spent       Float    @default(0)
   period      String   // "monthly", "quarterly", "yearly", "project"
   category    String   // e.g., "marketing", "engineering"
   startDate   DateTime?
   endDate     DateTime?
   alerts      Json?    // Array of { threshold, type, notified }
   notes       String?
   status      String   @default("active")
   createdAt   DateTime @default(now())
   updatedAt   DateTime @updatedAt
   ```

   **UsageRecord model:**
   ```
   id           String   @id @default(cuid())
   entityId     String
   entity       Entity   @relation(...)
   model        String   // AI model used
   inputTokens  Int
   outputTokens Int
   cost         Float    // cost in USD
   module       String   // which module made the call
   userId       String?
   metadata     Json?
   createdAt    DateTime @default(now())
   ```

2. **`src/engines/cost/types.ts`** -- Defines `BudgetConfig`, `BudgetAlert`, `UsageRecord` (in-memory type), `UsageMetricType`, `ProviderHealth`, `ProviderFallback`, `WorkflowCostAttribution`.
3. **`src/engines/cost/budget-service.ts`** -- Current implementation uses `const budgets = new Map<string, BudgetConfig>()`. Functions: `setBudget`, `getBudget`, `checkBudget`, `getBudgetAlerts`, `resetBudgetPeriod`, `addSpend`, `_resetBudgetStore`.
4. **`src/engines/cost/usage-metering.ts`** -- Current implementation uses `const usageRecords: UsageRecord[] = []`. Functions: `recordUsage`, `getUsageSummary`, `getRealtimeUsage`, `_resetUsageStore`, `_getUsageRecords`.
5. **`src/engines/cost/cost-attribution.ts`** -- Currently reads from `_getUsageRecords()` (in-memory array). Functions: `attributeCostToWorkflow`, `getTopCostlyWorkflows`, `getCostTimeline`.
6. **`src/engines/cost/provider-failover.ts`** -- Uses in-memory `Map` and `Set` for provider health and kill switches. Functions: `checkProviderHealth`, `getHealthyProvider`, `listFallbacks`, `setFallback`, `activateKillSwitch`, `deactivateKillSwitch`.
7. **`src/lib/db/index.ts`** -- Exports `prisma` (PrismaClient singleton). Import as: `import { prisma } from '@/lib/db'`.
8. **`src/lib/ai/index.ts`** -- Exports `generateText`, `generateJSON`. Import as: `import { generateText } from '@/lib/ai'`.
9. **`tests/unit/engines-def/budget-service.test.ts`** -- Existing tests that use in-memory `_resetBudgetStore()`, `setBudget`, `getBudget`, `checkBudget`, `addSpend`, `resetBudgetPeriod`.

## Requirements

### 1. Persist `budget-service.ts` to Database

Replace the in-memory `Map<string, BudgetConfig>` with Prisma queries against the `Budget` model.

**Important mapping considerations:**
- The in-memory `BudgetConfig` type has: `entityId`, `monthlyCapUsd`, `alertThresholds`, `overageBehavior`, `currentSpend`, `periodStart`, `periodEnd`.
- The Prisma `Budget` model has: `entityId`, `name`, `amount`, `spent`, `period`, `category`, `startDate`, `endDate`, `alerts` (JSON), `status`.
- You must map between these two schemas. Use `amount` for `monthlyCapUsd`, `spent` for `currentSpend`, `startDate`/`endDate` for `periodStart`/`periodEnd`.
- Store `alertThresholds` and `overageBehavior` inside the `alerts` JSON field.
- Use `name` as a reasonable default (e.g., `"AI Budget"`) and `category` as `"ai"`, `period` as `"monthly"`.

**Functions to update:**
- `setBudget(entityId, monthlyCapUsd, alertThresholds?, overageBehavior?)` -- Use `prisma.budget.upsert()` with `where: { entityId_category }` or `prisma.budget.create/update`.
- `getBudget(entityId)` -- Use `prisma.budget.findFirst({ where: { entityId, category: 'ai', status: 'active' } })`.
- `checkBudget(entityId, additionalCost)` -- Read budget from DB, compute alerts.
- `getBudgetAlerts(entityId)` -- Same as before but reads from DB.
- `resetBudgetPeriod(entityId)` -- Use `prisma.budget.update()` to set `spent: 0` and update dates.
- `addSpend(entityId, amount)` -- Use `prisma.budget.update()` to increment `spent`. Make this `async`.
- `_resetBudgetStore()` -- In test env (`process.env.NODE_ENV === 'test'`), use `prisma.budget.deleteMany()`. Otherwise no-op.

**Keep all existing function signatures and export names.** The only allowed change is making `addSpend` async (callers already ignore its return value).

### 2. Persist `usage-metering.ts` to Database

Replace the in-memory `usageRecords` array with Prisma queries against the `UsageRecord` model.

**Mapping considerations:**
- The in-memory `UsageRecord` type has: `id`, `entityId`, `metricType`, `amount`, `unitCost`, `totalCost`, `source`, `timestamp`.
- The Prisma `UsageRecord` model has: `id`, `entityId`, `model`, `inputTokens`, `outputTokens`, `cost`, `module`, `userId`, `metadata`, `createdAt`.
- Map `metricType` to `model` field (store as metadata if needed), `source` to `module`, `totalCost` to `cost`, `timestamp` to `createdAt`.
- Store `metricType`, `amount`, `unitCost` in the `metadata` JSON field for full fidelity.

**Functions to update:**
- `recordUsage(entityId, metricType, amount, source)` -- Use `prisma.usageRecord.create()`.
- `getUsageSummary(entityId, startDate, endDate)` -- Use `prisma.usageRecord.findMany()` with date filters, then aggregate in code.
- `getRealtimeUsage(entityId)` -- Use `prisma.usageRecord.findMany()` with date filters, then aggregate.
- `_resetUsageStore()` -- In test env, use `prisma.usageRecord.deleteMany()`.
- `_getUsageRecords()` -- Return `prisma.usageRecord.findMany()` (make async). **Note:** `cost-attribution.ts` calls this, so it will need updating too.

### 3. Update `cost-attribution.ts` for Async DB Access

Currently calls `_getUsageRecords()` synchronously. Update to `await` the now-async version, or query Prisma directly.

**Functions to update:**
- `attributeCostToWorkflow(workflowId, startDate, endDate)` -- Query `prisma.usageRecord.findMany({ where: { module: workflowId, createdAt: { gte: startDate, lte: endDate } } })`.
- `getTopCostlyWorkflows(entityId, limit)` -- Query and group by `module`.
- `getCostTimeline(entityId, days)` -- Query with date range and group by day.

### 4. Harden `provider-failover.ts`

The current implementation uses in-memory Maps and random latency values. Improve it:

- Keep the in-memory approach for provider health caching (this is intentionally ephemeral -- health status is transient).
- Remove `Math.random()` for latency. Instead, use a configurable default latency (e.g., 50ms) or measure actual response times if a health check endpoint is provided.
- Add a `lastErrorAt` tracking field to `ProviderHealth` to support error rate decay over time.
- Make the health check interval configurable (default 60 seconds, currently hardcoded).
- Ensure `_resetProviderStore()` exists for testing.

### 5. Update Tests (`tests/unit/engines-def/budget-service.test.ts`)

Replace the existing tests that rely on in-memory Maps with tests that mock Prisma.

**Mock setup pattern:**
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    budget: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
```

**Tests to write/update:**
- `setBudget` -- mock `prisma.budget.upsert` or `create`, verify it was called with correct args, verify returned BudgetConfig mapping.
- `getBudget` -- mock `prisma.budget.findFirst`, verify query filters, verify null case.
- `checkBudget` -- mock `prisma.budget.findFirst` to return a budget with known `spent`/`amount`, verify alert thresholds and `allowed` flag.
- `addSpend` -- mock `prisma.budget.update`, verify `spent` increment.
- `resetBudgetPeriod` -- mock `prisma.budget.findFirst` and `update`, verify `spent` reset to 0.
- Keep the same test descriptions where possible so CI diff is clear.

## Acceptance Criteria

- [ ] `budget-service.ts` no longer contains `new Map()` -- all state is persisted via Prisma `Budget` model.
- [ ] `usage-metering.ts` no longer contains `usageRecords: UsageRecord[] = []` -- all state is persisted via Prisma `UsageRecord` model.
- [ ] `cost-attribution.ts` queries Prisma directly (or awaits the async `_getUsageRecords`).
- [ ] `provider-failover.ts` no longer uses `Math.random()` for latency.
- [ ] All existing function signatures and export names are preserved.
- [ ] Import Prisma as `import { prisma } from '@/lib/db'`.
- [ ] Import AI as `import { generateText } from '@/lib/ai'` (budget-service already does this).
- [ ] `_resetBudgetStore()` and `_resetUsageStore()` exist and work for tests.
- [ ] Tests in `budget-service.test.ts` pass using mocked Prisma.
- [ ] No modifications to `types.ts`, `model-router.ts`, or any file outside Owned Paths.

## Implementation Steps

1. Read all Context files to understand existing APIs and Prisma models.
2. Update `budget-service.ts`:
   a. Add `import { prisma } from '@/lib/db'`.
   b. Remove `const budgets = new Map(...)`.
   c. Rewrite `setBudget` to use `prisma.budget.upsert()`.
   d. Rewrite `getBudget` to use `prisma.budget.findFirst()`.
   e. Rewrite `checkBudget` to read from DB.
   f. Rewrite `getBudgetAlerts` to read from DB.
   g. Rewrite `resetBudgetPeriod` to use `prisma.budget.update()`.
   h. Rewrite `addSpend` to use `prisma.budget.updateMany()` (make async).
   i. Rewrite `_resetBudgetStore` to use `prisma.budget.deleteMany()` in test env.
3. Update `usage-metering.ts`:
   a. Add `import { prisma } from '@/lib/db'`.
   b. Remove in-memory arrays.
   c. Rewrite all functions to use Prisma queries.
4. Update `cost-attribution.ts`:
   a. Add `import { prisma } from '@/lib/db'`.
   b. Remove import of `_getUsageRecords`.
   c. Rewrite functions to query `prisma.usageRecord` directly.
5. Update `provider-failover.ts`:
   a. Remove `Math.random()` calls.
   b. Add configurable health check interval.
   c. Add `_resetProviderStore()` for tests.
6. Update `tests/unit/engines-def/budget-service.test.ts`:
   a. Add Prisma mock at top of file.
   b. Rewrite all tests to use mocked Prisma calls.
   c. Verify function behavior through mock assertions.

## Tests Required

- `tests/unit/engines-def/budget-service.test.ts` (update existing):
  - `setBudget` creates/upserts budget in DB with correct field mapping.
  - `getBudget` queries by entityId and returns mapped BudgetConfig.
  - `getBudget` returns null when no budget exists.
  - `checkBudget` allows spending within budget.
  - `checkBudget` triggers alerts at 75%, 90%, and 100% thresholds.
  - `checkBudget` blocks spending when overageBehavior is BLOCK.
  - `checkBudget` allows with warning when overageBehavior is WARN.
  - `addSpend` increments spent via Prisma update.
  - `resetBudgetPeriod` resets spent to 0 and updates dates.

## Commit Strategy

**Commit 1:** `feat: persist budget-service to database via Prisma Budget model`
- Files: `src/engines/cost/budget-service.ts`

**Commit 2:** `feat: persist usage-metering to database via Prisma UsageRecord model`
- Files: `src/engines/cost/usage-metering.ts`

**Commit 3:** `fix: update cost-attribution and provider-failover for DB-backed usage data`
- Files: `src/engines/cost/cost-attribution.ts`, `src/engines/cost/provider-failover.ts`

**Commit 4:** `test: update budget-service tests to mock Prisma`
- Files: `tests/unit/engines-def/budget-service.test.ts`
