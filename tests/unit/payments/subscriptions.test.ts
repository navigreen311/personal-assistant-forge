import {
  PLANS,
  getPlan,
  getSubscription,
  createSubscription,
  changePlan,
  cancelSubscription,
  resumeSubscription,
  hasFeatureAccess,
  isWithinLimits,
  recordUsage,
  getUsageSummary,
  _resetStore,
} from '@/lib/integrations/payments/subscriptions';

// --- Prisma Mock ---

jest.mock('@/lib/db', () => ({
  prisma: {
    subscription: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockPrisma = prisma as unknown as {
  subscription: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
};

// --- Helpers ---

function makeDbSubscription(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  return {
    id: 'sub-1',
    entityId: 'entity-1',
    planId: 'plan_starter',
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    metadata: { userId: 'user-1' },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Subscriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.subscription.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe('getPlan', () => {
    it('should return plan by ID', () => {
      const plan = getPlan('plan_starter');
      expect(plan).toBeDefined();
      expect(plan!.name).toBe('Starter');
    });

    it('should return plan by tier name', () => {
      const plan = getPlan('professional');
      expect(plan).toBeDefined();
      expect(plan!.id).toBe('plan_professional');
    });

    it('should return undefined for unknown plan', () => {
      const plan = getPlan('plan_nonexistent');
      expect(plan).toBeUndefined();
    });
  });

  describe('createSubscription', () => {
    it('should create subscription with correct fields and store userId in metadata', async () => {
      const dbRecord = makeDbSubscription();
      mockPrisma.subscription.create.mockResolvedValue(dbRecord);

      const sub = await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_starter',
      });

      expect(mockPrisma.subscription.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrisma.subscription.create.mock.calls[0][0];
      expect(createCall.data.entityId).toBe('entity-1');
      expect(createCall.data.planId).toBe('plan_starter');
      expect(createCall.data.metadata).toEqual({ userId: 'user-1' });
      expect(createCall.data.status).toBe('active');

      expect(sub.status).toBe('active');
      expect(sub.planId).toBe('plan_starter');
      expect(sub.userId).toBe('user-1');
      expect(sub.entityId).toBe('entity-1');
      expect(sub.cancelAtPeriodEnd).toBe(false);
    });

    it('should set trialing status when trialDays provided', async () => {
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 14);
      const dbRecord = makeDbSubscription({
        status: 'trialing',
        currentPeriodEnd: trialEnd,
      });
      mockPrisma.subscription.create.mockResolvedValue(dbRecord);

      const sub = await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_professional',
        trialDays: 14,
      });

      const createCall = mockPrisma.subscription.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('trialing');

      expect(sub.status).toBe('trialing');
    });

    it('should throw for unknown plan', async () => {
      await expect(
        createSubscription({
          userId: 'user-1',
          entityId: 'entity-1',
          planId: 'plan_bogus',
        })
      ).rejects.toThrow('PLAN_NOT_FOUND');

      expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
    });
  });

  describe('getSubscription', () => {
    it('should return subscription by entityId', async () => {
      const dbRecord = makeDbSubscription();
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);

      const sub = await getSubscription('entity-1');

      expect(mockPrisma.subscription.findFirst).toHaveBeenCalledWith({
        where: { entityId: 'entity-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(sub).not.toBeNull();
      expect(sub!.entityId).toBe('entity-1');
      expect(sub!.userId).toBe('user-1');
    });

    it('should return null when none exists', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const sub = await getSubscription('entity-none');
      expect(sub).toBeNull();
    });

    it('should normalize canceled status to cancelled', async () => {
      const dbRecord = makeDbSubscription({ status: 'canceled' });
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);

      const sub = await getSubscription('entity-1');
      expect(sub!.status).toBe('cancelled');
    });
  });

  describe('changePlan', () => {
    it('should update planId in DB', async () => {
      const dbRecord = makeDbSubscription();
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);
      mockPrisma.subscription.update.mockResolvedValue({
        ...dbRecord,
        planId: 'plan_professional',
      });

      const updated = await changePlan({
        subscriptionId: 'sub-1',
        newPlanId: 'plan_professional',
      });

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { planId: 'plan_professional' },
      });
      expect(updated.planId).toBe('plan_professional');
    });

    it('should throw SAME_PLAN error', async () => {
      const dbRecord = makeDbSubscription({ planId: 'plan_starter' });
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);

      await expect(
        changePlan({ subscriptionId: 'sub-1', newPlanId: 'plan_starter' })
      ).rejects.toThrow('SAME_PLAN');

      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });

    it('should throw PLAN_NOT_FOUND error for invalid new plan', async () => {
      const dbRecord = makeDbSubscription();
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);

      await expect(
        changePlan({ subscriptionId: 'sub-1', newPlanId: 'plan_bogus' })
      ).rejects.toThrow('PLAN_NOT_FOUND');

      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });

    it('should throw SUBSCRIPTION_NOT_FOUND for unknown subscription', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await expect(
        changePlan({ subscriptionId: 'sub-missing', newPlanId: 'plan_professional' })
      ).rejects.toThrow('SUBSCRIPTION_NOT_FOUND');
    });
  });

  describe('cancelSubscription', () => {
    it('should set cancelAtPeriodEnd for non-immediate cancellation', async () => {
      const dbRecord = makeDbSubscription();
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);
      mockPrisma.subscription.update.mockResolvedValue({
        ...dbRecord,
        cancelAtPeriodEnd: true,
      });

      const cancelled = await cancelSubscription({
        subscriptionId: 'sub-1',
        immediate: false,
      });

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { cancelAtPeriodEnd: true },
      });
      expect(cancelled.cancelAtPeriodEnd).toBe(true);
      expect(cancelled.status).toBe('active');
    });

    it('should set status to cancelled for immediate cancellation', async () => {
      const dbRecord = makeDbSubscription();
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);
      mockPrisma.subscription.update.mockResolvedValue({
        ...dbRecord,
        status: 'canceled',
        cancelAtPeriodEnd: false,
      });

      const cancelled = await cancelSubscription({
        subscriptionId: 'sub-1',
        immediate: true,
      });

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { status: 'canceled', cancelAtPeriodEnd: false },
      });
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelAtPeriodEnd).toBe(false);
    });
  });

  describe('resumeSubscription', () => {
    it('should clear cancelAtPeriodEnd', async () => {
      const dbRecord = makeDbSubscription({ cancelAtPeriodEnd: true });
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);
      mockPrisma.subscription.update.mockResolvedValue({
        ...dbRecord,
        cancelAtPeriodEnd: false,
      });

      const resumed = await resumeSubscription('sub-1');

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { cancelAtPeriodEnd: false },
      });
      expect(resumed.cancelAtPeriodEnd).toBe(false);
    });

    it('should throw for fully cancelled subscription', async () => {
      const dbRecord = makeDbSubscription({ status: 'canceled', cancelAtPeriodEnd: false });
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);

      await expect(resumeSubscription('sub-1')).rejects.toThrow('SUBSCRIPTION_CANCELLED');
      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });

    it('should throw for subscription not pending cancellation', async () => {
      const dbRecord = makeDbSubscription({ cancelAtPeriodEnd: false });
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);

      await expect(resumeSubscription('sub-1')).rejects.toThrow('SUBSCRIPTION_ACTIVE');
      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('hasFeatureAccess', () => {
    it('should return true for included features', async () => {
      const dbRecord = makeDbSubscription({ planId: 'plan_professional' });
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);

      const result = await hasFeatureAccess('entity-1', 'ai_assistant');
      expect(result).toBe(true);
    });

    it('should return false for non-included features', async () => {
      const dbRecord = makeDbSubscription({ planId: 'plan_starter' });
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);

      const result = await hasFeatureAccess('entity-1', 'sso');
      expect(result).toBe(false);
    });

    it('should return false for entity without subscription', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await hasFeatureAccess('entity-none', 'basic_dashboard');
      expect(result).toBe(false);
    });

    it('should return false for cancelled subscription', async () => {
      const dbRecord = makeDbSubscription({ status: 'canceled', planId: 'plan_professional' });
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);

      const result = await hasFeatureAccess('entity-1', 'ai_assistant');
      expect(result).toBe(false);
    });
  });

  describe('isWithinLimits', () => {
    it('should return true when within limits', async () => {
      const dbRecord = makeDbSubscription({ planId: 'plan_starter' });
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);

      // No usage recorded, so should be within limits
      const result = await isWithinLimits('entity-1', 'apiCallsPerMonth');
      expect(result).toBe(true);
    });

    it('should return false when entity has no subscription', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await isWithinLimits('entity-none', 'apiCallsPerMonth');
      expect(result).toBe(false);
    });

    it('should return true for unknown metric', async () => {
      const dbRecord = makeDbSubscription({ planId: 'plan_starter' });
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);

      const result = await isWithinLimits('entity-1', 'unknownMetric');
      expect(result).toBe(true);
    });
  });

  describe('recordUsage / getUsageSummary', () => {
    it('should track usage counts', async () => {
      const dbRecord = makeDbSubscription();
      mockPrisma.subscription.findFirst.mockResolvedValue(dbRecord);

      await recordUsage({ entityId: 'entity-1', metric: 'apiCallsPerMonth', count: 5 });
      const summary = getUsageSummary('entity-1');

      expect(summary).toHaveLength(1);
      expect(summary[0].count).toBe(5);
      expect(summary[0].metric).toBe('apiCallsPerMonth');
    });

    it('should throw when entity has no subscription', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await expect(
        recordUsage({ entityId: 'entity-none', metric: 'apiCallsPerMonth' })
      ).rejects.toThrow('NO_SUBSCRIPTION');
    });
  });

  describe('_resetStore', () => {
    it('should call prisma.subscription.deleteMany and clear usage', async () => {
      mockPrisma.subscription.deleteMany.mockResolvedValue({ count: 0 });

      await _resetStore();

      expect(mockPrisma.subscription.deleteMany).toHaveBeenCalledTimes(1);
      expect(getUsageSummary('any-entity')).toEqual([]);
    });
  });

  describe('PLANS', () => {
    it('should have 4 plans defined', () => {
      expect(PLANS).toHaveLength(4);
    });

    it('should have correct pricing', () => {
      const free = getPlan('free');
      expect(free!.priceMonthly).toBe(0);

      const starter = getPlan('starter');
      expect(starter!.priceMonthly).toBe(2900);
      expect(starter!.priceYearly).toBe(29000);

      const pro = getPlan('professional');
      expect(pro!.priceMonthly).toBe(7900);
      expect(pro!.priceYearly).toBe(79000);

      const enterprise = getPlan('enterprise');
      expect(enterprise!.priceMonthly).toBe(19900);
      expect(enterprise!.priceYearly).toBe(199000);
    });
  });
});
