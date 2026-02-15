import type { Invoice, AgingReport } from '@/modules/finance/types';

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
} from '@/modules/finance/services/invoice-service';

describe('Invoice Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createInvoice', () => {
    it('should auto-calculate subtotal and total from line items', async () => {
      // 3 line items: (10 x $50) + (5 x $100) + (1 x $250) = $1,200 subtotal
      // 8.25% tax = $99.00 tax
      // Total = $1,299.00
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

      expect(result.subtotal).toBeCloseTo(1200, 2);
      expect(result.tax).toBeCloseTo(99, 2);
      expect(result.total).toBeCloseTo(1299, 2);
      expect(result.lineItems[0].total).toBeCloseTo(500, 2);
      expect(result.lineItems[1].total).toBeCloseTo(500, 2);
      expect(result.lineItems[2].total).toBeCloseTo(250, 2);
    });

    it('should handle zero quantity line items', async () => {
      mockPrisma.financialRecord.findFirst.mockResolvedValue(null);
      mockPrisma.financialRecord.create.mockResolvedValue({
        id: 'inv-2',
        entityId: 'entity-1',
        type: 'INVOICE',
        amount: 0,
        currency: 'USD',
        status: 'PENDING',
        dueDate: new Date(),
        category: 'INVOICE',
        vendor: null,
        description: JSON.stringify({
          invoiceNumber: 'INV-2026-0001',
          lineItems: [{ description: 'Item', quantity: 0, unitPrice: 100, total: 0 }],
          subtotal: 0,
          tax: 0,
          invoiceStatus: 'DRAFT',
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await createInvoice({
        entityId: 'entity-1',
        lineItems: [{ description: 'Item', quantity: 0, unitPrice: 100, total: 0 }],
        tax: 0,
        currency: 'USD',
        status: 'DRAFT',
        issuedDate: new Date(),
        dueDate: new Date(),
        paymentTerms: 'Net 30',
      });

      expect(result.subtotal).toBe(0);
      expect(result.total).toBe(0);
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
    it('should bucket invoices into correct aging ranges', async () => {
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

    it('should handle empty invoice list', async () => {
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
});
