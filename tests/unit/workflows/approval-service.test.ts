// ============================================================================
// Approval Service — Unit Tests
// ============================================================================

import {
  requestApproval,
  submitApproval,
  getPendingApprovals,
  getApprovalStatus,
  clearApprovalStore,
} from '@/modules/workflows/services/approval-service';
import type { HumanApprovalNodeConfig } from '@/modules/workflows/types';

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

// --- Mocks ---

function mockMakeDb() {
  return {
    workflowApproval: mockMakeTable('appr'),
    actionLog: mockMakeTable('log'),
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

// --- Helpers ---

function createApprovalConfig(overrides?: Partial<HumanApprovalNodeConfig>): HumanApprovalNodeConfig {
  return {
    nodeType: 'HUMAN_APPROVAL',
    approverIds: ['user-1', 'user-2', 'user-3'],
    message: 'Please approve this action',
    timeoutHours: 24,
    requiredApprovals: 2,
    ...overrides,
  };
}

// --- Tests ---

describe('ApprovalService', () => {
  beforeEach(() => {
    clearApprovalStore();
    jest.clearAllMocks();
  });

  describe('requestApproval', () => {
    it('should create approval request with PENDING status', async () => {
      const config = createApprovalConfig();
      const result = await requestApproval(config, 'exec-1', {});

      expect(result.approvalId).toBeDefined();
      expect(result.status).toBe('PENDING');
    });

    it('should set expiration based on timeoutHours', async () => {
      const config = createApprovalConfig({ timeoutHours: 48 });
      const result = await requestApproval(config, 'exec-2', {});

      const status = await getApprovalStatus(result.approvalId);
      expect(status.status).toBe('PENDING');
    });
  });

  describe('submitApproval', () => {
    it('should record approval response', async () => {
      const config = createApprovalConfig();
      const { approvalId } = await requestApproval(config, 'exec-3', {});

      const result = await submitApproval(approvalId, 'user-1', true, 'Looks good');

      expect(result.status).toBe('PENDING'); // Still needs 1 more approval
    });

    it('should mark as APPROVED when required approvals met', async () => {
      const config = createApprovalConfig({ requiredApprovals: 2 });
      const { approvalId } = await requestApproval(config, 'exec-4', {});

      await submitApproval(approvalId, 'user-1', true);
      const result = await submitApproval(approvalId, 'user-2', true);

      expect(result.status).toBe('APPROVED');
    });

    it('should mark as REJECTED on rejection', async () => {
      const config = createApprovalConfig();
      const { approvalId } = await requestApproval(config, 'exec-5', {});

      const result = await submitApproval(approvalId, 'user-1', false, 'Not acceptable');

      expect(result.status).toBe('REJECTED');
    });

    it('should prevent duplicate responses from same approver', async () => {
      const config = createApprovalConfig();
      const { approvalId } = await requestApproval(config, 'exec-6', {});

      await submitApproval(approvalId, 'user-1', true);

      await expect(
        submitApproval(approvalId, 'user-1', true)
      ).rejects.toThrow('already responded');
    });

    it('should reject unauthorized approvers', async () => {
      const config = createApprovalConfig({ approverIds: ['user-1'] });
      const { approvalId } = await requestApproval(config, 'exec-7', {});

      await expect(
        submitApproval(approvalId, 'user-99', true)
      ).rejects.toThrow('not an authorized approver');
    });

    it('should not allow responses to non-pending approvals', async () => {
      const config = createApprovalConfig({ requiredApprovals: 1 });
      const { approvalId } = await requestApproval(config, 'exec-8', {});

      await submitApproval(approvalId, 'user-1', true); // Completes it

      await expect(
        submitApproval(approvalId, 'user-2', true)
      ).rejects.toThrow('no longer pending');
    });
  });

  describe('getApprovalStatus', () => {
    it('should return current approval progress', async () => {
      const config = createApprovalConfig({ requiredApprovals: 3 });
      const { approvalId } = await requestApproval(config, 'exec-9', {});

      await submitApproval(approvalId, 'user-1', true);

      const status = await getApprovalStatus(approvalId);

      expect(status.approvals).toBe(1);
      expect(status.required).toBe(3);
      expect(status.responses).toHaveLength(1);
    });

    it('should throw for non-existent approval', async () => {
      await expect(getApprovalStatus('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('getPendingApprovals', () => {
    it('should return only pending approvals for the user', async () => {
      const config = createApprovalConfig({
        approverIds: ['user-1', 'user-2'],
      });

      await requestApproval(config, 'exec-10', {}, 'Workflow A', 'Step 1');
      await requestApproval(config, 'exec-11', {}, 'Workflow B', 'Step 2');

      const pendingForUser1 = await getPendingApprovals('user-1');
      expect(pendingForUser1).toHaveLength(2);

      const pendingForUser99 = await getPendingApprovals('user-99');
      expect(pendingForUser99).toHaveLength(0);
    });

    it('should exclude expired approvals', async () => {
      const config = createApprovalConfig({ timeoutHours: 0 }); // Expires immediately

      await requestApproval(config, 'exec-12', {});

      // Wait a tick for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const pending = await getPendingApprovals('user-1');
      // Should be 0 because timeoutHours=0 means expiresAt = createdAt
      expect(pending).toHaveLength(0);
    });
  });
});
