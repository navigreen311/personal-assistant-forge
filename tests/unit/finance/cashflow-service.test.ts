// Mock AI client — reject so we fall back to algorithmic cash flow forecasting
const mockGenerateJSON = jest.fn();
jest.mock('@/lib/ai', () => ({
  generateJSON: (...args: unknown[]) => mockGenerateJSON(...args),
}));

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
  forecastCashFlow,
  calculateBurnRate,
  getCashFlow,
  getRunningBalance,
  projectCashFlow,
  identifyTrends,
  getCashFlowSummary,
} from '@/modules/finance/services/cashflow-service';

describe('Cash Flow Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('forecastCashFlow', () => {
    it('should produce daily projections with correct running balance', async () => {
      // Historical: $3000 inflows, $2000 outflows over 90 days
      // Daily avg: ~$33.33 inflow, ~$22.22 outflow, ~$11.11 net
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          // Historical records
          { type: 'INVOICE', amount: 1500, status: 'PAID' },
          { type: 'PAYMENT', amount: 1500, status: 'PAID' },
          { type: 'EXPENSE', amount: 1000, status: 'PAID' },
          { type: 'BILL', amount: 1000, status: 'PAID' },
        ])
        .mockResolvedValueOnce([]);  // No scheduled items

      const forecast = await forecastCashFlow('entity-1', 10000, 30);

      expect(forecast.entityId).toBe('entity-1');
      expect(forecast.startingBalance).toBe(10000);
      expect(forecast.projections).toHaveLength(30);

      // Each day should have positive net since inflows > outflows
      const firstDay = forecast.projections[0];
      expect(firstDay.expectedInflows).toBeGreaterThan(0);
      expect(firstDay.expectedOutflows).toBeGreaterThan(0);

      // Running balance should start from startingBalance
      expect(firstDay.runningBalance).toBeCloseTo(
        10000 + firstDay.netCashFlow,
        2
      );

      // Verify running balance accumulates correctly
      for (let i = 1; i < forecast.projections.length; i++) {
        const prev = forecast.projections[i - 1];
        const curr = forecast.projections[i];
        expect(curr.runningBalance).toBeCloseTo(
          prev.runningBalance + curr.netCashFlow,
          2
        );
      }
    });

    it('should calculate 30/60/90 day summaries', async () => {
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          { type: 'INVOICE', amount: 9000, status: 'PAID' },
          { type: 'EXPENSE', amount: 4500, status: 'PAID' },
        ])
        .mockResolvedValueOnce([]);

      const forecast = await forecastCashFlow('entity-1', 50000, 90);

      expect(forecast.summary.thirtyDay).toBeDefined();
      expect(forecast.summary.sixtyDay).toBeDefined();
      expect(forecast.summary.ninetyDay).toBeDefined();

      // 90-day summary should encompass all projections
      expect(forecast.summary.ninetyDay.endBalance).toBeCloseTo(
        forecast.projections[89].runningBalance,
        2
      );
    });

    it('should generate alert when cash goes below zero', async () => {
      // High outflows, low inflows
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          { type: 'EXPENSE', amount: 90000, status: 'PAID' },
          { type: 'INVOICE', amount: 1000, status: 'PAID' },
        ])
        .mockResolvedValueOnce([]);

      const forecast = await forecastCashFlow('entity-1', 100, 30);

      // With starting balance of 100 and high burn, should go negative
      expect(forecast.alerts.length).toBeGreaterThan(0);
      expect(forecast.alerts[0]).toContain('Cash below $0');
    });
  });

  describe('calculateBurnRate', () => {
    it('should calculate average monthly burn rate', async () => {
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Test LLC' });

      // 3 months: $10k, $12k, $8k = $10k/month average
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([{ amount: 10000, type: 'EXPENSE' }])   // month 3 ago
        .mockResolvedValueOnce([{ amount: 12000, type: 'EXPENSE' }])   // month 2 ago
        .mockResolvedValueOnce([{ amount: 8000, type: 'EXPENSE' }])    // month 1 ago
        .mockResolvedValueOnce([
          // All records for balance calc
          { type: 'INVOICE', amount: 80000, status: 'PAID' },
          { type: 'EXPENSE', amount: 30000, status: 'PAID' },
        ]);

      const result = await calculateBurnRate('entity-1', 3);

      expect(result.monthlyBurn).toBeCloseTo(10000, 2);
      expect(result.entityName).toBe('Test LLC');
    });

    it('should calculate runway from balance and burn rate', async () => {
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Test LLC' });

      // $10k/month burn with $50k balance = 5 months runway
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([{ amount: 10000, type: 'EXPENSE' }])
        .mockResolvedValueOnce([{ amount: 10000, type: 'EXPENSE' }])
        .mockResolvedValueOnce([{ amount: 10000, type: 'EXPENSE' }])
        .mockResolvedValueOnce([
          { type: 'INVOICE', amount: 80000, status: 'PAID' },
          { type: 'EXPENSE', amount: 30000, status: 'PAID' },
        ]);

      const result = await calculateBurnRate('entity-1', 3);

      expect(result.monthlyBurn).toBeCloseTo(10000, 2);
      // Balance = 80000 - 30000 = 50000
      // Runway = 50000 / 10000 = 5 months
      expect(result.runwayMonths).toBeCloseTo(5, 1);
    });

    it('should return Infinity runway when burn rate is 0', async () => {
      mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Test LLC' });

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([])  // no expenses month 3
        .mockResolvedValueOnce([])  // no expenses month 2
        .mockResolvedValueOnce([])  // no expenses month 1
        .mockResolvedValueOnce([]); // no records

      const result = await calculateBurnRate('entity-1', 3);
      expect(result.monthlyBurn).toBe(0);
      expect(result.runwayMonths).toBe(Infinity);
    });
  });

  // --- Phase 3: Cash Flow Calculation Tests ---

  describe('getCashFlow', () => {
    it('should calculate income minus expenses per period', async () => {
      const jan15 = new Date('2026-01-15T12:00:00.000Z');
      const jan20 = new Date('2026-01-20T12:00:00.000Z');

      mockPrisma.financialRecord.findMany.mockResolvedValue([
        { type: 'INCOME', amount: 5000, status: 'PAID', createdAt: jan15 },
        { type: 'EXPENSE', amount: 2000, status: 'PAID', createdAt: jan15 },
        { type: 'REVENUE', amount: 3000, status: 'PAID', createdAt: jan20 },
        { type: 'EXPENSE', amount: 1000, status: 'PAID', createdAt: jan20 },
      ]);

      const result = await getCashFlow('entity-1', 'month', {
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31'),
      });

      expect(result).toHaveLength(1);
      expect(result[0].period).toBe('2026-01');
      expect(result[0].income).toBeCloseTo(8000, 2);
      expect(result[0].expenses).toBeCloseTo(3000, 2);
      expect(result[0].net).toBeCloseTo(5000, 2);
    });

    it('should handle periods with no transactions', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([]);

      const result = await getCashFlow('entity-1', 'month', {
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31'),
      });

      expect(result).toHaveLength(0);
    });

    it('should filter by date range', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        { type: 'INCOME', amount: 1000, status: 'PAID', createdAt: new Date('2026-01-15') },
      ]);

      const result = await getCashFlow('entity-1', 'day', {
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31'),
      });

      expect(mockPrisma.financialRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityId: 'entity-1',
            createdAt: { gte: new Date('2026-01-01'), lte: new Date('2026-01-31') },
          }),
        })
      );
    });
  });

  describe('projectCashFlow', () => {
    it('should project based on historical averages', async () => {
      const now = new Date();
      const records = [];
      // Create records across 3 months
      for (let i = 3; i >= 1; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 15);
        records.push({ type: 'INCOME', amount: 10000, status: 'PAID', createdAt: date });
        records.push({ type: 'EXPENSE', amount: 6000, status: 'PAID', createdAt: date });
      }

      mockPrisma.financialRecord.findMany.mockResolvedValue(records);

      const result = await projectCashFlow('entity-1', 3);

      expect(result).toHaveLength(3);
      expect(result[0].projectedIncome).toBeCloseTo(10000, 0);
      expect(result[0].projectedExpenses).toBeCloseTo(6000, 0);
      expect(result[0].projectedNet).toBeCloseTo(4000, 0);
    });

    it('should handle insufficient data gracefully', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([]);

      const result = await projectCashFlow('entity-1', 3);

      expect(result).toHaveLength(3);
      expect(result[0].projectedIncome).toBe(0);
      expect(result[0].projectedExpenses).toBe(0);
      expect(result[0].confidence).toBe(0);
    });
  });

  describe('getCashFlowSummary', () => {
    it('should return current month summary', async () => {
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          { type: 'INCOME', amount: 15000, status: 'PAID' },
          { type: 'EXPENSE', amount: 8000, status: 'PAID' },
        ])
        .mockResolvedValueOnce([
          { type: 'INCOME', amount: 12000, status: 'PAID' },
          { type: 'EXPENSE', amount: 7000, status: 'PAID' },
        ]);

      const result = await getCashFlowSummary('entity-1');

      expect(result.income).toBeCloseTo(15000, 2);
      expect(result.expenses).toBeCloseTo(8000, 2);
      expect(result.netCashFlow).toBeCloseTo(7000, 2);
    });

    it('should calculate month-over-month change', async () => {
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          { type: 'INCOME', amount: 20000, status: 'PAID' },
          { type: 'EXPENSE', amount: 10000, status: 'PAID' },
        ])
        .mockResolvedValueOnce([
          { type: 'INCOME', amount: 10000, status: 'PAID' },
          { type: 'EXPENSE', amount: 5000, status: 'PAID' },
        ]);

      const result = await getCashFlowSummary('entity-1');

      // Current net: 10000, Prev net: 5000, change = 100%
      expect(result.changes.netChange).toBeCloseTo(100, 2);
    });
  });

  describe('identifyTrends', () => {
    it('should return fallback when AI fails', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([]);
      mockGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

      const result = await identifyTrends('entity-1');

      expect(result.insights).toContain('unavailable');
      expect(result.trends).toHaveLength(1);
    });
  });
});
