// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _budgetStore = new Map<string, any>();

jest.mock('@/lib/db', () => {
  return {
    prisma: {
      attentionBudget: {
        findUnique: jest.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
          const compound = args.where.userId_date as { userId: string; date: Date } | undefined;
          if (compound) {
            const key = compound.userId;
            const rec = _budgetStore.get(key);
            return Promise.resolve(rec ? { ...rec } : null);
          }
          for (const rec of _budgetStore.values()) {
            if (rec.id === args.where.id) return Promise.resolve({ ...rec });
          }
          return Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
          const record = {
            id: `budget-1`,
            ...args.data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          _budgetStore.set(args.data.userId as string, record);
          return Promise.resolve({ ...record });
        }),
        update: jest.fn().mockImplementation((args: { where: { id: string }; data: Record<string, unknown> }) => {
          for (const [key, rec] of _budgetStore.entries()) {
            if (rec.id === args.where.id) {
              const updated = { ...rec, ...args.data, updatedAt: new Date() };
              _budgetStore.set(key, updated);
              return Promise.resolve({ ...updated });
            }
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      actionLog: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', preferences: {} }),
        update: jest.fn().mockResolvedValue({}),
      },
    },
  };
});

import {
  getBudget,
  consumeBudget,
  setBudget,
  resetBudget,
  deductBudget,
  setBudgetLimit,
  getBudgetHistory,
  isLowBudget,
} from '@/modules/attention/services/attention-budget-service';

const { prisma } = jest.requireMock('@/lib/db');

beforeEach(() => {
  _budgetStore.clear();
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
    // Seed a budget with an expired resetAt
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const pastReset = new Date(yesterday);
    pastReset.setHours(0, 0, 0, 0);

    _budgetStore.set('user-1', {
      id: 'budget-old',
      userId: 'user-1',
      date: yesterday,
      totalMinutes: 10,
      consumedMinutes: 8,
      resetAt: pastReset,
    });

    const budget = await getBudget('user-1');
    expect(budget.usedToday).toBe(0);
    expect(budget.remaining).toBe(10);
  });

  it('should initialize budget if none exists', async () => {
    const budget = await getBudget('new-user');
    expect(budget.dailyBudget).toBe(10);
    expect(budget.remaining).toBe(10);
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
    for (let i = 0; i < 8; i++) {
      await consumeBudget('user-1');
    }

    const result = await isLowBudget('user-1');
    expect(result.isLow).toBe(true);
  });
});

describe('getBudgetHistory', () => {
  it('should query ActionLog for recent deductions', async () => {
    (prisma.actionLog.findMany as jest.Mock).mockResolvedValueOnce([
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
    (prisma.actionLog.findMany as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

    const history = await getBudgetHistory('user-1', 7);
    expect(history).toEqual([]);
  });
});
