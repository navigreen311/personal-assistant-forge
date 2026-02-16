import type { Expense, ExpenseByCategory } from '@/modules/finance/types';

const mockPrisma = {
  financialRecord: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

import {
  createExpense,
  categorizeExpense,
  getExpensesByCategory,
  detectDuplicates,
} from '@/modules/finance/services/expense-service';

describe('Expense Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('categorizeExpense', () => {
    it('should categorize software subscriptions', () => {
      expect(categorizeExpense('Annual SaaS subscription', 'Slack')).toBe('Software & SaaS');
      expect(categorizeExpense('Software license renewal', 'Adobe')).toBe('Software & SaaS');
    });

    it('should categorize travel expenses', () => {
      expect(categorizeExpense('Flight to NYC', 'Delta Airlines')).toBe('Travel');
      expect(categorizeExpense('Hotel booking', 'Marriott')).toBe('Travel');
    });

    it('should categorize meals', () => {
      expect(categorizeExpense('Team lunch', 'Local Restaurant')).toBe('Meals & Entertainment');
      expect(categorizeExpense('Coffee meeting', 'Starbucks')).toBe('Meals & Entertainment');
    });

    it('should categorize marketing', () => {
      expect(categorizeExpense('Google ads campaign', 'Google')).toBe('Marketing');
      expect(categorizeExpense('Social media advertising', 'Facebook')).toBe('Marketing');
    });

    it('should categorize legal services', () => {
      expect(categorizeExpense('Legal consultation', 'Smith & Associates')).toBe('Legal & Professional');
      expect(categorizeExpense('Attorney fees', 'Law Firm LLC')).toBe('Legal & Professional');
    });

    it('should categorize technology infrastructure', () => {
      expect(categorizeExpense('Cloud hosting', 'AWS')).toBe('Technology & Infrastructure');
      expect(categorizeExpense('Internet service', 'Comcast')).toBe('Technology & Infrastructure');
    });

    it('should return General for unrecognized expenses', () => {
      expect(categorizeExpense('Miscellaneous item', 'Unknown Vendor')).toBe('General');
    });
  });

  describe('getExpensesByCategory', () => {
    it('should calculate percentages correctly', async () => {
      const period = { start: new Date('2026-01-01'), end: new Date('2026-01-31') };
      const prevStart = new Date('2025-12-01');

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          // Current period
          { category: 'Software & SaaS', amount: 500, type: 'EXPENSE' },
          { category: 'Software & SaaS', amount: 300, type: 'EXPENSE' },
          { category: 'Travel', amount: 200, type: 'EXPENSE' },
        ])
        .mockResolvedValueOnce([
          // Previous period
          { category: 'Software & SaaS', amount: 600, type: 'EXPENSE' },
          { category: 'Travel', amount: 400, type: 'EXPENSE' },
        ]);

      const result = await getExpensesByCategory('entity-1', period);

      // Total: 500 + 300 + 200 = 1000
      const softwareCategory = result.find((c) => c.category === 'Software & SaaS');
      expect(softwareCategory).toBeDefined();
      expect(softwareCategory!.total).toBeCloseTo(800, 2);
      expect(softwareCategory!.count).toBe(2);
      expect(softwareCategory!.percentageOfTotal).toBeCloseTo(80, 2);

      const travelCategory = result.find((c) => c.category === 'Travel');
      expect(travelCategory).toBeDefined();
      expect(travelCategory!.total).toBeCloseTo(200, 2);
      expect(travelCategory!.percentageOfTotal).toBeCloseTo(20, 2);
    });

    it('should detect trends correctly', async () => {
      const period = { start: new Date('2026-01-01'), end: new Date('2026-01-31') };

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          { category: 'Software', amount: 1000, type: 'EXPENSE' },
        ])
        .mockResolvedValueOnce([
          { category: 'Software', amount: 500, type: 'EXPENSE' },
        ]);

      const result = await getExpensesByCategory('entity-1', period);
      const sw = result.find((c) => c.category === 'Software');
      // 1000 vs 500 prev = +100% change
      expect(sw!.trend).toBe('UP');
      expect(sw!.changePercent).toBeCloseTo(100, 2);
    });
  });

  describe('detectDuplicates', () => {
    it('should find expenses within 3 days with same amount and vendor', async () => {
      const targetDate = new Date('2026-02-15');

      mockPrisma.financialRecord.findMany.mockResolvedValue([
        {
          id: 'dup-1',
          entityId: 'entity-1',
          type: 'EXPENSE',
          amount: 99.99,
          currency: 'USD',
          status: 'PAID',
          dueDate: new Date('2026-02-14'),
          category: 'Software & SaaS',
          vendor: 'Slack',
          description: JSON.stringify({ expenseDescription: 'Slack subscription' }),
          createdAt: new Date('2026-02-14'),
          updatedAt: new Date('2026-02-14'),
        },
      ]);

      const duplicates = await detectDuplicates({
        entityId: 'entity-1',
        amount: 99.99,
        vendor: 'Slack',
        date: targetDate,
      });

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].amount).toBeCloseTo(99.99, 2);
    });

    it('should return empty when no duplicates', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([]);

      const duplicates = await detectDuplicates({
        entityId: 'entity-1',
        amount: 99.99,
        vendor: 'Slack',
        date: new Date(),
      });

      expect(duplicates).toHaveLength(0);
    });

    it('should return empty when missing required fields', async () => {
      const duplicates = await detectDuplicates({});
      expect(duplicates).toHaveLength(0);
    });
  });
});
