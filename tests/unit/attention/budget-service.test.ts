jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'user-1', preferences: {} }),
      update: jest.fn().mockResolvedValue({}),
    },
    actionLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

import {
  getBudget,
  consumeBudget,
  setBudget,
  resetBudget,
  deductBudget,
  setBudgetLimit,
  getBudgetHistory,
  isLowBudget,
  budgetStore,
} from '@/modules/attention/services/attention-budget-service';

const { prisma } = jest.requireMock('@/lib/db');

beforeEach(() => {
  budgetStore.clear();
  jest.clearAllMocks();
});

describe('getBudget', () => {
  it('should return current budget for today', async () => {
    const budget = await getBudget('user-1');
    expect(budget.userId).toBe('user-1');
    expect(budget.dailyBudget).toBe(10);
    expect(budget.remaining).toBe(10);
    expect(budget.usedToday).toBe(0);
  });

  it('should auto-reset if lastReset is yesterday', async () => {
    // Set up a budget with expired resetAt
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    budgetStore.set('user-1', {
      userId: 'user-1',
      dailyBudget: 10,
      usedToday: 8,
      remaining: 2,
      resetAt: yesterday,
    });

    const budget = await getBudget('user-1');
    expect(budget.usedToday).toBe(0);
    expect(budget.remaining).toBe(10);
  });

  it('should initialize budget if none exists', async () => {
    expect(budgetStore.has('new-user')).toBe(false);
    const budget = await getBudget('new-user');
    expect(budget.dailyBudget).toBe(10);
    expect(budget.remaining).toBe(10);
    expect(budgetStore.has('new-user')).toBe(true);
  });
});

describe('consumeBudget', () => {
  it('should subtract amount from remaining budget', async () => {
    const { allowed, budget } = await consumeBudget('user-1');
    expect(allowed).toBe(true);
    expect(budget.remaining).toBe(9);
    expect(budget.usedToday).toBe(1);
  });

  it('should deny consumption when budget exhausted', async () => {
    await setBudget('user-1', 1);
    await consumeBudget('user-1');
    const { allowed } = await consumeBudget('user-1');
    expect(allowed).toBe(false);
  });

  it('should handle multiple consumptions', async () => {
    await setBudget('user-1', 3);
    await consumeBudget('user-1');
    await consumeBudget('user-1');
    const { allowed, budget } = await consumeBudget('user-1');
    expect(allowed).toBe(true);
    expect(budget.remaining).toBe(0);

    const { allowed: denied } = await consumeBudget('user-1');
    expect(denied).toBe(false);
  });
});

describe('deductBudget', () => {
  it('should subtract amount from remaining budget', async () => {
    const result = await deductBudget('user-1', 3, 'Test deduction');
    expect(result.allowed).toBe(true);
    expect(result.budget.remaining).toBe(7);
  });

  it('should flag as over-budget when remaining is 0', async () => {
    await setBudget('user-1', 2);
    await consumeBudget('user-1');
    await consumeBudget('user-1');

    const result = await deductBudget('user-1', 1, 'Over-budget deduction');
    expect(result.overBudget).toBe(true);
  });

  it('should log deduction in ActionLog', async () => {
    await deductBudget('user-1', 2, 'Test reason');

    expect(prisma.actionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'user-1',
          actionType: 'BUDGET_DEDUCTION',
          reason: expect.stringContaining('Test reason'),
        }),
      })
    );
  });
});

describe('resetBudget', () => {
  it('should reset budget to full', async () => {
    await consumeBudget('user-1');
    await consumeBudget('user-1');

    const budget = await resetBudget('user-1');
    expect(budget.usedToday).toBe(0);
    expect(budget.remaining).toBe(budget.dailyBudget);
  });
});

describe('isLowBudget', () => {
  it('should return true when below threshold', async () => {
    await setBudget('user-1', 10);
    // Use 9 units
    for (let i = 0; i < 9; i++) {
      await consumeBudget('user-1');
    }

    const result = await isLowBudget('user-1', 0.2);
    expect(result.isLow).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it('should return false when above threshold', async () => {
    const result = await isLowBudget('user-1', 0.2);
    expect(result.isLow).toBe(false);
    expect(result.remaining).toBe(10);
  });

  it('should use default 20% threshold', async () => {
    await setBudget('user-1', 10);
    // Use 8 units (remaining = 2 = 20% of 10)
    for (let i = 0; i < 8; i++) {
      await consumeBudget('user-1');
    }

    const result = await isLowBudget('user-1');
    expect(result.isLow).toBe(true);
  });
});

describe('getBudgetHistory', () => {
  it('should query ActionLog for recent deductions', async () => {
    (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([
      { reason: 'test deduction (amount: 2)', timestamp: new Date(), status: 'COMPLETED' },
    ]);

    const history = await getBudgetHistory('user-1', 7);
    expect(prisma.actionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorId: 'user-1',
          actionType: 'BUDGET_DEDUCTION',
        }),
      })
    );
    expect(history.length).toBe(1);
  });

  it('should return empty array on error', async () => {
    (prisma.actionLog.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

    const history = await getBudgetHistory('user-1', 7);
    expect(history).toEqual([]);
  });
});
