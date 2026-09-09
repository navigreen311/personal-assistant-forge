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

// The gate table, reached lazily: jest.mock factories are hoisted above every
// declaration in this file, so anything evaluated eagerly here is still in its
// temporal dead zone when the mocked module is first required.
function mockGateTable(): ReturnType<typeof mockMakeTable> {
  // Held on globalThis rather than in a module-level `let`: see the note in the
  // other execution suites -- a `let` is still in its temporal dead zone when a
  // hoisted jest.mock factory first reaches for it.
  const store = globalThis as { __p09MockGates?: ReturnType<typeof mockMakeTable> };
  if (!store.__p09MockGates) store.__p09MockGates = mockMakeTable('gate');
  return store.__p09MockGates;
}

jest.mock('@/lib/db', () => ({
  __esModule: true,
  get prisma() {
    return { executionGateRule: mockGateTable() };
  },
  get default() {
    return { executionGateRule: mockGateTable() };
  },
}));

import {
  createGate,
  evaluateGates,
  listGates,
  updateGate,
  deleteGate,
  evaluateExpression,
  _clearGateStore,
} from '../../../src/modules/execution/services/execution-gate';
import type { QueuedAction, ExecutionGate } from '../../../src/modules/execution/types';
import { verifiedEntityIdForTest } from '../../helpers/factories';

const ENTITY = verifiedEntityIdForTest('entity-1');
const OTHER_ENTITY = verifiedEntityIdForTest('entity-2');

function makeAction(overrides: Partial<QueuedAction> = {}): QueuedAction {
  return {
    id: 'action-1',
    actionLogId: 'log-1',
    actor: 'AI',
    actionType: 'CREATE_TASK',
    target: 'tasks',
    description: 'Create a task',
    reason: 'Testing',
    impact: 'Low',
    rollbackPlan: 'Delete task',
    blastRadius: 'LOW',
    reversible: true,
    status: 'APPROVED',
    requiresApproval: false,
    entityId: 'entity-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ExecutionGate', () => {
  beforeEach(async () => {
    await _clearGateStore();
  });

  describe('createGate', () => {
    it('should create a gate with generated ID', async () => {
      const gate = await createGate({
        name: 'Cost Limit',
        expression: 'estimatedCost < 100',
        description: 'Block if cost exceeds $100',
        scope: 'GLOBAL',
        isActive: true,
      }, ENTITY);

      expect(gate.id).toBeDefined();
      expect(gate.name).toBe('Cost Limit');
      expect(gate.expression).toBe('estimatedCost < 100');
      expect(gate.scope).toBe('GLOBAL');
      expect(gate.isActive).toBe(true);
    });

    it('should create an entity-scoped gate', async () => {
      const gate = await createGate({
        name: 'Entity Gate',
        expression: 'blastRadius != "CRITICAL"',
        description: 'No critical actions for this entity',
        scope: 'ENTITY',
        isActive: true,
      }, verifiedEntityIdForTest('entity-1'));

      expect(gate.scope).toBe('ENTITY');
      expect(gate.entityId).toBe('entity-1');
    });
  });

  describe('evaluateGates', () => {
    it('should pass when no gates exist', async () => {
      const action = makeAction();
      const result = await evaluateGates(action, {});

      expect(result.passed).toBe(true);
      expect(result.blockedBy).toBeUndefined();
    });

    it('should pass when all gates evaluate to true', async () => {
      await createGate({
        name: 'Allow LOW',
        expression: 'blastRadius == "LOW"',
        description: 'Only allow LOW blast radius',
        scope: 'GLOBAL',
        isActive: true,
      }, ENTITY);

      const action = makeAction({ blastRadius: 'LOW' });
      const result = await evaluateGates(action, { blastRadius: 'LOW' });

      expect(result.passed).toBe(true);
    });

    it('should block when a gate evaluates to false', async () => {
      await createGate({
        name: 'No CRITICAL',
        expression: 'blastRadius != "CRITICAL"',
        description: 'Block CRITICAL actions',
        scope: 'GLOBAL',
        isActive: true,
      }, ENTITY);

      const action = makeAction({ blastRadius: 'CRITICAL' });
      const result = await evaluateGates(action, { blastRadius: 'CRITICAL' });

      expect(result.passed).toBe(false);
      expect(result.blockedBy).toBeDefined();
      expect(result.blockedBy!.name).toBe('No CRITICAL');
      expect(result.reason).toContain('No CRITICAL');
    });

    it('should skip inactive gates', async () => {
      await createGate({
        name: 'Inactive Gate',
        expression: 'false',
        description: 'This gate always blocks',
        scope: 'GLOBAL',
        isActive: false,
      }, ENTITY);

      const action = makeAction();
      const result = await evaluateGates(action, {});

      expect(result.passed).toBe(true);
    });

    it('should only apply ENTITY gates to matching entity', async () => {
      await createGate({
        name: 'Entity-1 Only',
        expression: 'blastRadius != "HIGH"',
        description: 'No HIGH for entity-1',
        scope: 'ENTITY',
        isActive: true,
      }, verifiedEntityIdForTest('entity-1'));

      // Action in entity-2 should not be affected
      const action = makeAction({ entityId: 'entity-2', blastRadius: 'HIGH' });
      const result = await evaluateGates(action, { blastRadius: 'HIGH' });

      expect(result.passed).toBe(true);

      // Action in entity-1 should be blocked
      const action2 = makeAction({ entityId: 'entity-1', blastRadius: 'HIGH' });
      const result2 = await evaluateGates(action2, { blastRadius: 'HIGH' });

      expect(result2.passed).toBe(false);
    });

    it("applies a tenant's GLOBAL-scoped gate to that tenant's own actions", async () => {
      await createGate({
        name: 'Global Cost Gate',
        expression: 'estimatedCost < 1000',
        description: 'Block expensive actions across this entity',
        scope: 'GLOBAL',
        isActive: true,
      }, ENTITY);

      const action = makeAction({ estimatedCost: 5000, entityId: ENTITY });
      const result = await evaluateGates(action, { estimatedCost: 5000 });

      expect(result.passed).toBe(false);
    });

    it("does NOT apply one tenant's gate to another tenant's action", async () => {
      // CORRECTED BY P-09: this assertion used to be
      // "should apply GLOBAL gates to all entities", and it passed against an
      // in-memory store where any tenant's GLOBAL gate blocked every tenant's
      // actions. Installing a rule into someone else's execution path is a
      // cross-tenant denial of service; the scope is in the WHERE clause now.
      await createGate({
        name: 'Global Cost Gate',
        expression: 'estimatedCost < 1000',
        description: 'Block expensive actions across this entity',
        scope: 'GLOBAL',
        isActive: true,
      }, ENTITY);

      const action = makeAction({ estimatedCost: 5000, entityId: OTHER_ENTITY });
      const result = await evaluateGates(action, { estimatedCost: 5000 });

      expect(result.passed).toBe(true);
    });

    it('should pass action context variables to expression', async () => {
      await createGate({
        name: 'Actor Gate',
        expression: 'actor != "SYSTEM"',
        description: 'Block system actions',
        scope: 'GLOBAL',
        isActive: true,
      }, ENTITY);

      const action = makeAction({ actor: 'SYSTEM' });
      const result = await evaluateGates(action, {});

      expect(result.passed).toBe(false);
    });

    it('should evaluate multiple gates and block on first failure', async () => {
      await createGate({
        name: 'Gate A',
        expression: 'blastRadius != "CRITICAL"',
        description: 'No critical',
        scope: 'GLOBAL',
        isActive: true,
      }, ENTITY);
      await createGate({
        name: 'Gate B',
        expression: 'estimatedCost < 100',
        description: 'Cost limit',
        scope: 'GLOBAL',
        isActive: true,
      }, ENTITY);

      const action = makeAction({
        blastRadius: 'CRITICAL',
        estimatedCost: 50,
      });
      const result = await evaluateGates(action, {
        blastRadius: 'CRITICAL',
        estimatedCost: 50,
      });

      expect(result.passed).toBe(false);
      expect(result.blockedBy!.name).toBe('Gate A');
    });
  });

  describe('listGates', () => {
    it('should list all gates', async () => {
      await createGate({
        name: 'Gate 1',
        expression: 'true',
        description: 'Test',
        scope: 'GLOBAL',
        isActive: true,
      }, ENTITY);
      await createGate({
        name: 'Gate 2',
        expression: 'true',
        description: 'Test',
        scope: 'ENTITY',
        isActive: true,
      }, verifiedEntityIdForTest('entity-1'));

      const all = await listGates(ENTITY);
      expect(all).toHaveLength(2);
    });

    it('should filter by scope', async () => {
      await createGate({
        name: 'Global',
        expression: 'true',
        description: 'Test',
        scope: 'GLOBAL',
        isActive: true,
      }, ENTITY);
      await createGate({
        name: 'Entity',
        expression: 'true',
        description: 'Test',
        scope: 'ENTITY',
        isActive: true,
      }, verifiedEntityIdForTest('entity-1'));

      const globalGates = await listGates(ENTITY, 'GLOBAL');
      expect(globalGates).toHaveLength(1);
      expect(globalGates[0].name).toBe('Global');
    });

    it('should filter by entityId (includes GLOBAL)', async () => {
      await createGate({
        name: 'Global',
        expression: 'true',
        description: 'Test',
        scope: 'GLOBAL',
        isActive: true,
      }, ENTITY);
      await createGate({
        name: 'Entity-1',
        expression: 'true',
        description: 'Test',
        scope: 'ENTITY',
        isActive: true,
      }, verifiedEntityIdForTest('entity-1'));
      await createGate({
        name: 'Entity-2',
        expression: 'true',
        description: 'Test',
        scope: 'ENTITY',
        isActive: true,
      }, verifiedEntityIdForTest('entity-2'));

      // CORRECTED BY P-09. This used to read `listGates(undefined, 'entity-1')`
      // and expect Global + Entity-1, where "Global" meant a gate another
      // tenant had created with scope GLOBAL. A gate one tenant can install
      // into every other tenant's execution path is a cross-tenant control --
      // the mirror image of a gate you can bypass -- so a tenant-owned gate now
      // only ever applies to, and is only ever listed for, its own entity.
      // A truly platform-wide gate is one with no owner at all, which this API
      // cannot create and cannot delete.
      const result = await listGates(ENTITY);
      const names = result.map((g) => g.name);
      expect(names).toContain('Global');
      expect(names).toContain('Entity-1');
      expect(names).not.toContain('Entity-2');

      const theirs = (await listGates(OTHER_ENTITY)).map((g) => g.name);
      expect(theirs).toEqual(['Entity-2']);
    });
  });

  describe('updateGate', () => {
    it('should update gate expression and preserve ID', async () => {
      const gate = await createGate({
        name: 'Test Gate',
        expression: 'blastRadius == "LOW"',
        description: 'Test',
        scope: 'GLOBAL',
        isActive: true,
      }, ENTITY);

      const updated = await updateGate(gate.id, {
        expression: 'blastRadius != "CRITICAL"',
      }, ENTITY);

      expect(updated.id).toBe(gate.id);
      expect(updated.expression).toBe('blastRadius != "CRITICAL"');
      expect(updated.name).toBe('Test Gate');
    });

    it('should throw for non-existent gate', async () => {
      await expect(updateGate('nonexistent', { name: 'X' }, ENTITY)).rejects.toThrow(
        'Gate nonexistent not found'
      );
    });

    it("refuses to update another tenant's gate, and leaves it untouched", async () => {
      const gate = await createGate({
        name: 'Theirs',
        expression: 'blastRadius == "LOW"',
        description: 'Owned by entity-2',
        scope: 'ENTITY',
        isActive: true,
      }, OTHER_ENTITY);

      // The scope is in the WHERE clause, so a foreign gate is simply not found.
      await expect(
        updateGate(gate.id, { expression: 'true' }, ENTITY)
      ).rejects.toThrow('not found');

      const theirs = await listGates(OTHER_ENTITY);
      expect(theirs[0].expression).toBe('blastRadius == "LOW"');
    });
  });

  describe('deleteGate', () => {
    it('should delete an existing gate', async () => {
      const gate = await createGate({
        name: 'Deletable',
        expression: 'true',
        description: 'Test',
        scope: 'GLOBAL',
        isActive: true,
      }, ENTITY);

      await deleteGate(gate.id, ENTITY);
      const gates = await listGates(ENTITY);
      expect(gates).toHaveLength(0);
    });

    it('should throw for non-existent gate', async () => {
      await expect(deleteGate('nonexistent', ENTITY)).rejects.toThrow(
        'Gate nonexistent not found'
      );
    });

    it("refuses to delete another tenant's gate, and the gate survives", async () => {
      // A gate is the mechanism that STOPS an action. Being able to delete
      // someone else's is the same class of failure as bypassing your own.
      const gate = await createGate({
        name: 'Theirs',
        expression: 'false',
        description: 'Owned by entity-2',
        scope: 'ENTITY',
        isActive: true,
      }, OTHER_ENTITY);

      await expect(deleteGate(gate.id, ENTITY)).rejects.toThrow('not found');

      expect(await listGates(OTHER_ENTITY)).toHaveLength(1);
    });
  });

  describe('evaluateExpression', () => {
    it('should evaluate numeric comparisons', () => {
      expect(evaluateExpression('5 < 10', {})).toBe(true);
      expect(evaluateExpression('10 < 5', {})).toBe(false);
      expect(evaluateExpression('10 <= 10', {})).toBe(true);
      expect(evaluateExpression('10 > 5', {})).toBe(true);
      expect(evaluateExpression('5 > 10', {})).toBe(false);
      expect(evaluateExpression('10 >= 10', {})).toBe(true);
    });

    it('should evaluate string equality', () => {
      expect(evaluateExpression('x == "hello"', { x: 'hello' })).toBe(true);
      expect(evaluateExpression('x == "world"', { x: 'hello' })).toBe(false);
      expect(evaluateExpression('x != "world"', { x: 'hello' })).toBe(true);
    });

    it('should evaluate logical AND', () => {
      expect(evaluateExpression('a > 5 && b < 10', { a: 6, b: 8 })).toBe(true);
      expect(evaluateExpression('a > 5 && b < 10', { a: 3, b: 8 })).toBe(false);
    });

    it('should evaluate logical OR', () => {
      expect(evaluateExpression('a > 5 || b < 10', { a: 3, b: 8 })).toBe(true);
      expect(evaluateExpression('a > 5 || b < 10', { a: 3, b: 15 })).toBe(false);
    });

    it('should evaluate parenthesized expressions', () => {
      // Single parenthesized expression
      expect(evaluateExpression('(a > 5)', { a: 6 })).toBe(true);
      expect(evaluateExpression('(a > 5)', { a: 3 })).toBe(false);

      // Parenthesized OR
      expect(
        evaluateExpression('(a == 1 || a == 6)', { a: 6 })
      ).toBe(true);

      // Note: The expression parser consumes logical operators at the comparison
      // level when preceded by parenthesized expressions, so (expr) && (expr)
      // patterns should use non-parenthesized comparisons: a > 5 && b > 3
      expect(evaluateExpression('a > 5 && b > 3', { a: 6, b: 5 })).toBe(true);
    });

    it('should look up context variables', () => {
      expect(evaluateExpression('cost < 100', { cost: 50 })).toBe(true);
      expect(evaluateExpression('cost < 100', { cost: 150 })).toBe(false);
    });

    it('should default missing variables to 0', () => {
      expect(evaluateExpression('missing > 0', {})).toBe(false);
      expect(evaluateExpression('missing == 0', {})).toBe(true);
    });

    it('should handle boolean literals', () => {
      expect(evaluateExpression('true', {})).toBe(true);
      expect(evaluateExpression('false', {})).toBe(false);
    });

    it('should return false on parse errors (fail-safe)', () => {
      expect(evaluateExpression('', {})).toBe(false);
      expect(evaluateExpression(')))((', {})).toBe(false);
    });

    it('should evaluate single-quoted strings', () => {
      expect(evaluateExpression("x == 'hello'", { x: 'hello' })).toBe(true);
    });

    it('should handle negative numbers', () => {
      expect(evaluateExpression('x > -5', { x: 0 })).toBe(true);
      expect(evaluateExpression('x > -5', { x: -10 })).toBe(false);
    });
  });
});
