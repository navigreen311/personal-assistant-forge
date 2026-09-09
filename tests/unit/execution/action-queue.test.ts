// ---------------------------------------------------------------------------
// P-09: the stores this suite used to exercise are TABLES now.
//
// The suite stays offline, so each table gets a small in-memory double with the
// delegate surface the service actually calls. It is a real typed object, not a
// bag of `any`: a delegate or column name that does not exist still fails here.
// That is the failure the persistence pattern exists to stop -- a mocked Prisma
// client will happily accept `prisma.tableThatDoesNotExist.create()`, which is
// exactly how four delegates that were never in the schema shipped green.
//
// The real cross-process assertions -- that the state is in Postgres and that
// the gate cannot be bypassed by a restart -- live in tests/db/, where they can
// actually be true.
// ---------------------------------------------------------------------------

type MockRow = Record<string, unknown>;
type MockWhere = Record<string, unknown>;

function mockMatches(row: MockRow, where: MockWhere): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true;
    if (key === 'OR' && Array.isArray(cond)) {
      return (cond as MockWhere[]).some((c) => mockMatches(row, c));
    }
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as MockWhere;
      if ('in' in c) return (c.in as unknown[]).includes(value);
      if ('gte' in c && Number(value) < Number(c.gte)) return false;
      if ('lte' in c && Number(value) > Number(c.lte)) return false;
      return true;
    }
    return value === cond;
  });
}

function mockApply(row: MockRow, data: MockRow): MockRow {
  const next: MockRow = { ...row };
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === 'object' && 'increment' in (value as MockRow)) {
      next[key] = Number(next[key] ?? 0) + Number((value as MockRow).increment);
    } else {
      next[key] = value;
    }
  }
  return next;
}

function mockMakeTable(prefix: string) {
  const rows = new Map<string, MockRow>();
  let seq = 0;

  const list = (args?: {
    where?: MockWhere;
    orderBy?: MockRow;
    skip?: number;
    take?: number;
  }): MockRow[] => {
    let out = Array.from(rows.values()).filter((r) => mockMatches(r, args?.where ?? {}));
    const orderBy = args?.orderBy;
    if (orderBy) {
      const [key, dir] = Object.entries(orderBy)[0];
      out = out.slice().sort((a, b) => {
        const av = Number(a[key] instanceof Date ? (a[key] as Date).getTime() : a[key]);
        const bv = Number(b[key] instanceof Date ? (b[key] as Date).getTime() : b[key]);
        return dir === 'desc' ? bv - av : av - bv;
      });
    }
    const skip = args?.skip ?? 0;
    const take = args?.take ?? out.length;
    return out.slice(skip, skip + take).map((r) => ({ ...r }));
  };

  return {
    rows,
    clear: () => rows.clear(),
    seed: (row: MockRow) => {
      rows.set(row.id as string, row);
    },
    create: async (args: { data: MockRow }) => {
      const id = (args.data.id as string) ?? `${prefix}-${(seq += 1)}`;
      // `createdAt` / `updatedAt` / `startedAt` stand in for the schema's
      // `@default(now())` and `@updatedAt`, which the real client fills in.
      const row: MockRow = {
        createdAt: new Date(),
        updatedAt: new Date(),
        startedAt: new Date(),
        ...args.data,
        id,
      };
      rows.set(id, row);
      return { ...row };
    },
    findUnique: async (args: { where: MockWhere }) => {
      const row = Array.from(rows.values()).find((r) => mockMatches(r, args.where));
      return row ? { ...row } : null;
    },
    findFirst: async (args?: { where?: MockWhere; orderBy?: MockRow }) => {
      const found = list(args)[0];
      return found ?? null;
    },
    findMany: async (args?: {
      where?: MockWhere;
      orderBy?: MockRow;
      skip?: number;
      take?: number;
    }) => list(args),
    count: async (args?: { where?: MockWhere }) =>
      Array.from(rows.values()).filter((r) => mockMatches(r, args?.where ?? {})).length,
    update: async (args: { where: MockWhere; data: MockRow }) => {
      const entry = Array.from(rows.entries()).find(([, r]) => mockMatches(r, args.where));
      if (!entry) throw new Error(`${prefix}: no row matches update`);
      const next = mockApply(entry[1], { updatedAt: new Date(), ...args.data });
      rows.set(entry[0], next);
      return { ...next };
    },
    updateMany: async (args: { where: MockWhere; data: MockRow }) => {
      let count = 0;
      for (const [id, row] of rows) {
        if (mockMatches(row, args.where)) {
          rows.set(id, mockApply(row, { updatedAt: new Date(), ...args.data }));
          count += 1;
        }
      }
      return { count };
    },
    upsert: async (args: { where: MockWhere; create: MockRow; update: MockRow }) => {
      const entry = Array.from(rows.entries()).find(([, r]) => mockMatches(r, args.where));
      if (entry) {
        const next = mockApply(entry[1], args.update);
        rows.set(entry[0], next);
        return { ...next };
      }
      const id = `${prefix}-${(seq += 1)}`;
      const row: MockRow = { createdAt: new Date(), ...args.create, id };
      rows.set(id, row);
      return { ...row };
    },
    deleteMany: async (args?: { where?: MockWhere }) => {
      let count = 0;
      for (const [id, row] of Array.from(rows.entries())) {
        if (mockMatches(row, args?.where ?? {})) {
          rows.delete(id);
          count += 1;
        }
      }
      return { count };
    },
    aggregate: async (args: { where?: MockWhere; _sum?: MockRow }) => {
      const matched = Array.from(rows.values()).filter((r) =>
        mockMatches(r, args.where ?? {})
      );
      const sums: MockRow = {};
      for (const key of Object.keys(args._sum ?? {})) {
        sums[key] = matched.reduce((total, r) => total + Number(r[key] ?? 0), 0);
      }
      return { _sum: sums };
    },
  };
}

// Reached through hoisted FUNCTIONS: jest.mock factories are hoisted above
// every declaration in this file, so a const here is still in its temporal
// dead zone when the mocked module is first required.
function mockMakeDb() {
  return {
    queuedAction: mockMakeTable('qa'),
    executionGateRule: mockMakeTable('gate'),
    actionLog: mockMakeTable('log'),
    consentReceipt: mockMakeTable('receipt'),
  };
}

function mockDb(): ReturnType<typeof mockMakeDb> {
  // Held on globalThis rather than in a module-level `let`: jest.mock factories
  // are hoisted above every declaration in the file, and the shared test
  // helpers read `prisma` at import time, so a `let` here is still in its
  // temporal dead zone the first time this is called.
  const store = globalThis as { __p09MockDb?: ReturnType<typeof mockMakeDb> };
  if (!store.__p09MockDb) store.__p09MockDb = mockMakeDb();
  return store.__p09MockDb;
}

jest.mock('@/lib/db', () => ({
  __esModule: true,
  get prisma() {
    return mockDb();
  },
  get default() {
    return mockDb();
  },
}));

import {
  enqueueAction,
  approveAction,
  rejectAction,
  executeAction,
  getQueuedActions,
  getActionById,
  scheduleAction,
  bulkApprove,
  bulkReject,
  cancelAction,
  _clearActionStore,
} from '../../../src/modules/execution/services/action-queue';
import { _clearGateStore, createGate } from '../../../src/modules/execution/services/execution-gate';
import { verifiedEntityIdForTest } from '../../helpers/factories';

const ENTITY = verifiedEntityIdForTest('entity-1');
const OTHER_ENTITY = verifiedEntityIdForTest('entity-2');

describe('ActionQueue', () => {
  beforeEach(async () => {
    await _clearActionStore();
    await _clearGateStore();
    mockDb().actionLog.clear();
    mockDb().consentReceipt.clear();
  });

  const defaultParams = {
    actionLogId: '',
    actor: 'AI' as const,
    actorId: 'ai-agent-1',
    actionType: 'CREATE_TASK',
    target: 'tasks',
    description: 'Create a new task',
    reason: 'User requested task creation',
    impact: 'Low - creates a single task',
    rollbackPlan: 'Delete the created task',
    blastRadius: 'LOW' as const,
    reversible: true,
    requiresApproval: false,
  };

  describe('enqueueAction', () => {
    it('should enqueue an action with generated ID and timestamps', async () => {
      const action = await enqueueAction(defaultParams, ENTITY);

      expect(action.id).toBeDefined();
      expect(action.actionLogId).toBeDefined();
      expect(action.actor).toBe('AI');
      expect(action.actionType).toBe('CREATE_TASK');
      expect(action.status).toBe('QUEUED');
      expect(action.createdAt).toBeInstanceOf(Date);
      expect(action.updatedAt).toBeInstanceOf(Date);
    });

    it('should auto-approve LOW blast radius in EXECUTE_AUTONOMOUS mode', async () => {
      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        ENTITY,
        'EXECUTE_AUTONOMOUS'
      );

      expect(action.status).toBe('APPROVED');
      expect(action.requiresApproval).toBe(false);
    });

    it('should keep QUEUED for HIGH blast radius in EXECUTE_AUTONOMOUS mode', async () => {
      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'HIGH', requiresApproval: true },
        ENTITY,
        'EXECUTE_AUTONOMOUS'
      );

      expect(action.status).toBe('QUEUED');
      expect(action.requiresApproval).toBe(true);
    });

    it('should keep QUEUED in SUGGEST mode regardless of blast radius', async () => {
      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: true },
        ENTITY,
        'SUGGEST'
      );

      expect(action.status).toBe('QUEUED');
      expect(action.requiresApproval).toBe(true);
    });

    it('should keep QUEUED in DRAFT mode', async () => {
      const action = await enqueueAction(
        { ...defaultParams, requiresApproval: true },
        ENTITY,
        'DRAFT'
      );

      expect(action.status).toBe('QUEUED');
      expect(action.requiresApproval).toBe(true);
    });

    it('should keep QUEUED in EXECUTE_WITH_APPROVAL mode', async () => {
      const action = await enqueueAction(
        { ...defaultParams, requiresApproval: true },
        ENTITY,
        'EXECUTE_WITH_APPROVAL'
      );

      expect(action.status).toBe('QUEUED');
      expect(action.requiresApproval).toBe(true);
    });

    it('should respect explicit requiresApproval=true override', async () => {
      const action = await enqueueAction(
        { ...defaultParams, requiresApproval: true, blastRadius: 'LOW' },
        ENTITY,
        'EXECUTE_AUTONOMOUS'
      );

      // explicitRequirement=true overrides auto-approval logic
      expect(action.requiresApproval).toBe(true);
      expect(action.status).toBe('QUEUED');
    });

    it('should store the action so a later read finds it', async () => {
      // Was: reached into the module-level Map. The queue is a table now, so
      // the assertion goes through the read path the routes use.
      const action = await enqueueAction(defaultParams, ENTITY);

      const found = await getActionById(action.id, ENTITY);
      expect(found).toEqual(action);
    });

    it("does not put the action anywhere another tenant can read it", async () => {
      const action = await enqueueAction(defaultParams, ENTITY);

      expect(await getActionById(action.id, OTHER_ENTITY)).toBeNull();
    });

    it('should use explicit requiresApproval=false as override', async () => {
      // When requiresApproval is explicitly false, it takes precedence over autonomy level
      const action = await enqueueAction(
        { ...defaultParams, requiresApproval: false },
        ENTITY,
        'EXECUTE_WITH_APPROVAL'
      );

      expect(action.requiresApproval).toBe(false);
    });
  });

  describe('approveAction', () => {
    it('should approve a QUEUED action', async () => {
      const action = await enqueueAction(defaultParams, ENTITY, 'SUGGEST');
      const approved = await approveAction(action.id, 'approver-1', ENTITY);

      expect(approved.status).toBe('APPROVED');
      // `approver-1` is the SESSION's user id now; the route no longer reads it
      // off the request body, where the requester chose whose name to record.
      expect(approved.approvedBy).toBe('approver-1');
      expect(approved.approvedAt).toBeInstanceOf(Date);
    });

    it('should throw for non-existent action', async () => {
      await expect(approveAction('nonexistent', 'approver-1', ENTITY)).rejects.toThrow(
        'Action nonexistent not found'
      );
    });

    it('should throw when approving non-QUEUED action', async () => {
      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        ENTITY,
        'EXECUTE_AUTONOMOUS'
      );

      // Action is already APPROVED
      await expect(approveAction(action.id, 'approver-1', ENTITY)).rejects.toThrow(
        'Cannot approve action with status APPROVED'
      );
    });
  });

  describe('rejectAction', () => {
    it('should reject a QUEUED action', async () => {
      const action = await enqueueAction(defaultParams, ENTITY, 'SUGGEST');
      const rejected = await rejectAction(action.id, 'Not needed', ENTITY);

      expect(rejected.status).toBe('REJECTED');
    });

    it('should throw for non-existent action', async () => {
      await expect(rejectAction('nonexistent', 'reason', ENTITY)).rejects.toThrow(
        'Action nonexistent not found'
      );
    });

    it('should throw when rejecting non-QUEUED action', async () => {
      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        ENTITY,
        'EXECUTE_AUTONOMOUS'
      );

      await expect(rejectAction(action.id, 'reason', ENTITY)).rejects.toThrow(
        'Cannot reject action with status APPROVED'
      );
    });
  });

  describe('executeAction', () => {
    it('should execute an APPROVED action', async () => {
      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        ENTITY,
        'EXECUTE_AUTONOMOUS'
      );

      const executed = await executeAction(action.id, ENTITY);

      expect(executed.status).toBe('EXECUTED');
      expect(executed.executedAt).toBeInstanceOf(Date);
    });

    it('should throw for non-existent action', async () => {
      await expect(executeAction('nonexistent', ENTITY)).rejects.toThrow(
        'Action nonexistent not found'
      );
    });

    it('should throw when executing non-APPROVED action', async () => {
      const action = await enqueueAction(defaultParams, ENTITY, 'SUGGEST');

      await expect(executeAction(action.id, ENTITY)).rejects.toThrow(
        'Cannot execute action with status QUEUED'
      );
    });

    it('should block execution when a gate fails', async () => {
      await createGate({
        name: 'Block All',
        expression: 'false',
        description: 'Block everything',
        scope: 'GLOBAL',
        isActive: true,
      }, ENTITY);

      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        ENTITY,
        'EXECUTE_AUTONOMOUS'
      );

      await expect(executeAction(action.id, ENTITY)).rejects.toThrow(
        'Execution blocked by gate'
      );

      // Action should be marked FAILED
      const stored = await getActionById(action.id, ENTITY);
      expect(stored!.status).toBe('FAILED');
    });
  });

  describe('getQueuedActions', () => {
    it('should return all actions with pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await enqueueAction(
          { ...defaultParams, description: `Task ${i}` },
          ENTITY,
          'SUGGEST'
        );
      }

      const result = await getQueuedActions(ENTITY, {}, 1, 3);

      expect(result.total).toBe(5);
      expect(result.data).toHaveLength(3);
    });

    it('should filter by status', async () => {
      await enqueueAction(defaultParams, ENTITY, 'SUGGEST'); // QUEUED
      await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        ENTITY,
        'EXECUTE_AUTONOMOUS'
      ); // APPROVED

      const queued = await getQueuedActions(ENTITY, { status: 'QUEUED' });
      expect(queued.data).toHaveLength(1);
      expect(queued.data[0].status).toBe('QUEUED');

      const approved = await getQueuedActions(ENTITY, { status: 'APPROVED' });
      expect(approved.data).toHaveLength(1);
      expect(approved.data[0].status).toBe('APPROVED');
    });

    it('should filter by actor', async () => {
      await enqueueAction({ ...defaultParams, actor: 'AI' }, ENTITY, 'SUGGEST');
      await enqueueAction({ ...defaultParams, actor: 'HUMAN' }, ENTITY, 'SUGGEST');

      const aiActions = await getQueuedActions(ENTITY, { actor: 'AI' });
      expect(aiActions.data).toHaveLength(1);
      expect(aiActions.data[0].actor).toBe('AI');
    });

    it('should filter by blastRadius', async () => {
      await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW' },
        ENTITY,
        'SUGGEST'
      );
      await enqueueAction(
        { ...defaultParams, blastRadius: 'HIGH' },
        ENTITY,
        'SUGGEST'
      );

      const high = await getQueuedActions(ENTITY, { blastRadius: 'HIGH' });
      expect(high.data).toHaveLength(1);
      expect(high.data[0].blastRadius).toBe('HIGH');
    });

    it('scopes the list to the verified entity, with no filter needed', async () => {
      // CORRECTED BY P-09. This used to pass `entityId` as a FILTER, which is
      // the defect in miniature: the caller named the tenant and the service
      // believed it. The scope is now a required leading argument and is not a
      // field on the filter bag at all, so an ordinary request -- no filter --
      // still cannot see the other tenant's row.
      await enqueueAction(defaultParams, ENTITY, 'SUGGEST');
      await enqueueAction(defaultParams, OTHER_ENTITY, 'SUGGEST');

      const mine = await getQueuedActions(ENTITY, {});
      expect(mine.data).toHaveLength(1);
      expect(mine.data[0].entityId).toBe(ENTITY);

      // Symmetry: a fix that denies everyone passes every other assertion here.
      const theirs = await getQueuedActions(OTHER_ENTITY, {});
      expect(theirs.data).toHaveLength(1);
      expect(theirs.data[0].entityId).toBe(OTHER_ENTITY);
    });

    it("refuses to approve another tenant's action, and the action is unchanged", async () => {
      const theirs = await enqueueAction(defaultParams, OTHER_ENTITY, 'SUGGEST');

      await expect(approveAction(theirs.id, 'me', ENTITY)).rejects.toThrow('not found');

      const after = await getActionById(theirs.id, OTHER_ENTITY);
      expect(after!.status).toBe('QUEUED');
      expect(after!.approvedBy).toBeUndefined();
    });

    it("refuses to execute another tenant's action, and it is not executed", async () => {
      const theirs = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        OTHER_ENTITY,
        'EXECUTE_AUTONOMOUS'
      );

      await expect(executeAction(theirs.id, ENTITY)).rejects.toThrow('not found');

      const after = await getActionById(theirs.id, OTHER_ENTITY);
      expect(after!.status).toBe('APPROVED');
    });

    it('reports foreign ids as failures in a bulk approve, changing nothing', async () => {
      const theirs = await enqueueAction(defaultParams, OTHER_ENTITY, 'SUGGEST');

      const result = await bulkApprove([theirs.id], 'me', ENTITY);

      expect(result).toEqual({ approved: 0, failed: 1 });
      expect((await getActionById(theirs.id, OTHER_ENTITY))!.status).toBe('QUEUED');
    });

    it('should sort by creation time descending', async () => {
      const a1 = await enqueueAction(
        { ...defaultParams, description: 'First' },
        ENTITY,
        'SUGGEST'
      );
      // Backdate the stored rows: the ordering is done by the query now, so
      // the timestamps have to differ in the table rather than in a Map.
      mockDb().queuedAction.rows.get(a1.id)!.createdAt = new Date('2026-01-01T00:00:00Z');

      const a2 = await enqueueAction(
        { ...defaultParams, description: 'Second' },
        ENTITY,
        'SUGGEST'
      );
      mockDb().queuedAction.rows.get(a2.id)!.createdAt = new Date('2026-01-02T00:00:00Z');

      const result = await getQueuedActions(ENTITY, {});
      expect(result.data[0].description).toBe('Second');
      expect(result.data[1].description).toBe('First');
    });

    it('should return empty for no matches', async () => {
      const result = await getQueuedActions(ENTITY, { status: 'EXECUTED' });
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getActionById', () => {
    it('should return action by ID', async () => {
      const action = await enqueueAction(defaultParams, ENTITY, 'SUGGEST');
      const found = await getActionById(action.id, ENTITY);

      expect(found).toBeDefined();
      expect(found!.id).toBe(action.id);
    });

    it('should return null for non-existent ID', async () => {
      const found = await getActionById('nonexistent', ENTITY);
      expect(found).toBeNull();
    });
  });

  describe('scheduleAction', () => {
    it('should set scheduledFor date on action', async () => {
      const action = await enqueueAction(defaultParams, ENTITY, 'SUGGEST');
      const futureDate = new Date('2026-12-31T00:00:00Z');

      const scheduled = await scheduleAction(action.id, futureDate, ENTITY);

      expect(scheduled.scheduledFor).toEqual(futureDate);
      expect(scheduled.updatedAt).toBeInstanceOf(Date);
    });

    it('should throw for non-existent action', async () => {
      await expect(
        scheduleAction('nonexistent', new Date(), ENTITY)
      ).rejects.toThrow('Action nonexistent not found');
    });
  });

  describe('bulkApprove', () => {
    it('should approve multiple QUEUED actions', async () => {
      const a1 = await enqueueAction(defaultParams, ENTITY, 'SUGGEST');
      const a2 = await enqueueAction(defaultParams, ENTITY, 'SUGGEST');

      const result = await bulkApprove([a1.id, a2.id], 'approver-1', ENTITY);

      expect(result.approved).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should count failures for non-QUEUED actions', async () => {
      const queued = await enqueueAction(defaultParams, ENTITY, 'SUGGEST');
      const autoApproved = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        ENTITY,
        'EXECUTE_AUTONOMOUS'
      );

      const result = await bulkApprove(
        [queued.id, autoApproved.id],
        'approver-1',
        ENTITY
      );

      expect(result.approved).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('bulkReject', () => {
    it('should reject multiple QUEUED actions', async () => {
      const a1 = await enqueueAction(defaultParams, ENTITY, 'SUGGEST');
      const a2 = await enqueueAction(defaultParams, ENTITY, 'SUGGEST');

      const result = await bulkReject([a1.id, a2.id], 'Batch rejection', ENTITY);

      expect(result.rejected).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should count failures for non-QUEUED actions', async () => {
      const queued = await enqueueAction(defaultParams, ENTITY, 'SUGGEST');
      const autoApproved = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        ENTITY,
        'EXECUTE_AUTONOMOUS'
      );

      const result = await bulkReject(
        [queued.id, autoApproved.id],
        'Batch rejection',
        ENTITY
      );

      expect(result.rejected).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('cancelAction', () => {
    it('should cancel a QUEUED action', async () => {
      const action = await enqueueAction(defaultParams, ENTITY, 'SUGGEST');
      const cancelled = await cancelAction(action.id, ENTITY);

      expect(cancelled.status).toBe('REJECTED');
    });

    it('should throw for non-existent action', async () => {
      await expect(cancelAction('nonexistent', ENTITY)).rejects.toThrow(
        'Action nonexistent not found'
      );
    });

    it('should throw when cancelling non-QUEUED action', async () => {
      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        ENTITY,
        'EXECUTE_AUTONOMOUS'
      );

      await expect(cancelAction(action.id, ENTITY)).rejects.toThrow(
        'Cannot cancel action with status APPROVED'
      );
    });
  });
});
