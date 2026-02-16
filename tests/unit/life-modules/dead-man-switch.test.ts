import { configure, checkIn, evaluateSwitch, getStatus, addProtocol } from '@/modules/crisis/services/dead-man-switch-service';
import type { DeadManProtocol } from '@/modules/crisis/types';

describe('evaluateSwitch', () => {
  it('should not trigger when check-in is recent', async () => {
    await configure('dms-user-1', {
      userId: 'dms-user-1',
      isEnabled: true,
      checkInIntervalHours: 24,
      triggerAfterMisses: 3,
      protocols: [],
    });
    await checkIn('dms-user-1');

    const result = await evaluateSwitch('dms-user-1');
    expect(result.triggered).toBe(false);
    expect(result.missedCheckIns).toBe(0);
  });

  it('should increment missed count when overdue', async () => {
    await configure('dms-user-2', {
      userId: 'dms-user-2',
      isEnabled: true,
      checkInIntervalHours: 1, // 1 hour interval
      triggerAfterMisses: 5,
      protocols: [],
    });

    // Simulate last check-in was 3 hours ago
    const status = await getStatus('dms-user-2');
    status.lastCheckIn = new Date(Date.now() - 3 * 60 * 60 * 1000);

    const result = await evaluateSwitch('dms-user-2');
    expect(result.missedCheckIns).toBeGreaterThanOrEqual(1);
  });

  it('should trigger after configured number of misses', async () => {
    const protocols: DeadManProtocol[] = [
      { order: 1, action: 'Notify', contactName: 'Emergency', message: 'Check on user', delayHoursAfterTrigger: 0 },
    ];
    await configure('dms-user-3', {
      userId: 'dms-user-3',
      isEnabled: true,
      checkInIntervalHours: 1,
      triggerAfterMisses: 2,
      protocols,
    });

    // Simulate last check-in was 3 hours ago (3 missed check-ins > 2 trigger threshold)
    const status = await getStatus('dms-user-3');
    status.lastCheckIn = new Date(Date.now() - 3 * 60 * 60 * 1000);

    const result = await evaluateSwitch('dms-user-3');
    expect(result.triggered).toBe(true);
    expect(result.protocols.length).toBe(1);
  });

  it('should return protocols to execute on trigger', async () => {
    const protocols: DeadManProtocol[] = [
      { order: 1, action: 'Call', contactName: 'Person A', message: 'Check on user', delayHoursAfterTrigger: 0 },
      { order: 2, action: 'Email', contactName: 'Person B', message: 'Urgent: user unresponsive', delayHoursAfterTrigger: 6 },
    ];
    await configure('dms-user-4', {
      userId: 'dms-user-4',
      isEnabled: true,
      checkInIntervalHours: 1,
      triggerAfterMisses: 1,
      protocols,
    });

    const status = await getStatus('dms-user-4');
    status.lastCheckIn = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const result = await evaluateSwitch('dms-user-4');
    expect(result.triggered).toBe(true);
    expect(result.protocols).toHaveLength(2);
    expect(result.protocols[0].contactName).toBe('Person A');
    expect(result.protocols[1].contactName).toBe('Person B');
  });

  it('should not trigger when disabled', async () => {
    await configure('dms-user-5', {
      userId: 'dms-user-5',
      isEnabled: false,
      checkInIntervalHours: 1,
      triggerAfterMisses: 1,
      protocols: [{ order: 1, action: 'Test', contactName: 'Test', message: 'Test', delayHoursAfterTrigger: 0 }],
    });

    const status = await getStatus('dms-user-5');
    status.lastCheckIn = new Date(Date.now() - 10 * 60 * 60 * 1000);

    const result = await evaluateSwitch('dms-user-5');
    expect(result.triggered).toBe(false);
    expect(result.protocols).toHaveLength(0);
  });
});

describe('checkIn', () => {
  it('should reset missed counter', async () => {
    await configure('dms-checkin-1', {
      userId: 'dms-checkin-1',
      isEnabled: true,
      checkInIntervalHours: 1,
      triggerAfterMisses: 3,
      protocols: [],
    });

    const status = await getStatus('dms-checkin-1');
    status.lastCheckIn = new Date(Date.now() - 5 * 60 * 60 * 1000);
    await evaluateSwitch('dms-checkin-1');

    const updated = await checkIn('dms-checkin-1');
    expect(updated.missedCheckIns).toBe(0);
  });

  it('should update lastCheckIn timestamp', async () => {
    await configure('dms-checkin-2', {
      userId: 'dms-checkin-2',
      isEnabled: true,
      checkInIntervalHours: 24,
      triggerAfterMisses: 3,
      protocols: [],
    });

    const before = Date.now();
    const updated = await checkIn('dms-checkin-2');
    const after = Date.now();

    const checkInTime = new Date(updated.lastCheckIn).getTime();
    expect(checkInTime).toBeGreaterThanOrEqual(before);
    expect(checkInTime).toBeLessThanOrEqual(after);
  });
});
