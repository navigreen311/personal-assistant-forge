# Worker 08: Financial Operations Center (M6)

## Branch: ai-feature/w08-finance

## Owned Paths (ONLY modify these)

You MUST only create or modify files within these directories. Do NOT touch anything outside them.

```
src/modules/finance/services/              # Business logic services
src/modules/finance/types/                 # Module-specific TypeScript types
src/modules/finance/components/            # React components for finance UI
src/modules/finance/api/                   # Module-internal API helpers / validation
src/app/api/finance/                       # Next.js API routes for finance
src/app/(dashboard)/finance/               # Dashboard pages for financial operations
tests/unit/finance/                        # All unit tests for this worker
```

## Context (read these first, do NOT modify)

Read and internalize these files before writing any code. They define the shared contracts.

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project-wide dev process, commit conventions, done criteria |
| `src/shared/types/index.ts` | Immutable shared types: `FinancialRecord`, `FinancialRecordType`, `Entity`, `ApiResponse`, `ApiError`, `ApiMeta` |
| `prisma/schema.prisma` | Database schema: `FinancialRecord` model (id, entityId, type, amount, currency, status, dueDate, category, vendor, description), `Entity` model |
| `src/shared/utils/api-response.ts` | API helpers: `success<T>()`, `error()`, `paginated<T>()` |
| `src/lib/db/index.ts` | Prisma client singleton: `import { prisma } from '@/lib/db'` |
| `package.json` | Stack: Next.js 16, React 19, Prisma 7, Zod 4, date-fns 4, Jest 30, ts-jest |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

## Requirements

### 1. Multi-Entity Financial Dashboard Service

**Service file:** `src/modules/finance/services/dashboard-service.ts`

Provides unified financial views across all entities owned by a user.

```typescript
export interface FinancialSummary {
  entityId: string;
  entityName: string;
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  pendingInvoices: number;
  pendingInvoiceAmount: number;
  overdueBills: number;
  overdueBillAmount: number;
  currency: string;
}

export interface UnifiedDashboard {
  summaries: FinancialSummary[];
  aggregated: {
    totalIncome: number;
    totalExpenses: number;
    netCashFlow: number;
    totalPendingAR: number;
    totalOverdueAP: number;
  };
  alerts: FinancialAlert[];
  period: { start: Date; end: Date };
}

export interface FinancialAlert {
  id: string;
  type: 'OVERDUE_INVOICE' | 'OVERDUE_BILL' | 'LOW_CASH' | 'HIGH_BURN' | 'RENEWAL_DUE' | 'DUPLICATE_DETECTED';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  entityId: string;
  relatedRecordId?: string;
  createdAt: Date;
}
```

Implement:
- `getUnifiedDashboard(userId: string, period: { start: Date; end: Date }): Promise<UnifiedDashboard>`
- `getEntitySummary(entityId: string, period: { start: Date; end: Date }): Promise<FinancialSummary>`
- `generateAlerts(entityId: string): Promise<FinancialAlert[]>` -- Check for overdue, low cash, high burn, upcoming renewals

### 2. Invoice Management

**Service file:** `src/modules/finance/services/invoice-service.ts`

```typescript
export interface Invoice {
  id: string;
  entityId: string;
  contactId?: string;            // Who owes this
  invoiceNumber: string;         // Auto-generated: INV-YYYY-NNNN
  lineItems: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  status: 'DRAFT' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  issuedDate: Date;
  dueDate: Date;
  paidDate?: Date;
  notes?: string;
  paymentTerms: string;          // "Net 30", "Due on receipt", etc.
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface AgingReport {
  current: { count: number; amount: number };         // 0-30 days
  thirtyDays: { count: number; amount: number };      // 31-60 days
  sixtyDays: { count: number; amount: number };       // 61-90 days
  ninetyPlus: { count: number; amount: number };      // 90+ days
  totalOutstanding: number;
}
```

Implement:
- `createInvoice(data: Omit<Invoice, 'id' | 'invoiceNumber' | 'subtotal' | 'total'>): Promise<Invoice>` -- Auto-calculates subtotal/total, generates invoice number
- `getInvoice(id: string): Promise<Invoice | null>`
- `updateInvoiceStatus(id: string, status: string): Promise<Invoice>`
- `listInvoices(entityId: string, filters: { status?: string; contactId?: string }, page: number, pageSize: number): Promise<{ invoices: Invoice[]; total: number }>`
- `getAgingReport(entityId: string): Promise<AgingReport>` -- Buckets outstanding invoices by age
- `generateInvoiceNumber(entityId: string): Promise<string>` -- Format: `INV-2026-0001`
- `detectOverdueInvoices(entityId: string): Promise<Invoice[]>` -- Past due date and not paid

### 3. Expense Tracking

**Service file:** `src/modules/finance/services/expense-service.ts`

```typescript
export interface Expense {
  id: string;
  entityId: string;
  amount: number;
  currency: string;
  category: string;
  vendor: string;
  description: string;
  date: Date;
  receiptUrl?: string;           // Placeholder for OCR integration
  ocrData?: ReceiptOCRResult;
  isRecurring: boolean;
  recurringFrequency?: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  tags: string[];
}

export interface ReceiptOCRResult {
  extractedAmount: number;
  extractedVendor: string;
  extractedDate: string;
  confidence: number;
  rawText: string;
}

export interface ExpenseByCategory {
  category: string;
  total: number;
  count: number;
  percentageOfTotal: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
  changePercent: number;
}
```

Implement:
- `createExpense(data: Omit<Expense, 'id'>): Promise<Expense>`
- `listExpenses(entityId: string, filters: { category?: string; vendor?: string; dateRange?: { start: Date; end: Date } }, page: number, pageSize: number): Promise<{ expenses: Expense[]; total: number }>`
- `categorizeExpense(description: string, vendor: string): string` -- AI-assisted auto-categorization (rule-based placeholder)
- `getExpensesByCategory(entityId: string, period: { start: Date; end: Date }): Promise<ExpenseByCategory[]>`
- `detectDuplicates(expense: Partial<Expense>): Promise<Expense[]>` -- Find potential duplicate entries by amount + vendor + date proximity

### 4. Budget Builder with AI Forecasting

**Service file:** `src/modules/finance/services/budget-service.ts`

```typescript
export interface Budget {
  id: string;
  entityId: string;
  name: string;
  period: { start: Date; end: Date };
  categories: BudgetCategory[];
  totalBudgeted: number;
  totalSpent: number;
  remainingBudget: number;
  status: 'ACTIVE' | 'DRAFT' | 'CLOSED';
}

export interface BudgetCategory {
  category: string;
  budgeted: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  forecast: number;              // AI-predicted end-of-period spend
  alert: 'ON_TRACK' | 'WARNING' | 'OVER_BUDGET' | null;
}

export interface BudgetForecast {
  category: string;
  historicalMonthlyAvg: number;
  projectedMonthEnd: number;
  projectedQuarterEnd: number;
  confidence: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
}
```

Implement:
- `createBudget(data: Omit<Budget, 'id' | 'totalSpent' | 'remainingBudget'>): Promise<Budget>`
- `getBudgetWithActuals(id: string): Promise<Budget>` -- Enriches with actual spend data
- `forecastSpending(entityId: string, category: string, months: number): Promise<BudgetForecast>` -- Based on historical patterns (moving average)
- `checkBudgetAlerts(budgetId: string): Promise<BudgetCategory[]>` -- Flag categories over 80% spent

### 5. Cash Flow Forecasting

**Service file:** `src/modules/finance/services/cashflow-service.ts`

```typescript
export interface CashFlowProjection {
  date: Date;
  expectedInflows: number;
  expectedOutflows: number;
  netCashFlow: number;
  runningBalance: number;
  inflowSources: { source: string; amount: number }[];
  outflowSources: { source: string; amount: number }[];
}

export interface CashFlowForecast {
  entityId: string;
  startingBalance: number;
  projections: CashFlowProjection[];  // Daily or weekly
  summary: {
    thirtyDay: { inflow: number; outflow: number; net: number; endBalance: number };
    sixtyDay: { inflow: number; outflow: number; net: number; endBalance: number };
    ninetyDay: { inflow: number; outflow: number; net: number; endBalance: number };
  };
  alerts: string[];              // e.g., "Cash below $0 projected on March 15"
}

export interface BurnRate {
  entityId: string;
  entityName: string;
  monthlyBurn: number;
  runwayMonths: number;          // At current burn, how many months until $0
  trend: 'INCREASING' | 'DECREASING' | 'STABLE';
  threshold: number;             // Alert if burn exceeds this
  isAboveThreshold: boolean;
}

export interface ScenarioModel {
  id: string;
  name: string;                  // e.g., "Lose Client X"
  adjustments: ScenarioAdjustment[];
  projectedImpact: {
    monthlyRevenueChange: number;
    monthlyExpenseChange: number;
    newBurnRate: number;
    newRunwayMonths: number;
  };
}

export interface ScenarioAdjustment {
  type: 'REVENUE_LOSS' | 'REVENUE_GAIN' | 'EXPENSE_INCREASE' | 'EXPENSE_DECREASE';
  description: string;
  monthlyAmount: number;
  startDate: Date;
  endDate?: Date;
}
```

Implement:
- `forecastCashFlow(entityId: string, startingBalance: number, days: number): Promise<CashFlowForecast>` -- 30/60/90-day projection
- `calculateBurnRate(entityId: string, months: number): Promise<BurnRate>` -- Based on last N months of expenses
- `runScenario(entityId: string, scenario: Omit<ScenarioModel, 'id' | 'projectedImpact'>): Promise<ScenarioModel>` -- "What if" analysis
- `getRenewalRadar(entityId: string, daysAhead: number): Promise<Renewal[]>` -- Upcoming subscription/contract renewals

```typescript
export interface Renewal {
  id: string;
  name: string;
  vendor: string;
  amount: number;
  frequency: string;
  nextRenewalDate: Date;
  daysUntilRenewal: number;
  autoRenew: boolean;
  cancelDeadline?: Date;
}
```

### 6. P&L by Venture

**Service file:** `src/modules/finance/services/pnl-service.ts`

```typescript
export interface ProfitAndLoss {
  entityId: string;
  entityName: string;
  period: { start: Date; end: Date };
  revenue: PnLLineItem[];
  expenses: PnLLineItem[];
  totalRevenue: number;
  totalExpenses: number;
  grossProfit: number;
  grossMargin: number;           // percentage
  trends: PnLTrend[];
}

export interface PnLLineItem {
  category: string;
  amount: number;
  previousPeriodAmount: number;
  changePercent: number;
}

export interface PnLTrend {
  period: string;                // "2026-01", "2026-02", etc.
  revenue: number;
  expenses: number;
  profit: number;
}
```

Implement:
- `generatePnL(entityId: string, period: { start: Date; end: Date }): Promise<ProfitAndLoss>`
- `comparePeriods(entityId: string, period1: { start: Date; end: Date }, period2: { start: Date; end: Date }): Promise<{ period1: ProfitAndLoss; period2: ProfitAndLoss; changes: PnLLineItem[] }>`
- `getTrends(entityId: string, months: number): Promise<PnLTrend[]>` -- Monthly P&L trend data

### 7. API Routes

Create these Next.js API route handlers:

| Route File | Method | Path | Purpose |
|------------|--------|------|---------|
| `src/app/api/finance/dashboard/route.ts` | GET | `/api/finance/dashboard` | Unified dashboard (query: userId, startDate, endDate) |
| `src/app/api/finance/invoices/route.ts` | GET | `/api/finance/invoices` | List invoices with filters and pagination |
| `src/app/api/finance/invoices/route.ts` | POST | `/api/finance/invoices` | Create invoice |
| `src/app/api/finance/invoices/[id]/route.ts` | GET | `/api/finance/invoices/:id` | Get single invoice |
| `src/app/api/finance/invoices/[id]/route.ts` | PUT | `/api/finance/invoices/:id` | Update invoice status |
| `src/app/api/finance/invoices/aging/route.ts` | GET | `/api/finance/invoices/aging` | Aging report (query: entityId) |
| `src/app/api/finance/expenses/route.ts` | GET | `/api/finance/expenses` | List expenses with filters |
| `src/app/api/finance/expenses/route.ts` | POST | `/api/finance/expenses` | Create expense |
| `src/app/api/finance/expenses/categories/route.ts` | GET | `/api/finance/expenses/categories` | Expenses by category |
| `src/app/api/finance/budget/route.ts` | GET | `/api/finance/budget` | List budgets |
| `src/app/api/finance/budget/route.ts` | POST | `/api/finance/budget` | Create budget |
| `src/app/api/finance/budget/[id]/route.ts` | GET | `/api/finance/budget/:id` | Get budget with actuals |
| `src/app/api/finance/forecast/route.ts` | GET | `/api/finance/forecast` | Cash flow forecast (query: entityId, days) |
| `src/app/api/finance/forecast/scenario/route.ts` | POST | `/api/finance/forecast/scenario` | Run scenario model |
| `src/app/api/finance/renewals/route.ts` | GET | `/api/finance/renewals` | Renewal radar (query: entityId, daysAhead) |
| `src/app/api/finance/pnl/route.ts` | GET | `/api/finance/pnl` | P&L report (query: entityId, startDate, endDate) |

All routes MUST:
- Use Zod for request body / query parameter validation
- Use `success()`, `error()`, `paginated()` from `@/shared/utils/api-response`
- Use `prisma` from `@/lib/db`
- Wrap in try/catch returning `error('INTERNAL_ERROR', ...)` on failure
- Return proper HTTP status codes (200, 201, 400, 404, 500)

Store invoices, expenses, and renewals in the `FinancialRecord` table using the `type` field to distinguish (`INVOICE`, `EXPENSE`, `BILL`). Use the `description` field for serialized JSON of extended data (line items, OCR data, etc.). Store budgets and scenarios in the `Document` table with `type = 'REPORT'` and structured `content` JSON.

### 8. Dashboard Pages

**Finance overview page:** `src/app/(dashboard)/finance/page.tsx`
- Multi-entity summary cards (one per entity) with income, expenses, net cash flow
- Aggregated totals bar at top
- Alert banners (overdue invoices, low cash, high burn)
- Quick links: Invoices, Expenses, Budget, Forecast

**Invoices page:** `src/app/(dashboard)/finance/invoices/page.tsx`
- Invoice list table with columns: Number, Contact, Amount, Status, Due Date, Age
- Status filter tabs: All, Draft, Sent, Overdue, Paid
- "Create Invoice" button
- Aging report summary bar (Current / 30 / 60 / 90+ buckets with amounts)

**Expenses page:** `src/app/(dashboard)/finance/expenses/page.tsx`
- Expense list with category grouping
- Category breakdown pie chart placeholder (percentages displayed as bars)
- "Add Expense" button
- Duplicate detection warning banners

**Budget page:** `src/app/(dashboard)/finance/budget/page.tsx`
- Budget categories with progress bars (budgeted vs spent)
- Color-coded alerts: green (< 60%), yellow (60-80%), orange (80-100%), red (> 100%)
- AI forecast column showing projected end-of-period spend

**Forecast page:** `src/app/(dashboard)/finance/forecast/page.tsx`
- Cash flow timeline (table with daily/weekly rows: inflows, outflows, net, running balance)
- 30/60/90-day summary cards
- Burn rate per entity with runway months
- Scenario modeling section: "What if" form with adjustment inputs

**Components to create in `src/modules/finance/components/`:**
- `FinancialSummaryCard.tsx` -- Per-entity summary card
- `AlertBanner.tsx` -- Financial alert display
- `InvoiceTable.tsx` -- Sortable invoice list
- `InvoiceForm.tsx` -- Create/edit invoice with line items
- `AgingBar.tsx` -- Visual aging report buckets
- `ExpenseList.tsx` -- Expense list with category headers
- `CategoryBreakdown.tsx` -- Category percentage bars
- `ExpenseForm.tsx` -- Add/edit expense form
- `BudgetProgressBar.tsx` -- Category budget progress
- `BudgetForecastRow.tsx` -- Budget row with AI forecast
- `CashFlowTimeline.tsx` -- Timeline table for projections
- `BurnRateCard.tsx` -- Burn rate display with runway
- `ScenarioForm.tsx` -- "What if" adjustment inputs
- `ScenarioResultPanel.tsx` -- Scenario impact display
- `RenewalCard.tsx` -- Upcoming renewal display
- `PnLTable.tsx` -- Revenue and expense line items with totals

All components must be client components (`'use client'`) using Tailwind CSS. No external UI libraries.

## Acceptance Criteria

- [ ] Invoice subtotal/total auto-calculation is correct (sum of qty * unitPrice, + tax)
- [ ] Invoice number generation follows INV-YYYY-NNNN format and auto-increments
- [ ] Aging report correctly buckets invoices into 0-30, 31-60, 61-90, 90+ day ranges
- [ ] Expense duplicate detection finds records within 3 days with same amount and vendor
- [ ] Budget alerts fire at correct thresholds (80% warning, 100% over-budget)
- [ ] Cash flow forecast produces daily projections with correct running balance
- [ ] Burn rate calculation uses average of last N months of total expenses
- [ ] Scenario modeling correctly adjusts burn rate and runway
- [ ] P&L correctly separates revenue (INVOICE/PAYMENT) from expenses (EXPENSE/BILL)
- [ ] Gross margin calculation: (totalRevenue - totalExpenses) / totalRevenue * 100
- [ ] All 16 API routes return correct `ApiResponse<T>` shapes
- [ ] Zod validation rejects malformed requests
- [ ] All financial calculations use consistent rounding (2 decimal places)
- [ ] Dashboard pages render without errors
- [ ] All unit tests pass with `npx jest tests/unit/finance/`
- [ ] No imports from other worker-owned paths

## Implementation Steps

1. **Read context files** -- `src/shared/types/index.ts`, `prisma/schema.prisma`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`
2. **Create types** -- `src/modules/finance/types/index.ts` with all module-specific interfaces
3. **Build core services** (in order, starting with pure functions):
   a. `pnl-service.ts` (aggregation logic, depends on prisma)
   b. `invoice-service.ts` (CRUD + aging report, depends on prisma)
   c. `expense-service.ts` (CRUD + categorization + duplicates, depends on prisma)
   d. `budget-service.ts` (CRUD + forecasting, depends on prisma, expense-service)
   e. `cashflow-service.ts` (forecasting + burn rate + scenarios, depends on prisma)
   f. `dashboard-service.ts` (aggregates all others, depends on all services)
4. **Build API routes** -- All 16 route files with Zod schemas
5. **Build components** -- All 16 React components
6. **Build dashboard pages** -- Overview, invoices, expenses, budget, forecast pages
7. **Write tests** -- Unit tests for financial calculations
8. **Verify** -- `npx tsc --noEmit`, `npx jest tests/unit/finance/`, `npx next build`

## Tests

Create these test files in `tests/unit/finance/`:

| Test File | What It Tests |
|-----------|---------------|
| `invoice-service.test.ts` | Line item total calculation, subtotal/tax/total math, invoice number generation (format + increment), aging report bucketing, overdue detection |
| `expense-service.test.ts` | Auto-categorization rules, duplicate detection (same amount/vendor within 3 days), expenses by category with percentages |
| `budget-service.test.ts` | Budget remaining calculation, alert thresholds (80%, 100%), forecast using moving average |
| `cashflow-service.test.ts` | Running balance correctness, 30/60/90 summary aggregation, burn rate calculation, runway months |
| `scenario-model.test.ts` | Revenue loss impact on burn rate, expense increase impact on runway, multiple adjustments stacking |
| `pnl-service.test.ts` | Revenue vs expense separation, gross margin calculation, period comparison change percentages |
| `dashboard-service.test.ts` | Multi-entity aggregation, alert generation for different conditions |

Critical math tests to include:
- Invoice: 3 line items (10 x $50, 5 x $100, 1 x $250) + 8.25% tax = $1,200 subtotal + $99 tax = $1,299 total
- Burn rate: 3 months expenses ($10k, $12k, $8k) = $10k/month burn, with $50k balance = 5 months runway
- Aging: 5 invoices aged [10, 35, 65, 95, 120 days] should bucket as [1, 1, 1, 2] across the 4 buckets

Each test file must:
- Mock `prisma` using `jest.mock('@/lib/db')`
- Use `describe/it` blocks with descriptive names
- Test both success and error paths
- Use exact number comparisons with `toBeCloseTo()` for floating-point math
- Import types from `@/shared/types` and `@/modules/finance/types`

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(finance): add module-specific types and interfaces
feat(finance): implement invoice service with aging reports
feat(finance): implement expense service with auto-categorization
feat(finance): implement budget service with AI forecasting
feat(finance): implement cash flow forecasting and burn rate
feat(finance): implement scenario modeling engine
feat(finance): implement P&L service with trend analysis
feat(finance): implement unified dashboard service
feat(finance): add invoice and expense API routes
feat(finance): add budget, forecast, and P&L API routes
feat(finance): add financial dashboard components
feat(finance): add finance dashboard pages
test(finance): add unit tests for financial calculations
chore(finance): verify build and final cleanup
```
