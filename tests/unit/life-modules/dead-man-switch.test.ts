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
    backdateStoredCheckIn('dms-user-2', 3);

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
    backdateStoredCheckIn('dms-user-3', 3);

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

    backdateStoredCheckIn('dms-user-4', 2);

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

    backdateStoredCheckIn('dms-user-5', 10);

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

    backdateStoredCheckIn('dms-checkin-1', 5);
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
