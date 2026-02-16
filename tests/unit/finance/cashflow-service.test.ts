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
});
