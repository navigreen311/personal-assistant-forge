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

describe('Subscriptions', () => {
  beforeEach(() => {
    _resetStore();
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
    it('should create subscription with correct status', async () => {
      const sub = await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_starter',
      });

      expect(sub.status).toBe('active');
      expect(sub.planId).toBe('plan_starter');
      expect(sub.userId).toBe('user-1');
      expect(sub.entityId).toBe('entity-1');
      expect(sub.cancelAtPeriodEnd).toBe(false);
    });

    it('should set trial period when specified', async () => {
      const sub = await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_professional',
        trialDays: 14,
      });

      expect(sub.status).toBe('trialing');
      const periodDuration = sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime();
      const expectedDuration = 14 * 24 * 60 * 60 * 1000;
      // Allow 1 second tolerance
      expect(Math.abs(periodDuration - expectedDuration)).toBeLessThan(1000);
    });

    it('should throw for unknown plan', async () => {
      await expect(
        createSubscription({
          userId: 'user-1',
          entityId: 'entity-1',
          planId: 'plan_bogus',
        })
      ).rejects.toThrow('PLAN_NOT_FOUND');
    });
  });

  describe('changePlan', () => {
    it('should upgrade subscription plan', async () => {
      const sub = await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_starter',
      });

      const updated = await changePlan({
        subscriptionId: sub.id,
        newPlanId: 'plan_professional',
      });

      expect(updated.planId).toBe('plan_professional');
    });

    it('should downgrade subscription plan', async () => {
      const sub = await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_enterprise',
      });

      const updated = await changePlan({
        subscriptionId: sub.id,
        newPlanId: 'plan_starter',
      });

      expect(updated.planId).toBe('plan_starter');
    });

    it('should reject change to same plan', async () => {
      const sub = await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_starter',
      });

      await expect(
        changePlan({ subscriptionId: sub.id, newPlanId: 'plan_starter' })
      ).rejects.toThrow('SAME_PLAN');
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel immediately when immediate: true', async () => {
      const sub = await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_starter',
      });

      const cancelled = await cancelSubscription({
        subscriptionId: sub.id,
        immediate: true,
      });

      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelAtPeriodEnd).toBe(false);
    });

    it('should set cancelAtPeriodEnd when immediate: false', async () => {
      const sub = await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_starter',
      });

      const cancelled = await cancelSubscription({
        subscriptionId: sub.id,
        immediate: false,
      });

      expect(cancelled.status).toBe('active'); // still active until period end
      expect(cancelled.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe('resumeSubscription', () => {
    it('should resume a pending-cancellation subscription', async () => {
      const sub = await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_starter',
      });

      await cancelSubscription({ subscriptionId: sub.id, immediate: false });
      const resumed = await resumeSubscription(sub.id);

      expect(resumed.cancelAtPeriodEnd).toBe(false);
    });

    it('should reject resuming an already-cancelled subscription', async () => {
      const sub = await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_starter',
      });

      await cancelSubscription({ subscriptionId: sub.id, immediate: true });

      await expect(resumeSubscription(sub.id)).rejects.toThrow('SUBSCRIPTION_CANCELLED');
    });
  });

  describe('hasFeatureAccess', () => {
    it('should return true for included features', async () => {
      await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_professional',
      });

      expect(hasFeatureAccess('entity-1', 'ai_assistant')).toBe(true);
    });

    it('should return false for non-included features', async () => {
      await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_starter',
      });

      expect(hasFeatureAccess('entity-1', 'sso')).toBe(false);
    });

    it('should return false for entity without subscription', () => {
      expect(hasFeatureAccess('entity-none', 'basic_dashboard')).toBe(false);
    });
  });

  describe('recordUsage / isWithinLimits', () => {
    it('should track usage counts', async () => {
      await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_starter',
      });

      await recordUsage({ entityId: 'entity-1', metric: 'apiCallsPerMonth', count: 5 });
      const summary = getUsageSummary('entity-1');

      expect(summary).toHaveLength(1);
      expect(summary[0].count).toBe(5);
      expect(summary[0].metric).toBe('apiCallsPerMonth');
    });

    it('should return true when within limits', async () => {
      await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_starter', // 10000 API calls/month
      });

      await recordUsage({ entityId: 'entity-1', metric: 'apiCallsPerMonth', count: 100 });
      expect(isWithinLimits('entity-1', 'apiCallsPerMonth')).toBe(true);
    });

    it('should return false when limit exceeded', async () => {
      await createSubscription({
        userId: 'user-1',
        entityId: 'entity-1',
        planId: 'plan_free', // 1000 API calls/month
      });

      await recordUsage({ entityId: 'entity-1', metric: 'apiCallsPerMonth', count: 1001 });
      expect(isWithinLimits('entity-1', 'apiCallsPerMonth')).toBe(false);
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
