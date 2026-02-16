import type { Budget, BudgetCategory } from '@/modules/finance/types';

// Mock AI client — reject so we fall back to algorithmic budget analysis
const mockGenerateJSON = jest.fn();
jest.mock('@/lib/ai', () => ({
  generateJSON: (...args: unknown[]) => mockGenerateJSON(...args),
}));

const mockPrisma = {
  document: {
    create: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  financialRecord: {
    findMany: jest.fn(),
  },
  budget: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

import {
  createBudget,
  getBudgetWithActuals,
  checkBudgetAlerts,
  forecastSpending,
  createBudgetRecord,
  getBudgets,
  getBudget,
  updateBudget,
  deleteBudget,
  recordSpending,
  checkThresholds,
  getBudgetUtilization,
  suggestBudgetAdjustments,
} from '@/modules/finance/services/budget-service';

describe('Budget Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createBudget', () => {
    it('should calculate totalBudgeted from categories', async () => {
      mockPrisma.document.create.mockResolvedValue({
        id: 'budget-1',
        entityId: 'entity-1',
        title: 'Q1 Budget',
        content: JSON.stringify({
          periodStart: '2026-01-01',
          periodEnd: '2026-03-31',
          categories: [],
          totalBudgeted: 5000,
          totalSpent: 0,
          remainingBudget: 5000,
          status: 'DRAFT',
        }),
      });

      const result = await createBudget({
        entityId: 'entity-1',
        name: 'Q1 Budget',
        period: { start: new Date('2026-01-01'), end: new Date('2026-03-31') },
        categories: [
          { category: 'Software', budgeted: 2000, spent: 0, remaining: 2000, percentUsed: 0, forecast: 0, alert: null },
          { category: 'Travel', budgeted: 3000, spent: 0, remaining: 3000, percentUsed: 0, forecast: 0, alert: null },
        ],
        totalBudgeted: 5000,
        status: 'DRAFT',
      });

      expect(result.totalBudgeted).toBeCloseTo(5000, 2);
      expect(result.totalSpent).toBe(0);
      expect(result.remainingBudget).toBeCloseTo(5000, 2);
    });
  });

  describe('getBudgetWithActuals', () => {
    it('should enrich categories with actual spend and calculate alerts', async () => {
      mockPrisma.document.findUniqueOrThrow.mockResolvedValue({
        id: 'budget-1',
        entityId: 'entity-1',
        title: 'Q1 Budget',
        content: JSON.stringify({
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-03-31T23:59:59.999Z',
          categories: [
            { category: 'Software', budgeted: 1000, spent: 0, remaining: 1000, percentUsed: 0, forecast: 0, alert: null },
            { category: 'Travel', budgeted: 2000, spent: 0, remaining: 2000, percentUsed: 0, forecast: 0, alert: null },
            { category: 'Marketing', budgeted: 500, spent: 0, remaining: 500, percentUsed: 0, forecast: 0, alert: null },
          ],
          totalBudgeted: 3500,
          totalSpent: 0,
          remainingBudget: 3500,
          status: 'ACTIVE',
        }),
      });

      mockPrisma.financialRecord.findMany.mockResolvedValue([
        { category: 'Software', amount: 850, type: 'EXPENSE' },   // 85% of $1000 -> WARNING
        { category: 'Travel', amount: 2100, type: 'EXPENSE' },    // 105% of $2000 -> OVER_BUDGET
        { category: 'Marketing', amount: 200, type: 'EXPENSE' },  // 40% of $500 -> ON_TRACK
      ]);

      const result = await getBudgetWithActuals('budget-1');

      const software = result.categories.find((c) => c.category === 'Software')!;
      expect(software.spent).toBeCloseTo(850, 2);
      expect(software.percentUsed).toBeCloseTo(85, 2);
      expect(software.alert).toBe('WARNING');

      const travel = result.categories.find((c) => c.category === 'Travel')!;
      expect(travel.spent).toBeCloseTo(2100, 2);
      expect(travel.percentUsed).toBeCloseTo(105, 2);
      expect(travel.alert).toBe('OVER_BUDGET');

      const marketing = result.categories.find((c) => c.category === 'Marketing')!;
      expect(marketing.spent).toBeCloseTo(200, 2);
      expect(marketing.percentUsed).toBeCloseTo(40, 2);
      expect(marketing.alert).toBe('ON_TRACK');

      expect(result.totalSpent).toBeCloseTo(3150, 2);
      expect(result.remainingBudget).toBeCloseTo(350, 2);
    });

    it('should fire alerts at 80% threshold', async () => {
      mockPrisma.document.findUniqueOrThrow.mockResolvedValue({
        id: 'budget-2',
        entityId: 'entity-1',
        title: 'Budget',
        content: JSON.stringify({
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-03-31T23:59:59.999Z',
          categories: [
            { category: 'Test', budgeted: 1000, spent: 0, remaining: 1000, percentUsed: 0, forecast: 0, alert: null },
          ],
          totalBudgeted: 1000,
          totalSpent: 0,
          remainingBudget: 1000,
          status: 'ACTIVE',
        }),
      });

      // Exactly 80% = WARNING
      mockPrisma.financialRecord.findMany.mockResolvedValue([
        { category: 'Test', amount: 800, type: 'EXPENSE' },
      ]);

      const result = await getBudgetWithActuals('budget-2');
      expect(result.categories[0].alert).toBe('WARNING');
    });

    it('should fire OVER_BUDGET at 100% threshold', async () => {
      mockPrisma.document.findUniqueOrThrow.mockResolvedValue({
        id: 'budget-3',
        entityId: 'entity-1',
        title: 'Budget',
        content: JSON.stringify({
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-03-31T23:59:59.999Z',
          categories: [
            { category: 'Test', budgeted: 1000, spent: 0, remaining: 1000, percentUsed: 0, forecast: 0, alert: null },
          ],
          totalBudgeted: 1000,
          totalSpent: 0,
          remainingBudget: 1000,
          status: 'ACTIVE',
        }),
      });

      mockPrisma.financialRecord.findMany.mockResolvedValue([
        { category: 'Test', amount: 1000, type: 'EXPENSE' },
      ]);

      const result = await getBudgetWithActuals('budget-3');
      expect(result.categories[0].alert).toBe('OVER_BUDGET');
    });
  });

  describe('checkBudgetAlerts', () => {
    it('should return only categories at or above 80%', async () => {
      mockPrisma.document.findUniqueOrThrow.mockResolvedValue({
        id: 'budget-4',
        entityId: 'entity-1',
        title: 'Budget',
        content: JSON.stringify({
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-03-31T23:59:59.999Z',
          categories: [
            { category: 'Low', budgeted: 1000, spent: 0, remaining: 1000, percentUsed: 0, forecast: 0, alert: null },
            { category: 'High', budgeted: 1000, spent: 0, remaining: 1000, percentUsed: 0, forecast: 0, alert: null },
          ],
          totalBudgeted: 2000,
          totalSpent: 0,
          remainingBudget: 2000,
          status: 'ACTIVE',
        }),
      });

      mockPrisma.financialRecord.findMany.mockResolvedValue([
        { category: 'Low', amount: 300, type: 'EXPENSE' },   // 30%
        { category: 'High', amount: 900, type: 'EXPENSE' },  // 90%
      ]);

      const alerts = await checkBudgetAlerts('budget-4');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].category).toBe('High');
    });
  });

  describe('forecastSpending', () => {
    it('should calculate historical monthly average', async () => {
      // Mock 3 months of data: $1000, $1200, $800
      mockPrisma.financialRecord.findMany
        .mockResolvedValueOnce([{ amount: 1000 }])  // month 3 ago
        .mockResolvedValueOnce([{ amount: 1200 }])  // month 2 ago
        .mockResolvedValueOnce([{ amount: 800 }])   // month 1 ago
        .mockResolvedValueOnce([{ amount: 500 }]);   // current month so far

      const forecast = await forecastSpending('entity-1', 'Software', 3);

      expect(forecast.category).toBe('Software');
      expect(forecast.historicalMonthlyAvg).toBeCloseTo(1000, 2);
      expect(forecast.confidence).toBeGreaterThan(0);
    });
  });

  // --- Phase 3: Budget Prisma model CRUD tests ---

  describe('createBudgetRecord', () => {
    it('should create a budget with default status active', async () => {
      mockPrisma.budget.create.mockResolvedValue({
        id: 'b-1',
        entityId: 'entity-1',
        name: 'Marketing Q1',
        amount: 10000,
        spent: 0,
        period: 'quarterly',
        category: 'marketing',
        status: 'active',
        alerts: [],
        notes: null,
        startDate: null,
        endDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await createBudgetRecord('entity-1', {
        name: 'Marketing Q1',
        amount: 10000,
        period: 'quarterly',
        category: 'marketing',
      });

      expect(result.status).toBe('active');
      expect(result.spent).toBe(0);
      expect(mockPrisma.budget.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityId: 'entity-1',
          name: 'Marketing Q1',
          amount: 10000,
          spent: 0,
          status: 'active',
        }),
      });
    });

    it('should set spent to 0 initially', async () => {
      mockPrisma.budget.create.mockResolvedValue({
        id: 'b-2', entityId: 'e-1', name: 'Test', amount: 5000, spent: 0,
        period: 'monthly', category: 'ops', status: 'active', alerts: [],
        notes: null, startDate: null, endDate: null, createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await createBudgetRecord('e-1', {
        name: 'Test', amount: 5000, period: 'monthly', category: 'ops',
      });

      expect(result.spent).toBe(0);
    });
  });

  describe('recordSpending', () => {
    it('should add amount to spent', async () => {
      mockPrisma.budget.findUniqueOrThrow.mockResolvedValue({
        id: 'b-1', amount: 10000, spent: 2000, status: 'active',
        alerts: [], name: 'Test',
      });
      mockPrisma.budget.update.mockResolvedValue({});

      const result = await recordSpending('b-1', 500);

      expect(result.spent).toBeCloseTo(2500, 2);
      expect(mockPrisma.budget.update).toHaveBeenCalledWith({
        where: { id: 'b-1' },
        data: expect.objectContaining({ spent: 2500 }),
      });
    });

    it('should trigger alert when threshold crossed', async () => {
      mockPrisma.budget.findUniqueOrThrow.mockResolvedValue({
        id: 'b-1', amount: 10000, spent: 7500, status: 'active', name: 'Test',
        alerts: [{ threshold: 80, type: 'percentage', notified: false }],
      });
      mockPrisma.budget.update.mockResolvedValue({});

      const result = await recordSpending('b-1', 600);

      expect(result.spent).toBeCloseTo(8100, 2);
      expect(result.triggeredAlerts).toHaveLength(1);
      expect(result.triggeredAlerts[0].threshold).toBe(80);
    });

    it('should set status to exhausted when fully spent', async () => {
      mockPrisma.budget.findUniqueOrThrow.mockResolvedValue({
        id: 'b-1', amount: 1000, spent: 900, status: 'active', name: 'Test',
        alerts: [],
      });
      mockPrisma.budget.update.mockResolvedValue({});

      const result = await recordSpending('b-1', 200);

      expect(result.status).toBe('exhausted');
    });

    it('should handle spending beyond budget amount', async () => {
      mockPrisma.budget.findUniqueOrThrow.mockResolvedValue({
        id: 'b-1', amount: 1000, spent: 1000, status: 'exhausted', name: 'Test',
        alerts: [],
      });
      mockPrisma.budget.update.mockResolvedValue({});

      const result = await recordSpending('b-1', 500);

      expect(result.spent).toBeCloseTo(1500, 2);
      expect(result.status).toBe('exhausted');
    });
  });

  describe('checkThresholds', () => {
    it('should identify triggered thresholds', async () => {
      mockPrisma.budget.findUniqueOrThrow.mockResolvedValue({
        id: 'b-1', amount: 10000, spent: 8500,
        alerts: [
          { threshold: 50, type: 'percentage', notified: false },
          { threshold: 80, type: 'percentage', notified: false },
        ],
      });

      const result = await checkThresholds('b-1');

      expect(result.alerts[0].triggered).toBe(true);
      expect(result.alerts[1].triggered).toBe(true);
      expect(result.utilization).toBeCloseTo(85, 2);
    });

    it('should not trigger thresholds below spending level', async () => {
      mockPrisma.budget.findUniqueOrThrow.mockResolvedValue({
        id: 'b-1', amount: 10000, spent: 3000,
        alerts: [
          { threshold: 50, type: 'percentage', notified: false },
          { threshold: 80, type: 'percentage', notified: false },
        ],
      });

      const result = await checkThresholds('b-1');

      expect(result.alerts[0].triggered).toBe(false);
      expect(result.alerts[1].triggered).toBe(false);
    });
  });

  describe('suggestBudgetAdjustments', () => {
    it('should call generateJSON with spending data', async () => {
      mockPrisma.budget.findMany.mockResolvedValue([
        { id: 'b-1', name: 'Marketing', category: 'marketing', amount: 5000, spent: 4500, period: 'monthly' },
        { id: 'b-2', name: 'Engineering', category: 'engineering', amount: 10000, spent: 3000, period: 'monthly' },
      ]);

      mockGenerateJSON.mockResolvedValue({
        suggestions: [{ budgetName: 'Marketing', action: 'increase', reason: 'Near capacity', suggestedAmount: 7000 }],
      });

      const result = await suggestBudgetAdjustments('entity-1');

      expect(mockGenerateJSON).toHaveBeenCalled();
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].action).toBe('increase');
    });

    it('should handle AI failure gracefully', async () => {
      mockPrisma.budget.findMany.mockResolvedValue([
        { id: 'b-1', name: 'Test', category: 'ops', amount: 5000, spent: 2000, period: 'monthly' },
      ]);

      mockGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

      const result = await suggestBudgetAdjustments('entity-1');

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].reason).toContain('unavailable');
    });
  });
});
