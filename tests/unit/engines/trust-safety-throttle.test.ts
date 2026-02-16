import {
  checkThrottle,
  recordAction,
  getDefaultThrottleConfigs,
  updateThrottleConfig,
  resetThrottle,
  _resetAllThrottles,
  getThrottleStatus,
} from '@/engines/trust-safety/throttle-service';

const TEST_USER = 'test-user-throttle-v2';

beforeEach(() => {
  _resetAllThrottles();
});

describe('checkThrottle', () => {
  it('should allow action when under hourly limit', async () => {
    const status = await checkThrottle(TEST_USER, 'calls');
    expect(status.isThrottled).toBe(false);
    expect(status.currentHourCount).toBe(0);
  });

  it('should throttle when hourly limit reached', async () => {
    for (let i = 0; i < 5; i++) {
      await recordAction(TEST_USER, 'calls');
    }
    const status = await checkThrottle(TEST_USER, 'calls');
    expect(status.isThrottled).toBe(true);
    expect(status.currentHourCount).toBe(5);
    expect(status.maxPerHour).toBe(5);
  });

  it('should throttle when daily limit reached', async () => {
    // financial_tx has maxPerDay = 1
    await recordAction(TEST_USER, 'financial_tx');
    const status = await checkThrottle(TEST_USER, 'financial_tx');
    expect(status.isThrottled).toBe(true);
    expect(status.currentDayCount).toBe(1);
    expect(status.maxPerDay).toBe(1);
  });

  it('should return requiresApproval when above approval threshold', async () => {
    // calls: requiresApprovalAbove = 3
    for (let i = 0; i < 3; i++) {
      await recordAction(TEST_USER, 'calls');
    }
    const status = await checkThrottle(TEST_USER, 'calls');
    expect(status.requiresApproval).toBe(true);
  });

  it('should provide nextAllowedAt when throttled', async () => {
    for (let i = 0; i < 5; i++) {
      await recordAction(TEST_USER, 'calls');
    }
    const status = await checkThrottle(TEST_USER, 'calls');
    expect(status.isThrottled).toBe(true);
    expect(status.nextAllowedAt).toBeInstanceOf(Date);
    expect(status.nextAllowedAt!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('recordAction', () => {
  it('should increment hourly and daily counters', async () => {
    await recordAction(TEST_USER, 'emails');
    const status1 = await checkThrottle(TEST_USER, 'emails');
    expect(status1.currentHourCount).toBe(1);
    expect(status1.currentDayCount).toBe(1);

    await recordAction(TEST_USER, 'emails');
    const status2 = await checkThrottle(TEST_USER, 'emails');
    expect(status2.currentHourCount).toBe(2);
    expect(status2.currentDayCount).toBe(2);
  });
});

describe('updateThrottleConfig', () => {
  it('should override default config with custom values', async () => {
    updateThrottleConfig('calls', { maxPerHour: 100, maxPerDay: 500, cooldownMinutes: 0 });

    // Should now allow more than 5 calls per hour (cooldown disabled)
    for (let i = 0; i < 10; i++) {
      await recordAction(TEST_USER, 'calls');
    }
    const status = await checkThrottle(TEST_USER, 'calls');
    expect(status.isThrottled).toBe(false);
    expect(status.maxPerHour).toBe(100);
    expect(status.maxPerDay).toBe(500);
  });
});

describe('_resetAllThrottles', () => {
  it('should clear all counters and custom configs', async () => {
    // Record actions and set custom config
    await recordAction(TEST_USER, 'calls');
    await recordAction(TEST_USER, 'emails');
    updateThrottleConfig('calls', { maxPerHour: 999 });

    _resetAllThrottles();

    // Counters should be reset
    const callStatus = await checkThrottle(TEST_USER, 'calls');
    expect(callStatus.currentHourCount).toBe(0);
    expect(callStatus.currentDayCount).toBe(0);

    // Custom config should be cleared (back to default maxPerHour=5)
    expect(callStatus.maxPerHour).toBe(5);

    const emailStatus = await checkThrottle(TEST_USER, 'emails');
    expect(emailStatus.currentHourCount).toBe(0);
  });
});

describe('getThrottleStatus', () => {
  it('should return status for all configured action types', async () => {
    const statuses = await getThrottleStatus(TEST_USER);
    expect(statuses.length).toBeGreaterThanOrEqual(5);

    const actionTypes = statuses.map(s => s.actionType);
    expect(actionTypes).toContain('calls');
    expect(actionTypes).toContain('emails');
    expect(actionTypes).toContain('financial_tx');
    expect(actionTypes).toContain('api_calls');
    expect(actionTypes).toContain('messages');
  });

  it('should reflect recorded actions in status', async () => {
    await recordAction(TEST_USER, 'calls');
    await recordAction(TEST_USER, 'calls');

    const statuses = await getThrottleStatus(TEST_USER);
    const callStatus = statuses.find(s => s.actionType === 'calls');
    expect(callStatus).toBeDefined();
    expect(callStatus!.currentHourCount).toBe(2);
  });
});

describe('cooldown enforcement', () => {
  it('should block action during cooldown period', async () => {
    // calls has cooldownMinutes: 5
    await recordAction(TEST_USER, 'calls');
    const status = await checkThrottle(TEST_USER, 'calls');

    // After recording an action, cooldown should be active
    // The action was just recorded so cooldown should make it throttled
    expect(status.isThrottled).toBe(true);
    expect(status.nextAllowedAt).toBeInstanceOf(Date);
    expect(status.nextAllowedAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('should allow action after cooldown expires', async () => {
    // Use a custom config with a very short cooldown that we can simulate expiry for
    updateThrottleConfig('test_cooldown', {
      maxPerHour: 100,
      maxPerDay: 1000,
      cooldownMinutes: 0.001, // ~60ms cooldown
    });

    await recordAction(TEST_USER, 'test_cooldown');

    // Wait for cooldown to expire
    await new Promise(resolve => setTimeout(resolve, 100));

    const status = await checkThrottle(TEST_USER, 'test_cooldown');
    expect(status.isThrottled).toBe(false);
  });

  it('should not enforce cooldown for actions without cooldownMinutes', async () => {
    // emails has no cooldownMinutes
    await recordAction(TEST_USER, 'emails');
    const status = await checkThrottle(TEST_USER, 'emails');
    expect(status.isThrottled).toBe(false);
  });
});
