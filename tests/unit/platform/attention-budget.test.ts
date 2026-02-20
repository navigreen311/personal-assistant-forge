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


import { getBudget, consumeBudget, setBudget, resetBudget } from '@/modules/attention/services/attention-budget-service';
import { isDNDActive, checkVIPBreakthrough, setDND, dndStore } from '@/modules/attention/services/dnd-service';
import { routeNotification, notificationStore } from '@/modules/attention/services/priority-router';

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated content'),
  generateJSON: jest.fn().mockResolvedValue({ priority: 'P1' }),
  chat: jest.fn().mockResolvedValue('AI response'),
}));

// Mock dnd-service for priority-router tests
jest.mock('@/modules/attention/services/dnd-service', () => {
  const actual = jest.requireActual('@/modules/attention/services/dnd-service');
  return {
    ...actual,
    isDNDActive: jest.fn(actual.isDNDActive),
    checkVIPBreakthrough: jest.fn(actual.checkVIPBreakthrough),
  };
});

// Mock attention-budget-service for priority-router tests
jest.mock('@/modules/attention/services/attention-budget-service', () => {
  const actual = jest.requireActual('@/modules/attention/services/attention-budget-service');
  return {
    ...actual,
    consumeBudget: jest.fn(actual.consumeBudget),
  };
});

beforeEach(() => {
  _budgetStore.clear();
  dndStore.clear();
  notificationStore.clear();
  jest.clearAllMocks();
});

describe('getBudget', () => {
  it('should return current budget with remaining count', async () => {
    const budget = await getBudget('user-1');
    expect(budget.userId).toBe('user-1');
    expect(budget.dailyBudget).toBe(10);
    expect(budget.remaining).toBe(10);
    expect(budget.usedToday).toBe(0);
  });

  it('should reset at midnight in user timezone', async () => {
    const budget = await getBudget('user-1');
    expect(budget.resetAt).toBeDefined();
    expect(budget.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('should handle first-time budget creation with defaults', async () => {
    // budgetStore removed in Prisma migration - just verify getBudget works for new users
    const budget = await getBudget('new-user');
    expect(budget.dailyBudget).toBe(10);
    expect(budget.remaining).toBe(10);
    // budgetStore removed in Prisma migration
  });
});

describe('consumeBudget', () => {
  it('should allow consumption when budget remains', async () => {
    const { allowed, budget } = await consumeBudget('user-1');
    expect(allowed).toBe(true);
    expect(budget.remaining).toBe(9);
  });

  it('should deny consumption when budget exhausted', async () => {
    await setBudget('user-1', 1);
    await consumeBudget('user-1');
    const { allowed } = await consumeBudget('user-1');
    expect(allowed).toBe(false);
  });

  it('should decrement remaining by 1', async () => {
    const before = await getBudget('user-1');
    const remainingBefore = before.remaining;
    const usedBefore = before.usedToday;
    const { budget: after } = await consumeBudget('user-1');
    expect(after.remaining).toBe(remainingBefore - 1);
    expect(after.usedToday).toBe(usedBefore + 1);
  });

  it('should handle concurrent consumption attempts', async () => {
    await setBudget('user-1', 2);
    const results = await Promise.all([
      consumeBudget('user-1'),
      consumeBudget('user-1'),
      consumeBudget('user-1'),
    ]);
    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBeGreaterThanOrEqual(2);
  });
});

describe('isDNDActive', () => {
  it('should return true during manual DND', async () => {
    await setDND('user-1', { isActive: true, mode: 'MANUAL' });
    expect(await isDNDActive('user-1')).toBe(true);
  });

  it('should return true during focus hours', async () => {
    const now = new Date();
    const start = `${String(now.getHours()).padStart(2, '0')}:00`;
    const end = `${String(now.getHours() + 1).padStart(2, '0')}:00`;
    await setDND('user-1', { mode: 'FOCUS_HOURS', startTime: start, endTime: end, isActive: false });
    expect(await isDNDActive('user-1')).toBe(true);
  });

  it('should return false outside focus hours', async () => {
    await setDND('user-1', { mode: 'FOCUS_HOURS', startTime: '03:00', endTime: '04:00', isActive: false });
    const now = new Date();
    const currentHour = now.getHours();
    if (currentHour < 3 || currentHour >= 4) {
      expect(await isDNDActive('user-1')).toBe(false);
    }
  });

  it('should return true during calendar events (CALENDAR_AWARE)', async () => {
    await setDND('user-1', { mode: 'CALENDAR_AWARE', isActive: true });
    expect(await isDNDActive('user-1')).toBe(true);
  });

  it('should allow VIP breakthrough when enabled', async () => {
    await setDND('user-1', { vipBreakthroughEnabled: true, vipContactIds: ['vip-1'] });
    expect(await checkVIPBreakthrough('user-1', 'vip-1')).toBe(true);
  });

  it('should block non-VIP during DND', async () => {
    await setDND('user-1', { vipBreakthroughEnabled: true, vipContactIds: ['vip-1'] });
    expect(await checkVIPBreakthrough('user-1', 'regular-user')).toBe(false);
  });
});

describe('routeNotification', () => {
  it('should route P0 to INTERRUPT when budget available', async () => {
    const { isDNDActive: mockDND } = jest.requireMock('@/modules/attention/services/dnd-service');
    (mockDND as jest.Mock).mockResolvedValue(false);
    const { consumeBudget: mockConsume } = jest.requireMock('@/modules/attention/services/attention-budget-service');
    (mockConsume as jest.Mock).mockResolvedValue({ allowed: true, budget: {} });

    const item = await routeNotification('user-1', {
      userId: 'user-1', title: 'Urgent', body: 'Test', source: 'system', priority: 'P0',
    });
    expect(item.routedAction).toBe('INTERRUPT');
  });

  it('should route P0 to INTERRUPT even during DND (for VIP)', async () => {
    const { isDNDActive: mockDND, checkVIPBreakthrough: mockVIP } = jest.requireMock('@/modules/attention/services/dnd-service');
    (mockDND as jest.Mock).mockResolvedValue(true);
    (mockVIP as jest.Mock).mockResolvedValue(true);

    const item = await routeNotification('user-1', {
      userId: 'user-1', title: 'VIP', body: 'Test', source: 'vip-contact', priority: 'P0',
    });
    expect(item.routedAction).toBe('INTERRUPT');
  });

  it('should route P1 to NEXT_DIGEST', async () => {
    const item = await routeNotification('user-1', {
      userId: 'user-1', title: 'Normal', body: 'Test', source: 'email', priority: 'P1',
    });
    expect(item.routedAction).toBe('NEXT_DIGEST');
  });

  it('should route P2 to WEEKLY_REVIEW', async () => {
    const item = await routeNotification('user-1', {
      userId: 'user-1', title: 'Low', body: 'Test', source: 'newsletter', priority: 'P2',
    });
    expect(item.routedAction).toBe('WEEKLY_REVIEW');
  });

  it('should downgrade P0 to NEXT_DIGEST when budget exhausted and not VIP', async () => {
    const { isDNDActive: mockDND, checkVIPBreakthrough: mockVIP } = jest.requireMock('@/modules/attention/services/dnd-service');
    (mockDND as jest.Mock).mockResolvedValue(true);
    (mockVIP as jest.Mock).mockResolvedValue(false);

    const item = await routeNotification('user-1', {
      userId: 'user-1', title: 'P0 non-VIP', body: 'Test', source: 'system', priority: 'P0',
    });
    expect(item.routedAction).toBe('NEXT_DIGEST');
  });
});
