import {
  setBudget,
  getBudget,
  checkBudget,
  resetBudgetPeriod,
  addSpend,
  _resetBudgetStore,
} from '@/engines/cost/budget-service';

const TEST_ENTITY = 'test-entity-budget';

beforeEach(() => {
  _resetBudgetStore();
});

describe('setBudget', () => {
  it('should create new budget with default thresholds', async () => {
    const budget = await setBudget(TEST_ENTITY, 1000);
    expect(budget.entityId).toBe(TEST_ENTITY);
    expect(budget.monthlyCapUsd).toBe(1000);
    expect(budget.alertThresholds).toEqual([0.75, 0.90, 1.0]);
    expect(budget.overageBehavior).toBe('WARN');
    expect(budget.currentSpend).toBe(0);
  });

  it('should update existing budget', async () => {
    await setBudget(TEST_ENTITY, 1000);
    const updated = await setBudget(TEST_ENTITY, 2000, [0.5, 0.9], 'BLOCK');
    expect(updated.monthlyCapUsd).toBe(2000);
    expect(updated.alertThresholds).toEqual([0.5, 0.9]);
    expect(updated.overageBehavior).toBe('BLOCK');
  });
});

describe('checkBudget', () => {
  it('should allow spending within budget', async () => {
    await setBudget(TEST_ENTITY, 1000);
    const result = await checkBudget(TEST_ENTITY, 100);
    expect(result.allowed).toBe(true);
    expect(result.remainingBudget).toBe(900);
  });

  it('should return alert at 75% threshold', async () => {
    await setBudget(TEST_ENTITY, 1000);
    addSpend(TEST_ENTITY, 700);
    const result = await checkBudget(TEST_ENTITY, 50);
    // 750/1000 = 75%
    expect(result.alerts.some(a => a.threshold === 0.75)).toBe(true);
  });

  it('should return alert at 90% threshold', async () => {
    await setBudget(TEST_ENTITY, 1000);
    addSpend(TEST_ENTITY, 850);
    const result = await checkBudget(TEST_ENTITY, 50);
    // 900/1000 = 90%
    expect(result.alerts.some(a => a.threshold === 0.90)).toBe(true);
  });

  it('should return alert at 100% threshold', async () => {
    await setBudget(TEST_ENTITY, 1000);
    addSpend(TEST_ENTITY, 950);
    const result = await checkBudget(TEST_ENTITY, 50);
    // 1000/1000 = 100%
    expect(result.alerts.some(a => a.threshold === 1.0)).toBe(true);
  });

  it('should block spending when overage behavior is BLOCK', async () => {
    await setBudget(TEST_ENTITY, 1000, [0.75, 0.9, 1.0], 'BLOCK');
    addSpend(TEST_ENTITY, 900);
    const result = await checkBudget(TEST_ENTITY, 200);
    // 1100/1000 = 110% > 100%
    expect(result.allowed).toBe(false);
  });

  it('should warn but allow when overage behavior is WARN', async () => {
    await setBudget(TEST_ENTITY, 1000, [0.75, 0.9, 1.0], 'WARN');
    addSpend(TEST_ENTITY, 900);
    const result = await checkBudget(TEST_ENTITY, 200);
    expect(result.allowed).toBe(true);
    expect(result.alerts.length).toBeGreaterThan(0);
  });

  it('should calculate remaining budget correctly', async () => {
    await setBudget(TEST_ENTITY, 500);
    addSpend(TEST_ENTITY, 200);
    const result = await checkBudget(TEST_ENTITY, 100);
    // 500 - (200 + 100) = 200
    expect(result.remainingBudget).toBe(200);
  });
});

describe('resetBudgetPeriod', () => {
  it('should reset currentSpend to 0', async () => {
    await setBudget(TEST_ENTITY, 1000);
    addSpend(TEST_ENTITY, 500);
    const reset = await resetBudgetPeriod(TEST_ENTITY);
    expect(reset.currentSpend).toBe(0);
  });
});
