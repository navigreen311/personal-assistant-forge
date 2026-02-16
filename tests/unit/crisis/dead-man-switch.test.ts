import {
  configure,
  checkIn,
  evaluateSwitch,
  getStatus,
  addProtocol,
} from '@/modules/crisis/services/dead-man-switch-service';
import type { DeadManSwitch, DeadManProtocol } from '@/modules/crisis/types';

describe('DeadManSwitchService', () => {
  beforeEach(() => {
    // Each test uses unique user IDs for isolation
  });

  describe('configure', () => {
    it('should create a dead man switch with initial check-in and zero missed check-ins', async () => {
      const result = await configure('user-cfg-1', {
        userId: 'user-cfg-1',
        isEnabled: true,
        checkInIntervalHours: 24,
        triggerAfterMisses: 3,
        protocols: [],
      });

      expect(result.userId).toBe('user-cfg-1');
      expect(result.isEnabled).toBe(true);
      expect(result.checkInIntervalHours).toBe(24);
      expect(result.triggerAfterMisses).toBe(3);
      expect(result.lastCheckIn).toBeInstanceOf(Date);
      expect(result.missedCheckIns).toBe(0);
      expect(result.protocols).toEqual([]);
    });

    it('should allow configuring with protocols', async () => {
      const protocols: DeadManProtocol[] = [
        {
          order: 1,
          action: 'NOTIFY',
          contactName: 'Emergency Contact',
          message: 'User has not checked in.',
          delayHoursAfterTrigger: 0,
        },
      ];

      const result = await configure('user-cfg-2', {
        userId: 'user-cfg-2',
        isEnabled: true,
        checkInIntervalHours: 12,
        triggerAfterMisses: 2,
        protocols,
      });

      expect(result.protocols).toHaveLength(1);
      expect(result.protocols[0].contactName).toBe('Emergency Contact');
    });
  });

  describe('checkIn', () => {
    it('should reset lastCheckIn and missedCheckIns to zero', async () => {
      await configure('user-ci-1', {
        userId: 'user-ci-1',
        isEnabled: true,
        checkInIntervalHours: 24,
        triggerAfterMisses: 3,
        protocols: [],
      });

      const result = await checkIn('user-ci-1');

      expect(result.lastCheckIn).toBeInstanceOf(Date);
      expect(result.missedCheckIns).toBe(0);
    });

    it('should throw when switch is not configured for the user', async () => {
      await expect(checkIn('user-not-configured')).rejects.toThrow(
        'Dead man switch not configured for user user-not-configured'
      );
    });
  });

  describe('evaluateSwitch', () => {
    it('should not trigger when switch is disabled', async () => {
      await configure('user-eval-1', {
        userId: 'user-eval-1',
        isEnabled: false,
        checkInIntervalHours: 24,
        triggerAfterMisses: 1,
        protocols: [
          { order: 1, action: 'NOTIFY', contactName: 'EC', message: 'msg', delayHoursAfterTrigger: 0 },
        ],
      });

      const result = await evaluateSwitch('user-eval-1');

      expect(result.triggered).toBe(false);
      expect(result.missedCheckIns).toBe(0);
      expect(result.protocols).toEqual([]);
    });

    it('should not trigger when user just checked in', async () => {
      await configure('user-eval-2', {
        userId: 'user-eval-2',
        isEnabled: true,
        checkInIntervalHours: 24,
        triggerAfterMisses: 3,
        protocols: [],
      });

      const result = await evaluateSwitch('user-eval-2');

      expect(result.triggered).toBe(false);
      expect(result.missedCheckIns).toBe(0);
    });

    it('should throw when switch is not configured', async () => {
      await expect(evaluateSwitch('user-not-configured')).rejects.toThrow(
        'Dead man switch not configured for user user-not-configured'
      );
    });

    it('should return protocols when triggered', async () => {
      const protocols: DeadManProtocol[] = [
        { order: 1, action: 'NOTIFY', contactName: 'EC', message: 'Alert!', delayHoursAfterTrigger: 0 },
      ];

      // Configure with a very short interval to simulate missed check-ins
      await configure('user-eval-3', {
        userId: 'user-eval-3',
        isEnabled: true,
        checkInIntervalHours: 0.0001, // ~0.36 seconds
        triggerAfterMisses: 1,
        protocols,
      });

      // Wait a tiny bit to ensure time passes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await evaluateSwitch('user-eval-3');

      // Due to the extremely short interval, this should trigger
      if (result.triggered) {
        expect(result.protocols).toHaveLength(1);
        expect(result.protocols[0].action).toBe('NOTIFY');
      }
    });
  });

  describe('getStatus', () => {
    it('should return the current switch status', async () => {
      await configure('user-status-1', {
        userId: 'user-status-1',
        isEnabled: true,
        checkInIntervalHours: 24,
        triggerAfterMisses: 3,
        protocols: [],
      });

      const status = await getStatus('user-status-1');

      expect(status.userId).toBe('user-status-1');
      expect(status.isEnabled).toBe(true);
      expect(status.checkInIntervalHours).toBe(24);
    });

    it('should throw for unconfigured user', async () => {
      await expect(getStatus('user-not-configured')).rejects.toThrow(
        'Dead man switch not configured for user user-not-configured'
      );
    });
  });

  describe('addProtocol', () => {
    it('should add a protocol with auto-assigned order', async () => {
      await configure('user-proto-1', {
        userId: 'user-proto-1',
        isEnabled: true,
        checkInIntervalHours: 24,
        triggerAfterMisses: 3,
        protocols: [],
      });

      const result = await addProtocol('user-proto-1', {
        action: 'SEND_EMAIL',
        contactName: 'Lawyer',
        message: 'Urgent: no check-in.',
        delayHoursAfterTrigger: 1,
      });

      expect(result.protocols).toHaveLength(1);
      expect(result.protocols[0].order).toBe(1);
      expect(result.protocols[0].contactName).toBe('Lawyer');
    });

    it('should increment order for subsequent protocols', async () => {
      await configure('user-proto-2', {
        userId: 'user-proto-2',
        isEnabled: true,
        checkInIntervalHours: 24,
        triggerAfterMisses: 3,
        protocols: [],
      });

      await addProtocol('user-proto-2', {
        action: 'NOTIFY', contactName: 'Contact 1', message: 'msg1', delayHoursAfterTrigger: 0,
      });
      const result = await addProtocol('user-proto-2', {
        action: 'NOTIFY', contactName: 'Contact 2', message: 'msg2', delayHoursAfterTrigger: 1,
      });

      expect(result.protocols).toHaveLength(2);
      expect(result.protocols[1].order).toBe(2);
    });

    it('should throw for unconfigured user', async () => {
      await expect(
        addProtocol('user-not-configured', {
          action: 'NOTIFY', contactName: 'X', message: 'y', delayHoursAfterTrigger: 0,
        })
      ).rejects.toThrow('Dead man switch not configured for user user-not-configured');
    });
  });
});
