/**
 * Integration Test: Workflow Execution
 * Tests cross-module interactions: trigger -> evaluate -> execute -> log results
 *
 * Services under test:
 * - workflow-crud.ts (createWorkflow, getWorkflow)
 * - workflow-executor.ts (executeWorkflow, getNextNodes)
 * - condition-evaluator.ts (evaluateExpression)
 */

// --- Infrastructure mocks ---


// ---------------------------------------------------------------------------
// P-09: WorkflowExecutionRecord is a TABLE now, not a module-level Map.
// This suite runs offline, so the table gets a small in-memory double that
// answers the same delegate calls the executor makes. A delegate or field name
// that does not exist still fails here -- which is the whole point of moving
// off a `Map` and onto a schema.
// ---------------------------------------------------------------------------

type MockRow = Record<string, unknown>;

const mockExecutionRows = new Map<string, MockRow>();
let mockExecutionSeq = 0;

function mockRowMatches(row: MockRow, where: MockRow): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

const mockExecutionRecordDelegate = {
  create: async (args: { data: MockRow }) => {
    const id = (args.data.id as string) ?? `rec-${(mockExecutionSeq += 1)}`;
    const row: MockRow = {
      completedAt: null,
      currentNodeId: null,
      error: null,
      startedAt: new Date(),
      variables: {},
      stepResults: [],
      ...args.data,
      id,
    };
    mockExecutionRows.set(id, row);
    return { ...row };
  },
  findUnique: async (args: { where: { id: string } }) => {
    const row = mockExecutionRows.get(args.where.id);
    return row ? { ...row } : null;
  },
  findMany: async (args?: { where?: MockRow }) =>
    Array.from(mockExecutionRows.values())
      .filter((r) => mockRowMatches(r, args?.where ?? {}))
      .map((r) => ({ ...r })),
  count: async (args?: { where?: MockRow }) =>
    Array.from(mockExecutionRows.values()).filter((r) => mockRowMatches(r, args?.where ?? {}))
      .length,
  updateMany: async (args: { where: MockRow; data: MockRow }) => {
    let count = 0;
    for (const [id, row] of mockExecutionRows) {
      if (mockRowMatches(row, args.where)) {
        mockExecutionRows.set(id, { ...row, ...args.data });
        count += 1;
      }
    }
    return { count };
  },
  upsert: async (args: { where: { id: string }; create: MockRow; update: MockRow }) => {
    const existing = mockExecutionRows.get(args.where.id);
    const row = existing ? { ...existing, ...args.update } : { ...args.create };
    mockExecutionRows.set(args.where.id, row);
    return { ...row };
  },
  deleteMany: async () => {
    const count = mockExecutionRows.size;
    mockExecutionRows.clear();
    return { count };
  },
};

const mockPrisma = {
  workflow: {
    create: jest.fn(),
    findUnique: jest.fn(),
    // P-09 trap 1: the scoped reads use findFirst so the entity rides in the
    // WHERE clause. Aliased so the double cannot answer undefined in silence.
    findFirst: (...args: unknown[]) => mockPrisma.workflow.findUnique(...args),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  workflowExecutionRecord: mockExecutionRecordDelegate,
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
  generateJSON: jest.fn(),
  chat: jest.fn(),
  streamText: jest.fn(),
}));

jest.mock('@/modules/workflows/services/action-handlers', () => ({
  executeAction: jest.fn().mockResolvedValue({ success: true, result: 'action-completed' }),
}));

jest.mock('@/modules/workflows/services/ai-decision-service', () => ({
  executeAIDecision: jest.fn().mockResolvedValue({
    decision: 'APPROVE',
    confidence: 0.9,
    requiresHumanReview: false,
  }),
}));

jest.mock('@/modules/workflows/services/approval-service', () => ({
  requestApproval: jest.fn().mockResolvedValue({
    approvalId: 'approval-1',
    status: 'PENDING',
  }),
}));

jest.mock('@/lib/queue/workflow-queue', () => ({
  enqueueWorkflowExecution: jest.fn().mockResolvedValue(undefined),
}));

import { createWorkflow, getWorkflow } from '@/modules/workflows/services/workflow-crud';
import {
  executeWorkflow,
  getNextNodes,
  clearExecutionStore,
} from '@/modules/workflows/services/workflow-executor';
import { evaluateExpression } from '@/modules/workflows/services/condition-evaluator';
import { executeAction } from '@/modules/workflows/services/action-handlers';
import type { WorkflowGraph, WorkflowNode, WorkflowEdge } from '@/modules/workflows/types';
import { verifiedEntityIdForTest } from '../helpers/factories';

const ENTITY = verifiedEntityIdForTest('ent-1');

const mockedExecuteAction = executeAction as jest.MockedFunction<typeof executeAction>;

// --- Test helpers ---

function makeNode(
  id: string,
  nodeType: string,
  label: string,
  config: Record<string, unknown> = {}
): WorkflowNode {
  return {
    id,
    type: nodeType as WorkflowNode['type'],
    label,
    config: { nodeType, ...config } as WorkflowNode['config'],
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
  };
}

function makeEdge(sourceNodeId: string, targetNodeId: string, label?: string): WorkflowEdge {
  return {
    id: `edge-${sourceNodeId}-${targetNodeId}`,
    sourceNodeId,
    targetNodeId,
    label,
  };
}

describe('Workflow Execution Integration Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await clearExecutionStore();
  });

  describe('Simple workflow execution', () => {
    it('should execute a workflow with one trigger and one action, logging the result', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          makeNode('trigger-1', 'TRIGGER', 'On New Message', { triggerType: 'EVENT', eventName: 'message.received' }),
          makeNode('action-1', 'ACTION', 'Send Notification', {
            actionType: 'SEND_NOTIFICATION',
            parameters: { channel: 'slack', message: 'New message received' },
          }),
        ],
        edges: [makeEdge('trigger-1', 'action-1')],
      };

      // Mock workflow in DB
      const workflowRecord = {
        id: 'wf-1',
        name: 'Simple Notification',
        entityId: 'entity-1',
        triggers: [{ type: 'EVENT', config: { triggerType: 'EVENT', eventName: 'message.received' } }],
        steps: graph,
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.workflow.findUnique.mockResolvedValue(workflowRecord);
      mockPrisma.workflow.update.mockResolvedValue(workflowRecord);

      const execution = await executeWorkflow('wf-1', 'system', 'EVENT', ENTITY);

      expect(execution.workflowId).toBe('wf-1');
      expect(execution.status).toBe('COMPLETED');
      expect(execution.stepResults.length).toBe(2); // trigger + action
      expect(execution.stepResults[0].status).toBe('COMPLETED');
      expect(execution.stepResults[1].status).toBe('COMPLETED');

      // Verify action was executed
      expect(mockedExecuteAction).toHaveBeenCalledWith(
        'SEND_NOTIFICATION',
        expect.objectContaining({ channel: 'slack' })
      );

      // Verify workflow was updated with lastRun
      // CORRECTED BY P-09: `where: { id }` alone carried no tenant, so the
      // write was reachable for any workflow id. The entity is in the WHERE.
      expect(mockPrisma.workflow.updateMany).toHaveBeenCalledWith({
        where: { id: 'wf-1', entityId: ENTITY },
        data: expect.objectContaining({
          lastRun: expect.any(Date),
          successRate: expect.any(Number),
        }),
      });
    });
  });

  describe('Multi-step workflow', () => {
    it('should execute 3 sequential steps in order', async () => {
      const executionOrder: string[] = [];

      mockedExecuteAction.mockImplementation(async (actionType: string) => {
        executionOrder.push(actionType);
        return { success: true, result: `${actionType} completed` };
      });

      const graph: WorkflowGraph = {
        nodes: [
          makeNode('trigger-1', 'TRIGGER', 'Start', { triggerType: 'MANUAL' }),
          makeNode('action-1', 'ACTION', 'Step 1: Create Task', {
            actionType: 'CREATE_TASK',
            parameters: { title: 'New task' },
          }),
          makeNode('action-2', 'ACTION', 'Step 2: Send Message', {
            actionType: 'SEND_MESSAGE',
            parameters: { message: 'Task created' },
          }),
          makeNode('action-3', 'ACTION', 'Step 3: Log Financial', {
            actionType: 'LOG_FINANCIAL',
            parameters: { amount: 100 },
          }),
        ],
        edges: [
          makeEdge('trigger-1', 'action-1'),
          makeEdge('action-1', 'action-2'),
          makeEdge('action-2', 'action-3'),
        ],
      };

      const workflowRecord = {
        id: 'wf-2',
        name: 'Multi-step Workflow',
        entityId: 'entity-1',
        triggers: [{ type: 'MANUAL', config: {} }],
        steps: graph,
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.workflow.findUnique.mockResolvedValue(workflowRecord);
      mockPrisma.workflow.update.mockResolvedValue(workflowRecord);

      const execution = await executeWorkflow('wf-2', 'user-1', 'MANUAL', ENTITY);

      expect(execution.status).toBe('COMPLETED');
      expect(execution.stepResults).toHaveLength(4); // trigger + 3 actions

      // Verify order of execution
      expect(executionOrder).toEqual(['CREATE_TASK', 'SEND_MESSAGE', 'LOG_FINANCIAL']);

      // All steps completed
      expect(execution.stepResults.every((s) => s.status === 'COMPLETED')).toBe(true);
    });
  });

  describe('Conditional execution', () => {
    it('should execute true branch when condition is met', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          makeNode('trigger-1', 'TRIGGER', 'Start', { triggerType: 'MANUAL' }),
          makeNode('condition-1', 'CONDITION', 'Check Amount', {
            expression: 'amount > 1000',
            trueOutputId: 'action-true',
            falseOutputId: 'action-false',
          }),
          makeNode('action-true', 'ACTION', 'High Value Alert', {
            actionType: 'SEND_NOTIFICATION',
            parameters: { message: 'High value detected' },
          }),
          makeNode('action-false', 'ACTION', 'Standard Processing', {
            actionType: 'LOG_FINANCIAL',
            parameters: { message: 'Standard amount' },
          }),
        ],
        edges: [
          makeEdge('trigger-1', 'condition-1'),
          makeEdge('condition-1', 'action-true', 'TRUE'),
          makeEdge('condition-1', 'action-false', 'FALSE'),
        ],
      };

      const workflowRecord = {
        id: 'wf-3',
        name: 'Conditional Workflow',
        entityId: 'entity-1',
        triggers: [{ type: 'MANUAL', config: {} }],
        steps: graph,
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.workflow.findUnique.mockResolvedValue(workflowRecord);
      mockPrisma.workflow.update.mockResolvedValue(workflowRecord);

      // Execute with amount > 1000 (meets condition)
      const execution = await executeWorkflow('wf-3', 'user-1', 'MANUAL', ENTITY, { amount: 5000 });

      expect(execution.status).toBe('COMPLETED');

      // Condition should evaluate to true
      const conditionResult = execution.stepResults.find((s) => s.nodeId === 'condition-1');
      expect(conditionResult?.output.result).toBe(true);

      // True branch should have executed
      expect(mockedExecuteAction).toHaveBeenCalledWith(
        'SEND_NOTIFICATION',
        expect.objectContaining({ message: 'High value detected' })
      );
    });

    it('should execute false branch when condition is not met', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          makeNode('trigger-1', 'TRIGGER', 'Start', { triggerType: 'MANUAL' }),
          makeNode('condition-1', 'CONDITION', 'Check Amount', {
            expression: 'amount > 1000',
            trueOutputId: 'action-true',
            falseOutputId: 'action-false',
          }),
          makeNode('action-true', 'ACTION', 'High Value Alert', {
            actionType: 'SEND_NOTIFICATION',
            parameters: { message: 'High value' },
          }),
          makeNode('action-false', 'ACTION', 'Standard Processing', {
            actionType: 'LOG_FINANCIAL',
            parameters: { message: 'Standard' },
          }),
        ],
        edges: [
          makeEdge('trigger-1', 'condition-1'),
          makeEdge('condition-1', 'action-true', 'TRUE'),
          makeEdge('condition-1', 'action-false', 'FALSE'),
        ],
      };

      const workflowRecord = {
        id: 'wf-3b',
        name: 'Conditional Workflow',
        entityId: 'entity-1',
        triggers: [{ type: 'MANUAL', config: {} }],
        steps: graph,
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.workflow.findUnique.mockResolvedValue(workflowRecord);
      mockPrisma.workflow.update.mockResolvedValue(workflowRecord);

      // Execute with amount < 1000 (does NOT meet condition)
      const execution = await executeWorkflow('wf-3b', 'user-1', 'MANUAL', ENTITY, { amount: 50 });

      expect(execution.status).toBe('COMPLETED');

      // Condition should evaluate to false
      const conditionResult = execution.stepResults.find((s) => s.nodeId === 'condition-1');
      expect(conditionResult?.output.result).toBe(false);

      // False branch should have executed
      expect(mockedExecuteAction).toHaveBeenCalledWith(
        'LOG_FINANCIAL',
        expect.objectContaining({ message: 'Standard' })
      );
    });

    it('should verify the condition evaluator directly with context variables', () => {
      // Test expression evaluation with different contexts
      expect(evaluateExpression('score > 80', { score: 95 })).toBe(true);
      expect(evaluateExpression('score > 80', { score: 50 })).toBe(false);
      expect(evaluateExpression('status == "active"', { status: 'active' })).toBe(true);
      expect(evaluateExpression('amount >= 100 && priority == "HIGH"', { amount: 200, priority: 'HIGH' })).toBe(true);
      expect(evaluateExpression('amount >= 100 && priority == "HIGH"', { amount: 200, priority: 'LOW' })).toBe(false);
    });
  });

  describe('Workflow failure handling', () => {
    it('should log error and fail when a step throws without error handler', async () => {
      mockedExecuteAction.mockRejectedValueOnce(new Error('External API down'));

      const graph: WorkflowGraph = {
        nodes: [
          makeNode('trigger-1', 'TRIGGER', 'Start', { triggerType: 'MANUAL' }),
          makeNode('action-1', 'ACTION', 'Call External API', {
            actionType: 'CALL_API',
            parameters: { url: 'https://api.example.com' },
          }),
          makeNode('action-2', 'ACTION', 'Post-Processing', {
            actionType: 'UPDATE_RECORD',
            parameters: { status: 'processed' },
          }),
        ],
        edges: [
          makeEdge('trigger-1', 'action-1'),
          makeEdge('action-1', 'action-2'),
        ],
      };

      const workflowRecord = {
        id: 'wf-4',
        name: 'Failing Workflow',
        entityId: 'entity-1',
        triggers: [{ type: 'MANUAL', config: {} }],
        steps: graph,
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.workflow.findUnique.mockResolvedValue(workflowRecord);
      mockPrisma.workflow.update.mockResolvedValue(workflowRecord);

      const execution = await executeWorkflow('wf-4', 'user-1', 'MANUAL', ENTITY);

      // Execution should be marked as failed
      expect(execution.status).toBe('FAILED');
      expect(execution.error).toBeTruthy();

      // The failed step should have an error
      const failedStep = execution.stepResults.find((s) => s.nodeId === 'action-1');
      expect(failedStep?.status).toBe('FAILED');
      expect(failedStep?.error).toContain('External API down');

      // The subsequent step should NOT have executed
      const postStep = execution.stepResults.find((s) => s.nodeId === 'action-2');
      expect(postStep).toBeUndefined();
    });

    it('should route to error handler node when a step fails and handler exists', async () => {
      mockedExecuteAction
        .mockRejectedValueOnce(new Error('Step failed'))
        .mockResolvedValueOnce({ success: true, handled: true });

      const graph: WorkflowGraph = {
        nodes: [
          makeNode('trigger-1', 'TRIGGER', 'Start', { triggerType: 'MANUAL' }),
          makeNode('action-1', 'ACTION', 'Risky Action', {
            actionType: 'CALL_API',
            parameters: {},
          }),
          makeNode('error-handler', 'ERROR_HANDLER', 'Handle Error', {
            errorTypes: ['*'],
            notifyOnError: true,
          }),
        ],
        edges: [
          makeEdge('trigger-1', 'action-1'),
          makeEdge('action-1', 'error-handler', 'ERROR'),
        ],
      };

      const workflowRecord = {
        id: 'wf-5',
        name: 'Workflow with Error Handler',
        entityId: 'entity-1',
        triggers: [{ type: 'MANUAL', config: {} }],
        steps: graph,
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.workflow.findUnique.mockResolvedValue(workflowRecord);
      mockPrisma.workflow.update.mockResolvedValue(workflowRecord);

      const execution = await executeWorkflow('wf-5', 'user-1', 'MANUAL', ENTITY);

      // Even though a step failed, the error handler ran so the workflow completes
      expect(execution.status).toBe('COMPLETED');

      // The error handler node should have been executed
      const errorHandlerResult = execution.stepResults.find((s) => s.nodeId === 'error-handler');
      expect(errorHandlerResult).toBeDefined();
      expect(errorHandlerResult?.status).toBe('COMPLETED');
      expect(errorHandlerResult?.output.handled).toBe(true);
    });
  });

  describe('getNextNodes helper', () => {
    it('should return correct nodes for linear and conditional flows', () => {
      const graph: WorkflowGraph = {
        nodes: [
          makeNode('a', 'ACTION', 'Step A', { actionType: 'SEND_MESSAGE', parameters: {} }),
          makeNode('b', 'ACTION', 'Step B', { actionType: 'UPDATE_RECORD', parameters: {} }),
          makeNode('c', 'CONDITION', 'Check', {
            expression: 'x > 5',
            trueOutputId: 'yes',
            falseOutputId: 'no',
          }),
          makeNode('yes', 'ACTION', 'Yes Branch', { actionType: 'SEND_NOTIFICATION', parameters: {} }),
          makeNode('no', 'ACTION', 'No Branch', { actionType: 'LOG_FINANCIAL', parameters: {} }),
        ],
        edges: [
          makeEdge('a', 'b'),
          makeEdge('b', 'c'),
          makeEdge('c', 'yes'),
          makeEdge('c', 'no'),
        ],
      };

      // Linear: A -> B
      const nextFromA = getNextNodes(graph, 'a');
      expect(nextFromA.map((n) => n.id)).toEqual(['b']);

      // Condition: true -> yes
      const nextFromCondTrue = getNextNodes(graph, 'c', true);
      expect(nextFromCondTrue.map((n) => n.id)).toEqual(['yes']);

      // Condition: false -> no
      const nextFromCondFalse = getNextNodes(graph, 'c', false);
      expect(nextFromCondFalse.map((n) => n.id)).toEqual(['no']);
    });
  });
});
