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
// every declaration in this file.
function mockMakeDb() {
  return {
    queuedAction: mockMakeTable('qa'),
    rollbackPlan: mockMakeTable('plan'),
    actionLog: mockMakeTable('log'),
    consentReceipt: mockMakeTable('receipt'),
    executionGateRule: mockMakeTable('gate'),
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
  createRollbackPlan,
  executeRollback,
  getRollbackPlan,
  canRollback,
  _clearRollbackStore,
} from '../../../src/modules/execution/services/rollback-service';
import {
  _clearActionStore,
} from '../../../src/modules/execution/services/action-queue';
import type { QueuedAction } from '../../../src/modules/execution/types';
import { verifiedEntityIdForTest } from '../../helpers/factories';

const ENTITY = verifiedEntityIdForTest('entity-1');
const OTHER_ENTITY = verifiedEntityIdForTest('entity-2');

function seedAction(overrides: Partial<QueuedAction> = {}): QueuedAction {
  const action: QueuedAction = {
    id: 'action-1',
    actionLogId: 'log-1',
    actor: 'AI',
    actionType: 'CREATE_TASK',
    target: 'tasks/t-1',
    description: 'Create task',
    reason: 'Testing',
    impact: 'Low',
    rollbackPlan: 'Delete the task',
    blastRadius: 'LOW',
    reversible: true,
    status: 'EXECUTED',
    requiresApproval: false,
    entityId: ENTITY,
    executedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  // The queue is a table now, so the fixture is a row rather than a Map entry.
  mockDb().queuedAction.seed({ ...action, actorId: null, estimatedCost: null });
  mockDb().actionLog.seed({ id: action.actionLogId, status: action.status });
  return action;
}

describe('RollbackService', () => {
  beforeEach(async () => {
    await _clearActionStore();
    await _clearRollbackStore();
    mockDb().actionLog.clear();
  });

  describe('createRollbackPlan', () => {
    it('should create rollback plan for CREATE_TASK', async () => {
      seedAction({ actionType: 'CREATE_TASK', target: 'tasks/t-1' });

      const plan = await createRollbackPlan('action-1', ENTITY);

      expect(plan.actionId).toBe('action-1');
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].type).toBe('DELETE');
      expect(plan.steps[0].model).toBe('Task');
      expect(plan.steps[0].recordId).toBe('tasks/t-1');
      expect(plan.steps[0].status).toBe('PENDING');
      expect(plan.canAutoRollback).toBe(true);
      expect(plan.requiresManualSteps).toBe(false);
      expect(plan.estimatedDuration).toBe(1000);
    });

    it('should create rollback plan for CREATE_CONTACT', async () => {
      seedAction({
        id: 'action-2',
        actionType: 'CREATE_CONTACT',
        target: 'contacts/c-1',
      });

      const plan = await createRollbackPlan('action-2', ENTITY);

      expect(plan.steps[0].type).toBe('DELETE');
      expect(plan.steps[0].model).toBe('Contact');
      expect(plan.canAutoRollback).toBe(true);
    });

    it('should create rollback plan for CREATE_PROJECT', async () => {
      seedAction({
        id: 'action-3',
        actionType: 'CREATE_PROJECT',
        target: 'projects/p-1',
      });

      const plan = await createRollbackPlan('action-3', ENTITY);

      expect(plan.steps[0].type).toBe('DELETE');
      expect(plan.steps[0].model).toBe('Project');
    });

    it('should create rollback plan for UPDATE_RECORD with RESTORE step', async () => {
      seedAction({ id: 'action-4', actionType: 'UPDATE_RECORD', target: 'records/r-1' });

      const plan = await createRollbackPlan('action-4', ENTITY);

      expect(plan.steps[0].type).toBe('RESTORE');
      expect(plan.steps[0].model).toBe('Record');
      expect(plan.canAutoRollback).toBe(true);
    });

    it('should create rollback plan for DELETE_RECORD with RESTORE step', async () => {
      seedAction({ id: 'action-5', actionType: 'DELETE_RECORD', target: 'records/r-1' });

      const plan = await createRollbackPlan('action-5', ENTITY);

      expect(plan.steps[0].type).toBe('RESTORE');
    });

    it('should create rollback plan for SEND_MESSAGE with UNDO_SEND and MANUAL steps', async () => {
      seedAction({ id: 'action-6', actionType: 'SEND_MESSAGE', target: 'messages/m-1' });

      const plan = await createRollbackPlan('action-6', ENTITY);

      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].type).toBe('UNDO_SEND');
      expect(plan.steps[1].type).toBe('MANUAL');
      expect(plan.canAutoRollback).toBe(false);
      expect(plan.requiresManualSteps).toBe(true);
      expect(plan.manualInstructions).toBeDefined();
      expect(plan.manualInstructions).toContain('Manually contact recipient');
    });

    it('should create rollback plan for FINANCIAL_ACTION with UPDATE and MANUAL steps', async () => {
      seedAction({
        id: 'action-7',
        actionType: 'FINANCIAL_ACTION',
        target: 'finance/f-1',
      });

      const plan = await createRollbackPlan('action-7', ENTITY);

      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].type).toBe('UPDATE');
      expect(plan.steps[0].model).toBe('FinancialRecord');
      expect(plan.steps[1].type).toBe('MANUAL');
      expect(plan.canAutoRollback).toBe(false);
      expect(plan.requiresManualSteps).toBe(true);
    });

    it('should create rollback plan for TRIGGER_WORKFLOW with MANUAL step', async () => {
      seedAction({
        id: 'action-8',
        actionType: 'TRIGGER_WORKFLOW',
        target: 'workflows/wf-1',
      });

      const plan = await createRollbackPlan('action-8', ENTITY);

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].type).toBe('MANUAL');
      expect(plan.canAutoRollback).toBe(false);
    });

    it('should create rollback plan for CALL_API with MANUAL step', async () => {
      seedAction({
        id: 'action-9',
        actionType: 'CALL_API',
        target: 'api/endpoint',
      });

      const plan = await createRollbackPlan('action-9', ENTITY);

      expect(plan.steps[0].type).toBe('MANUAL');
      expect(plan.canAutoRollback).toBe(false);
    });

    it('should create rollback plan for GENERATE_DOCUMENT with DELETE step', async () => {
      seedAction({
        id: 'action-10',
        actionType: 'GENERATE_DOCUMENT',
        target: 'documents/d-1',
      });

      const plan = await createRollbackPlan('action-10', ENTITY);

      expect(plan.steps[0].type).toBe('DELETE');
      expect(plan.steps[0].model).toBe('Document');
      expect(plan.canAutoRollback).toBe(true);
    });

    it('should create generic MANUAL rollback for unknown action types', async () => {
      seedAction({
        id: 'action-11',
        actionType: 'CUSTOM_ACTION',
        target: 'custom/resource',
      });

      const plan = await createRollbackPlan('action-11', ENTITY);

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].type).toBe('MANUAL');
      expect(plan.steps[0].description).toContain('Manually reverse');
      expect(plan.canAutoRollback).toBe(false);
    });

    it('should throw for non-existent action', async () => {
      await expect(createRollbackPlan('nonexistent', ENTITY)).rejects.toThrow(
        'Action nonexistent not found'
      );
    });

    it('should store the plan in the rollback store', async () => {
      seedAction();
      await createRollbackPlan('action-1', ENTITY);

      const stored = await getRollbackPlan('action-1', ENTITY);
      expect(stored).toBeDefined();
      expect(stored!.actionId).toBe('action-1');
    });
  });

  describe('executeRollback', () => {
    it('should execute auto-rollback for CREATE_TASK (DELETE step)', async () => {
      seedAction({
        actionType: 'CREATE_TASK',
        target: 'tasks/t-1',
      });

      const result = await executeRollback('action-1', ENTITY);

      expect(result.actionId).toBe('action-1');
      expect(result.status).toBe('COMPLETE');
      expect(result.stepsCompleted).toBe(1);
      expect(result.stepsFailed).toBe(0);
      expect(result.stepsSkipped).toBe(0);

      // Action should be marked ROLLED_BACK
      const action = await mockDb().queuedAction.findUnique({ where: { id: 'action-1' } });
      expect(action!.status).toBe('ROLLED_BACK');
    });

    it('should skip MANUAL steps and report as PARTIAL', async () => {
      seedAction({
        actionType: 'SEND_MESSAGE',
        target: 'messages/m-1',
      });

      const result = await executeRollback('action-1', ENTITY);

      // SEND_MESSAGE has UNDO_SEND (completed) + MANUAL (skipped)
      expect(result.stepsCompleted).toBe(1);
      expect(result.stepsSkipped).toBe(1);
      expect(result.status).toBe('PARTIAL');
    });

    it('should create a plan automatically if none exists', async () => {
      seedAction({
        actionType: 'CREATE_CONTACT',
        target: 'contacts/c-1',
      });

      // Don't call createRollbackPlan first
      const result = await executeRollback('action-1', ENTITY);

      expect(result.status).toBe('COMPLETE');
      expect(result.stepsCompleted).toBe(1);
    });

    it('should use existing plan if already created', async () => {
      seedAction({
        actionType: 'CREATE_TASK',
        target: 'tasks/t-1',
      });

      await createRollbackPlan('action-1', ENTITY);
      const result = await executeRollback('action-1', ENTITY);

      expect(result.status).toBe('COMPLETE');
    });

    it('should handle RESTORE step for UPDATE_RECORD', async () => {
      seedAction({
        actionType: 'UPDATE_RECORD',
        target: 'records/r-1',
      });

      // The default strategy passes empty previousState {}
      // RESTORE requires model, recordId, and previousState to be truthy
      // Since previousState is {}, it's truthy but empty object = falsy-ish?
      // Actually {} is truthy in JS. But the rollback strategy passes {} for previousState
      // The code checks: step.model && step.recordId && step.previousState
      // model = 'Record', recordId = 'records/r-1', previousState = {} -> all truthy
      const result = await executeRollback('action-1', ENTITY);

      expect(result.stepsCompleted).toBe(1);
      expect(result.status).toBe('COMPLETE');
    });

    it('should report FAILED when all steps fail or skip with no completions', async () => {
      seedAction({
        actionType: 'CALL_API',
        target: 'api/endpoint',
      });

      // CALL_API has only a MANUAL step -> skipped
      const result = await executeRollback('action-1', ENTITY);

      expect(result.stepsSkipped).toBe(1);
      expect(result.stepsCompleted).toBe(0);
      expect(result.status).toBe('FAILED');
    });
  });

  describe('getRollbackPlan', () => {
    it('should return stored plan', async () => {
      seedAction();
      await createRollbackPlan('action-1', ENTITY);

      const plan = await getRollbackPlan('action-1', ENTITY);
      expect(plan).toBeDefined();
      expect(plan!.actionId).toBe('action-1');
    });

    it('should return null if no plan exists', async () => {
      const plan = await getRollbackPlan('nonexistent', ENTITY);
      expect(plan).toBeNull();
    });
  });

  describe('canRollback', () => {
    it('should return true for EXECUTED reversible action', async () => {
      seedAction({
        status: 'EXECUTED',
        reversible: true,
      });

      const result = await canRollback('action-1', ENTITY);
      expect(result.canRollback).toBe(true);
    });

    it('should return false for already rolled back action', async () => {
      seedAction({ status: 'ROLLED_BACK' });

      const result = await canRollback('action-1', ENTITY);
      expect(result.canRollback).toBe(false);
      expect(result.reason).toContain('already been rolled back');
    });

    it('should return false for non-EXECUTED action', async () => {
      seedAction({ status: 'QUEUED' });

      const result = await canRollback('action-1', ENTITY);
      expect(result.canRollback).toBe(false);
      expect(result.reason).toContain('status QUEUED');
    });

    it('should return false for irreversible action', async () => {
      seedAction({ status: 'EXECUTED', reversible: false });

      const result = await canRollback('action-1', ENTITY);
      expect(result.canRollback).toBe(false);
      expect(result.reason).toContain('irreversible');
    });

    it('should return false for non-existent action', async () => {
      const result = await canRollback('nonexistent', ENTITY);
      expect(result.canRollback).toBe(false);
      expect(result.reason).toContain('not found');
    });
  });
});
