const mockPrisma = {
  financialRecord: {
    findMany: jest.fn(),
  },
  entity: {
    findUniqueOrThrow: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

import { generatePnL, comparePeriods, getTrends } from '@/modules/finance/services/pnl-service';

describe('P&L Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generatePnL', () => {
    it('should correctly separate revenue from expenses', async () => {
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Test LLC' });

      const records = [
        { type: 'INVOICE', amount: 5000, category: 'Consulting', status: 'PAID' },
        { type: 'PAYMENT', amount: 3000, category: 'Product Sales', status: 'PAID' },
        { type: 'EXPENSE', amount: 2000, category: 'Software', status: 'PAID' },
        { type: 'BILL', amount: 1000, category: 'Rent', status: 'PAID' },
        { type: 'INVOICE', amount: 500, category: 'Consulting', status: 'CANCELLED' }, // Should be excluded
      ];

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce(records)   // current period
        .mockResolvedValueOnce([]);       // previous period

      const pnl = await generatePnL('entity-1', {
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31'),
      });

      expect(pnl.totalRevenue).toBeCloseTo(8000, 2); // 5000 + 3000
      expect(pnl.totalExpenses).toBeCloseTo(3000, 2); // 2000 + 1000
      expect(pnl.grossProfit).toBeCloseTo(5000, 2);
    });

    it('should calculate gross margin correctly', async () => {
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Test LLC' });

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          { type: 'INVOICE', amount: 10000, category: 'Services', status: 'PAID' },
          { type: 'EXPENSE', amount: 3000, category: 'Costs', status: 'PAID' },
        ])
        .mockResolvedValueOnce([]);

      const pnl = await generatePnL('entity-1', {
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31'),
      });

      // Gross margin = (10000 - 3000) / 10000 * 100 = 70%
      expect(pnl.grossMargin).toBeCloseTo(70, 2);
    });

    it('should handle zero revenue with 0% margin', async () => {
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Test LLC' });

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          { type: 'EXPENSE', amount: 1000, category: 'Costs', status: 'PAID' },
        ])
        .mockResolvedValueOnce([]);

      const pnl = await generatePnL('entity-1', {
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31'),
      });

      expect(pnl.totalRevenue).toBe(0);
      expect(pnl.grossMargin).toBe(0);
      expect(pnl.grossProfit).toBeCloseTo(-1000, 2);
    });

    it('should exclude cancelled records', async () => {
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Test LLC' });

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          { type: 'INVOICE', amount: 5000, category: 'Services', status: 'PAID' },
          { type: 'INVOICE', amount: 2000, category: 'Services', status: 'CANCELLED' },
        ])
        .mockResolvedValueOnce([]);

      const pnl = await generatePnL('entity-1', {
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31'),
      });

      expect(pnl.totalRevenue).toBeCloseTo(5000, 2);
    });
  });

  describe('comparePeriods', () => {
    it('should calculate change percentages between periods', async () => {
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Test LLC' });

      // Period 1
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          { type: 'INVOICE', amount: 8000, category: 'Services', status: 'PAID' },
          { type: 'EXPENSE', amount: 3000, category: 'Software', status: 'PAID' },
        ])
        .mockResolvedValueOnce([]) // period1 previous
        // Period 2
        .mockResolvedValueOnce([
          { type: 'INVOICE', amount: 10000, category: 'Services', status: 'PAID' },
          { type: 'EXPENSE', amount: 4000, category: 'Software', status: 'PAID' },
        ])
        .mockResolvedValueOnce([
          { type: 'INVOICE', amount: 8000, category: 'Services', status: 'PAID' },
          { type: 'EXPENSE', amount: 3000, category: 'Software', status: 'PAID' },
        ]);

      const result = await comparePeriods(
        'entity-1',
        { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
        { start: new Date('2026-02-01'), end: new Date('2026-02-28') }
      );

      expect(result.period1.totalRevenue).toBeCloseTo(8000, 2);
      expect(result.period2.totalRevenue).toBeCloseTo(10000, 2);
      expect(result.changes.length).toBeGreaterThan(0);
    });
  });

  describe('getTrends', () => {
    it('should return monthly P&L trend data', async () => {
      // Mock 3 months of data
      for (let i = 0; i < 3; i++) {
        mockPrisma.financialRecord.findMany.mockResolvedValueOnce([
          { type: 'INVOICE', amount: 10000 + i * 1000, status: 'PAID' },
          { type: 'EXPENSE', amount: 5000 + i * 500, status: 'PAID' },
        ]);
      }

      const trends = await getTrends('entity-1', 3);

      expect(trends).toHaveLength(3);
      for (const trend of trends) {
        expect(trend.period).toMatch(/^\d{4}-\d{2}$/);
        expect(trend.revenue).toBeGreaterThan(0);
        expect(trend.expenses).toBeGreaterThan(0);
        expect(trend.profit).toBe(trend.revenue - trend.expenses);
      }
    });
  });
});
