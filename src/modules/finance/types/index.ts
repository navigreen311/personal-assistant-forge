// ============================================================================
// Finance Module — Type Definitions
// ============================================================================

// --- Dashboard ---

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
  type:
    | 'OVERDUE_INVOICE'
    | 'OVERDUE_BILL'
    | 'LOW_CASH'
    | 'HIGH_BURN'
    | 'RENEWAL_DUE'
    | 'DUPLICATE_DETECTED';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  entityId: string;
  relatedRecordId?: string;
  createdAt: Date;
}

// --- Invoices ---

export interface Invoice {
  id: string;
  entityId: string;
  contactId?: string;
  invoiceNumber: string;
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
  paymentTerms: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface AgingReport {
  current: { count: number; amount: number };
  thirtyDays: { count: number; amount: number };
  sixtyDays: { count: number; amount: number };
  ninetyPlus: { count: number; amount: number };
  totalOutstanding: number;
}

// --- Expenses ---

export interface Expense {
  id: string;
  entityId: string;
  amount: number;
  currency: string;
  category: string;
  vendor: string;
  description: string;
  date: Date;
  receiptUrl?: string;
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

// --- Budget ---

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
  forecast: number;
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

// --- Cash Flow ---

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
  projections: CashFlowProjection[];
  summary: {
    thirtyDay: { inflow: number; outflow: number; net: number; endBalance: number };
    sixtyDay: { inflow: number; outflow: number; net: number; endBalance: number };
    ninetyDay: { inflow: number; outflow: number; net: number; endBalance: number };
  };
  alerts: string[];
}

export interface BurnRate {
  entityId: string;
  entityName: string;
  monthlyBurn: number;
  runwayMonths: number;
  trend: 'INCREASING' | 'DECREASING' | 'STABLE';
  threshold: number;
  isAboveThreshold: boolean;
}

export interface ScenarioModel {
  id: string;
  name: string;
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

// --- P&L ---

export interface ProfitAndLoss {
  entityId: string;
  entityName: string;
  period: { start: Date; end: Date };
  revenue: PnLLineItem[];
  expenses: PnLLineItem[];
  totalRevenue: number;
  totalExpenses: number;
  grossProfit: number;
  grossMargin: number;
  trends: PnLTrend[];
}

export interface PnLLineItem {
  category: string;
  amount: number;
  previousPeriodAmount: number;
  changePercent: number;
}

export interface PnLTrend {
  period: string;
  revenue: number;
  expenses: number;
  profit: number;
}
