// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _adoptionStore = new Map<string, any>();

jest.mock('@/lib/db', () => {
  return {
    prisma: {
      adoptionProgress: {
        upsert: jest.fn().mockImplementation((args: { where: { userId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
          const existing = _adoptionStore.get(args.where.userId);
          if (existing) {
            const updated = { ...existing, ...args.update, updatedAt: new Date() };
            _adoptionStore.set(args.where.userId, updated);
            return Promise.resolve({ ...updated });
          }
          const record = {
            id: 'adoption-' + args.where.userId,
            ...args.create,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          _adoptionStore.set(args.where.userId, record);
          return Promise.resolve({ ...record });
        }),
        findUnique: jest.fn().mockImplementation((args: { where: { userId: string } }) => {
          const rec = _adoptionStore.get(args.where.userId);
          return Promise.resolve(rec ? { ...rec } : null);
        }),
        update: jest.fn().mockImplementation((args: { where: { userId: string }; data: Record<string, unknown> }) => {
          const rec = _adoptionStore.get(args.where.userId);
          if (rec) {
            const updated = { ...rec, ...args.data, updatedAt: new Date() };
            _adoptionStore.set(args.where.userId, updated);
            return Promise.resolve({ ...updated });
          }
          return Promise.resolve(null);
        }),
      },
    },
  };
});

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('We noticed you have been away. Come back and check out the new features!'),
  generateJSON: jest.fn().mockResolvedValue({}),
  chat: jest.fn().mockResolvedValue('AI conversational response'),
}));

import {
  setUserActivity,
  checkForReengagementTriggers,
  generateReengagementMessage,
} from '@/engines/adoption/reengagement-service';

describe('reengagement-service (Prisma-backed)', () => {
  beforeEach(() => {
    _adoptionStore.clear();
    jest.clearAllMocks();
  });

  it('should return no triggers for a default active user', async () => {
    const triggers = await checkForReengagementTriggers('active-user');
    expect(triggers).toHaveLength(0);
  });

  it('should detect USAGE_DROP when current usage is below 50% of average', async () => {
    await setUserActivity('drop-user', {
      dailyUsage7DayAvg: 20,
      currentDayUsage: 5,
    });
    const triggers = await checkForReengagementTriggers('drop-user');
    const usageDrop = triggers.find(t => t.triggerType === 'USAGE_DROP');
    expect(usageDrop).toBeDefined();
    expect(usageDrop?.severity).toBe('MEDIUM');
    expect(usageDrop?.message).toContain('20');
    expect(usageDrop?.message).toContain('5');
  });

  it('should detect FEATURE_ABANDONMENT when week 1 features are not used recently', async () => {
    await setUserActivity('abandon-user', {
      featuresUsedWeek1: ['email_triage', 'calendar_sync'],
      featuresUsedRecent: [],
    });
    const triggers = await checkForReengagementTriggers('abandon-user');
    const abandonment = triggers.find(t => t.triggerType === 'FEATURE_ABANDONMENT');
    expect(abandonment).toBeDefined();
    expect(abandonment?.message).toContain('email_triage');
    expect(abandonment?.message).toContain('calendar_sync');
  });

  it('should detect STREAK_BREAK when streak of 5+ days is broken', async () => {
    await setUserActivity('streak-user', {
      currentStreakBroken: true,
      lastStreakLength: 7,
    });
    const triggers = await checkForReengagementTriggers('streak-user');
    const streakBreak = triggers.find(t => t.triggerType === 'STREAK_BREAK');
    expect(streakBreak).toBeDefined();
    expect(streakBreak?.message).toContain('7-day');
  });

  it('should detect INACTIVE for new user not logged in for 3+ days', async () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 4);
    await setUserActivity('inactive-new-user', {
      lastLogin: threeDaysAgo,
      activationDay: 10,
    });
    const triggers = await checkForReengagementTriggers('inactive-new-user');
    const inactive = triggers.find(t => t.triggerType === 'INACTIVE');
    expect(inactive).toBeDefined();
    expect(inactive?.message).toContain('4 days');
    expect(inactive?.suggestedAction).toContain('activation checklist');
  });

  it('should detect INACTIVE for established user not logged in for 7+ days', async () => {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    await setUserActivity('inactive-old-user', {
      lastLogin: tenDaysAgo,
      activationDay: 60,
    });
    const triggers = await checkForReengagementTriggers('inactive-old-user');
    const inactive = triggers.find(t => t.triggerType === 'INACTIVE');
    expect(inactive).toBeDefined();
    expect(inactive?.severity).toBe('HIGH');
    expect(inactive?.suggestedAction).toContain('delegation inbox');
  });

  it('should not trigger INACTIVE for established user within 7-day threshold', async () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    await setUserActivity('ok-old-user', {
      lastLogin: fiveDaysAgo,
      activationDay: 60,
    });
    const triggers = await checkForReengagementTriggers('ok-old-user');
    const inactive = triggers.find(t => t.triggerType === 'INACTIVE');
    expect(inactive).toBeUndefined();
  });

  it('should generate AI-powered reengagement messages', async () => {
    const message = await generateReengagementMessage({
      userId: 'test-user',
      triggerType: 'USAGE_DROP',
      message: 'Your activity has dropped.',
      suggestedAction: 'Check your dashboard.',
      severity: 'MEDIUM',
      triggeredAt: new Date(),
    });
    expect(message).toBeTruthy();
    expect(typeof message).toBe('string');
  });

  it('should persist activity data across calls (database-backed)', async () => {
    await setUserActivity('persist-user', {
      dailyUsage7DayAvg: 30,
      currentDayUsage: 10,
    });
    // Subsequent check reads from DB
    const triggers = await checkForReengagementTriggers('persist-user');
    const usageDrop = triggers.find(t => t.triggerType === 'USAGE_DROP');
    expect(usageDrop).toBeDefined();
  });

  it('should detect multiple triggers simultaneously', async () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    await setUserActivity('multi-trigger-user', {
      dailyUsage7DayAvg: 20,
      currentDayUsage: 3,
      featuresUsedWeek1: ['workflow_builder'],
      featuresUsedRecent: [],
      currentStreakBroken: true,
      lastStreakLength: 10,
      lastLogin: fiveDaysAgo,
      activationDay: 15,
    });
    const triggers = await checkForReengagementTriggers('multi-trigger-user');
    const types = triggers.map(t => t.triggerType);
    expect(types).toContain('USAGE_DROP');
    expect(types).toContain('FEATURE_ABANDONMENT');
    expect(types).toContain('STREAK_BREAK');
    expect(types).toContain('INACTIVE');
  });
});
