// ============================================================================
// Workflow CRUD Service — Unit Tests
// Tests for createWorkflow, getWorkflow, updateWorkflow, deleteWorkflow,
// listWorkflows, duplicateWorkflow
// ============================================================================

// --- Mocks (must be defined before imports) ---

const mockWorkflowCreate = jest.fn();
const mockWorkflowFindUnique = jest.fn();
const mockWorkflowFindMany = jest.fn();
const mockWorkflowUpdate = jest.fn();
const mockWorkflowUpdateMany = jest.fn();
const mockWorkflowCount = jest.fn();
const mockSyncCronTriggers = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    workflow: {
      create: (...args: unknown[]) => mockWorkflowCreate(...args),
      // P-09 trap 1: the reads moved from findUnique to findFirst so the entity
      // can ride in the WHERE clause. Aliased, so a mock that only knows
      // findUnique cannot silently return undefined.
      findUnique: (...args: unknown[]) => mockWorkflowFindUnique(...args),
      findFirst: (...args: unknown[]) => mockWorkflowFindUnique(...args),
      findMany: (...args: unknown[]) => mockWorkflowFindMany(...args),
      update: (...args: unknown[]) => mockWorkflowUpdate(...args),
      // P-09: writes are updateMany with { id, entityId }; a unique WHERE
      // cannot carry the tenant.
      updateMany: (...args: unknown[]) => mockWorkflowUpdateMany(...args),
      count: (...args: unknown[]) => mockWorkflowCount(...args),
    },
  },
}));

// P-09 (P-11 finding 1): workflow-crud is now the cron PRODUCER, so a workflow
// carrying a TIME trigger reconciles BullMQ's repeat state on save. That is a
// Redis call; this suite is offline, so the producer is stubbed and asserted
// on directly.
jest.mock('@/lib/queue/scheduler', () => ({
  syncCronTriggers: (...args: unknown[]) => mockSyncCronTriggers(...args),
  cronExpressionsOf: jest.requireActual('@/lib/queue/scheduler').cronExpressionsOf,
}));

import {
  createWorkflow,
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
  listWorkflows,
  duplicateWorkflow,
} from '@/modules/workflows/services/workflow-crud';
import type { WorkflowGraph, TriggerNodeConfig } from '@/modules/workflows/types';
import { verifiedEntityIdForTest } from '../../helpers/factories';

const ENTITY = verifiedEntityIdForTest('ent-1');

// --- Helpers ---

function makeTriggerConfig(overrides?: Partial<TriggerNodeConfig>): TriggerNodeConfig {
  return {
    nodeType: 'TRIGGER',
    triggerType: 'MANUAL',
    ...overrides,
  };
}

function makeGraph(overrides?: Partial<WorkflowGraph>): WorkflowGraph {
  return {
    nodes: overrides?.nodes ?? [
      {
        id: 'node-1',
        type: 'TRIGGER',
        label: 'Start',
        config: makeTriggerConfig(),
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: ['node-2'],
      },
    ],
    edges: overrides?.edges ?? [],
  };
}

function makePrismaWorkflow(overrides: Partial<{
  id: string;
  name: string;
  entityId: string;
  triggers: unknown;
  steps: unknown;
  status: string;
  lastRun: Date | null;
  successRate: number;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  const now = new Date();
  return {
    id: overrides.id ?? 'wf-1',
    name: overrides.name ?? 'Test Workflow',
    entityId: overrides.entityId ?? 'ent-1',
    triggers: overrides.triggers ?? [{ type: 'MANUAL', config: { nodeType: 'TRIGGER', triggerType: 'MANUAL' } }],
    steps: overrides.steps ?? makeGraph(),
    status: overrides.status ?? 'DRAFT',
    lastRun: overrides.lastRun ?? null,
    successRate: overrides.successRate ?? 0,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

// --- Tests ---

describe('WorkflowCRUD', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkflowUpdateMany.mockResolvedValue({ count: 1 });
    mockSyncCronTriggers.mockResolvedValue({ registered: [], cleared: false });
  });

  // ─── createWorkflow ────────────────────────────────────

  describe('createWorkflow', () => {
    it('should create a workflow with required fields', async () => {
      const triggers: TriggerNodeConfig[] = [makeTriggerConfig()];
      const graph = makeGraph();
      const prismaRecord = makePrismaWorkflow();
      mockWorkflowCreate.mockResolvedValue(prismaRecord);

      const result = await createWorkflow({
        name: 'Test Workflow',
        graph,
        triggers,
      }, ENTITY);

      expect(result.id).toBe('wf-1');
      expect(result.name).toBe('Test Workflow');
      expect(result.entityId).toBe('ent-1');
      expect(result.status).toBe('DRAFT');
      expect(mockWorkflowCreate).toHaveBeenCalledTimes(1);
    });

    it('should set initial status to DRAFT', async () => {
      const triggers: TriggerNodeConfig[] = [makeTriggerConfig()];
      const graph = makeGraph();
      mockWorkflowCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'wf-new',
          ...data,
          lastRun: null,
          successRate: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      await createWorkflow({ name: 'New', graph, triggers }, ENTITY);

      expect(mockWorkflowCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DRAFT',
          }),
        })
      );
    });

    it('should map trigger configs to triggerData format', async () => {
      const triggers: TriggerNodeConfig[] = [
        makeTriggerConfig({ triggerType: 'TIME', cronExpression: '0 9 * * *' }),
      ];
      const graph = makeGraph();
      const prismaRecord = makePrismaWorkflow({
        triggers: [{ type: 'TIME', config: triggers[0] }],
      });
      mockWorkflowCreate.mockResolvedValue(prismaRecord);

      const result = await createWorkflow({
        name: 'Scheduled',
        graph,
        triggers,
      }, ENTITY);

      expect(result.triggers).toHaveLength(1);
      expect(mockWorkflowCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            triggers: expect.arrayContaining([
              expect.objectContaining({ type: 'TIME' }),
            ]),
          }),
        })
      );
    });

    it('should store the graph as steps in prisma', async () => {
      const triggers: TriggerNodeConfig[] = [makeTriggerConfig()];
      const graph = makeGraph();
      const prismaRecord = makePrismaWorkflow();
      mockWorkflowCreate.mockResolvedValue(prismaRecord);

      await createWorkflow({ name: 'With Graph', graph, triggers }, ENTITY);

      expect(mockWorkflowCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            steps: graph,
          }),
        })
      );
    });
  });

  // ─── getWorkflow ───────────────────────────────────────

  describe('getWorkflow', () => {
    it('should return mapped workflow when found', async () => {
      const prismaRecord = makePrismaWorkflow({ id: 'wf-42', name: 'Found Workflow' });
      mockWorkflowFindUnique.mockResolvedValue(prismaRecord);

      const result = await getWorkflow('wf-42', ENTITY);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('wf-42');
      expect(result!.name).toBe('Found Workflow');
      expect(result!.status).toBe('DRAFT');
    });

    it('should return null when workflow does not exist', async () => {
      mockWorkflowFindUnique.mockResolvedValue(null);

      const result = await getWorkflow('nonexistent', ENTITY);

      expect(result).toBeNull();
    });

    it('should map lastRun null to undefined', async () => {
      const prismaRecord = makePrismaWorkflow({ lastRun: null });
      mockWorkflowFindUnique.mockResolvedValue(prismaRecord);

      const result = await getWorkflow('wf-1', ENTITY);

      expect(result).not.toBeNull();
      expect(result!.lastRun).toBeUndefined();
    });

    it('should map lastRun when present', async () => {
      const lastRunDate = new Date('2026-01-15');
      const prismaRecord = makePrismaWorkflow({ lastRun: lastRunDate });
      mockWorkflowFindUnique.mockResolvedValue(prismaRecord);

      const result = await getWorkflow('wf-1', ENTITY);

      expect(result).not.toBeNull();
      expect(result!.lastRun).toEqual(lastRunDate);
    });
  });

  // ─── updateWorkflow ────────────────────────────────────

  describe('updateWorkflow', () => {
    it('should update name when provided', async () => {
      const updated = makePrismaWorkflow({ name: 'Updated Workflow' });
      mockWorkflowFindUnique.mockResolvedValue(updated);

      const result = await updateWorkflow('wf-1', { name: 'Updated Workflow' }, ENTITY);

      expect(result.name).toBe('Updated Workflow');
      // CORRECTED BY P-09. This assertion used to require
      // `update({ where: { id: 'wf-1' } })` -- a unique WHERE with no entity in
      // it, which is precisely the defect: anyone who knew a workflow id could
      // rewrite another tenant's automation. The tenant is in the WHERE now,
      // and the write is updateMany because a unique WHERE cannot carry it.
      expect(mockWorkflowUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wf-1', entityId: ENTITY },
          data: expect.objectContaining({ name: 'Updated Workflow' }),
        })
      );
    });

    it('should update status when provided', async () => {
      const updated = makePrismaWorkflow({ status: 'ACTIVE' });
      mockWorkflowFindUnique.mockResolvedValue(updated);

      const result = await updateWorkflow('wf-1', { status: 'ACTIVE' }, ENTITY);

      expect(result.status).toBe('ACTIVE');
    });

    it('should update graph (stored as steps)', async () => {
      const newGraph = makeGraph({
        nodes: [
          {
            id: 'node-new',
            type: 'TRIGGER',
            label: 'New Start',
            config: makeTriggerConfig(),
            position: { x: 100, y: 100 },
            inputs: [],
            outputs: [],
          },
        ],
        edges: [],
      });
      const updated = makePrismaWorkflow({ steps: newGraph });
      mockWorkflowFindUnique.mockResolvedValue(updated);

      await updateWorkflow('wf-1', { graph: newGraph }, ENTITY);

      expect(mockWorkflowUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            steps: newGraph,
          }),
        })
      );
    });

    it('should only include defined fields in update data', async () => {
      const updated = makePrismaWorkflow({ name: 'Only Name' });
      mockWorkflowFindUnique.mockResolvedValue(updated);

      await updateWorkflow('wf-1', { name: 'Only Name' }, ENTITY);

      const updateCall = mockWorkflowUpdateMany.mock.calls[0][0];
      expect(updateCall.data).toEqual({ name: 'Only Name' });
      expect(updateCall.data.status).toBeUndefined();
      expect(updateCall.data.steps).toBeUndefined();
      expect(updateCall.data.triggers).toBeUndefined();
    });

    it('should update triggers with mapped format', async () => {
      const newTriggers: TriggerNodeConfig[] = [
        makeTriggerConfig({ triggerType: 'EVENT', eventName: 'task.created' }),
      ];
      const updated = makePrismaWorkflow({
        triggers: [{ type: 'EVENT', config: newTriggers[0] }],
      });
      mockWorkflowFindUnique.mockResolvedValue(updated);

      await updateWorkflow('wf-1', { triggers: newTriggers }, ENTITY);

      expect(mockWorkflowUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            triggers: expect.arrayContaining([
              expect.objectContaining({ type: 'EVENT' }),
            ]),
          }),
        })
      );
    });
  });

  // ─── deleteWorkflow ────────────────────────────────────

  describe('deleteWorkflow', () => {
    it('should soft-delete by setting status to ARCHIVED', async () => {
      mockWorkflowFindUnique.mockResolvedValue(makePrismaWorkflow({ status: 'ARCHIVED' }));

      await deleteWorkflow('wf-1', ENTITY);

      // CORRECTED BY P-09: `where: { id }` alone let any caller archive any
      // tenant's workflow. The entity is in the WHERE now.
      expect(mockWorkflowUpdateMany).toHaveBeenCalledWith({
        where: { id: 'wf-1', entityId: ENTITY },
        data: { status: 'ARCHIVED' },
      });
    });

    it('should return void (no return value)', async () => {
      mockWorkflowFindUnique.mockResolvedValue(makePrismaWorkflow({ status: 'ARCHIVED' }));

      const result = await deleteWorkflow('wf-1', ENTITY);

      expect(result).toBeUndefined();
    });

    it("refuses to archive another tenant's workflow, and writes nothing", async () => {
      // The scoped updateMany matches no row: count === 0 is not-found.
      mockWorkflowUpdateMany.mockResolvedValue({ count: 0 });

      await expect(deleteWorkflow('wf-1', ENTITY)).rejects.toThrow('not found');
    });
  });

  // ─── listWorkflows ─────────────────────────────────────

  describe('listWorkflows', () => {
    const mockRecords = [
      makePrismaWorkflow({ id: 'wf-1', name: 'Workflow Alpha' }),
      makePrismaWorkflow({ id: 'wf-2', name: 'Workflow Beta' }),
    ];

    it('should return paginated workflow list', async () => {
      mockWorkflowFindMany.mockResolvedValue(mockRecords);
      mockWorkflowCount.mockResolvedValue(2);

      const result = await listWorkflows(ENTITY);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.data[0].name).toBe('Workflow Alpha');
    });

    it('should filter by status', async () => {
      mockWorkflowFindMany.mockResolvedValue([mockRecords[0]]);
      mockWorkflowCount.mockResolvedValue(1);

      const result = await listWorkflows(ENTITY, { status: 'DRAFT' });

      expect(result.data).toHaveLength(1);
      expect(mockWorkflowFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'DRAFT' }),
        })
      );
    });

    it('should apply pagination correctly', async () => {
      mockWorkflowFindMany.mockResolvedValue([mockRecords[1]]);
      mockWorkflowCount.mockResolvedValue(2);

      await listWorkflows(ENTITY, undefined, 2, 1);

      expect(mockWorkflowFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 1,  // (page 2 - 1) * pageSize 1
          take: 1,
        })
      );
    });

    it('should order by updatedAt descending', async () => {
      mockWorkflowFindMany.mockResolvedValue(mockRecords);
      mockWorkflowCount.mockResolvedValue(2);

      await listWorkflows(ENTITY);

      expect(mockWorkflowFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { updatedAt: 'desc' },
        })
      );
    });

    it('should return empty data when no workflows match', async () => {
      mockWorkflowFindMany.mockResolvedValue([]);
      mockWorkflowCount.mockResolvedValue(0);

      const result = await listWorkflows(ENTITY, { status: 'ACTIVE' });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should use default pagination values', async () => {
      mockWorkflowFindMany.mockResolvedValue(mockRecords);
      mockWorkflowCount.mockResolvedValue(2);

      await listWorkflows(ENTITY);

      expect(mockWorkflowFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,    // (1 - 1) * 20
          take: 20,   // default pageSize
        })
      );
    });
  });

  // ─── duplicateWorkflow ─────────────────────────────────

  describe('duplicateWorkflow', () => {
    it('should duplicate an existing workflow with a new name', async () => {
      const original = makePrismaWorkflow({
        id: 'wf-original',
        name: 'Original',
        entityId: 'ent-1',
        triggers: [{ type: 'MANUAL', config: { nodeType: 'TRIGGER', triggerType: 'MANUAL' } }],
        steps: makeGraph(),
        status: 'ACTIVE',
      });
      const duplicated = makePrismaWorkflow({
        id: 'wf-copy',
        name: 'Copy of Original',
        entityId: 'ent-1',
        triggers: original.triggers,
        steps: original.steps,
        status: 'DRAFT',
      });

      mockWorkflowFindUnique.mockResolvedValue(original);
      mockWorkflowCreate.mockResolvedValue(duplicated);

      const result = await duplicateWorkflow('wf-original', 'Copy of Original', ENTITY);

      expect(result.id).toBe('wf-copy');
      expect(result.name).toBe('Copy of Original');
      expect(result.status).toBe('DRAFT');
      expect(mockWorkflowCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Copy of Original',
            entityId: 'ent-1',
            status: 'DRAFT',
          }),
        })
      );
    });

    it('should throw when source workflow does not exist', async () => {
      mockWorkflowFindUnique.mockResolvedValue(null);

      await expect(
        duplicateWorkflow('nonexistent', 'Copy', ENTITY)
      ).rejects.toThrow('Workflow nonexistent not found');
    });

    it('should preserve triggers and steps from the original', async () => {
      const triggers = [
        { type: 'TIME', config: { nodeType: 'TRIGGER', triggerType: 'TIME', cronExpression: '0 9 * * *' } },
      ];
      const steps = makeGraph({
        nodes: [
          {
            id: 'n1',
            type: 'TRIGGER',
            label: 'Cron Start',
            config: makeTriggerConfig({ triggerType: 'TIME', cronExpression: '0 9 * * *' }),
            position: { x: 0, y: 0 },
            inputs: [],
            outputs: ['n2'],
          },
        ],
        edges: [{ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' }],
      });
      const original = makePrismaWorkflow({
        id: 'wf-src',
        triggers,
        steps,
      });
      const duplicated = makePrismaWorkflow({
        id: 'wf-dup',
        name: 'Duplicated',
        triggers,
        steps,
      });

      mockWorkflowFindUnique.mockResolvedValue(original);
      mockWorkflowCreate.mockResolvedValue(duplicated);

      await duplicateWorkflow('wf-src', 'Duplicated', ENTITY);

      expect(mockWorkflowCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            triggers: original.triggers,
            steps: original.steps,
          }),
        })
      );
    });

    it('should always set duplicate status to DRAFT regardless of original status', async () => {
      const original = makePrismaWorkflow({ id: 'wf-active', status: 'ACTIVE' });
      const duplicated = makePrismaWorkflow({ id: 'wf-dup', status: 'DRAFT' });

      mockWorkflowFindUnique.mockResolvedValue(original);
      mockWorkflowCreate.mockResolvedValue(duplicated);

      await duplicateWorkflow('wf-active', 'Active Copy', ENTITY);

      expect(mockWorkflowCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DRAFT',
          }),
        })
      );
    });
  });
});
