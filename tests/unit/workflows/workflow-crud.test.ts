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
const mockWorkflowCount = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    workflow: {
      create: (...args: unknown[]) => mockWorkflowCreate(...args),
      findUnique: (...args: unknown[]) => mockWorkflowFindUnique(...args),
      findMany: (...args: unknown[]) => mockWorkflowFindMany(...args),
      update: (...args: unknown[]) => mockWorkflowUpdate(...args),
      count: (...args: unknown[]) => mockWorkflowCount(...args),
    },
  },
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
        entityId: 'ent-1',
        graph,
        triggers,
      });

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

      await createWorkflow({ name: 'New', entityId: 'ent-1', graph, triggers });

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
        entityId: 'ent-1',
        graph,
        triggers,
      });

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

      await createWorkflow({ name: 'With Graph', entityId: 'ent-1', graph, triggers });

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

      const result = await getWorkflow('wf-42');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('wf-42');
      expect(result!.name).toBe('Found Workflow');
      expect(result!.status).toBe('DRAFT');
    });

    it('should return null when workflow does not exist', async () => {
      mockWorkflowFindUnique.mockResolvedValue(null);

      const result = await getWorkflow('nonexistent');

      expect(result).toBeNull();
    });

    it('should map lastRun null to undefined', async () => {
      const prismaRecord = makePrismaWorkflow({ lastRun: null });
      mockWorkflowFindUnique.mockResolvedValue(prismaRecord);

      const result = await getWorkflow('wf-1');

      expect(result).not.toBeNull();
      expect(result!.lastRun).toBeUndefined();
    });

    it('should map lastRun when present', async () => {
      const lastRunDate = new Date('2026-01-15');
      const prismaRecord = makePrismaWorkflow({ lastRun: lastRunDate });
      mockWorkflowFindUnique.mockResolvedValue(prismaRecord);

      const result = await getWorkflow('wf-1');

      expect(result).not.toBeNull();
      expect(result!.lastRun).toEqual(lastRunDate);
    });
  });

  // ─── updateWorkflow ────────────────────────────────────

  describe('updateWorkflow', () => {
    it('should update name when provided', async () => {
      const updated = makePrismaWorkflow({ name: 'Updated Workflow' });
      mockWorkflowUpdate.mockResolvedValue(updated);

      const result = await updateWorkflow('wf-1', { name: 'Updated Workflow' });

      expect(result.name).toBe('Updated Workflow');
      expect(mockWorkflowUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wf-1' },
          data: expect.objectContaining({ name: 'Updated Workflow' }),
        })
      );
    });

    it('should update status when provided', async () => {
      const updated = makePrismaWorkflow({ status: 'ACTIVE' });
      mockWorkflowUpdate.mockResolvedValue(updated);

      const result = await updateWorkflow('wf-1', { status: 'ACTIVE' });

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
      mockWorkflowUpdate.mockResolvedValue(updated);

      await updateWorkflow('wf-1', { graph: newGraph });

      expect(mockWorkflowUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            steps: newGraph,
          }),
        })
      );
    });

    it('should only include defined fields in update data', async () => {
      const updated = makePrismaWorkflow({ name: 'Only Name' });
      mockWorkflowUpdate.mockResolvedValue(updated);

      await updateWorkflow('wf-1', { name: 'Only Name' });

      const updateCall = mockWorkflowUpdate.mock.calls[0][0];
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
      mockWorkflowUpdate.mockResolvedValue(updated);

      await updateWorkflow('wf-1', { triggers: newTriggers });

      expect(mockWorkflowUpdate).toHaveBeenCalledWith(
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
      mockWorkflowUpdate.mockResolvedValue({});

      await deleteWorkflow('wf-1');

      expect(mockWorkflowUpdate).toHaveBeenCalledWith({
        where: { id: 'wf-1' },
        data: { status: 'ARCHIVED' },
      });
    });

    it('should return void (no return value)', async () => {
      mockWorkflowUpdate.mockResolvedValue({});

      const result = await deleteWorkflow('wf-1');

      expect(result).toBeUndefined();
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

      const result = await listWorkflows('ent-1');

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.data[0].name).toBe('Workflow Alpha');
    });

    it('should filter by status', async () => {
      mockWorkflowFindMany.mockResolvedValue([mockRecords[0]]);
      mockWorkflowCount.mockResolvedValue(1);

      const result = await listWorkflows('ent-1', { status: 'DRAFT' });

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

      await listWorkflows('ent-1', undefined, 2, 1);

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

      await listWorkflows('ent-1');

      expect(mockWorkflowFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { updatedAt: 'desc' },
        })
      );
    });

    it('should return empty data when no workflows match', async () => {
      mockWorkflowFindMany.mockResolvedValue([]);
      mockWorkflowCount.mockResolvedValue(0);

      const result = await listWorkflows('ent-1', { status: 'ACTIVE' });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should use default pagination values', async () => {
      mockWorkflowFindMany.mockResolvedValue(mockRecords);
      mockWorkflowCount.mockResolvedValue(2);

      await listWorkflows('ent-1');

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

      const result = await duplicateWorkflow('wf-original', 'Copy of Original');

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
        duplicateWorkflow('nonexistent', 'Copy')
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

      await duplicateWorkflow('wf-src', 'Duplicated');

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

      await duplicateWorkflow('wf-active', 'Active Copy');

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
