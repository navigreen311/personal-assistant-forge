jest.mock('@/lib/db', () => ({
  prisma: {
    budget: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  setBudget,
  getBudget,
  checkBudget,
  resetBudgetPeriod,
  addSpend,
  _resetBudgetStore,
} from '@/engines/cost/budget-service';

const mockBudget = prisma.budget as unknown as {
  create: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
  upsert: jest.Mock;
  deleteMany: jest.Mock;
};

const TEST_ENTITY = 'test-entity-budget';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('setBudget', () => {
  it('should create new budget with default thresholds', async () => {
    mockBudget.findFirst.mockResolvedValue(null);
    mockBudget.upsert.mockResolvedValue({
      id: 'budget-1',
      entityId: TEST_ENTITY,
      name: 'AI Budget',
      amount: 1000,
      spent: 0,
      period: 'monthly',
      category: 'ai',
      startDate: new Date(2026, 1, 1),
      endDate: new Date(2026, 1, 28, 23, 59, 59),
      alerts: { alertThresholds: [0.75, 0.90, 1.0], overageBehavior: 'WARN' },
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const budget = await setBudget(TEST_ENTITY, 1000);
    expect(budget.entityId).toBe(TEST_ENTITY);
    expect(budget.monthlyCapUsd).toBe(1000);
    expect(budget.alertThresholds).toEqual([0.75, 0.90, 1.0]);
    expect(budget.overageBehavior).toBe('WARN');
    expect(budget.currentSpend).toBe(0);

    expect(mockBudget.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '' },
        create: expect.objectContaining({
          entityId: TEST_ENTITY,
          amount: 1000,
          category: 'ai',
        }),
      })
    );
  });

  it('should update existing budget', async () => {
    mockBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      entityId: TEST_ENTITY,
      spent: 100,
    });
    mockBudget.upsert.mockResolvedValue({
      id: 'budget-1',
      entityId: TEST_ENTITY,
      name: 'AI Budget',
      amount: 2000,
      spent: 100,
      period: 'monthly',
      category: 'ai',
      startDate: new Date(2026, 1, 1),
      endDate: new Date(2026, 1, 28, 23, 59, 59),
      alerts: { alertThresholds: [0.5, 0.9], overageBehavior: 'BLOCK' },
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const updated = await setBudget(TEST_ENTITY, 2000, [0.5, 0.9], 'BLOCK');
    expect(updated.monthlyCapUsd).toBe(2000);
    expect(updated.alertThresholds).toEqual([0.5, 0.9]);
    expect(updated.overageBehavior).toBe('BLOCK');

    expect(mockBudget.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'budget-1' },
        update: expect.objectContaining({
          amount: 2000,
          alerts: { alertThresholds: [0.5, 0.9], overageBehavior: 'BLOCK' },
        }),
      })
    );
  });
});

describe('getBudget', () => {
  it('should return budget when it exists', async () => {
    mockBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      entityId: TEST_ENTITY,
      amount: 1000,
      spent: 250,
      startDate: new Date(2026, 1, 1),
      endDate: new Date(2026, 1, 28, 23, 59, 59),
      alerts: { alertThresholds: [0.75, 0.90, 1.0], overageBehavior: 'WARN' },
    });

    const budget = await getBudget(TEST_ENTITY);
    expect(budget).not.toBeNull();
    expect(budget!.entityId).toBe(TEST_ENTITY);
    expect(budget!.monthlyCapUsd).toBe(1000);
    expect(budget!.currentSpend).toBe(250);

    expect(mockBudget.findFirst).toHaveBeenCalledWith({
      where: { entityId: TEST_ENTITY, category: 'ai', status: 'active' },
    });
  });

  it('should return null when no budget exists', async () => {
    mockBudget.findFirst.mockResolvedValue(null);

    const budget = await getBudget(TEST_ENTITY);
    expect(budget).toBeNull();
  });
});

describe('checkBudget', () => {
  it('should allow spending within budget', async () => {
    mockBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      entityId: TEST_ENTITY,
      amount: 1000,
      spent: 0,
      startDate: new Date(2026, 1, 1),
      endDate: new Date(2026, 1, 28, 23, 59, 59),
      alerts: { alertThresholds: [0.75, 0.90, 1.0], overageBehavior: 'WARN' },
    });

    const result = await checkBudget(TEST_ENTITY, 100);
    expect(result.allowed).toBe(true);
    expect(result.remainingBudget).toBe(900);
  });

  it('should return alert at 75% threshold', async () => {
    mockBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      entityId: TEST_ENTITY,
      amount: 1000,
      spent: 700,
      startDate: new Date(2026, 1, 1),
      endDate: new Date(2026, 1, 28, 23, 59, 59),
      alerts: { alertThresholds: [0.75, 0.90, 1.0], overageBehavior: 'WARN' },
    });

    const result = await checkBudget(TEST_ENTITY, 50);
    // 750/1000 = 75%
    expect(result.alerts.some(a => a.threshold === 0.75)).toBe(true);
  });

  it('should return alert at 90% threshold', async () => {
    mockBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      entityId: TEST_ENTITY,
      amount: 1000,
      spent: 850,
      startDate: new Date(2026, 1, 1),
      endDate: new Date(2026, 1, 28, 23, 59, 59),
      alerts: { alertThresholds: [0.75, 0.90, 1.0], overageBehavior: 'WARN' },
    });

    const result = await checkBudget(TEST_ENTITY, 50);
    // 900/1000 = 90%
    expect(result.alerts.some(a => a.threshold === 0.90)).toBe(true);
  });

  it('should return alert at 100% threshold', async () => {
    mockBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      entityId: TEST_ENTITY,
      amount: 1000,
      spent: 950,
      startDate: new Date(2026, 1, 1),
      endDate: new Date(2026, 1, 28, 23, 59, 59),
      alerts: { alertThresholds: [0.75, 0.90, 1.0], overageBehavior: 'WARN' },
    });

    const result = await checkBudget(TEST_ENTITY, 50);
    // 1000/1000 = 100%
    expect(result.alerts.some(a => a.threshold === 1.0)).toBe(true);
  });

  it('should block spending when overage behavior is BLOCK', async () => {
    mockBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      entityId: TEST_ENTITY,
      amount: 1000,
      spent: 900,
      startDate: new Date(2026, 1, 1),
      endDate: new Date(2026, 1, 28, 23, 59, 59),
      alerts: { alertThresholds: [0.75, 0.9, 1.0], overageBehavior: 'BLOCK' },
    });

    const result = await checkBudget(TEST_ENTITY, 200);
    // 1100/1000 = 110% > 100%
    expect(result.allowed).toBe(false);
  });

  it('should warn but allow when overage behavior is WARN', async () => {
    mockBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      entityId: TEST_ENTITY,
      amount: 1000,
      spent: 900,
      startDate: new Date(2026, 1, 1),
      endDate: new Date(2026, 1, 28, 23, 59, 59),
      alerts: { alertThresholds: [0.75, 0.9, 1.0], overageBehavior: 'WARN' },
    });

    const result = await checkBudget(TEST_ENTITY, 200);
    expect(result.allowed).toBe(true);
    expect(result.alerts.length).toBeGreaterThan(0);
  });

  it('should calculate remaining budget correctly', async () => {
    mockBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      entityId: TEST_ENTITY,
      amount: 500,
      spent: 200,
      startDate: new Date(2026, 1, 1),
      endDate: new Date(2026, 1, 28, 23, 59, 59),
      alerts: { alertThresholds: [0.75, 0.90, 1.0], overageBehavior: 'WARN' },
    });

    const result = await checkBudget(TEST_ENTITY, 100);
    // 500 - (200 + 100) = 200
    expect(result.remainingBudget).toBe(200);
  });
});

describe('addSpend', () => {
  it('should increment spent via Prisma update', async () => {
    mockBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      entityId: TEST_ENTITY,
      spent: 200,
    });
    mockBudget.update.mockResolvedValue({});

    await addSpend(TEST_ENTITY, 50);

    expect(mockBudget.findFirst).toHaveBeenCalledWith({
      where: { entityId: TEST_ENTITY, category: 'ai', status: 'active' },
    });
    expect(mockBudget.update).toHaveBeenCalledWith({
      where: { id: 'budget-1' },
      data: { spent: 250 },
    });
  });

  it('should no-op when no budget exists', async () => {
    mockBudget.findFirst.mockResolvedValue(null);

    await addSpend(TEST_ENTITY, 50);

    expect(mockBudget.update).not.toHaveBeenCalled();
  });
});

describe('resetBudgetPeriod', () => {
  it('should reset spent to 0 and update dates', async () => {
    mockBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      entityId: TEST_ENTITY,
      amount: 1000,
      spent: 500,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 0, 31, 23, 59, 59),
      alerts: { alertThresholds: [0.75, 0.90, 1.0], overageBehavior: 'WARN' },
    });

    mockBudget.update.mockResolvedValue({
      id: 'budget-1',
      entityId: TEST_ENTITY,
      amount: 1000,
      spent: 0,
      startDate: new Date(2026, 1, 1),
      endDate: new Date(2026, 1, 28, 23, 59, 59),
      alerts: { alertThresholds: [0.75, 0.90, 1.0], overageBehavior: 'WARN' },
    });

    const reset = await resetBudgetPeriod(TEST_ENTITY);
    expect(reset.currentSpend).toBe(0);

    expect(mockBudget.update).toHaveBeenCalledWith({
      where: { id: 'budget-1' },
      data: expect.objectContaining({ spent: 0 }),
    });
  });

  it('should throw when no budget exists', async () => {
    mockBudget.findFirst.mockResolvedValue(null);

    await expect(resetBudgetPeriod(TEST_ENTITY)).rejects.toThrow(
      `No budget found for entity ${TEST_ENTITY}`
    );
  });
});
