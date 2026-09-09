// Mock uuid ESM module
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

import {
  createRunbook,
  getRunbook,
  updateRunbook,
  deleteRunbook,
  listRunbooks,
  executeRunbook,
  getRunbookExecution,
  listRunbookExecutions,
  createFromTemplate,
  describeCronExpression,
  suggestRunbookSteps,
  validateRunbookWithAI,
  BUILTIN_TEMPLATES,
  _clearRunbookStores,
} from '../../../src/modules/execution/services/runbook-service';
import { _clearActionStore } from '../../../src/modules/execution/services/action-queue';
import { _clearGateStore } from '../../../src/modules/execution/services/execution-gate';
import { verifiedEntityIdForTest } from '../../helpers/factories';

const ENTITY = verifiedEntityIdForTest('entity-1');
const OTHER_ENTITY = verifiedEntityIdForTest('entity-2');

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

function mockMakeDb() {
  return {
    runbook: mockMakeTable('rb'),
    runbookExecution: mockMakeTable('rbx'),
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

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
  generateText: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
}));

describe('RunbookService', () => {
  beforeEach(async () => {
    await _clearRunbookStores();
    await _clearActionStore();
    await _clearGateStore();
    mockDb().actionLog.clear();
    mockDb().consentReceipt.clear();
  });

  const defaultRunbookParams = {
    name: 'Test Runbook',
    description: 'A test runbook',
    steps: [
      {
        order: 1,
        name: 'Step 1',
        description: 'First step',
        actionType: 'CREATE_TASK',
        parameters: { title: 'New Task' },
        requiresApproval: false,
        maxBlastRadius: 'LOW' as const,
        continueOnFailure: false,
      },
      {
        order: 2,
        name: 'Step 2',
        description: 'Second step',
        actionType: 'CREATE_CONTACT',
        parameters: { name: 'Alice' },
        requiresApproval: false,
        maxBlastRadius: 'LOW' as const,
        continueOnFailure: false,
      },
    ],
    tags: ['test', 'automation'],
    isActive: true,
    createdBy: 'user-1',
  };

  describe('createRunbook', () => {
    it('should create a runbook with generated ID and timestamps', async () => {
      const runbook = await createRunbook(defaultRunbookParams, ENTITY);

      expect(runbook.id).toBeDefined();
      expect(runbook.name).toBe('Test Runbook');
      expect(runbook.entityId).toBe('entity-1');
      expect(runbook.steps).toHaveLength(2);
      expect(runbook.tags).toEqual(['test', 'automation']);
      expect(runbook.isActive).toBe(true);
      expect(runbook.createdBy).toBe('user-1');
      expect(runbook.createdAt).toBeInstanceOf(Date);
      expect(runbook.updatedAt).toBeInstanceOf(Date);
    });

    it('should store the runbook for retrieval', async () => {
      const runbook = await createRunbook(defaultRunbookParams, ENTITY);
      const retrieved = await getRunbook(runbook.id, ENTITY);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(runbook.id);
      expect(retrieved!.name).toBe('Test Runbook');
    });
  });

  describe('getRunbook', () => {
    it('should return null for non-existent runbook', async () => {
      const result = await getRunbook('nonexistent', ENTITY);
      expect(result).toBeNull();
    });
  });

  describe('updateRunbook', () => {
    it('should update runbook fields while preserving ID and createdAt', async () => {
      const runbook = await createRunbook(defaultRunbookParams, ENTITY);
      const updated = await updateRunbook(runbook.id, {
        name: 'Updated Runbook',
        description: 'Updated description',
      }, ENTITY);

      expect(updated.id).toBe(runbook.id);
      expect(updated.name).toBe('Updated Runbook');
      expect(updated.description).toBe('Updated description');
      expect(updated.createdAt).toEqual(runbook.createdAt);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        runbook.updatedAt.getTime()
      );
    });

    it('should throw for non-existent runbook', async () => {
      await expect(
        updateRunbook('nonexistent', { name: 'X' }, ENTITY)
      ).rejects.toThrow('Runbook nonexistent not found');
    });
  });

  describe('deleteRunbook', () => {
    it('should delete an existing runbook', async () => {
      const runbook = await createRunbook(defaultRunbookParams, ENTITY);
      await deleteRunbook(runbook.id, ENTITY);

      const result = await getRunbook(runbook.id, ENTITY);
      expect(result).toBeNull();
    });

    it('should throw for non-existent runbook', async () => {
      await expect(deleteRunbook('nonexistent', ENTITY)).rejects.toThrow(
        'Runbook nonexistent not found'
      );
    });
  });

  describe('listRunbooks', () => {
    it('lists only the verified entity\'s runbooks', async () => {
      // The entity is a branded argument now, not a field on the draft, so a
      // caller cannot write into -- or read out of -- another tenant.
      await createRunbook(defaultRunbookParams, ENTITY);
      await createRunbook(defaultRunbookParams, OTHER_ENTITY);

      const result = await listRunbooks(ENTITY);
      expect(result).toHaveLength(1);
      expect(result[0].entityId).toBe(ENTITY);

      // Symmetry: a fix that denies everyone passes every other assertion here.
      const theirs = await listRunbooks(OTHER_ENTITY);
      expect(theirs).toHaveLength(1);
      expect(theirs[0].entityId).toBe(OTHER_ENTITY);
    });

    it("refuses to read, rewrite or delete another tenant's runbook", async () => {
      // Rewriting is the worst of the three: it changes what the automation
      // will do to their records the next time it runs.
      const theirs = await createRunbook(defaultRunbookParams, OTHER_ENTITY);

      expect(await getRunbook(theirs.id, ENTITY)).toBeNull();
      await expect(
        updateRunbook(theirs.id, { name: 'Hijacked' }, ENTITY)
      ).rejects.toThrow('not found');
      await expect(deleteRunbook(theirs.id, ENTITY)).rejects.toThrow('not found');

      const after = await getRunbook(theirs.id, OTHER_ENTITY);
      expect(after!.name).toBe('Test Runbook');
    });

    it("refuses to run another tenant's runbook", async () => {
      const theirs = await createRunbook(defaultRunbookParams, OTHER_ENTITY);

      await expect(executeRunbook(theirs.id, 'user-1', ENTITY)).rejects.toThrow(
        'not found'
      );

      expect(await listRunbookExecutions(theirs.id, OTHER_ENTITY)).toHaveLength(0);
    });

    it('should filter by isActive', async () => {
      await createRunbook({ ...defaultRunbookParams, isActive: true }, ENTITY);
      await createRunbook({ ...defaultRunbookParams, isActive: false }, ENTITY);

      const active = await listRunbooks(ENTITY, { isActive: true });
      expect(active).toHaveLength(1);
      expect(active[0].isActive).toBe(true);

      const inactive = await listRunbooks(ENTITY, { isActive: false });
      expect(inactive).toHaveLength(1);
      expect(inactive[0].isActive).toBe(false);
    });

    it('should filter by tag', async () => {
      await createRunbook({
        ...defaultRunbookParams,
        tags: ['finance', 'weekly'],
      }, ENTITY);
      await createRunbook({
        ...defaultRunbookParams,
        tags: ['onboarding'],
      }, ENTITY);

      const finance = await listRunbooks(ENTITY, { tag: 'finance' });
      expect(finance).toHaveLength(1);
      expect(finance[0].tags).toContain('finance');
    });

    it('should return empty for a different entity', async () => {
      await createRunbook(defaultRunbookParams, ENTITY);

      const result = await listRunbooks(OTHER_ENTITY);
      expect(result).toHaveLength(0);
    });
  });

  describe('executeRunbook', () => {
    it('should execute all steps sequentially', async () => {
      const runbook = await createRunbook(defaultRunbookParams, ENTITY);
      const execution = await executeRunbook(runbook.id, 'user-1', ENTITY);

      expect(execution.id).toBeDefined();
      expect(execution.runbookId).toBe(runbook.id);
      expect(execution.triggeredBy).toBe('user-1');
      expect(execution.startedAt).toBeInstanceOf(Date);

      // Both steps should complete (CREATE_TASK and CREATE_CONTACT are LOW blast radius)
      expect(execution.status).toBe('COMPLETED');
      expect(execution.completedAt).toBeInstanceOf(Date);

      // Step results
      expect(execution.stepResults).toHaveLength(2);
      expect(execution.stepResults[0].status).toBe('COMPLETED');
      expect(execution.stepResults[0].stepName).toBe('Step 1');
      expect(execution.stepResults[1].status).toBe('COMPLETED');
      expect(execution.stepResults[1].stepName).toBe('Step 2');

      // Each completed step should have an actionId
      expect(execution.stepResults[0].actionId).toBeDefined();
      expect(execution.stepResults[1].actionId).toBeDefined();
    });

    it('should pause when step requires approval', async () => {
      const runbook = await createRunbook({
        ...defaultRunbookParams,
        steps: [
          {
            order: 1,
            name: 'Auto Step',
            description: 'Auto',
            actionType: 'CREATE_TASK',
            parameters: {},
            requiresApproval: false,
            maxBlastRadius: 'LOW',
            continueOnFailure: false,
          },
          {
            order: 2,
            name: 'Approval Step',
            description: 'Needs approval',
            actionType: 'SEND_MESSAGE',
            parameters: { channel: 'EMAIL' },
            requiresApproval: true,
            maxBlastRadius: 'MEDIUM',
            continueOnFailure: false,
          },
        ],
      }, ENTITY);

      const execution = await executeRunbook(runbook.id, 'user-1', ENTITY);

      expect(execution.status).toBe('PAUSED');
      expect(execution.stepResults[0].status).toBe('COMPLETED');
      expect(execution.stepResults[1].status).toBe('AWAITING_APPROVAL');
    });

    it('should pause when blast radius exceeds step max', async () => {
      // BULK_SEND with recipients will have higher blast radius than LOW
      const runbook = await createRunbook({
        ...defaultRunbookParams,
        steps: [
          {
            order: 1,
            name: 'Bulk Send',
            description: 'Send to many',
            actionType: 'BULK_SEND',
            parameters: { recipientCount: 200, channel: 'EMAIL' },
            requiresApproval: false,
            maxBlastRadius: 'LOW', // very restrictive
            continueOnFailure: false,
          },
        ],
      }, ENTITY);

      const execution = await executeRunbook(runbook.id, 'user-1', ENTITY);

      // BULK_SEND with 200 recipients will score higher than LOW
      // The step maxBlastRadius is LOW, so it should pause
      expect(execution.status).toBe('PAUSED');
      expect(execution.stepResults[0].status).toBe('AWAITING_APPROVAL');
      expect(execution.stepResults[0].error).toContain('exceeds max');
    });

    it('should update runbook lastRunAt and lastRunStatus on completion', async () => {
      const runbook = await createRunbook(defaultRunbookParams, ENTITY);
      await executeRunbook(runbook.id, 'user-1', ENTITY);

      const updated = await getRunbook(runbook.id, ENTITY);
      expect(updated!.lastRunAt).toBeInstanceOf(Date);
      expect(updated!.lastRunStatus).toBe('SUCCESS');
    });

    it('should update runbook lastRunStatus to PARTIAL when paused', async () => {
      const runbook = await createRunbook({
        ...defaultRunbookParams,
        steps: [
          {
            order: 1,
            name: 'Approval Step',
            description: 'Needs approval',
            actionType: 'CREATE_TASK',
            parameters: {},
            requiresApproval: true,
            maxBlastRadius: 'LOW',
            continueOnFailure: false,
          },
        ],
      }, ENTITY);

      await executeRunbook(runbook.id, 'user-1', ENTITY);

      const updated = await getRunbook(runbook.id, ENTITY);
      expect(updated!.lastRunStatus).toBe('PARTIAL');
    });

    it('should throw for non-existent runbook', async () => {
      await expect(executeRunbook('nonexistent', 'user-1', ENTITY)).rejects.toThrow(
        'Runbook nonexistent not found'
      );
    });
  });

  describe('getRunbookExecution', () => {
    it('should return execution by ID', async () => {
      const runbook = await createRunbook(defaultRunbookParams, ENTITY);
      const execution = await executeRunbook(runbook.id, 'user-1', ENTITY);

      const found = await getRunbookExecution(execution.id, ENTITY);
      expect(found).toBeDefined();
      expect(found!.id).toBe(execution.id);
    });

    it('should return null for non-existent execution', async () => {
      const found = await getRunbookExecution('nonexistent', ENTITY);
      expect(found).toBeNull();
    });
  });

  describe('listRunbookExecutions', () => {
    it('should list executions for a runbook', async () => {
      const runbook = await createRunbook(defaultRunbookParams, ENTITY);
      await executeRunbook(runbook.id, 'user-1', ENTITY);
      await executeRunbook(runbook.id, 'user-2', ENTITY);

      const executions = await listRunbookExecutions(runbook.id, ENTITY);

      expect(executions).toHaveLength(2);
      // Should be sorted by startedAt descending
      expect(executions[0].startedAt.getTime()).toBeGreaterThanOrEqual(
        executions[1].startedAt.getTime()
      );
    });

    it('should return empty for runbook with no executions', async () => {
      const executions = await listRunbookExecutions('nonexistent', ENTITY);
      expect(executions).toHaveLength(0);
    });
  });

  describe('createFromTemplate', () => {
    it('should create runbook from template index 0 (Weekly CFO Pack)', async () => {
      const runbook = await createFromTemplate(0, ENTITY, 'user-1');

      expect(runbook.name).toBe('Weekly CFO Pack');
      expect(runbook.entityId).toBe('entity-1');
      expect(runbook.createdBy).toBe('user-1');
      expect(runbook.steps.length).toBe(BUILTIN_TEMPLATES[0].steps.length);
      expect(runbook.tags).toEqual(BUILTIN_TEMPLATES[0].tags);
    });

    it('should create runbook from template index 1 (Client Onboarding)', async () => {
      const runbook = await createFromTemplate(1, ENTITY, 'user-1');

      expect(runbook.name).toBe('Client Onboarding');
      expect(runbook.steps.length).toBe(BUILTIN_TEMPLATES[1].steps.length);
    });

    it('should create runbook from template index 2 (Close the Loop Fridays)', async () => {
      const runbook = await createFromTemplate(2, ENTITY, 'user-1');

      expect(runbook.name).toBe('Close the Loop Fridays');
      expect(runbook.schedule).toBe('0 9 * * 5');
    });

    it('should throw for invalid template index', async () => {
      await expect(
        createFromTemplate(99, ENTITY, 'user-1')
      ).rejects.toThrow('Template index 99 not found');
    });
  });

  describe('describeCronExpression', () => {
    it('should describe weekly schedule', () => {
      // Monday at 9:00
      expect(describeCronExpression('0 9 * * 1')).toBe(
        'Every Monday at 9:00'
      );
    });

    it('should describe Friday schedule', () => {
      expect(describeCronExpression('0 9 * * 5')).toBe(
        'Every Friday at 9:00'
      );
    });

    it('should describe daily schedule', () => {
      expect(describeCronExpression('30 8 * * *')).toBe(
        'Daily at 8:30'
      );
    });

    it('should describe monthly schedule', () => {
      expect(describeCronExpression('0 10 15 * *')).toBe(
        'Day 15 of every month at 10:00'
      );
    });

    it('should return raw expression for invalid format', () => {
      expect(describeCronExpression('invalid')).toBe('invalid');
    });

    it('should pad minutes correctly', () => {
      expect(describeCronExpression('5 9 * * 1')).toBe(
        'Every Monday at 9:05'
      );
    });
  });

  describe('BUILTIN_TEMPLATES', () => {
    it('should have 3 built-in templates', () => {
      expect(BUILTIN_TEMPLATES).toHaveLength(3);
    });

    it('should have valid step structures', () => {
      for (const template of BUILTIN_TEMPLATES) {
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.steps.length).toBeGreaterThan(0);
        expect(template.tags.length).toBeGreaterThan(0);

        for (const step of template.steps) {
          expect(step.order).toBeGreaterThan(0);
          expect(step.name).toBeDefined();
          expect(step.actionType).toBeDefined();
          expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(
            step.maxBlastRadius
          );
        }
      }
    });
  });

  describe('suggestRunbookSteps with AI', () => {
    const { generateJSON } = jest.requireMock('@/lib/ai') as { generateJSON: jest.Mock };

    beforeEach(() => {
      generateJSON.mockReset();
    });

    it('should use AI for step suggestions', async () => {
      generateJSON.mockResolvedValueOnce({
        steps: [
          { name: 'Pre-check', description: 'Validate inputs', actionType: 'AI_ANALYSIS', requiresApproval: false, maxBlastRadius: 'LOW' },
          { name: 'Execute', description: 'Run the action', actionType: 'CREATE_TASK', requiresApproval: true, maxBlastRadius: 'MEDIUM' },
        ],
      });

      const steps = await suggestRunbookSteps({
        actionType: 'CREATE_TASK',
        description: 'Create a new task',
        entityId: 'entity-1',
      });

      expect(generateJSON).toHaveBeenCalled();
      expect(steps.length).toBe(2);
      expect(steps[0].name).toBe('Pre-check');
      expect(steps[0].order).toBe(1);
      expect(steps[1].order).toBe(2);
    });

    it('should fall back to existing logic on AI failure', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const steps = await suggestRunbookSteps({
        actionType: 'CREATE_TASK',
        description: 'Create a new task',
        entityId: 'entity-1',
      });

      expect(steps.length).toBe(1);
      expect(steps[0].requiresApproval).toBe(true);
    });
  });

  describe('validateRunbookWithAI', () => {
    const { generateJSON } = jest.requireMock('@/lib/ai') as { generateJSON: jest.Mock };

    beforeEach(() => {
      generateJSON.mockReset();
    });

    it('should validate a runbook with AI suggestions', async () => {
      generateJSON.mockResolvedValueOnce({
        valid: false,
        suggestions: ['Add a pre-validation step', 'Enable approval for step 2'],
      });

      const runbook = await createRunbook(defaultRunbookParams, ENTITY);
      const validation = await validateRunbookWithAI(runbook);

      expect(generateJSON).toHaveBeenCalled();
      expect(validation.valid).toBe(false);
      expect(validation.suggestions.length).toBe(2);
    });

    it('should return valid with no suggestions on AI failure', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const runbook = await createRunbook(defaultRunbookParams, ENTITY);
      const validation = await validateRunbookWithAI(runbook);

      expect(validation.valid).toBe(true);
      expect(validation.suggestions).toEqual([]);
    });
  });
});
