import type { Invoice, AgingReport } from '@/modules/finance/types';

// Mock AI client — reject so we fall back to template-based generation
const mockGenerateText = jest.fn();
jest.mock('@/lib/ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

// Mock prisma
const mockPrisma = {
  financialRecord: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  entity: {
    findUniqueOrThrow: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

import {
  createInvoice,
  getInvoice,
  updateInvoiceStatus,
  listInvoices,
  getAgingReport,
  generateInvoiceNumber,
  detectOverdueInvoices,
  markAsPaid,
  markAsOverdue,
  getAccountsReceivable,
  getInvoiceSummary,
} from '@/modules/finance/services/invoice-service';

describe('Invoice Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createInvoice', () => {
    it('should auto-calculate subtotal and total from line items', async () => {
      // 3 line items: (10 x $50) + (5 x $100) + (1 x $250) = $1,250 subtotal
      // tax = $99.00
      // Total = $1,349.00
      const lineItems = [
        { description: 'Widget A', quantity: 10, unitPrice: 50, total: 0 },
        { description: 'Widget B', quantity: 5, unitPrice: 100, total: 0 },
        { description: 'Widget C', quantity: 1, unitPrice: 250, total: 0 },
      ];

      mockPrisma.financialRecord.findFirst.mockResolvedValue(null);
      mockPrisma.financialRecord.create.mockResolvedValue({
        id: 'inv-1',
        entityId: 'entity-1',
        type: 'INVOICE',
        amount: 1299,
        currency: 'USD',
        status: 'PENDING',
        dueDate: new Date('2026-03-15'),
        category: 'INVOICE',
        vendor: null,
        description: JSON.stringify({
          invoiceNumber: 'INV-2026-0001',
          lineItems: [
            { description: 'Widget A', quantity: 10, unitPrice: 50, total: 500 },
            { description: 'Widget B', quantity: 5, unitPrice: 100, total: 500 },
            { description: 'Widget C', quantity: 1, unitPrice: 250, total: 250 },
          ],
          subtotal: 1200,
          tax: 99,
          invoiceStatus: 'DRAFT',
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await createInvoice({
        entityId: 'entity-1',
        lineItems,
        tax: 99,
        currency: 'USD',
        status: 'DRAFT',
        issuedDate: new Date('2026-02-15'),
        dueDate: new Date('2026-03-15'),
        paymentTerms: 'Net 30',
      });

      expect(result.subtotal).toBeCloseTo(1250, 2);
      expect(result.tax).toBeCloseTo(99, 2);
      expect(result.total).toBeCloseTo(1349, 2);
      expect(result.lineItems[0].total).toBeCloseTo(500, 2);
      expect(result.lineItems[1].total).toBeCloseTo(500, 2);
      expect(result.lineItems[2].total).toBeCloseTo(250, 2);
    });

    it('should create a FinancialRecord with type INVOICE', async () => {
      mockPrisma.financialRecord.findFirst.mockResolvedValue(null);
      mockPrisma.financialRecord.create.mockResolvedValue({
        id: 'inv-2', entityId: 'e-1', type: 'INVOICE', amount: 100,
        currency: 'USD', status: 'PENDING', dueDate: new Date(),
        category: 'INVOICE', vendor: null,
        description: JSON.stringify({ invoiceNumber: 'INV-2026-0001', invoiceStatus: 'DRAFT', lineItems: [], subtotal: 100, tax: 0 }),
        createdAt: new Date(), updatedAt: new Date(),
      });

      await createInvoice({
        entityId: 'e-1',
        lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, total: 0 }],
        tax: 0, currency: 'USD', status: 'DRAFT',
        issuedDate: new Date(), dueDate: new Date(), paymentTerms: 'Net 30',
      });

      expect(mockPrisma.financialRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'INVOICE' }),
      });
    });

    it('should set default status to PENDING', async () => {
      mockPrisma.financialRecord.findFirst.mockResolvedValue(null);
      mockPrisma.financialRecord.create.mockResolvedValue({
        id: 'inv-3', entityId: 'e-1', type: 'INVOICE', amount: 0,
        currency: 'USD', status: 'PENDING', dueDate: new Date(),
        category: 'INVOICE', vendor: null,
        description: JSON.stringify({ invoiceNumber: 'INV-2026-0001', invoiceStatus: 'DRAFT', lineItems: [], subtotal: 0, tax: 0 }),
        createdAt: new Date(), updatedAt: new Date(),
      });

      await createInvoice({
        entityId: 'e-1',
        lineItems: [{ description: 'Item', quantity: 0, unitPrice: 100, total: 0 }],
        tax: 0, currency: 'USD', status: 'DRAFT',
        issuedDate: new Date(), dueDate: new Date(), paymentTerms: 'Net 30',
      });

      expect(mockPrisma.financialRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'PENDING' }),
      });
    });
  });

  describe('generateInvoiceNumber', () => {
    it('should generate INV-YYYY-0001 for first invoice', async () => {
      mockPrisma.financialRecord.findFirst.mockResolvedValue(null);

      const number = await generateInvoiceNumber('entity-1');
      const year = new Date().getFullYear();
      expect(number).toBe(`INV-${year}-0001`);
    });

    it('should auto-increment from existing invoice numbers', async () => {
      const year = new Date().getFullYear();
      mockPrisma.financialRecord.findFirst.mockResolvedValue({
        description: JSON.stringify({ invoiceNumber: `INV-${year}-0005` }),
      });

      const number = await generateInvoiceNumber('entity-1');
      expect(number).toBe(`INV-${year}-0006`);
    });

    it('should format with leading zeros', async () => {
      const year = new Date().getFullYear();
      mockPrisma.financialRecord.findFirst.mockResolvedValue({
        description: JSON.stringify({ invoiceNumber: `INV-${year}-0099` }),
      });

      const number = await generateInvoiceNumber('entity-1');
      expect(number).toBe(`INV-${year}-0100`);
    });
  });

  describe('getAgingReport', () => {
    it('should correctly bucket invoices by overdue days', async () => {
      const now = new Date();
      const makeDueDate = (daysAgo: number) =>
        new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

      // 5 invoices aged [10, 35, 65, 95, 120 days]
      // Expected buckets: [1, 1, 1, 2]
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        { id: '1', amount: 100, dueDate: makeDueDate(10), createdAt: makeDueDate(10) },
        { id: '2', amount: 200, dueDate: makeDueDate(35), createdAt: makeDueDate(35) },
        { id: '3', amount: 300, dueDate: makeDueDate(65), createdAt: makeDueDate(65) },
        { id: '4', amount: 400, dueDate: makeDueDate(95), createdAt: makeDueDate(95) },
        { id: '5', amount: 500, dueDate: makeDueDate(120), createdAt: makeDueDate(120) },
      ]);

      const report = await getAgingReport('entity-1');

      expect(report.current.count).toBe(1);
      expect(report.current.amount).toBeCloseTo(100, 2);

      expect(report.thirtyDays.count).toBe(1);
      expect(report.thirtyDays.amount).toBeCloseTo(200, 2);

      expect(report.sixtyDays.count).toBe(1);
      expect(report.sixtyDays.amount).toBeCloseTo(300, 2);

      expect(report.ninetyPlus.count).toBe(2);
      expect(report.ninetyPlus.amount).toBeCloseTo(900, 2);

      expect(report.totalOutstanding).toBeCloseTo(1500, 2);
    });

    it('should calculate totals per bucket', async () => {
      const now = new Date();
      const makeDueDate = (daysAgo: number) =>
        new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

      mockPrisma.financialRecord.findMany.mockResolvedValue([
        { id: '1', amount: 500, dueDate: makeDueDate(5), createdAt: makeDueDate(5) },
        { id: '2', amount: 300, dueDate: makeDueDate(15), createdAt: makeDueDate(15) },
      ]);

      const report = await getAgingReport('entity-1');

      expect(report.current.count).toBe(2);
      expect(report.current.amount).toBeCloseTo(800, 2);
      expect(report.totalOutstanding).toBeCloseTo(800, 2);
    });

    it('should handle no overdue invoices', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([]);

      const report = await getAgingReport('entity-1');

      expect(report.current.count).toBe(0);
      expect(report.thirtyDays.count).toBe(0);
      expect(report.sixtyDays.count).toBe(0);
      expect(report.ninetyPlus.count).toBe(0);
      expect(report.totalOutstanding).toBe(0);
    });
  });

  describe('detectOverdueInvoices', () => {
    it('should return invoices past due date with PENDING status', async () => {
      const pastDate = new Date('2026-01-01');
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        {
          id: 'inv-overdue',
          entityId: 'entity-1',
          type: 'INVOICE',
          amount: 500,
          currency: 'USD',
          status: 'PENDING',
          dueDate: pastDate,
          category: 'INVOICE',
          vendor: null,
          description: JSON.stringify({ invoiceNumber: 'INV-2026-0001', invoiceStatus: 'SENT' }),
          createdAt: pastDate,
          updatedAt: pastDate,
        },
      ]);

      const overdue = await detectOverdueInvoices('entity-1');
      expect(overdue).toHaveLength(1);
      expect(overdue[0].id).toBe('inv-overdue');
    });
  });

  describe('updateInvoiceStatus', () => {
    it('should set paidDate when marking as PAID', async () => {
      mockPrisma.financialRecord.findUniqueOrThrow.mockResolvedValue({
        id: 'inv-1',
        description: JSON.stringify({ invoiceNumber: 'INV-2026-0001', invoiceStatus: 'SENT' }),
      });

      mockPrisma.financialRecord.update.mockResolvedValue({
        id: 'inv-1',
        entityId: 'entity-1',
        type: 'INVOICE',
        amount: 500,
        currency: 'USD',
        status: 'PAID',
        dueDate: new Date('2026-03-15'),
        category: 'INVOICE',
        vendor: null,
        description: JSON.stringify({
          invoiceNumber: 'INV-2026-0001',
          invoiceStatus: 'PAID',
          paidDate: new Date().toISOString(),
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await updateInvoiceStatus('inv-1', 'PAID');
      expect(result.status).toBe('PAID');
      expect(result.paidDate).toBeDefined();
    });
  });

  // --- Phase 3: Additional Invoice Operation Tests ---

  describe('markAsPaid', () => {
    it('should update status to PAID', async () => {
      mockPrisma.financialRecord.findUniqueOrThrow.mockResolvedValue({
        id: 'inv-1',
        description: JSON.stringify({ invoiceNumber: 'INV-2026-0001', invoiceStatus: 'SENT' }),
      });

      mockPrisma.financialRecord.update.mockResolvedValue({
        id: 'inv-1', entityId: 'e-1', type: 'INVOICE', amount: 500,
        currency: 'USD', status: 'PAID', dueDate: new Date('2026-03-15'),
        category: 'INVOICE', vendor: null,
        description: JSON.stringify({
          invoiceNumber: 'INV-2026-0001', invoiceStatus: 'PAID',
          paidDate: new Date().toISOString(),
        }),
        createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await markAsPaid('inv-1');

      expect(result.status).toBe('PAID');
      expect(mockPrisma.financialRecord.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: expect.objectContaining({ status: 'PAID' }),
      });
    });

    it('should record payment date', async () => {
      const paidDate = new Date('2026-03-01');
      mockPrisma.financialRecord.findUniqueOrThrow.mockResolvedValue({
        id: 'inv-1',
        description: JSON.stringify({ invoiceNumber: 'INV-2026-0001' }),
      });

      mockPrisma.financialRecord.update.mockResolvedValue({
        id: 'inv-1', entityId: 'e-1', type: 'INVOICE', amount: 500,
        currency: 'USD', status: 'PAID', dueDate: new Date('2026-03-15'),
        category: 'INVOICE', vendor: null,
        description: JSON.stringify({
          invoiceNumber: 'INV-2026-0001', invoiceStatus: 'PAID',
          paidDate: paidDate.toISOString(),
        }),
        createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await markAsPaid('inv-1', paidDate);
      expect(result.paidDate).toBeDefined();
    });
  });

  describe('markAsOverdue', () => {
    it('should update all past-due PENDING invoices to OVERDUE', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        {
          id: 'inv-1', description: JSON.stringify({ invoiceNumber: 'INV-1', invoiceStatus: 'SENT' }),
        },
        {
          id: 'inv-2', description: JSON.stringify({ invoiceNumber: 'INV-2', invoiceStatus: 'SENT' }),
        },
      ]);
      mockPrisma.financialRecord.update.mockResolvedValue({});

      const result = await markAsOverdue('entity-1');

      expect(result.count).toBe(2);
      expect(mockPrisma.financialRecord.update).toHaveBeenCalledTimes(2);
    });

    it('should return count of newly overdue invoices', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([]);

      const result = await markAsOverdue('entity-1');

      expect(result.count).toBe(0);
    });
  });

  describe('getAccountsReceivable', () => {
    it('should sum PENDING and OVERDUE invoice amounts', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        { amount: 1000, status: 'PENDING' },
        { amount: 2000, status: 'OVERDUE' },
        { amount: 500, status: 'PENDING' },
      ]);

      const result = await getAccountsReceivable('entity-1');

      expect(result.total).toBeCloseTo(3500, 2);
      expect(result.pendingCount).toBe(2);
      expect(result.overdueCount).toBe(1);
      expect(result.pendingTotal).toBeCloseTo(1500, 2);
      expect(result.overdueTotal).toBeCloseTo(2000, 2);
    });
  });

  describe('getInvoiceSummary', () => {
    it('should return total invoiced, paid, overdue', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        { amount: 1000, status: 'PAID', description: JSON.stringify({ issuedDate: '2026-01-01', paidDate: '2026-01-15' }) },
        { amount: 2000, status: 'OVERDUE', description: '{}' },
        { amount: 500, status: 'PENDING', description: '{}' },
      ]);

      const result = await getInvoiceSummary('entity-1');

      expect(result.totalInvoiced).toBeCloseTo(3500, 2);
      expect(result.totalPaid).toBeCloseTo(1000, 2);
      expect(result.totalOverdue).toBeCloseTo(2000, 2);
      expect(result.invoiceCount).toBe(3);
      expect(result.avgDaysToPayment).toBeCloseTo(14, 0);
    });
  });
});
