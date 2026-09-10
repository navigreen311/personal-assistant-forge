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

// ---------------------------------------------------------------------------
// P-27/T-038. Firing the switch now STOPS things, and stopping is a row in
// `ExecutionGateRule` -- one per entity the user owns. So this file needs two
// more fakes: the entities to halt, and the gate table to halt them in.
//
// The gate fake is a real little table rather than a bag of jest.fn(): the
// point of the new assertions is which rows exist afterwards, and a mock that
// only records calls could not tell a halt that was installed from one that was
// installed and immediately deleted.
// ---------------------------------------------------------------------------

interface FakeGateRow {
  id: string;
  name: string;
  expression: string;
  description: string;
  scope: string;
  entityId: string | null;
  isActive: boolean;
}

const entityRows: Array<{ id: string; userId: string }> = [];
const gateRows: FakeGateRow[] = [];
let gateSeq = 0;

function gateMatches(row: FakeGateRow, where: Record<string, unknown>): boolean {
  if (where.name !== undefined && row.name !== where.name) return false;
  if (where.isActive !== undefined && row.isActive !== where.isActive) return false;
  const entityId = where.entityId as string | { in?: string[] } | undefined;
  if (typeof entityId === 'string' && row.entityId !== entityId) return false;
  if (entityId && typeof entityId === 'object' && Array.isArray(entityId.in)) {
    if (!entityId.in.includes(row.entityId ?? '')) return false;
  }
  return true;
}

const executionGateRuleDelegate = {
  createMany: jest.fn(async ({ data }: { data: Omit<FakeGateRow, 'id'>[] }) => {
    for (const row of data) {
      gateSeq += 1;
      gateRows.push({ ...row, id: `gate-${gateSeq}` });
    }
    return { count: data.length };
  }),
  deleteMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
    const keep = gateRows.filter((row) => !gateMatches(row, where));
    const count = gateRows.length - keep.length;
    gateRows.length = 0;
    gateRows.push(...keep);
    return { count };
  }),
  findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
    gateRows.find((row) => gateMatches(row, where)) ?? null),
  findMany: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
    gateRows.filter((row) => gateMatches(row, where ?? {}))),
};

const entityDelegate = {
  findMany: jest.fn(async ({ where }: { where: { userId: string } }) =>
    entityRows.filter((row) => row.userId === where.userId).map((row) => ({ id: row.id }))),
};

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
    entity: entityDelegate,
    executionGateRule: executionGateRuleDelegate,
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
  entityRows.length = 0;
  gateRows.length = 0;
  gateSeq = 0;
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

  // -------------------------------------------------------------------------
  // P-27 / T-038 — "...and the agent stops."
  //
  // Before this, `fireDeadManSwitch` executed a protocol by writing one audit
  // row naming it. `DeadManProtocol.action` is a free string and no dispatcher
  // read it, so a firing changed nothing that could stop anything. These tests
  // assert the row that does the stopping, and — as much as they assert its
  // presence — that it is not there when it should not be.
  // -------------------------------------------------------------------------
  describe('the halt', () => {
    const protocols: DeadManProtocol[] = [
      { order: 1, action: 'NOTIFY', contactName: 'Now', message: 'immediate', delayHoursAfterTrigger: 0 },
    ];

    async function armedWithEntities(userId: string, entityIds: string[], hoursAgo: number) {
      for (const id of entityIds) entityRows.push({ id, userId });
      await configure(userId, {
        userId,
        isEnabled: true,
        checkInIntervalHours: 1,
        triggerAfterMisses: 2,
        protocols,
      });
      backdateStoredCheckIn(userId, hoursAgo);
    }

    it('halts EVERY entity the user owns, not the one in the request context', async () => {
      // The switch is keyed by userId and has no entity column, so the tenant
      // in `context.entityId` is only where the audit rows are filed. Halting
      // that one alone would leave the agent running in this user's other
      // entities -- invisible to anyone who has just one.
      await armedWithEntities('halt-1', ['e-a', 'e-b', 'e-c'], 3);

      const result = await fireDeadManSwitch('halt-1', ACTOR);

      expect(result.triggered).toBe(true);
      expect(result.haltedEntityIds.sort()).toEqual(['e-a', 'e-b', 'e-c']);
      expect(gateRows.map((g) => g.entityId).sort()).toEqual(['e-a', 'e-b', 'e-c']);
    });

    it('writes a halt the existing gate evaluator already understands', async () => {
      // Not a second mechanism beside `evaluateGates`: an ordinary gate whose
      // expression is `false`, which that function already refuses everything
      // for. A bespoke column or a magic flag would need a second reader, and a
      // halt with one reader is how the first version of this feature failed.
      await armedWithEntities('halt-2', ['e-only'], 3);

      await fireDeadManSwitch('halt-2', ACTOR);

      expect(gateRows).toHaveLength(1);
      expect(gateRows[0]).toMatchObject({
        expression: 'false',
        scope: 'ENTITY',
        isActive: true,
        entityId: 'e-only',
      });
    });

    it('does NOT halt when the switch has not tripped', async () => {
      entityRows.push({ id: 'e-quiet', userId: 'halt-3' });
      await configure('halt-3', {
        userId: 'halt-3',
        isEnabled: true,
        checkInIntervalHours: 24,
        triggerAfterMisses: 3,
        protocols,
      });

      const result = await fireDeadManSwitch('halt-3', ACTOR);

      expect(result.triggered).toBe(false);
      expect(gateRows).toHaveLength(0);
    });

    it('reasserts the halt on a tick that does NOT re-execute the protocols', async () => {
      // The two halves have different idempotency requirements. Notifying the
      // contacts must happen once per outage; being stopped must be TRUE for
      // the whole of it. A crash between the audit row and the gate rows would
      // otherwise leave a switch that refuses to fire again and an agent that
      // never stopped.
      await armedWithEntities('halt-4', ['e-4'], 3);
      await fireDeadManSwitch('halt-4', ACTOR);

      gateRows.length = 0; // as if the halt had been lost, or never written

      const second = await fireDeadManSwitch('halt-4', ACTOR);

      expect(second.alreadyFired).toBe(true);
      expect(second.executed).toEqual([]);
      expect(auditRows).toHaveLength(2); // still no second notification
      expect(gateRows.map((g) => g.entityId)).toEqual(['e-4']); // but stopped again
    });

    it('lifts the halt when the user checks in', async () => {
      // Without this the switch is a one-way door: the product can stop the
      // agent and offers no way to start it again.
      await armedWithEntities('halt-5', ['e-5a', 'e-5b'], 3);
      await fireDeadManSwitch('halt-5', ACTOR);
      expect(gateRows).toHaveLength(2);

      await checkIn('halt-5');

      expect(gateRows).toHaveLength(0);
    });

    it('lifts the halt when the switch is reconfigured', async () => {
      // `configure` resets `lastCheckIn`, so `alreadyFiredSince` treats the
      // outage as over and the switch may fire again. The halt has to end on
      // the same edge or the reconfigured switch is armed over a user who is
      // still stopped.
      await armedWithEntities('halt-6', ['e-6'], 3);
      await fireDeadManSwitch('halt-6', ACTOR);
      expect(gateRows).toHaveLength(1);

      await configure('halt-6', {
        userId: 'halt-6',
        isEnabled: true,
        checkInIntervalHours: 12,
        triggerAfterMisses: 2,
        protocols,
      });

      expect(gateRows).toHaveLength(0);
    });
  });
});
