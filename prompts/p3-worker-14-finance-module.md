# Worker 14: Complete Finance Module Stubs

## Branch

`ai-feature/p3-w14-finance-module`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/finance/services/budget-service.ts`
- `src/modules/finance/services/cashflow-service.ts`
- `src/modules/finance/services/expense-service.ts`
- `src/modules/finance/services/invoice-service.ts`
- `src/modules/finance/services/pnl-service.ts`
- `src/modules/finance/services/dashboard-service.ts`
- `tests/unit/finance/budget-service.test.ts`
- `tests/unit/finance/cashflow-service.test.ts`
- `tests/unit/finance/expense-service.test.ts`
- `tests/unit/finance/invoice-service.test.ts`

### Do NOT modify

- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- `src/engines/cost/` -- This is the engine-level cost service, NOT the same as the module-level finance services. Do NOT touch.
- Any files outside the owned paths above

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/lib/ai/index.ts`** -- Exports `generateText(prompt, options?)`, `generateJSON<T>(prompt, options?)`, `chat(messages, options?)`, `streamText(prompt, options?)`. Options include `model`, `maxTokens`, `temperature`, `system`.
2. **`src/lib/db/index.ts`** -- Exports `prisma` client instance. Import as `import { prisma } from '@/lib/db'`.
3. **`prisma/schema.prisma`** -- Database models. Key models for this worker:
   - `Budget` model: `id`, `entityId`, `entity` (relation), `name`, `amount` (Float -- total budget in cents), `spent` (Float, default 0), `period` (String: "monthly", "quarterly", "yearly", "project"), `category` (String), `startDate` (DateTime?), `endDate` (DateTime?), `alerts` (Json? -- array of threshold configs), `notes` (String?), `status` (String, default "active": "active", "paused", "exhausted", "closed"), `createdAt`, `updatedAt`. Indexes on `entityId`, `category`, `status`.
   - `FinancialRecord` model: `id`, `entityId`, `type` (String), `amount` (Float), `currency` (String, default "USD"), `status` (String, default "PENDING"), `dueDate` (DateTime?), `category` (String), `vendor` (String?), `description` (String?), `createdAt`, `updatedAt`, `entity` (relation). Indexes on `entityId`, `type`, `status`.
4. **`src/modules/finance/types/`** -- Finance types if they exist. Read to understand interfaces.
5. **`src/modules/finance/services/budget-service.ts`** -- Current implementation. Was partially AI-wired in Phase 2.
6. **`src/modules/finance/services/cashflow-service.ts`** -- Current implementation.
7. **`src/modules/finance/services/expense-service.ts`** -- Current implementation.
8. **`src/modules/finance/services/invoice-service.ts`** -- Current implementation.
9. **`src/modules/finance/services/pnl-service.ts`** -- Current implementation.
10. **`src/modules/finance/services/dashboard-service.ts`** -- Current implementation.
11. **Existing test files** in `tests/unit/finance/` -- Read to understand current test patterns and what is already tested.

## Requirements

### 1. Budget Service (`src/modules/finance/services/budget-service.ts`)

**Read the file first** to understand the current implementation.

If stub or incomplete, implement:

- **`createBudget(entityId, budget)`**: Create a budget via `prisma.budget.create`. Input: `{ name, amount, period, category, startDate?, endDate?, alerts?, notes? }`. Set default `status: "active"`, `spent: 0`.
- **`getBudgets(entityId, filters?)`**: Query `prisma.budget.findMany` where `entityId` matches. Support filtering by `status`, `category`, `period`.
- **`getBudget(budgetId)`**: Get a single budget by ID.
- **`updateBudget(budgetId, updates)`**: Update budget fields. If `amount` changes, recalculate alert thresholds.
- **`deleteBudget(budgetId)`**: Soft delete by setting `status: "closed"`.
- **`recordSpending(budgetId, amount, description?)`**: Add `amount` to `spent`. Check against alert thresholds. If a threshold is crossed, mark it as notified in the alerts JSON and return alert info. If `spent >= amount`, set `status: "exhausted"`.
- **`checkThresholds(budgetId)`**: Compare `spent` against `amount` and each alert threshold. Return `{ alerts: Array<{ threshold, type, triggered, message }> }`.
- **`getBudgetUtilization(entityId)`**: For all active budgets, return utilization percentage (`spent / amount * 100`), sorted by highest utilization.
- **AI integration**: Add `suggestBudgetAdjustments(entityId)` -- use `generateJSON` to analyze spending patterns across all budgets and suggest adjustments (increase/decrease budgets, create new category budgets, merge underspent budgets).

### 2. Cash Flow Service (`src/modules/finance/services/cashflow-service.ts`)

**Read the file first** to understand the current implementation.

If stub or incomplete, implement:

- **`getCashFlow(entityId, period, dateRange?)`**: Calculate cash flow from FinancialRecord model. Query income records (`type: "INCOME"` or `type: "REVENUE"`) and expense records (`type: "EXPENSE"`). Group by period (day/week/month). Return `{ period: string, income: number, expenses: number, net: number }[]`.
- **`getRunningBalance(entityId, dateRange?)`**: Calculate cumulative cash flow over time. Start from earliest record, accumulate net per period. Return `{ date: string, balance: number }[]`.
- **`projectCashFlow(entityId, forecastMonths)`**: Project future cash flow based on historical patterns. Use rolling average of past 3 months for income and expenses. Return `{ month: string, projectedIncome: number, projectedExpenses: number, projectedNet: number, confidence: number }[]`.
- **`identifyTrends(entityId)`**: Analyze cash flow data to identify trends: growing/shrinking income, seasonal patterns, expense spikes. Use AI via `generateJSON` to provide narrative insights.
- **`getCashFlowSummary(entityId)`**: Return current month's income, expenses, net cash flow, and comparison to previous month (percentage change).

### 3. Expense Service (`src/modules/finance/services/expense-service.ts`)

**Read the file first** to understand the current implementation.

If stub or incomplete, implement:

- **`createExpense(entityId, expense)`**: Create a FinancialRecord with `type: "EXPENSE"`. Input: `{ amount, category, vendor?, description?, dueDate?, status? }`. Default `status: "PENDING"`, `currency: "USD"`.
- **`getExpenses(entityId, filters?)`**: Query `prisma.financialRecord.findMany` where `type: "EXPENSE"` and `entityId` matches. Support filtering by `category`, `status`, `vendor`, date range. Support sorting by `amount`, `createdAt`, `dueDate`.
- **`getExpense(expenseId)`**: Get a single expense by ID.
- **`updateExpense(expenseId, updates)`**: Update expense fields.
- **`deleteExpense(expenseId)`**: Delete the financial record. Or soft delete by setting `status: "CANCELLED"`.
- **`categorizeExpense(expenseId)`**: If expense has no category or category is "UNCATEGORIZED", use AI via `generateJSON` to suggest a category based on vendor name, description, and amount. Return suggested category without auto-applying.
- **`getExpensesByCategory(entityId, dateRange?)`**: Aggregate expenses by category. Return `{ category: string, total: number, count: number, percentage: number }[]` sorted by total descending.
- **`getRecurringExpenses(entityId)`**: Identify recurring expenses by finding FinancialRecords with the same vendor and similar amounts that appear monthly. Return list of detected recurring expenses with frequency and average amount.
- **`getExpenseTotals(entityId, dateRange?)`**: Return total expenses, average expense, largest expense, smallest expense within the date range.

### 4. Invoice Service (`src/modules/finance/services/invoice-service.ts`)

**Read the file first** to understand the current implementation.

If stub or incomplete, implement:

- **`createInvoice(entityId, invoice)`**: Create a FinancialRecord with `type: "INVOICE"`. Input: `{ amount, category, vendor (client name), description?, dueDate, status? }`. Default `status: "PENDING"`.
- **`getInvoices(entityId, filters?)`**: Query invoices with filtering by `status` (PENDING, PAID, OVERDUE, CANCELLED), date range, vendor/client.
- **`getInvoice(invoiceId)`**: Get a single invoice by ID.
- **`updateInvoice(invoiceId, updates)`**: Update invoice fields.
- **`markAsPaid(invoiceId, paidDate?)`**: Set `status: "PAID"`. Record payment date in description or metadata.
- **`markAsOverdue(entityId)`**: Batch operation -- find all PENDING invoices where `dueDate < now()` and update `status` to `"OVERDUE"`. Return count of newly overdue invoices.
- **`getAgingReport(entityId)`**: Calculate invoice aging buckets:
  - Current (not yet due): count and total
  - 0-30 days overdue: count and total
  - 31-60 days overdue: count and total
  - 61-90 days overdue: count and total
  - 90+ days overdue: count and total
  - Return `{ bucket: string, count: number, total: number }[]`
- **`getAccountsReceivable(entityId)`**: Total of all PENDING + OVERDUE invoices.
- **`getInvoiceSummary(entityId, dateRange?)`**: Return total invoiced, total paid, total overdue, average days to payment.

### 5. P&L Service (`src/modules/finance/services/pnl-service.ts`)

**Read the file first** to understand the current implementation.

If stub or incomplete, implement:

- **`generatePnL(entityId, dateRange)`**: Generate a Profit & Loss statement from FinancialRecord data.
  - Revenue: Sum all records where `type IN ("INCOME", "REVENUE")` within date range, grouped by `category`.
  - Cost of Goods Sold (COGS): Sum records where `type: "COGS"` or `category` matches COGS-related categories.
  - Gross Profit: Revenue - COGS.
  - Operating Expenses: Sum records where `type: "EXPENSE"`, grouped by `category`.
  - Operating Income: Gross Profit - Operating Expenses.
  - Net Income: Operating Income (simplified -- no tax/interest for now).
  - Return structured P&L: `{ revenue: { total, byCategory }, cogs: { total, byCategory }, grossProfit, operatingExpenses: { total, byCategory }, operatingIncome, netIncome, period: { from, to } }`.
- **`comparePnL(entityId, period1, period2)`**: Generate P&L for two periods and compare. Return absolute and percentage changes for each line item.
- **`getMargins(entityId, dateRange?)`**: Calculate gross margin (grossProfit / revenue * 100) and operating margin (operatingIncome / revenue * 100).
- **`getPnLTrend(entityId, periods)`**: Generate P&L for multiple consecutive periods. Return trend data for charting.

### 6. Dashboard Service (`src/modules/finance/services/dashboard-service.ts`)

**Read the file first** to understand the current implementation.

If stub or incomplete, implement:

- **`getDashboardData(entityId)`**: Aggregate all financial data into a single dashboard response:
  - `totalIncome`: Sum of all INCOME/REVENUE FinancialRecords for current month
  - `totalExpenses`: Sum of all EXPENSE FinancialRecords for current month
  - `netCashFlow`: totalIncome - totalExpenses
  - `pendingAR`: Total of PENDING + OVERDUE invoices (accounts receivable)
  - `overdueAP`: Total of overdue expenses (accounts payable)
  - `budgetUtilization`: Average utilization across active budgets
  - `recentTransactions`: Last 10 FinancialRecords ordered by createdAt desc
  - `monthOverMonth`: Percentage change in net cash flow vs previous month
- **`getQuickStats(entityId)`**: Lightweight version returning only totals (for widget/header display).
- **`getAlerts(entityId)`**: Return actionable financial alerts:
  - Budgets approaching threshold
  - Overdue invoices
  - Unusual spending patterns (if amount > 2x average for category)
  - Cash flow warnings (if projected negative)

### 7. Tests

Write or update comprehensive tests for all 4 test files. **Read existing test files first** -- they may already have some tests. Update them to cover the new implementations without deleting existing passing tests.

#### `tests/unit/finance/budget-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    budget: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('createBudget', () => {
  it('should create a budget with default status active');
  it('should set spent to 0 initially');
});
describe('recordSpending', () => {
  it('should add amount to spent');
  it('should trigger alert when threshold crossed');
  it('should set status to exhausted when fully spent');
  it('should handle spending beyond budget amount');
});
describe('checkThresholds', () => {
  it('should identify triggered thresholds');
  it('should not trigger thresholds below spending level');
});
describe('suggestBudgetAdjustments', () => {
  it('should call generateJSON with spending data');
  it('should handle AI failure gracefully');
});
```

#### `tests/unit/finance/cashflow-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    financialRecord: { findMany: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('getCashFlow', () => {
  it('should calculate income minus expenses per period');
  it('should handle periods with no transactions');
  it('should filter by date range');
});
describe('projectCashFlow', () => {
  it('should project based on historical averages');
  it('should handle insufficient data gracefully');
});
describe('getCashFlowSummary', () => {
  it('should return current month summary');
  it('should calculate month-over-month change');
});
```

#### `tests/unit/finance/expense-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    financialRecord: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('createExpense', () => {
  it('should create a FinancialRecord with type EXPENSE');
  it('should set default status to PENDING');
});
describe('getExpensesByCategory', () => {
  it('should aggregate expenses by category');
  it('should calculate percentage of total');
  it('should sort by total descending');
});
describe('categorizeExpense', () => {
  it('should call AI for uncategorized expenses');
  it('should return suggested category without auto-applying');
  it('should handle AI failure gracefully');
});
describe('getRecurringExpenses', () => {
  it('should identify monthly recurring expenses');
  it('should match by vendor and similar amount');
});
```

#### `tests/unit/finance/invoice-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    financialRecord: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}));

describe('createInvoice', () => {
  it('should create a FinancialRecord with type INVOICE');
  it('should set default status to PENDING');
});
describe('markAsPaid', () => {
  it('should update status to PAID');
  it('should record payment date');
});
describe('markAsOverdue', () => {
  it('should update all past-due PENDING invoices to OVERDUE');
  it('should return count of newly overdue invoices');
});
describe('getAgingReport', () => {
  it('should correctly bucket invoices by overdue days');
  it('should calculate totals per bucket');
  it('should handle no overdue invoices');
});
describe('getAccountsReceivable', () => {
  it('should sum PENDING and OVERDUE invoice amounts');
});
```

## Acceptance Criteria

1. `budget-service.ts` implements full CRUD for budgets using Budget Prisma model, with threshold tracking and AI-powered adjustment suggestions.
2. `cashflow-service.ts` calculates cash flow from FinancialRecord data with projection and AI trend analysis.
3. `expense-service.ts` implements full CRUD for expenses using FinancialRecord (type="EXPENSE"), with AI categorization and recurring expense detection.
4. `invoice-service.ts` implements full CRUD for invoices using FinancialRecord (type="INVOICE"), with aging report and overdue detection.
5. `pnl-service.ts` generates structured P&L statements from FinancialRecord data with period comparison.
6. `dashboard-service.ts` aggregates all financial data into a unified dashboard response with alerts.
7. All 4 test files pass with `npx jest tests/unit/finance/budget tests/unit/finance/cashflow tests/unit/finance/expense tests/unit/finance/invoice`.
8. `jest.config.ts`, `package.json`, `tsconfig.json`, and `prisma/schema.prisma` are NOT modified.
9. `src/engines/cost/` is NOT modified (that is engine-level, not module-level).
10. All existing function signatures and exports are preserved.

## Implementation Steps

1. **Read all context files** listed above. Pay special attention to current implementation patterns, existing exports, and the Prisma schema for Budget and FinancialRecord models.
2. **Create branch**: `git checkout -b ai-feature/p3-w14-finance-module`
3. **Read existing test files** in `tests/unit/finance/` to understand current test coverage and patterns.
4. **Read and implement `budget-service.ts`**: Add CRUD, threshold tracking, AI suggestions.
5. **Read and implement `cashflow-service.ts`**: Add cash flow calculation, projection, AI trends.
6. **Read and implement `expense-service.ts`**: Add expense CRUD, categorization, recurring detection.
7. **Read and implement `invoice-service.ts`**: Add invoice CRUD, aging report, overdue detection.
8. **Read and implement `pnl-service.ts`**: Add P&L generation and comparison.
9. **Read and implement `dashboard-service.ts`**: Add financial dashboard aggregation and alerts.
10. **Write/update tests**: Create or update the 4 test files with mocked Prisma and AI dependencies.
11. **Type-check**: `npx tsc --noEmit`
12. **Run tests**: `npx jest tests/unit/finance/`
13. **Commit** with conventional commits.

## Tests Required

See Requirement 7 above for detailed test specifications. Each test file must:

- Mock `@/lib/db` with `jest.mock` providing relevant Prisma model mocks
- Mock `@/lib/ai` with `jest.mock` where services use AI
- Test all public functions with happy path + error cases
- Have 3-8 test cases minimum per file
- Read existing test files first -- do not delete existing passing tests

## Commit Strategy

Make atomic commits in this order:

1. `feat(finance): implement budget service with threshold tracking and AI suggestions`
   - Files: `src/modules/finance/services/budget-service.ts`
2. `feat(finance): implement cash flow calculation, projection, and AI trend analysis`
   - Files: `src/modules/finance/services/cashflow-service.ts`
3. `feat(finance): implement expense CRUD with AI categorization and recurring detection`
   - Files: `src/modules/finance/services/expense-service.ts`
4. `feat(finance): implement invoice management with aging report and overdue detection`
   - Files: `src/modules/finance/services/invoice-service.ts`
5. `feat(finance): implement P&L generation and financial dashboard aggregation`
   - Files: `src/modules/finance/services/pnl-service.ts`, `src/modules/finance/services/dashboard-service.ts`
6. `test(finance): add tests for budget, cashflow, expense, and invoice services`
   - Files: `tests/unit/finance/budget-service.test.ts`, `tests/unit/finance/cashflow-service.test.ts`, `tests/unit/finance/expense-service.test.ts`, `tests/unit/finance/invoice-service.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
