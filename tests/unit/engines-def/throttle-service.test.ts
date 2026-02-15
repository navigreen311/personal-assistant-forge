import {
  checkThrottle,
  recordAction,
  getDefaultThrottleConfigs,
  resetThrottle,
} from '@/engines/trust-safety/throttle-service';

const TEST_USER = 'test-user-throttle';

beforeEach(async () => {
  // Reset throttle state for each test
  await resetThrottle(TEST_USER, 'calls');
  await resetThrottle(TEST_USER, 'emails');
  await resetThrottle(TEST_USER, 'financial_tx');
});

describe('checkThrottle', () => {
  it('should allow action when under hourly limit', async () => {
    const status = await checkThrottle(TEST_USER, 'calls');
    expect(status.isThrottled).toBe(false);
    expect(status.currentHourCount).toBe(0);
  });

  it('should throttle when hourly limit reached', async () => {
    // Record 5 calls (max per hour)
    for (let i = 0; i < 5; i++) {
      await recordAction(TEST_USER, 'calls');
    }
    const status = await checkThrottle(TEST_USER, 'calls');
    expect(status.isThrottled).toBe(true);
    expect(status.currentHourCount).toBe(5);
    expect(status.maxPerHour).toBe(5);
  });

  it('should allow action when under daily limit', async () => {
    await recordAction(TEST_USER, 'emails');
    const status = await checkThrottle(TEST_USER, 'emails');
    expect(status.isThrottled).toBe(false);
    expect(status.currentDayCount).toBe(1);
  });

  it('should throttle when daily limit reached', async () => {
    // financial_tx has maxPerDay = 1
    await recordAction(TEST_USER, 'financial_tx');
    const status = await checkThrottle(TEST_USER, 'financial_tx');
    expect(status.isThrottled).toBe(true);
    expect(status.currentDayCount).toBe(1);
    expect(status.maxPerDay).toBe(1);
  });

  it('should report requiresApproval when above approval threshold', async () => {
    // calls: requiresApprovalAbove = 3
    for (let i = 0; i < 3; i++) {
      await recordAction(TEST_USER, 'calls');
    }
    const status = await checkThrottle(TEST_USER, 'calls');
    expect(status.requiresApproval).toBe(true);
  });

  it('should calculate correct nextAllowedAt time', async () => {
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
  it('should increment hourly counter', async () => {
    await recordAction(TEST_USER, 'emails');
    const status = await checkThrottle(TEST_USER, 'emails');
    expect(status.currentHourCount).toBe(1);

    await recordAction(TEST_USER, 'emails');
    const status2 = await checkThrottle(TEST_USER, 'emails');
    expect(status2.currentHourCount).toBe(2);
  });

  it('should increment daily counter', async () => {
    await recordAction(TEST_USER, 'emails');
    await recordAction(TEST_USER, 'emails');
    const status = await checkThrottle(TEST_USER, 'emails');
    expect(status.currentDayCount).toBe(2);
  });
});

describe('getDefaultThrottleConfigs', () => {
  it('should return config for calls with maxPerHour=5', () => {
    const configs = getDefaultThrottleConfigs();
    const callsConfig = configs.find(c => c.actionType === 'calls');
    expect(callsConfig).toBeDefined();
    expect(callsConfig!.maxPerHour).toBe(5);
  });

  it('should return config for emails with maxPerHour=20', () => {
    const configs = getDefaultThrottleConfigs();
    const emailConfig = configs.find(c => c.actionType === 'emails');
    expect(emailConfig).toBeDefined();
    expect(emailConfig!.maxPerHour).toBe(20);
  });

  it('should return config for financial_tx with maxPerDay=1', () => {
    const configs = getDefaultThrottleConfigs();
    const fxConfig = configs.find(c => c.actionType === 'financial_tx');
    expect(fxConfig).toBeDefined();
    expect(fxConfig!.maxPerDay).toBe(1);
  });
});
