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

import { runScenario } from '@/modules/finance/services/cashflow-service';

describe('Scenario Modeling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function setupBurnRateMocks(monthlyExpenses: number[], totalIncome: number, totalExpenses: number) {
    mockPrisma.entity.findUniqueOrThrow.mockResolvedValue({ name: 'Test LLC' });

    // Monthly expense mocks
    for (const amount of monthlyExpenses) {
      mockPrisma.financialRecord.findMany.mockResolvedValueOnce(
        amount > 0 ? [{ amount, type: 'EXPENSE' }] : []
      );
    }

    // All records for balance (called in calculateBurnRate)
    mockPrisma.financialRecord.findMany.mockResolvedValueOnce([
      { type: 'INVOICE', amount: totalIncome, status: 'PAID' },
      { type: 'EXPENSE', amount: totalExpenses, status: 'PAID' },
    ]);

    // All records for balance (called again in runScenario)
    mockPrisma.financialRecord.findMany.mockResolvedValueOnce([
      { type: 'INVOICE', amount: totalIncome, status: 'PAID' },
      { type: 'EXPENSE', amount: totalExpenses, status: 'PAID' },
    ]);
  }

  describe('Revenue loss impact', () => {
    it('should increase burn rate when revenue is lost', async () => {
      // Base burn: $10k/month, balance: $50k
      setupBurnRateMocks([10000, 10000, 10000], 80000, 30000);

      const result = await runScenario('entity-1', {
        name: 'Lose Client X',
        adjustments: [
          {
            type: 'REVENUE_LOSS',
            description: 'Lost Client X',
            monthlyAmount: 5000,
            startDate: new Date('2026-03-01'),
          },
        ],
      });

      // Revenue loss of $5k means net burn increases by $5k
      // New burn = $10k + $5k = $15k
      expect(result.projectedImpact.monthlyRevenueChange).toBeCloseTo(-5000, 2);
      expect(result.projectedImpact.newBurnRate).toBeCloseTo(15000, 2);

      // Runway = $50k / $15k ≈ 3.33 months
      expect(result.projectedImpact.newRunwayMonths).toBeCloseTo(3.33, 1);
    });
  });

  describe('Expense increase impact', () => {
    it('should reduce runway when expenses increase', async () => {
      // Base burn: $10k/month, balance: $50k
      setupBurnRateMocks([10000, 10000, 10000], 80000, 30000);

      const result = await runScenario('entity-1', {
        name: 'New Office Lease',
        adjustments: [
          {
            type: 'EXPENSE_INCREASE',
            description: 'New office',
            monthlyAmount: 3000,
            startDate: new Date('2026-03-01'),
          },
        ],
      });

      // New burn = $10k + $3k = $13k
      expect(result.projectedImpact.monthlyExpenseChange).toBeCloseTo(3000, 2);
      expect(result.projectedImpact.newBurnRate).toBeCloseTo(13000, 2);

      // Runway = $50k / $13k ≈ 3.85 months
      expect(result.projectedImpact.newRunwayMonths).toBeCloseTo(3.85, 1);
    });
  });

  describe('Multiple adjustments stacking', () => {
    it('should correctly stack multiple adjustments', async () => {
      // Base burn: $10k/month, balance: $50k
      setupBurnRateMocks([10000, 10000, 10000], 80000, 30000);

      const result = await runScenario('entity-1', {
        name: 'Combined Scenario',
        adjustments: [
          {
            type: 'REVENUE_LOSS',
            description: 'Lost Client X',
            monthlyAmount: 5000,
            startDate: new Date('2026-03-01'),
          },
          {
            type: 'EXPENSE_INCREASE',
            description: 'Hired new engineer',
            monthlyAmount: 8000,
            startDate: new Date('2026-03-01'),
          },
          {
            type: 'EXPENSE_DECREASE',
            description: 'Cancelled unused subscription',
            monthlyAmount: 1000,
            startDate: new Date('2026-03-01'),
          },
        ],
      });

      // Revenue change: -$5k
      // Expense change: +$8k - $1k = +$7k
      // New burn = $10k + $7k - (-$5k) = $10k + $7k + $5k = $22k
      expect(result.projectedImpact.monthlyRevenueChange).toBeCloseTo(-5000, 2);
      expect(result.projectedImpact.monthlyExpenseChange).toBeCloseTo(7000, 2);
      expect(result.projectedImpact.newBurnRate).toBeCloseTo(22000, 2);

      // Runway = $50k / $22k ≈ 2.27 months
      expect(result.projectedImpact.newRunwayMonths).toBeCloseTo(2.27, 1);
    });

    it('should handle revenue gain improving runway', async () => {
      // Base burn: $10k/month, balance: $50k
      setupBurnRateMocks([10000, 10000, 10000], 80000, 30000);

      const result = await runScenario('entity-1', {
        name: 'New Client Win',
        adjustments: [
          {
            type: 'REVENUE_GAIN',
            description: 'New client',
            monthlyAmount: 15000,
            startDate: new Date('2026-03-01'),
          },
        ],
      });

      // New burn = $10k - $15k = -$5k (negative burn = profit)
      expect(result.projectedImpact.newBurnRate).toBeCloseTo(-5000, 2);
      // Negative burn -> Infinity runway
      expect(result.projectedImpact.newRunwayMonths).toBe(Infinity);
    });
  });
});
