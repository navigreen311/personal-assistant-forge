/**
 * Integration Test: Finance Flow
 * Tests cross-module interactions: create invoice -> track payment -> update budget -> generate P&L
 *
 * Services under test:
 * - invoice-service.ts (createInvoice, getInvoice, updateInvoiceStatus, listInvoices)
 * - budget-service.ts (createBudget, getBudgetWithActuals)
 * - pnl-service.ts (generatePnL, comparePeriods)
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

describe('Finance Flow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Invoice creation to budget impact', () => {
    it('should create an invoice and verify budget tracks the expected revenue', async () => {
      // Mock invoice number generation
      mockPrisma.financialRecord.findFirst.mockResolvedValue(null);

      // Mock invoice creation
      const invoiceRecord = createMockFinancialRecord({
        id: 'inv-1',
        amount: 5000,
        description: JSON.stringify({
          contactId: 'client-1',
          invoiceNumber: 'INV-2026-0001',
          lineItems: [
            { description: 'Consulting Services', quantity: 10, unitPrice: 500, total: 5000 },
          ],
          subtotal: 5000,
          tax: 0,
          invoiceStatus: 'SENT',
          issuedDate: '2026-02-01T00:00:00.000Z',
          paymentTerms: 'Net 30',
        }),
      });
      mockPrisma.financialRecord.create.mockResolvedValue(invoiceRecord);

      // Step 1: Create the invoice
      const invoice = await createInvoice({
        entityId: 'entity-1',
        contactId: 'client-1',
        lineItems: [
          { description: 'Consulting Services', quantity: 10, unitPrice: 500, total: 5000 },
        ],
        tax: 0,
        currency: 'USD',
        status: 'SENT',
        issuedDate: new Date('2026-02-01'),
        dueDate: new Date('2026-03-01'),
        paymentTerms: 'Net 30',
      });

      expect(invoice.id).toBe('inv-1');
      expect(invoice.total).toBe(5000);
      expect(invoice.invoiceNumber).toBe('INV-2026-0001');

      // Step 2: Create a budget that should reflect revenue from invoices
      const budgetDoc = {
        id: 'budget-1',
        entityId: 'entity-1',
        title: 'Q1 2026 Budget',
        content: JSON.stringify({
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-03-31T23:59:59.999Z',
          categories: [
            {
              category: 'INVOICE',
              budgeted: 10000,
              spent: 0,
              remaining: 10000,
              percentUsed: 0,
              forecast: 0,
              alert: null,
            },
          ],
          totalBudgeted: 10000,
          totalSpent: 0,
          remainingBudget: 10000,
          status: 'ACTIVE',
        }),
      };

      mockPrisma.document.create.mockResolvedValue(budgetDoc);

      const budget = await createBudget({
        entityId: 'entity-1',
        name: 'Q1 2026 Budget',
        totalBudgeted: 10000,
        period: {
          start: new Date('2026-01-01'),
          end: new Date('2026-03-31'),
        },
        categories: [
          { category: 'INVOICE', budgeted: 10000, spent: 0, remaining: 10000, percentUsed: 0, forecast: 0, alert: null },
        ],
        status: 'ACTIVE',
      });

      expect(budget.id).toBe('budget-1');
      expect(budget.totalBudgeted).toBe(10000);
      expect(budget.totalSpent).toBe(0);

      // Step 3: Verify budget with actuals includes the created expenses
      mockPrisma.document.findUniqueOrThrow.mockResolvedValue(budgetDoc);
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        createMockFinancialRecord({
          type: 'EXPENSE',
          amount: 2000,
          category: 'INVOICE',
        }),
      ]);

      const budgetWithActuals = await getBudgetWithActuals('budget-1');

      expect(budgetWithActuals.totalSpent).toBe(2000);
      expect(budgetWithActuals.remainingBudget).toBe(8000);

      const invoiceCat = budgetWithActuals.categories.find((c) => c.category === 'INVOICE');
      expect(invoiceCat?.spent).toBe(2000);
      expect(invoiceCat?.percentUsed).toBe(20);
      expect(invoiceCat?.alert).toBe('ON_TRACK');
    });
  });

  describe('Payment tracking', () => {
    it('should create an invoice, mark as paid, and verify payment status', async () => {
      // Setup invoice creation
      mockPrisma.financialRecord.findFirst.mockResolvedValue(null);

      const invoiceRecord = createMockFinancialRecord({
        id: 'inv-pay',
        amount: 3000,
        status: 'PENDING',
        description: JSON.stringify({
          contactId: 'client-1',
          invoiceNumber: 'INV-2026-0001',
          lineItems: [
            { description: 'Web Development', quantity: 1, unitPrice: 3000, total: 3000 },
          ],
          subtotal: 3000,
          tax: 0,
          invoiceStatus: 'SENT',
          issuedDate: '2026-02-01T00:00:00.000Z',
          paymentTerms: 'Net 30',
        }),
      });

      mockPrisma.financialRecord.create.mockResolvedValue(invoiceRecord);

      // Step 1: Create invoice
      const invoice = await createInvoice({
        entityId: 'entity-1',
        contactId: 'client-1',
        lineItems: [
          { description: 'Web Development', quantity: 1, unitPrice: 3000, total: 3000 },
        ],
        tax: 0,
        currency: 'USD',
        status: 'SENT',
        issuedDate: new Date('2026-02-01'),
        dueDate: new Date('2026-03-01'),
        paymentTerms: 'Net 30',
      });

      expect(invoice.status).toBe('SENT');
      expect(invoice.total).toBe(3000);

      // Step 2: Mark invoice as paid
      const paidRecord = createMockFinancialRecord({
        id: 'inv-pay',
        amount: 3000,
        status: 'PAID',
        description: JSON.stringify({
          contactId: 'client-1',
          invoiceNumber: 'INV-2026-0001',
          lineItems: [
            { description: 'Web Development', quantity: 1, unitPrice: 3000, total: 3000 },
          ],
          subtotal: 3000,
          tax: 0,
          invoiceStatus: 'PAID',
          paidDate: new Date().toISOString(),
          issuedDate: '2026-02-01T00:00:00.000Z',
          paymentTerms: 'Net 30',
        }),
      });

      mockPrisma.financialRecord.findUniqueOrThrow.mockResolvedValue(invoiceRecord);
      mockPrisma.financialRecord.update.mockResolvedValue(paidRecord);

      const paidInvoice = await updateInvoiceStatus('inv-pay', 'PAID');

      expect(paidInvoice.status).toBe('PAID');
      expect(paidInvoice.paidDate).toBeDefined();
      expect(paidInvoice.total).toBe(3000);

      // Verify the DB update was called with correct status
      expect(mockPrisma.financialRecord.update).toHaveBeenCalledWith({
        where: { id: 'inv-pay' },
        data: expect.objectContaining({
          status: 'PAID',
        }),
      });
    });
  });

  describe('P&L report generation', () => {
    it('should generate P&L with revenue from invoices and expenses, calculating net correctly', async () => {
      const period = {
        start: new Date('2026-01-01'),
        end: new Date('2026-03-31'),
      };

      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({
        name: 'Test Business',
      });

      // Current period records
      const currentRecords = [
        createMockFinancialRecord({
          id: 'rev-1',
          type: 'INVOICE',
          amount: 10000,
          category: 'Consulting',
          status: 'PAID',
          createdAt: new Date('2026-02-15'),
        }),
        createMockFinancialRecord({
          id: 'rev-2',
          type: 'INVOICE',
          amount: 5000,
          category: 'Development',
          status: 'PAID',
          createdAt: new Date('2026-03-01'),
        }),
        createMockFinancialRecord({
          id: 'exp-1',
          type: 'EXPENSE',
          amount: 3000,
          category: 'Software',
          status: 'PAID',
          createdAt: new Date('2026-02-10'),
        }),
        createMockFinancialRecord({
          id: 'exp-2',
          type: 'EXPENSE',
          amount: 2000,
          category: 'Office',
          status: 'PAID',
          createdAt: new Date('2026-03-05'),
        }),
      ];

      // Previous period records (for comparison)
      const previousRecords = [
        createMockFinancialRecord({
          id: 'prev-rev',
          type: 'INVOICE',
          amount: 8000,
          category: 'Consulting',
          status: 'PAID',
          createdAt: new Date('2025-11-15'),
        }),
        createMockFinancialRecord({
          id: 'prev-exp',
          type: 'EXPENSE',
          amount: 1500,
          category: 'Software',
          status: 'PAID',
          createdAt: new Date('2025-12-01'),
        }),
      ];

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce(currentRecords)
        .mockResolvedValueOnce(previousRecords);

      const pnl = await generatePnL('entity-1', period);

      expect(pnl.entityId).toBe('entity-1');
      expect(pnl.entityName).toBe('Test Business');

      // Revenue should include INVOICE types
      expect(pnl.totalRevenue).toBe(15000); // 10000 + 5000
      expect(pnl.revenue.length).toBe(2);

      // Expenses should include EXPENSE types
      expect(pnl.totalExpenses).toBe(5000); // 3000 + 2000
      expect(pnl.expenses.length).toBe(2);

      // Net calculation
      expect(pnl.grossProfit).toBe(10000);
      expect(pnl.grossMargin).toBeCloseTo(66.67, 0);

      // Revenue by category
      const consultingRevenue = pnl.revenue.find((r) => r.category === 'Consulting');
      expect(consultingRevenue?.amount).toBe(10000);
      expect(consultingRevenue?.previousPeriodAmount).toBe(8000);
    });
  });

  describe('Multi-period finance flow', () => {
    it('should generate P&L for two periods and verify period-specific totals', async () => {
      const period1 = {
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31'),
      };

      const period2 = {
        start: new Date('2026-02-01'),
        end: new Date('2026-02-28'),
      };

      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({
        name: 'Multi-Period Business',
      });

      // Period 1 current + previous records
      const period1Current = [
        createMockFinancialRecord({
          type: 'INVOICE', amount: 8000, category: 'Sales', status: 'PAID',
          createdAt: new Date('2026-01-15'),
        }),
        createMockFinancialRecord({
          type: 'EXPENSE', amount: 3000, category: 'Operations', status: 'PAID',
          createdAt: new Date('2026-01-20'),
        }),
      ];
      const period1Previous: typeof period1Current = [];

      // Period 2 current + previous records
      const period2Current = [
        createMockFinancialRecord({
          type: 'INVOICE', amount: 12000, category: 'Sales', status: 'PAID',
          createdAt: new Date('2026-02-10'),
        }),
        createMockFinancialRecord({
          type: 'EXPENSE', amount: 4000, category: 'Operations', status: 'PAID',
          createdAt: new Date('2026-02-15'),
        }),
      ];
      const period2Previous: typeof period2Current = [];

      // comparePeriods calls generatePnL twice, each of which calls findMany twice (current + previous)
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce(period1Current)    // P1 current
        .mockResolvedValueOnce(period1Previous)   // P1 previous
        .mockResolvedValueOnce(period2Current)    // P2 current
        .mockResolvedValueOnce(period2Previous);  // P2 previous

      const comparison = await comparePeriods('entity-1', period1, period2);

      // Period 1 verification
      expect(comparison.period1.totalRevenue).toBe(8000);
      expect(comparison.period1.totalExpenses).toBe(3000);
      expect(comparison.period1.grossProfit).toBe(5000);

      // Period 2 verification
      expect(comparison.period2.totalRevenue).toBe(12000);
      expect(comparison.period2.totalExpenses).toBe(4000);
      expect(comparison.period2.grossProfit).toBe(8000);

      // Changes array should track differences
      expect(comparison.changes).toBeInstanceOf(Array);
      expect(comparison.changes.length).toBeGreaterThan(0);

      // Sales revenue should show growth
      const salesChange = comparison.changes.find((c) => c.category === 'Sales');
      expect(salesChange).toBeDefined();
      expect(salesChange?.amount).toBe(12000); // period2 revenue
      expect(salesChange?.previousPeriodAmount).toBe(8000); // period1 revenue
      expect(salesChange?.changePercent).toBe(50); // 50% growth
    });

    it('should handle invoices listing with pagination and status filtering', async () => {
      const records = [
        createMockFinancialRecord({
          id: 'inv-a',
          type: 'INVOICE',
          status: 'PAID',
          amount: 1000,
          description: JSON.stringify({
            invoiceNumber: 'INV-2026-0001',
            invoiceStatus: 'PAID',
            lineItems: [],
            subtotal: 1000,
            tax: 0,
          }),
        }),
        createMockFinancialRecord({
          id: 'inv-b',
          type: 'INVOICE',
          status: 'PAID',
          amount: 2000,
          description: JSON.stringify({
            invoiceNumber: 'INV-2026-0002',
            invoiceStatus: 'PAID',
            lineItems: [],
            subtotal: 2000,
            tax: 0,
          }),
        }),
      ];

      mockPrisma.financialRecord.findMany.mockResolvedValue(records);
      mockPrisma.financialRecord.count.mockResolvedValue(2);

      const result = await listInvoices(
        'entity-1',
        { status: 'PAID' },
        1,
        20
      );

      expect(result.invoices).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.invoices[0].status).toBe('PAID');
      expect(result.invoices[1].status).toBe('PAID');

      // Verify query was filtered by status
      expect(mockPrisma.financialRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityId: 'entity-1',
            type: 'INVOICE',
            status: 'PAID',
          }),
        })
      );
    });
  });
});
