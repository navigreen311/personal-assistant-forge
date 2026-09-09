// ---------------------------------------------------------------------------
// P-10/T-015. The dead man switch is stored in `DeadManSwitch` now, not a Map,
// so this file stands a small in-memory fake behind the Prisma delegates the
// service uses.
//
// NOTE ON BACKDATING. These tests used to simulate an overdue user by writing
// `status.lastCheckIn = <3 hours ago>` on the object `getStatus()` returned.
// That did anything at all only because `getStatus` handed back the very object
// inside the Map -- against a real row it mutates a detached copy and the
// service never sees it. `backdateStoredCheckIn()` edits the stored row, which
// is what the test was trying to express.
// ---------------------------------------------------------------------------

interface FakeSwitchRow {
  userId: string;
  isEnabled: boolean;
  checkInIntervalHours: number;
  lastCheckIn: Date;
  missedCheckIns: number;
  triggerAfterMisses: number;
  protocols: unknown;
}

const switchRows = new Map<string, FakeSwitchRow>();
const auditRows: Array<Record<string, unknown>> = [];
let auditSeq = 0;

const auditLogEntryDelegate = {
  create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    auditSeq += 1;
    const row = { ...data, id: `audit-${auditSeq}` };
    auditRows.push(row);
    return row;
  }),
  findFirst: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
    const w = (where ?? {}) as {
      actorId?: string;
      resource?: string;
      action?: string;
      resourceId?: string;
      entityId?: string;
      timestamp?: { gte?: Date };
    };
    const hit = auditRows.find((r) => {
      if (w.actorId !== undefined && r.actorId !== w.actorId) return false;
      if (w.resourceId !== undefined && r.resourceId !== w.resourceId) return false;
      if (w.resource !== undefined && r.resource !== w.resource) return false;
      if (w.action !== undefined && r.action !== w.action) return false;
      if (w.entityId !== undefined && r.entityId !== w.entityId) return false;
      if (w.timestamp?.gte && (r.timestamp as Date) < w.timestamp.gte) return false;
      return true;
    });
    return hit ?? null;
  }),
  findMany: jest.fn(async () => auditRows),
  count: jest.fn(async () => auditRows.length),
};

jest.mock('@/lib/db', () => ({
  prisma: {
    deadManSwitch: {
      findUnique: jest.fn(async ({ where }: { where: { userId: string } }) =>
        switchRows.get(where.userId) ?? null),
      upsert: jest.fn(async ({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: FakeSwitchRow;
        update: Partial<FakeSwitchRow>;
      }) => {
        const existing = switchRows.get(where.userId);
        const row = existing ? { ...existing, ...update } : { ...create };
        switchRows.set(where.userId, row);
        return row;
      }),
      update: jest.fn(async ({
        where,
        data,
      }: {
        where: { userId: string };
        data: Partial<FakeSwitchRow>;
      }) => {
        const existing = switchRows.get(where.userId);
        if (!existing) throw new Error('record not found');
        const row = { ...existing, ...data };
        switchRows.set(where.userId, row);
        return row;
      }),
    },
    auditLogEntry: auditLogEntryDelegate,
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ auditLogEntry: auditLogEntryDelegate, $executeRaw: jest.fn(async () => 1) })),
  },
}));

/**
 * Push every stored audit row further into the past.
 *
 * Needed only to simulate a sequence that real time produces for free: the
 * first firing happened BEFORE the later check-in. Without it the test rewinds
 * `lastCheckIn` behind a row that was written a millisecond ago, which cannot
 * happen in production -- `checkIn()` only ever sets it to `now`.
 */
function backdateAuditRows(hoursAgo: number): void {
  for (const row of auditRows) {
    row.timestamp = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  }
}

/** Move a STORED switch's last check-in into the past. */
function backdateStoredCheckIn(userId: string, hoursAgo: number): void {
  const row = switchRows.get(userId);
  if (!row) throw new Error(`no stored switch for ${userId}`);
  row.lastCheckIn = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  row.missedCheckIns = 0;
}

beforeEach(() => {
  switchRows.clear();
  auditRows.length = 0;
  auditSeq = 0;
});

import {
  configure,
  checkIn,
  evaluateSwitch,
  getStatus,
  addProtocol,
  fireDeadManSwitch,
  DMS_FIRED,
  DMS_PROTOCOL_EXECUTED,
  DMS_RESOURCE,
} from '@/modules/crisis/services/dead-man-switch-service';
import { verifiedEntityIdForTest } from '../../helpers/factories';
import type { DeadManProtocol } from '@/modules/crisis/types';

const ENTITY = verifiedEntityIdForTest('entity-1');
const ACTOR = { actor: 'owner@example.com', actorId: 'actor-1', entityId: ENTITY };

describe('DeadManSwitchService', () => {

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

    // P-10/T-015, CORRECTED IN PLACE. This was:
    //
    //     if (result.triggered) {
    //       expect(result.protocols).toHaveLength(1);
    //       ...
    //     }
    //
    // wrapped around a 0.36-second check-in interval and a 10ms sleep. When the
    // race went the other way the test asserted NOTHING and still passed, so the
    // only behaviour it was written to check was the one it could skip. Made
    // deterministic by backdating the stored check-in instead of racing a timer.
    it('should return protocols when triggered', async () => {
      const protocols: DeadManProtocol[] = [
        { order: 1, action: 'NOTIFY', contactName: 'EC', message: 'Alert!', delayHoursAfterTrigger: 0 },
      ];

      await configure('user-eval-3', {
        userId: 'user-eval-3',
        isEnabled: true,
        checkInIntervalHours: 1,
        triggerAfterMisses: 1,
        protocols,
      });
      backdateStoredCheckIn('user-eval-3', 3);

      const result = await evaluateSwitch('user-eval-3');

      expect(result.triggered).toBe(true);
      expect(result.protocols).toHaveLength(1);
      expect(result.protocols[0].action).toBe('NOTIFY');
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

  // -----------------------------------------------------------------------
  // fireDeadManSwitch — the consumer T-015 was missing
  //
  // Before P-10 `evaluateSwitch` returned `triggered: true` and its only caller
  // was a test. Nothing in the product read it, so the switch was correct and
  // inert. These tests are about the ACTING half.
  // -----------------------------------------------------------------------
  describe('fireDeadManSwitch', () => {
    const protocols: DeadManProtocol[] = [
      { order: 1, action: 'NOTIFY', contactName: 'Now', message: 'immediate', delayHoursAfterTrigger: 0 },
      { order: 2, action: 'EMAIL', contactName: 'Later', message: 'staged', delayHoursAfterTrigger: 100 },
    ];

    async function armed(userId: string, hoursAgo: number) {
      await configure(userId, {
        userId,
        isEnabled: true,
        checkInIntervalHours: 1,
        triggerAfterMisses: 2,
        protocols,
      });
      backdateStoredCheckIn(userId, hoursAgo);
    }

    it('does nothing when the switch has not tripped', async () => {
      await configure('fire-quiet', {
        userId: 'fire-quiet',
        isEnabled: true,
        checkInIntervalHours: 24,
        triggerAfterMisses: 3,
        protocols,
      });

      const result = await fireDeadManSwitch('fire-quiet', ACTOR);

      expect(result.triggered).toBe(false);
      expect(result.executed).toEqual([]);
      expect(auditRows).toHaveLength(0);
    });

    it('executes the due protocols and records each one in the audit log', async () => {
      await armed('fire-1', 3);

      const result = await fireDeadManSwitch('fire-1', ACTOR);

      expect(result.triggered).toBe(true);
      expect(result.executed.map((p) => p.order)).toEqual([1]);
      // The staged protocol is still inside its delay: a staged escalation must
      // stay staged rather than firing everything at once.
      expect(result.deferred.map((p) => p.order)).toEqual([2]);

      expect(auditRows.map((r) => r.action)).toEqual([DMS_FIRED, DMS_PROTOCOL_EXECUTED]);
      expect(auditRows[0].resource).toBe(DMS_RESOURCE);
      expect(auditRows[0].sensitivityLevel).toBe('RESTRICTED');
      expect(auditRows[0].entityId).toBe(ENTITY);
      expect(auditRows[0].actor).toBe('owner@example.com');
    });

    it('does not fire twice for the same outage', async () => {
      await armed('fire-2', 3);

      await fireDeadManSwitch('fire-2', ACTOR);
      const second = await fireDeadManSwitch('fire-2', ACTOR);

      expect(second.alreadyFired).toBe(true);
      expect(second.executed).toEqual([]);
      // Two rows from the first call, none from the second: nobody gets told
      // twice that their contact is unreachable.
      expect(auditRows).toHaveLength(2);
    });

    it('fires again for a NEW outage after a check-in', async () => {
      await armed('fire-3', 6);
      await fireDeadManSwitch('fire-3', ACTOR);
      // That firing happened during the FIRST outage, before the check-in below.
      backdateAuditRows(5);

      await checkIn('fire-3');
      backdateStoredCheckIn('fire-3', 3);

      const again = await fireDeadManSwitch('fire-3', ACTOR);

      expect(again.alreadyFired).toBe(false);
      expect(again.executed.map((p) => p.order)).toEqual([1]);
    });

    it('takes the actor from the caller, never from the switch row', async () => {
      await armed('fire-4', 3);

      await fireDeadManSwitch('fire-4', {
        actor: 'ops@example.com',
        actorId: 'ops-9',
        entityId: ENTITY,
      });

      expect(auditRows[0].actor).toBe('ops@example.com');
      expect(auditRows[0].actorId).toBe('ops-9');
    });
  });
});
