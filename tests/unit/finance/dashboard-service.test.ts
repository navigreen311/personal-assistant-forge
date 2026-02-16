const mockPrisma = {
  financialRecord: {
    findMany: jest.fn(),
  },
  entity: {
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

import {
  getUnifiedDashboard,
  getEntitySummary,
  generateAlerts,
} from '@/modules/finance/services/dashboard-service';

describe('Dashboard Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getEntitySummary', () => {
    it('should calculate income, expenses, and net cash flow', async () => {
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Test LLC' });
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        { type: 'INVOICE', amount: 10000, status: 'PAID' },
        { type: 'PAYMENT', amount: 5000, status: 'PAID' },
        { type: 'EXPENSE', amount: 3000, status: 'PAID' },
        { type: 'BILL', amount: 2000, status: 'PAID' },
        { type: 'INVOICE', amount: 1000, status: 'PENDING' },
        { type: 'BILL', amount: 500, status: 'OVERDUE' },
      ]);

      const summary = await getEntitySummary('entity-1', {
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31'),
      });

      expect(summary.totalIncome).toBeCloseTo(16000, 2);  // 10k + 5k + 1k
      expect(summary.totalExpenses).toBeCloseTo(5500, 2);  // 3k + 2k + 500
      expect(summary.netCashFlow).toBeCloseTo(10500, 2);
      expect(summary.pendingInvoices).toBe(1);
      expect(summary.pendingInvoiceAmount).toBeCloseTo(1000, 2);
      expect(summary.overdueBills).toBe(1);
      expect(summary.overdueBillAmount).toBeCloseTo(500, 2);
    });
  });

  describe('generateAlerts', () => {
    it('should detect overdue invoices', async () => {
      const pastDate = new Date('2025-12-01');
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          { id: 'inv-1', amount: 5000, type: 'INVOICE', status: 'PENDING', dueDate: pastDate },
        ]) // overdue invoices
        .mockResolvedValueOnce([]) // overdue bills
        .mockResolvedValueOnce([]) // recent records for burn rate
        .mockResolvedValueOnce([]) // all records for low cash
        .mockResolvedValueOnce([]); // upcoming renewals

      const alerts = await generateAlerts('entity-1');
      const overdueAlert = alerts.find((a) => a.type === 'OVERDUE_INVOICE');
      expect(overdueAlert).toBeDefined();
      expect(overdueAlert!.severity).toBe('WARNING');
    });

    it('should detect overdue bills', async () => {
      const pastDate = new Date('2025-12-01');
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([]) // overdue invoices
        .mockResolvedValueOnce([
          { id: 'bill-1', amount: 2000, type: 'BILL', status: 'PENDING', vendor: 'Vendor A', dueDate: pastDate },
        ]) // overdue bills
        .mockResolvedValueOnce([]) // recent records
        .mockResolvedValueOnce([]) // all records
        .mockResolvedValueOnce([]); // renewals

      const alerts = await generateAlerts('entity-1');
      const billAlert = alerts.find((a) => a.type === 'OVERDUE_BILL');
      expect(billAlert).toBeDefined();
      expect(billAlert!.severity).toBe('CRITICAL');
    });

    it('should detect high burn rate', async () => {
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([])  // overdue invoices
        .mockResolvedValueOnce([])  // overdue bills
        .mockResolvedValueOnce([
          // Recent records: expenses > income * 1.2
          { type: 'EXPENSE', amount: 15000, status: 'PAID' },
          { type: 'INVOICE', amount: 10000, status: 'PAID' },
        ])
        .mockResolvedValueOnce([
          { type: 'INVOICE', amount: 10000, status: 'PAID' },
          { type: 'EXPENSE', amount: 15000, status: 'PAID' },
        ]) // all records (negative balance)
        .mockResolvedValueOnce([]); // renewals

      const alerts = await generateAlerts('entity-1');
      const burnAlert = alerts.find((a) => a.type === 'HIGH_BURN');
      expect(burnAlert).toBeDefined();
      expect(burnAlert!.severity).toBe('WARNING');
    });

    it('should detect low cash (negative balance)', async () => {
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { type: 'INVOICE', amount: 5000, status: 'PAID' },
          { type: 'EXPENSE', amount: 8000, status: 'PAID' },
        ]) // Net negative
        .mockResolvedValueOnce([]);

      const alerts = await generateAlerts('entity-1');
      const cashAlert = alerts.find((a) => a.type === 'LOW_CASH');
      expect(cashAlert).toBeDefined();
      expect(cashAlert!.severity).toBe('CRITICAL');
    });

    it('should detect upcoming renewals', async () => {
      const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { type: 'INVOICE', amount: 10000, status: 'PAID' },
          { type: 'EXPENSE', amount: 5000, status: 'PAID' },
        ])
        .mockResolvedValueOnce([
          { type: 'INVOICE', amount: 50000, status: 'PAID' },
        ])
        .mockResolvedValueOnce([
          { id: 'renewal-1', amount: 1200, type: 'BILL', vendor: 'SaaS Co', dueDate: futureDate },
        ]);

      const alerts = await generateAlerts('entity-1');
      const renewalAlert = alerts.find((a) => a.type === 'RENEWAL_DUE');
      expect(renewalAlert).toBeDefined();
      expect(renewalAlert!.severity).toBe('INFO');
    });
  });

  describe('getUnifiedDashboard', () => {
    it('should aggregate summaries across multiple entities', async () => {
      mockPrisma.entity.findMany.mockResolvedValue([
        { id: 'entity-1' },
        { id: 'entity-2' },
      ]);

      // Entity 1 summary
      mockPrisma.entity.findUniqueOrThrow
        .mockResolvedValueOnce({ name: 'Entity 1' })
        .mockResolvedValueOnce({ name: 'Entity 2' });

      // Mock ordering matches interleaved async execution:
      // getEntitySummary and generateAlerts run in parallel for both entities.
      // generateAlerts hits findMany first (getEntitySummary awaits findUniqueOrThrow first).
      mockPrisma.financialRecord.findMany
        // 1. generateAlerts('entity-1') - overdue invoices
        .mockResolvedValueOnce([])
        // 2. generateAlerts('entity-2') - overdue invoices
        .mockResolvedValueOnce([])
        // 3. getEntitySummary('entity-1') - records
        .mockResolvedValueOnce([
          { type: 'INVOICE', amount: 10000, status: 'PAID' },
          { type: 'EXPENSE', amount: 3000, status: 'PAID' },
        ])
        // 4. generateAlerts('entity-1') - overdue bills
        .mockResolvedValueOnce([])
        // 5. getEntitySummary('entity-2') - records
        .mockResolvedValueOnce([
          { type: 'INVOICE', amount: 5000, status: 'PAID' },
          { type: 'EXPENSE', amount: 2000, status: 'PAID' },
        ])
        // 6. generateAlerts('entity-2') - overdue bills
        .mockResolvedValueOnce([])
        // 7. generateAlerts('entity-1') - recent records (burn rate)
        .mockResolvedValueOnce([])
        // 8. generateAlerts('entity-2') - recent records (burn rate)
        .mockResolvedValueOnce([])
        // 9. generateAlerts('entity-1') - all records (low cash)
        .mockResolvedValueOnce([{ type: 'INVOICE', amount: 10000, status: 'PAID' }])
        // 10. generateAlerts('entity-2') - all records (low cash)
        .mockResolvedValueOnce([{ type: 'INVOICE', amount: 5000, status: 'PAID' }])
        // 11. generateAlerts('entity-1') - upcoming renewals
        .mockResolvedValueOnce([])
        // 12. generateAlerts('entity-2') - upcoming renewals
        .mockResolvedValueOnce([]);

      const dashboard = await getUnifiedDashboard('user-1', {
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31'),
      });

      expect(dashboard.summaries).toHaveLength(2);
      expect(dashboard.aggregated.totalIncome).toBeCloseTo(15000, 2);
      expect(dashboard.aggregated.totalExpenses).toBeCloseTo(5000, 2);
      expect(dashboard.aggregated.netCashFlow).toBeCloseTo(10000, 2);
    });
  });
});
