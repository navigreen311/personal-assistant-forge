/**
 * E2E Test: Finance Management
 * Tests full finance flows end-to-end:
 *   budget CRUD and checking, expense tracking, invoice lifecycle,
 *   P&L report generation, financial forecasting
 *
 * Services under test:
 * - budget-service.ts (createBudget, getBudgetWithActuals)
 * - expense-service.ts (createExpense, listExpenses, getExpensesByCategory, categorizeExpense, detectDuplicates, getRecurringExpenses, getExpenseTotals, updateExpense, deleteExpense)
 * - invoice-service.ts (createInvoice, getInvoice, updateInvoiceStatus, listInvoices)
 * - pnl-service.ts (generatePnL, comparePeriods)
 * - cashflow-service.ts (forecastCashFlow, calculateBurnRate, runScenario)
 */

// --- Infrastructure mocks ---

const mockPrisma = {
  financialRecord: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  document: {
    create: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  entity: {
    findUniqueOrThrow: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
  generateJSON: jest.fn(),
  chat: jest.fn(),
  streamText: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'e2e-finance-uuid'),
}));

import {
  createInvoice,
  getInvoice,
  updateInvoiceStatus,
  listInvoices,
} from '@/modules/finance/services/invoice-service';
import {
  createBudget,
  getBudgetWithActuals,
} from '@/modules/finance/services/budget-service';
import { generatePnL, comparePeriods } from '@/modules/finance/services/pnl-service';
import {
  createExpense,
  listExpenses,
  getExpensesByCategory,
  categorizeExpense,
  detectDuplicates,
  getRecurringExpenses,
  getExpenseTotals,
  updateExpense,
  deleteExpense,
} from '@/modules/finance/services/expense-service';
import {
  forecastCashFlow,
  calculateBurnRate,
  runScenario,
} from '@/modules/finance/services/cashflow-service';
import { generateJSON } from '@/lib/ai';

const mockedGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;

// --- Test helpers ---

function createMockFinancialRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fr-1',
    entityId: 'entity-1',
    type: 'INVOICE',
    amount: 1000,
    currency: 'USD',
    status: 'PENDING',
    dueDate: new Date('2026-03-15'),
    category: 'INVOICE',
    vendor: null,
    description: null,
    createdAt: new Date('2026-02-01'),
    updatedAt: new Date('2026-02-01'),
    ...overrides,
  };
}

describe('Finance Management E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGenerateJSON.mockRejectedValue(new Error('AI unavailable'));
  });

  // =========================================================================
  // Budget CRUD and checking
  // =========================================================================
  describe('Budget CRUD and checking', () => {
    it('should create a budget and retrieve it with actuals', async () => {
      const budgetDoc = {
        id: 'budget-1',
        entityId: 'entity-1',
        title: 'Q1 2026 Budget',
        content: JSON.stringify({
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-03-31T23:59:59.999Z',
          categories: [
            { category: 'Software', budgeted: 5000, spent: 0, remaining: 5000, percentUsed: 0, forecast: 0, alert: null },
            { category: 'Office', budgeted: 3000, spent: 0, remaining: 3000, percentUsed: 0, forecast: 0, alert: null },
            { category: 'Marketing', budgeted: 8000, spent: 0, remaining: 8000, percentUsed: 0, forecast: 0, alert: null },
          ],
          totalBudgeted: 16000,
          totalSpent: 0,
          remainingBudget: 16000,
          status: 'ACTIVE',
        }),
      };

      mockPrisma.document.create.mockResolvedValue(budgetDoc);

      const budget = await createBudget({
        entityId: 'entity-1',
        name: 'Q1 2026 Budget',
        totalBudgeted: 16000,
        period: { start: new Date('2026-01-01'), end: new Date('2026-03-31') },
        categories: [
          { category: 'Software', budgeted: 5000, spent: 0, remaining: 5000, percentUsed: 0, forecast: 0, alert: null },
          { category: 'Office', budgeted: 3000, spent: 0, remaining: 3000, percentUsed: 0, forecast: 0, alert: null },
          { category: 'Marketing', budgeted: 8000, spent: 0, remaining: 8000, percentUsed: 0, forecast: 0, alert: null },
        ],
        status: 'ACTIVE',
      });

      expect(budget.id).toBe('budget-1');
      expect(budget.totalBudgeted).toBe(16000);
      expect(budget.categories).toHaveLength(3);

      mockPrisma.document.findUniqueOrThrow.mockResolvedValue(budgetDoc);
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        createMockFinancialRecord({ type: 'EXPENSE', amount: 1500, category: 'Software' }),
        createMockFinancialRecord({ type: 'EXPENSE', amount: 800, category: 'Office' }),
        createMockFinancialRecord({ type: 'EXPENSE', amount: 2000, category: 'Marketing' }),
      ]);

      const budgetWithActuals = await getBudgetWithActuals('budget-1');

      expect(budgetWithActuals.totalSpent).toBe(4300);
      expect(budgetWithActuals.remainingBudget).toBe(11700);

      const softwareCat = budgetWithActuals.categories.find((c) => c.category === 'Software');
      expect(softwareCat?.spent).toBe(1500);
      expect(softwareCat?.percentUsed).toBe(30);
      expect(softwareCat?.alert).toBe('ON_TRACK');
    });

    it('should flag WARNING when a category exceeds 80% of budget', async () => {
      const budgetDoc = {
        id: 'budget-warn',
        entityId: 'entity-1',
        title: 'Warning Budget',
        content: JSON.stringify({
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-03-31T23:59:59.999Z',
          categories: [
            { category: 'Travel', budgeted: 2000, spent: 0, remaining: 2000, percentUsed: 0, forecast: 0, alert: null },
          ],
          totalBudgeted: 2000,
          totalSpent: 0,
          remainingBudget: 2000,
          status: 'ACTIVE',
        }),
      };

      mockPrisma.document.findUniqueOrThrow.mockResolvedValue(budgetDoc);
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        createMockFinancialRecord({ type: 'EXPENSE', amount: 1700, category: 'Travel' }),
      ]);

      const result = await getBudgetWithActuals('budget-warn');
      const travelCat = result.categories.find((c) => c.category === 'Travel');
      expect(travelCat?.percentUsed).toBe(85);
      expect(travelCat?.alert).toBe('WARNING');
    });

    it('should flag OVER_BUDGET when a category exceeds 100%', async () => {
      const budgetDoc = {
        id: 'budget-over',
        entityId: 'entity-1',
        title: 'Over Budget',
        content: JSON.stringify({
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-03-31T23:59:59.999Z',
          categories: [
            { category: 'Events', budgeted: 1000, spent: 0, remaining: 1000, percentUsed: 0, forecast: 0, alert: null },
          ],
          totalBudgeted: 1000,
          totalSpent: 0,
          remainingBudget: 1000,
          status: 'ACTIVE',
        }),
      };

      mockPrisma.document.findUniqueOrThrow.mockResolvedValue(budgetDoc);
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        createMockFinancialRecord({ type: 'EXPENSE', amount: 600, category: 'Events' }),
        createMockFinancialRecord({ type: 'EXPENSE', amount: 500, category: 'Events' }),
      ]);

      const result = await getBudgetWithActuals('budget-over');
      const eventsCat = result.categories.find((c) => c.category === 'Events');
      expect(eventsCat?.percentUsed).toBe(110);
      expect(eventsCat?.alert).toBe('OVER_BUDGET');
    });
  });

  // =========================================================================
  // Expense tracking
  // =========================================================================
  describe('Expense tracking', () => {
    it('should create an expense and verify its properties', async () => {
      const expenseRecord = createMockFinancialRecord({
        id: 'exp-1',
        type: 'EXPENSE',
        amount: 299.99,
        category: 'Software & SaaS',
        vendor: 'Figma',
        status: 'PAID',
        dueDate: new Date('2026-02-15'),
        description: JSON.stringify({
          expenseDescription: 'Annual Figma subscription',
          isRecurring: true,
          recurringFrequency: 'ANNUAL',
          tags: ['design', 'tools'],
        }),
      });

      mockPrisma.financialRecord.create.mockResolvedValue(expenseRecord);

      const expense = await createExpense({
        entityId: 'entity-1',
        amount: 299.99,
        currency: 'USD',
        category: 'Software & SaaS',
        vendor: 'Figma',
        description: 'Annual Figma subscription',
        date: new Date('2026-02-15'),
        isRecurring: true,
        recurringFrequency: 'ANNUAL',
        tags: ['design', 'tools'],
      });

      expect(expense.id).toBe('exp-1');
      expect(expense.amount).toBe(299.99);
      expect(expense.category).toBe('Software & SaaS');
    });

    it('should list expenses with filtering and pagination', async () => {
      const records = [
        createMockFinancialRecord({ id: 'e-1', type: 'EXPENSE', amount: 100, category: 'Office', vendor: 'Amazon', description: '{}' }),
        createMockFinancialRecord({ id: 'e-2', type: 'EXPENSE', amount: 200, category: 'Office', vendor: 'Staples', description: '{}' }),
      ];

      mockPrisma.financialRecord.findMany.mockResolvedValue(records);
      mockPrisma.financialRecord.count.mockResolvedValue(2);

      const result = await listExpenses('entity-1', { category: 'Office' }, 1, 20);

      expect(result.expenses).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should categorize expenses by keyword matching', () => {
      expect(categorizeExpense('Annual subscription', 'Slack')).toBe('Software & SaaS');
      expect(categorizeExpense('Team lunch', 'DoorDash')).toBe('Meals & Entertainment');
      expect(categorizeExpense('Monthly rent', 'WeWork')).toBe('Rent & Facilities');
      expect(categorizeExpense('Flight to NYC', 'United Airlines')).toBe('Travel');
      expect(categorizeExpense('Server hosting', 'AWS')).toBe('Technology & Infrastructure');
      expect(categorizeExpense('Legal consultation', 'Wilson & Co')).toBe('Legal & Professional');
      expect(categorizeExpense('Random purchase', 'Unknown Store')).toBe('General');
    });

    it('should get expenses grouped by category with trends', async () => {
      const currentRecords = [
        createMockFinancialRecord({ type: 'EXPENSE', amount: 500, category: 'Software', createdAt: new Date('2026-02-01') }),
        createMockFinancialRecord({ type: 'EXPENSE', amount: 300, category: 'Software', createdAt: new Date('2026-02-15') }),
        createMockFinancialRecord({ type: 'EXPENSE', amount: 200, category: 'Office', createdAt: new Date('2026-02-10') }),
      ];
      const previousRecords = [
        createMockFinancialRecord({ type: 'EXPENSE', amount: 400, category: 'Software', createdAt: new Date('2026-01-01') }),
        createMockFinancialRecord({ type: 'EXPENSE', amount: 250, category: 'Office', createdAt: new Date('2026-01-10') }),
      ];

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce(currentRecords)
        .mockResolvedValueOnce(previousRecords);

      const result = await getExpensesByCategory('entity-1', {
        start: new Date('2026-02-01'),
        end: new Date('2026-02-28'),
      });

      expect(result.length).toBe(2);
      const software = result.find((r) => r.category === 'Software');
      expect(software!.total).toBe(800);
      expect(software!.count).toBe(2);
      expect(software!.trend).toBe('UP');

      const office = result.find((r) => r.category === 'Office');
      expect(office!.total).toBe(200);
      expect(office!.trend).toBe('DOWN');
    });

    it('should detect duplicate expenses', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        createMockFinancialRecord({ id: 'dup-1', type: 'EXPENSE', amount: 99.99, vendor: 'Slack', dueDate: new Date('2026-02-14'), description: '{}' }),
      ]);

      const duplicates = await detectDuplicates({
        entityId: 'entity-1',
        amount: 99.99,
        vendor: 'Slack',
        date: new Date('2026-02-15'),
      });

      expect(duplicates).toHaveLength(1);
    });

    it('should get expense totals summary', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        createMockFinancialRecord({ type: 'EXPENSE', amount: 100, status: 'PAID' }),
        createMockFinancialRecord({ type: 'EXPENSE', amount: 250, status: 'PAID' }),
        createMockFinancialRecord({ type: 'EXPENSE', amount: 50, status: 'PAID' }),
      ]);

      const totals = await getExpenseTotals('entity-1');

      expect(totals.total).toBe(400);
      expect(totals.average).toBeCloseTo(133.33, 0);
      expect(totals.largest).toBe(250);
      expect(totals.smallest).toBe(50);
      expect(totals.count).toBe(3);
    });

    it('should update and soft-delete an expense', async () => {
      const existingRecord = createMockFinancialRecord({
        id: 'upd-exp', type: 'EXPENSE', amount: 500, category: 'Office',
        description: JSON.stringify({ expenseDescription: 'Old description' }),
      });
      const updatedRecord = createMockFinancialRecord({
        id: 'upd-exp', type: 'EXPENSE', amount: 600, category: 'Office',
        description: JSON.stringify({ expenseDescription: 'Updated description' }),
      });

      mockPrisma.financialRecord.findUniqueOrThrow.mockResolvedValue(existingRecord);
      mockPrisma.financialRecord.update.mockResolvedValue(updatedRecord);

      const updated = await updateExpense('upd-exp', { amount: 600, description: 'Updated description' });
      expect(updated.amount).toBe(600);

      mockPrisma.financialRecord.update.mockResolvedValue({ ...updatedRecord, status: 'CANCELLED' });
      await deleteExpense('upd-exp');
      expect(mockPrisma.financialRecord.update).toHaveBeenCalledWith({
        where: { id: 'upd-exp' },
        data: { status: 'CANCELLED' },
      });
    });

    it('should identify recurring expenses', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        createMockFinancialRecord({ vendor: 'Slack', amount: 12.50, createdAt: new Date('2025-09-01') }),
        createMockFinancialRecord({ vendor: 'Slack', amount: 12.50, createdAt: new Date('2025-10-01') }),
        createMockFinancialRecord({ vendor: 'Slack', amount: 12.50, createdAt: new Date('2025-11-01') }),
        createMockFinancialRecord({ vendor: 'Slack', amount: 12.50, createdAt: new Date('2025-12-01') }),
      ]);

      const recurring = await getRecurringExpenses('entity-1');

      expect(recurring.length).toBeGreaterThanOrEqual(1);
      const slack = recurring.find((r) => r.vendor === 'Slack');
      expect(slack!.frequency).toBe('monthly');
      expect(slack!.averageAmount).toBe(12.50);
      expect(slack!.occurrences).toBe(4);
    });
  });

  // =========================================================================
  // Invoice lifecycle
  // =========================================================================
  describe('Invoice lifecycle', () => {
    it('should create an invoice, verify details, and mark as paid', async () => {
      mockPrisma.financialRecord.findFirst.mockResolvedValue(null);

      const invoiceRecord = createMockFinancialRecord({
        id: 'inv-lifecycle',
        amount: 7500,
        description: JSON.stringify({
          contactId: 'client-1',
          invoiceNumber: 'INV-2026-0001',
          lineItems: [{ description: 'Web Development', quantity: 50, unitPrice: 150, total: 7500 }],
          subtotal: 7500, tax: 0, invoiceStatus: 'SENT',
          issuedDate: '2026-02-01T00:00:00.000Z', paymentTerms: 'Net 30',
        }),
      });

      mockPrisma.financialRecord.create.mockResolvedValue(invoiceRecord);

      const invoice = await createInvoice({
        entityId: 'entity-1', contactId: 'client-1',
        lineItems: [{ description: 'Web Development', quantity: 50, unitPrice: 150, total: 7500 }],
        tax: 0, currency: 'USD', status: 'SENT',
        issuedDate: new Date('2026-02-01'), dueDate: new Date('2026-03-01'), paymentTerms: 'Net 30',
      });

      expect(invoice.id).toBe('inv-lifecycle');
      expect(invoice.total).toBe(7500);
      expect(invoice.invoiceNumber).toBe('INV-2026-0001');
      expect(invoice.status).toBe('SENT');

      // Get invoice
      mockPrisma.financialRecord.findUnique.mockResolvedValue(invoiceRecord);
      const fetched = await getInvoice('inv-lifecycle');
      expect(fetched).not.toBeNull();
      expect(fetched!.total).toBe(7500);

      // Mark as paid
      const paidRecord = createMockFinancialRecord({
        id: 'inv-lifecycle', amount: 7500, status: 'PAID',
        description: JSON.stringify({
          contactId: 'client-1', invoiceNumber: 'INV-2026-0001',
          lineItems: [{ description: 'Web Development', quantity: 50, unitPrice: 150, total: 7500 }],
          subtotal: 7500, tax: 0, invoiceStatus: 'PAID',
          paidDate: new Date().toISOString(),
          issuedDate: '2026-02-01T00:00:00.000Z', paymentTerms: 'Net 30',
        }),
      });

      mockPrisma.financialRecord.findUniqueOrThrow.mockResolvedValue(invoiceRecord);
      mockPrisma.financialRecord.update.mockResolvedValue(paidRecord);

      const paidInvoice = await updateInvoiceStatus('inv-lifecycle', 'PAID');
      expect(paidInvoice.status).toBe('PAID');
      expect(paidInvoice.paidDate).toBeDefined();
      expect(mockPrisma.financialRecord.update).toHaveBeenCalledWith({
        where: { id: 'inv-lifecycle' },
        data: expect.objectContaining({ status: 'PAID' }),
      });
    });

    it('should list invoices filtered by status with pagination', async () => {
      const records = [
        createMockFinancialRecord({
          id: 'inv-list-1', type: 'INVOICE', status: 'PAID', amount: 1000,
          description: JSON.stringify({ invoiceNumber: 'INV-2026-0010', invoiceStatus: 'PAID', paidDate: '2026-02-10T00:00:00.000Z', lineItems: [], subtotal: 1000, tax: 0 }),
        }),
        createMockFinancialRecord({
          id: 'inv-list-2', type: 'INVOICE', status: 'PAID', amount: 2500,
          description: JSON.stringify({ invoiceNumber: 'INV-2026-0011', invoiceStatus: 'PAID', paidDate: '2026-02-12T00:00:00.000Z', lineItems: [], subtotal: 2500, tax: 0 }),
        }),
      ];

      mockPrisma.financialRecord.findMany.mockResolvedValue(records);
      mockPrisma.financialRecord.count.mockResolvedValue(2);

      const result = await listInvoices('entity-1', { status: 'PAID' }, 1, 20);

      expect(result.invoices).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockPrisma.financialRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityId: 'entity-1', type: 'INVOICE', status: 'PAID' }),
        })
      );
    });

    it('should auto-increment invoice numbers', async () => {
      mockPrisma.financialRecord.findFirst.mockResolvedValue(
        createMockFinancialRecord({ description: JSON.stringify({ invoiceNumber: 'INV-2026-0005' }) })
      );

      const newRecord = createMockFinancialRecord({
        id: 'inv-auto', amount: 500,
        description: JSON.stringify({
          contactId: 'client-1', invoiceNumber: 'INV-2026-0006',
          lineItems: [{ description: 'Service', quantity: 1, unitPrice: 500, total: 500 }],
          subtotal: 500, tax: 0, invoiceStatus: 'DRAFT',
          issuedDate: '2026-02-15T00:00:00.000Z', paymentTerms: 'Net 15',
        }),
      });
      mockPrisma.financialRecord.create.mockResolvedValue(newRecord);

      const invoice = await createInvoice({
        entityId: 'entity-1', contactId: 'client-1',
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 500, total: 500 }],
        tax: 0, currency: 'USD', status: 'DRAFT',
        issuedDate: new Date('2026-02-15'), dueDate: new Date('2026-03-01'), paymentTerms: 'Net 15',
      });

      expect(invoice.invoiceNumber).toBe('INV-2026-0006');
    });
  });

  // =========================================================================
  // P&L report generation
  // =========================================================================
  describe('P&L report generation', () => {
    it('should generate a P&L statement with correct revenue, expenses, and margins', async () => {
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Tech Startup LLC' });

      const currentRecords = [
        createMockFinancialRecord({ type: 'INVOICE', amount: 20000, category: 'Consulting', status: 'PAID', createdAt: new Date('2026-01-15') }),
        createMockFinancialRecord({ type: 'INVOICE', amount: 15000, category: 'Development', status: 'PAID', createdAt: new Date('2026-02-15') }),
        createMockFinancialRecord({ type: 'INVOICE', amount: 5000, category: 'Training', status: 'PAID', createdAt: new Date('2026-03-10') }),
        createMockFinancialRecord({ type: 'EXPENSE', amount: 8000, category: 'Payroll', status: 'PAID', createdAt: new Date('2026-01-31') }),
        createMockFinancialRecord({ type: 'EXPENSE', amount: 3000, category: 'Software', status: 'PAID', createdAt: new Date('2026-02-10') }),
        createMockFinancialRecord({ type: 'EXPENSE', amount: 2000, category: 'Office', status: 'PAID', createdAt: new Date('2026-03-05') }),
      ];
      const previousRecords = [
        createMockFinancialRecord({ type: 'INVOICE', amount: 18000, category: 'Consulting', status: 'PAID', createdAt: new Date('2025-10-15') }),
        createMockFinancialRecord({ type: 'EXPENSE', amount: 7000, category: 'Payroll', status: 'PAID', createdAt: new Date('2025-11-01') }),
      ];

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce(currentRecords)
        .mockResolvedValueOnce(previousRecords);

      const pnl = await generatePnL('entity-1', { start: new Date('2026-01-01'), end: new Date('2026-03-31') });

      expect(pnl.entityName).toBe('Tech Startup LLC');
      expect(pnl.totalRevenue).toBe(40000);
      expect(pnl.revenue.length).toBe(3);
      expect(pnl.totalExpenses).toBe(13000);
      expect(pnl.expenses.length).toBe(3);
      expect(pnl.grossProfit).toBe(27000);
      expect(pnl.grossMargin).toBeCloseTo(67.5, 0);

      const consulting = pnl.revenue.find((r) => r.category === 'Consulting');
      expect(consulting!.amount).toBe(20000);
      expect(consulting!.previousPeriodAmount).toBe(18000);
    });

    it('should compare two periods and calculate changes', async () => {
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Growth Co' });

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          createMockFinancialRecord({ type: 'INVOICE', amount: 10000, category: 'Sales', status: 'PAID', createdAt: new Date('2026-01-15') }),
          createMockFinancialRecord({ type: 'EXPENSE', amount: 4000, category: 'Ops', status: 'PAID', createdAt: new Date('2026-01-20') }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          createMockFinancialRecord({ type: 'INVOICE', amount: 15000, category: 'Sales', status: 'PAID', createdAt: new Date('2026-02-10') }),
          createMockFinancialRecord({ type: 'EXPENSE', amount: 5000, category: 'Ops', status: 'PAID', createdAt: new Date('2026-02-15') }),
        ])
        .mockResolvedValueOnce([]);

      const comparison = await comparePeriods(
        'entity-1',
        { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
        { start: new Date('2026-02-01'), end: new Date('2026-02-28') }
      );

      expect(comparison.period1.totalRevenue).toBe(10000);
      expect(comparison.period1.grossProfit).toBe(6000);
      expect(comparison.period2.totalRevenue).toBe(15000);
      expect(comparison.period2.grossProfit).toBe(10000);

      const salesChange = comparison.changes.find((c) => c.category === 'Sales');
      expect(salesChange!.changePercent).toBe(50);
    });

    it('should handle a period with no records gracefully', async () => {
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Empty Co' });
      mockPrisma.financialRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const pnl = await generatePnL('entity-1', { start: new Date('2026-01-01'), end: new Date('2026-03-31') });

      expect(pnl.totalRevenue).toBe(0);
      expect(pnl.totalExpenses).toBe(0);
      expect(pnl.grossProfit).toBe(0);
      expect(pnl.grossMargin).toBe(0);
    });
  });

  // =========================================================================
  // Financial forecasting
  // =========================================================================
  describe('Financial forecasting', () => {
    it('should forecast cash flow over 30 days', async () => {
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          createMockFinancialRecord({ type: 'INVOICE', amount: 5000, status: 'PAID', createdAt: new Date('2026-01-15') }),
          createMockFinancialRecord({ type: 'EXPENSE', amount: 2000, status: 'PAID', createdAt: new Date('2026-01-20') }),
        ])
        .mockResolvedValueOnce([]);

      const forecast = await forecastCashFlow('entity-1', 10000, 30);

      expect(forecast.entityId).toBe('entity-1');
      expect(forecast.startingBalance).toBe(10000);
      expect(forecast.projections).toHaveLength(30);
      expect(forecast.summary.thirtyDay).toBeDefined();
      expect(forecast.summary.thirtyDay.endBalance).toBeDefined();

      const firstDay = forecast.projections[0];
      expect(firstDay.date).toBeInstanceOf(Date);
      expect(typeof firstDay.expectedInflows).toBe('number');
      expect(typeof firstDay.runningBalance).toBe('number');
    });

    it('should detect cash-below-zero alert in forecast', async () => {
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          createMockFinancialRecord({ type: 'EXPENSE', amount: 50000, status: 'PAID', createdAt: new Date('2026-01-15') }),
          createMockFinancialRecord({ type: 'INVOICE', amount: 1000, status: 'PAID', createdAt: new Date('2026-01-20') }),
        ])
        .mockResolvedValueOnce([]);

      const forecast = await forecastCashFlow('entity-1', 100, 30);

      expect(forecast.alerts.length).toBeGreaterThan(0);
      expect(forecast.alerts.some((a) => a.includes('below $0'))).toBe(true);
    });

    it('should calculate burn rate with runway', async () => {
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Startup' });

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([createMockFinancialRecord({ type: 'EXPENSE', amount: 5000 })])
        .mockResolvedValueOnce([createMockFinancialRecord({ type: 'EXPENSE', amount: 6000 })])
        .mockResolvedValueOnce([createMockFinancialRecord({ type: 'EXPENSE', amount: 5500 })])
        .mockResolvedValueOnce([
          createMockFinancialRecord({ type: 'INVOICE', amount: 50000 }),
          createMockFinancialRecord({ type: 'EXPENSE', amount: 16500 }),
        ]);

      const burnRate = await calculateBurnRate('entity-1', 3);

      expect(burnRate.entityName).toBe('Startup');
      expect(burnRate.monthlyBurn).toBeGreaterThan(0);
      expect(burnRate.runwayMonths).toBeGreaterThan(0);
      expect(['INCREASING', 'DECREASING', 'STABLE']).toContain(burnRate.trend);
    });

    it('should run a scenario with revenue loss and expense increase', async () => {
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Scenario Co' });

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([createMockFinancialRecord({ type: 'EXPENSE', amount: 4000 })])
        .mockResolvedValueOnce([createMockFinancialRecord({ type: 'EXPENSE', amount: 4000 })])
        .mockResolvedValueOnce([createMockFinancialRecord({ type: 'EXPENSE', amount: 4000 })])
        .mockResolvedValueOnce([
          createMockFinancialRecord({ type: 'INVOICE', amount: 80000 }),
          createMockFinancialRecord({ type: 'EXPENSE', amount: 12000 }),
        ])
        .mockResolvedValueOnce([
          createMockFinancialRecord({ type: 'INVOICE', amount: 80000 }),
          createMockFinancialRecord({ type: 'EXPENSE', amount: 12000 }),
        ]);

      const scenario = await runScenario('entity-1', {
        name: 'Lose Key Client',
        adjustments: [
          { type: 'REVENUE_LOSS', description: 'Key client churns', monthlyAmount: 5000, startDate: new Date('2026-03-01') },
          { type: 'EXPENSE_INCREASE', description: 'Hire replacement sales rep', monthlyAmount: 3000, startDate: new Date('2026-03-15') },
        ],
      });

      expect(scenario.name).toBe('Lose Key Client');
      expect(scenario.adjustments).toHaveLength(2);
      expect(scenario.projectedImpact.monthlyRevenueChange).toBe(-5000);
      expect(scenario.projectedImpact.monthlyExpenseChange).toBe(3000);
      expect(scenario.projectedImpact.newBurnRate).toBeGreaterThan(0);
      expect(scenario.projectedImpact.newRunwayMonths).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Cross-module: Invoice -> Budget -> P&L
  // =========================================================================
  describe('Cross-module: Invoice -> Budget -> P&L flow', () => {
    it('should create invoice, track in budget, and see it in P&L', async () => {
      // Step 1: Create invoice
      mockPrisma.financialRecord.findFirst.mockResolvedValue(null);
      const invoiceRecord = createMockFinancialRecord({
        id: 'cross-inv', type: 'INVOICE', amount: 10000, status: 'PAID',
        description: JSON.stringify({
          contactId: 'client-1', invoiceNumber: 'INV-2026-0001',
          lineItems: [{ description: 'Consulting', quantity: 20, unitPrice: 500, total: 10000 }],
          subtotal: 10000, tax: 0, invoiceStatus: 'PAID',
          issuedDate: '2026-02-01T00:00:00.000Z', paymentTerms: 'Net 30',
        }),
      });
      mockPrisma.financialRecord.create.mockResolvedValue(invoiceRecord);

      const invoice = await createInvoice({
        entityId: 'entity-1', contactId: 'client-1',
        lineItems: [{ description: 'Consulting', quantity: 20, unitPrice: 500, total: 10000 }],
        tax: 0, currency: 'USD', status: 'PAID',
        issuedDate: new Date('2026-02-01'), dueDate: new Date('2026-03-01'), paymentTerms: 'Net 30',
      });
      expect(invoice.total).toBe(10000);

      // Step 2: Create expense
      const expenseRecord = createMockFinancialRecord({
        id: 'cross-exp', type: 'EXPENSE', amount: 3000, category: 'Consulting', status: 'PAID',
        description: JSON.stringify({ expenseDescription: 'Subcontractor' }),
      });
      mockPrisma.financialRecord.create.mockResolvedValue(expenseRecord);

      const expense = await createExpense({
        entityId: 'entity-1', amount: 3000, currency: 'USD', category: 'Consulting',
        vendor: 'Subcontractor LLC', description: 'Subcontractor',
        date: new Date('2026-02-15'), isRecurring: false, tags: [],
      });
      expect(expense.amount).toBe(3000);

      // Step 3: Check budget
      const budgetDoc = {
        id: 'cross-budget', entityId: 'entity-1', title: 'Budget',
        content: JSON.stringify({
          periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-03-31T23:59:59.999Z',
          categories: [{ category: 'Consulting', budgeted: 5000, spent: 0, remaining: 5000, percentUsed: 0, forecast: 0, alert: null }],
          totalBudgeted: 5000, totalSpent: 0, remainingBudget: 5000, status: 'ACTIVE',
        }),
      };
      mockPrisma.document.findUniqueOrThrow.mockResolvedValue(budgetDoc);
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        createMockFinancialRecord({ type: 'EXPENSE', amount: 3000, category: 'Consulting' }),
      ]);

      const budgetActuals = await getBudgetWithActuals('cross-budget');
      expect(budgetActuals.totalSpent).toBe(3000);
      expect(budgetActuals.categories[0].percentUsed).toBe(60);

      // Step 4: Generate P&L
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Cross-Module Co' });
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          createMockFinancialRecord({ type: 'INVOICE', amount: 10000, category: 'Consulting', status: 'PAID', createdAt: new Date('2026-02-01') }),
          createMockFinancialRecord({ type: 'EXPENSE', amount: 3000, category: 'Consulting', status: 'PAID', createdAt: new Date('2026-02-15') }),
        ])
        .mockResolvedValueOnce([]);

      const pnl = await generatePnL('entity-1', { start: new Date('2026-01-01'), end: new Date('2026-03-31') });

      expect(pnl.totalRevenue).toBe(10000);
      expect(pnl.totalExpenses).toBe(3000);
      expect(pnl.grossProfit).toBe(7000);
      expect(pnl.grossMargin).toBeCloseTo(70, 0);
    });
  });
});
