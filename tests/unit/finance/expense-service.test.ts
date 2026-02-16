import type { Expense, ExpenseByCategory } from '@/modules/finance/types';

const mockGenerateJSON = jest.fn();
jest.mock('@/lib/ai', () => ({
  generateJSON: (...args: unknown[]) => mockGenerateJSON(...args),
}));

const mockPrisma = {
  financialRecord: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
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
  getExpense,
  updateExpense,
  deleteExpense,
  categorizeExpenseWithAI,
  getRecurringExpenses,
  getExpenseTotals,
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

  describe('createExpense', () => {
    it('should create a FinancialRecord with type EXPENSE', async () => {
      mockPrisma.financialRecord.create.mockResolvedValue({
        id: 'exp-1',
        entityId: 'entity-1',
        type: 'EXPENSE',
        amount: 150,
        currency: 'USD',
        status: 'PAID',
        dueDate: new Date('2026-02-15'),
        category: 'Software & SaaS',
        vendor: 'Slack',
        description: JSON.stringify({ expenseDescription: 'Slack monthly' }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await createExpense({
        entityId: 'entity-1',
        amount: 150,
        currency: 'USD',
        category: 'Software & SaaS',
        vendor: 'Slack',
        description: 'Slack monthly',
        date: new Date('2026-02-15'),
        isRecurring: false,
        tags: [],
      });

      expect(result.amount).toBeCloseTo(150, 2);
      expect(mockPrisma.financialRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'EXPENSE',
          entityId: 'entity-1',
        }),
      });
    });

    it('should set default status to PAID', async () => {
      mockPrisma.financialRecord.create.mockResolvedValue({
        id: 'exp-2', entityId: 'e-1', type: 'EXPENSE', amount: 50,
        currency: 'USD', status: 'PAID', dueDate: null, category: 'General',
        vendor: '', description: '{}', createdAt: new Date(), updatedAt: new Date(),
      });

      await createExpense({
        entityId: 'e-1', amount: 50, currency: 'USD', category: '',
        vendor: '', description: '', date: new Date(), isRecurring: false, tags: [],
      });

      expect(mockPrisma.financialRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'PAID' }),
      });
    });
  });

  describe('getExpensesByCategory', () => {
    it('should aggregate expenses by category', async () => {
      const period = { start: new Date('2026-01-01'), end: new Date('2026-01-31') };

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          { category: 'Software & SaaS', amount: 500, type: 'EXPENSE' },
          { category: 'Software & SaaS', amount: 300, type: 'EXPENSE' },
          { category: 'Travel', amount: 200, type: 'EXPENSE' },
        ])
        .mockResolvedValueOnce([
          { category: 'Software & SaaS', amount: 600, type: 'EXPENSE' },
          { category: 'Travel', amount: 400, type: 'EXPENSE' },
        ]);

      const result = await getExpensesByCategory('entity-1', period);

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

    it('should calculate percentage of total', async () => {
      const period = { start: new Date('2026-01-01'), end: new Date('2026-01-31') };

      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([
          { category: 'A', amount: 250, type: 'EXPENSE' },
          { category: 'B', amount: 750, type: 'EXPENSE' },
        ])
        .mockResolvedValueOnce([]);

      const result = await getExpensesByCategory('entity-1', period);
      const catA = result.find((c) => c.category === 'A')!;
      const catB = result.find((c) => c.category === 'B')!;

      expect(catA.percentageOfTotal).toBeCloseTo(25, 2);
      expect(catB.percentageOfTotal).toBeCloseTo(75, 2);
    });

    it('should sort by total descending (detect trends correctly)', async () => {
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

  // --- Phase 3: Additional Expense Operation Tests ---

  describe('categorizeExpenseWithAI', () => {
    it('should call AI for uncategorized expenses', async () => {
      mockPrisma.financialRecord.findUniqueOrThrow.mockResolvedValue({
        id: 'exp-1', vendor: 'WeWork', amount: 500, category: 'UNCATEGORIZED',
        description: JSON.stringify({ expenseDescription: 'Monthly desk rental' }),
      });

      mockGenerateJSON.mockResolvedValue({ suggestedCategory: 'Rent & Facilities', confidence: 0.9 });

      const result = await categorizeExpenseWithAI('exp-1');

      expect(mockGenerateJSON).toHaveBeenCalled();
      expect(result.suggestedCategory).toBe('Rent & Facilities');
      expect(result.confidence).toBeCloseTo(0.9, 2);
    });

    it('should return suggested category without auto-applying', async () => {
      mockPrisma.financialRecord.findUniqueOrThrow.mockResolvedValue({
        id: 'exp-1', vendor: 'Adobe', amount: 55, category: 'General',
        description: '{}',
      });

      mockGenerateJSON.mockResolvedValue({ suggestedCategory: 'Software & SaaS', confidence: 0.85 });

      const result = await categorizeExpenseWithAI('exp-1');

      // Should not have called update
      expect(mockPrisma.financialRecord.update).not.toHaveBeenCalled();
      expect(result.suggestedCategory).toBe('Software & SaaS');
    });

    it('should handle AI failure gracefully', async () => {
      mockPrisma.financialRecord.findUniqueOrThrow.mockResolvedValue({
        id: 'exp-1', vendor: 'Unknown', amount: 100, category: 'General',
        description: '{}',
      });

      mockGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

      const result = await categorizeExpenseWithAI('exp-1');

      expect(result.suggestedCategory).toBe('General');
      expect(result.confidence).toBe(0);
    });
  });

  describe('getRecurringExpenses', () => {
    it('should identify monthly recurring expenses', async () => {
      const now = new Date();
      const entries = [];
      // Create 4 monthly entries for "Slack" at ~$100
      for (let i = 4; i >= 1; i--) {
        entries.push({
          type: 'EXPENSE',
          amount: 99 + (i % 2), // slight variation: 100, 99, 100, 99
          vendor: 'Slack',
          status: 'PAID',
          createdAt: new Date(now.getFullYear(), now.getMonth() - i, 15),
        });
      }

      mockPrisma.financialRecord.findMany.mockResolvedValue(entries);

      const result = await getRecurringExpenses('entity-1');

      expect(result.length).toBeGreaterThanOrEqual(1);
      const slack = result.find((r) => r.vendor === 'Slack');
      expect(slack).toBeDefined();
      expect(slack!.frequency).toBe('monthly');
    });

    it('should match by vendor and similar amount', async () => {
      const now = new Date();

      mockPrisma.financialRecord.findMany.mockResolvedValue([
        { type: 'EXPENSE', amount: 50, vendor: 'Netflix', status: 'PAID', createdAt: new Date(now.getFullYear(), now.getMonth() - 3, 1) },
        { type: 'EXPENSE', amount: 50, vendor: 'Netflix', status: 'PAID', createdAt: new Date(now.getFullYear(), now.getMonth() - 2, 1) },
        { type: 'EXPENSE', amount: 50, vendor: 'Netflix', status: 'PAID', createdAt: new Date(now.getFullYear(), now.getMonth() - 1, 1) },
        // Different vendor, different amounts — not recurring
        { type: 'EXPENSE', amount: 200, vendor: 'RandomCo', status: 'PAID', createdAt: new Date(now.getFullYear(), now.getMonth() - 2, 15) },
        { type: 'EXPENSE', amount: 500, vendor: 'RandomCo', status: 'PAID', createdAt: new Date(now.getFullYear(), now.getMonth() - 1, 10) },
      ]);

      const result = await getRecurringExpenses('entity-1');

      const netflix = result.find((r) => r.vendor === 'Netflix');
      expect(netflix).toBeDefined();
      expect(netflix!.occurrences).toBe(3);

      // RandomCo should NOT be detected as recurring (amounts differ too much)
      const random = result.find((r) => r.vendor === 'RandomCo');
      expect(random).toBeUndefined();
    });
  });

  describe('getExpenseTotals', () => {
    it('should return total, average, largest, smallest', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        { amount: 100 },
        { amount: 500 },
        { amount: 200 },
        { amount: 50 },
      ]);

      const result = await getExpenseTotals('entity-1');

      expect(result.total).toBeCloseTo(850, 2);
      expect(result.average).toBeCloseTo(212.5, 2);
      expect(result.largest).toBeCloseTo(500, 2);
      expect(result.smallest).toBeCloseTo(50, 2);
      expect(result.count).toBe(4);
    });

    it('should handle empty results', async () => {
      mockPrisma.financialRecord.findMany.mockResolvedValue([]);

      const result = await getExpenseTotals('entity-1');

      expect(result.total).toBe(0);
      expect(result.count).toBe(0);
    });
  });
});
