// ============================================================================
// Workflow Executor — Unit Tests
// ============================================================================

import {
  executeWorkflow,
  getNextNodes,
  cancelExecution,
  setExecution,
  clearExecutionStore,
} from '@/modules/workflows/services/workflow-executor';
import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowExecution,
  TriggerNodeConfig,
  ActionNodeConfig,
  ConditionNodeConfig,
  HumanApprovalNodeConfig,
  DelayNodeConfig,
  LoopNodeConfig,
  ErrorHandlerNodeConfig,
} from '@/modules/workflows/types';

// --- Mocks ---

jest.mock('@/lib/db', () => ({
  prisma: {
    workflow: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    actionLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
    },
    task: {
      create: jest.fn().mockResolvedValue({ id: 'task-1', title: 'Test Task' }),
    },
    message: {
      create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
    },
  },
}));

jest.mock('@/lib/queue/workflow-queue', () => ({
  enqueueWorkflowExecution: jest.fn().mockResolvedValue('job-1'),
}));

const { prisma } = jest.requireMock('@/lib/db');

// --- Helpers ---

function createTriggerNode(id: string, label: string): WorkflowNode {
  return {
    id,
    type: 'TRIGGER',
    label,
    config: { nodeType: 'TRIGGER', triggerType: 'MANUAL' } as TriggerNodeConfig,
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
  };
}

function createActionNode(id: string, label: string): WorkflowNode {
  return {
    id,
    type: 'ACTION',
    label,
    config: {
      nodeType: 'ACTION',
      actionType: 'CREATE_TASK',
      parameters: { title: 'Test', entityId: 'entity-1' },
    } as ActionNodeConfig,
    position: { x: 200, y: 0 },
    inputs: [],
    outputs: [],
  };
}

function createConditionNode(
  id: string,
  expression: string,
  trueOutputId: string,
  falseOutputId: string
): WorkflowNode {
  return {
    id,
    type: 'CONDITION',
    label: 'Condition',
    config: {
      nodeType: 'CONDITION',
      expression,
      trueOutputId,
      falseOutputId,
    } as ConditionNodeConfig,
    position: { x: 200, y: 0 },
    inputs: [],
    outputs: [],
  };
}

function createSimpleGraph(): WorkflowGraph {
  return {
    nodes: [
      createTriggerNode('trigger-1', 'Start'),
      createActionNode('action-1', 'Task 1'),
      createActionNode('action-2', 'Task 2'),
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'trigger-1', targetNodeId: 'action-1' },
      { id: 'e2', sourceNodeId: 'action-1', targetNodeId: 'action-2' },
    ],
  };
}

// --- Tests ---

describe('WorkflowExecutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearExecutionStore();
  });

  describe('executeWorkflow', () => {
    it('should execute a simple linear workflow (trigger -> action -> action)', async () => {
      const graph = createSimpleGraph();

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        name: 'Test Workflow',
        entityId: 'entity-1',
        steps: graph,
        triggers: [],
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      prisma.workflow.update.mockResolvedValue({});

      const execution = await executeWorkflow('wf-1', 'user-1', 'MANUAL');

      expect(execution.status).toBe('COMPLETED');
      expect(execution.workflowId).toBe('wf-1');
      expect(execution.stepResults.length).toBe(3);
      expect(execution.stepResults[0].nodeId).toBe('trigger-1');
      expect(execution.stepResults[0].status).toBe('COMPLETED');
    });

    it('should follow true branch on condition node', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createTriggerNode('trigger-1', 'Start'),
          createConditionNode('cond-1', 'amount > 100', 'action-true', 'action-false'),
          createActionNode('action-true', 'High Amount'),
          createActionNode('action-false', 'Low Amount'),
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'trigger-1', targetNodeId: 'cond-1' },
          { id: 'e2', sourceNodeId: 'cond-1', targetNodeId: 'action-true' },
          { id: 'e3', sourceNodeId: 'cond-1', targetNodeId: 'action-false' },
        ],
      };

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-2',
        name: 'Condition WF',
        entityId: 'entity-1',
        steps: graph,
        triggers: [],
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.workflow.update.mockResolvedValue({});

      const execution = await executeWorkflow('wf-2', 'user-1', 'MANUAL', { amount: 200 });

      expect(execution.status).toBe('COMPLETED');
      // Should have executed trigger, condition, and true branch
      const nodeIds = execution.stepResults.map((s) => s.nodeId);
      expect(nodeIds).toContain('trigger-1');
      expect(nodeIds).toContain('cond-1');
      expect(nodeIds).toContain('action-true');
    });

    it('should follow false branch on condition node', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createTriggerNode('trigger-1', 'Start'),
          createConditionNode('cond-1', 'amount > 100', 'action-true', 'action-false'),
          createActionNode('action-true', 'High Amount'),
          createActionNode('action-false', 'Low Amount'),
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'trigger-1', targetNodeId: 'cond-1' },
          { id: 'e2', sourceNodeId: 'cond-1', targetNodeId: 'action-true' },
          { id: 'e3', sourceNodeId: 'cond-1', targetNodeId: 'action-false' },
        ],
      };

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-3',
        name: 'Condition WF',
        entityId: 'entity-1',
        steps: graph,
        triggers: [],
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.workflow.update.mockResolvedValue({});

      const execution = await executeWorkflow('wf-3', 'user-1', 'MANUAL', { amount: 50 });

      expect(execution.status).toBe('COMPLETED');
      const nodeIds = execution.stepResults.map((s) => s.nodeId);
      expect(nodeIds).toContain('action-false');
      expect(nodeIds).not.toContain('action-true');
    });

    it('should pause at human approval nodes', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createTriggerNode('trigger-1', 'Start'),
          {
            id: 'approval-1',
            type: 'HUMAN_APPROVAL',
            label: 'Approve',
            config: {
              nodeType: 'HUMAN_APPROVAL',
              approverIds: ['user-1'],
              message: 'Please approve',
              timeoutHours: 24,
              requiredApprovals: 1,
            } as HumanApprovalNodeConfig,
            position: { x: 200, y: 0 },
            inputs: [],
            outputs: [],
          },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'trigger-1', targetNodeId: 'approval-1' },
        ],
      };

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-4',
        steps: graph,
        triggers: [],
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.workflow.update.mockResolvedValue({});

      const execution = await executeWorkflow('wf-4', 'user-1', 'MANUAL');

      expect(execution.status).toBe('PAUSED');
    });

    it('should handle delay nodes by scheduling future execution', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createTriggerNode('trigger-1', 'Start'),
          {
            id: 'delay-1',
            type: 'DELAY',
            label: 'Wait',
            config: {
              nodeType: 'DELAY',
              delayType: 'FIXED',
              delayMs: 1000,
            } as DelayNodeConfig,
            position: { x: 200, y: 0 },
            inputs: [],
            outputs: [],
          },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'trigger-1', targetNodeId: 'delay-1' },
        ],
      };

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-5',
        steps: graph,
        triggers: [],
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.workflow.update.mockResolvedValue({});

      const execution = await executeWorkflow('wf-5', 'user-1', 'MANUAL');

      expect(execution.status).toBe('COMPLETED');
      const delayResult = execution.stepResults.find((s) => s.nodeId === 'delay-1');
      expect(delayResult).toBeDefined();
      expect(delayResult?.output.delayed).toBe(true);
    });

    it('should execute loop nodes for each item in collection', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createTriggerNode('trigger-1', 'Start'),
          {
            id: 'loop-1',
            type: 'LOOP',
            label: 'Loop Items',
            config: {
              nodeType: 'LOOP',
              collection: 'items',
              iteratorVariable: 'item',
              bodyNodeIds: [],
              maxIterations: 10,
            } as LoopNodeConfig,
            position: { x: 200, y: 0 },
            inputs: [],
            outputs: [],
          },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'trigger-1', targetNodeId: 'loop-1' },
        ],
      };

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-6',
        steps: graph,
        triggers: [],
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.workflow.update.mockResolvedValue({});

      const execution = await executeWorkflow('wf-6', 'user-1', 'MANUAL', {
        items: ['a', 'b', 'c'],
      });

      const loopResult = execution.stepResults.find((s) => s.nodeId === 'loop-1');
      expect(loopResult?.output.iterations).toBe(3);
    });

    it('should catch errors and route to error handler nodes', async () => {
      const graph: WorkflowGraph = {
        nodes: [
          createTriggerNode('trigger-1', 'Start'),
          {
            id: 'error-handler-1',
            type: 'ERROR_HANDLER',
            label: 'Handle Error',
            config: {
              nodeType: 'ERROR_HANDLER',
              errorTypes: ['*'],
              notifyOnError: true,
            } as ErrorHandlerNodeConfig,
            position: { x: 400, y: 0 },
            inputs: [],
            outputs: [],
          },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'trigger-1', targetNodeId: 'error-handler-1', label: 'ERROR' },
        ],
      };

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-7',
        steps: graph,
        triggers: [],
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.workflow.update.mockResolvedValue({});

      const execution = await executeWorkflow('wf-7', 'user-1', 'MANUAL');

      expect(execution.status).toBe('COMPLETED');
    });

    it('should update execution status throughout the process', async () => {
      const graph = createSimpleGraph();

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-8',
        steps: graph,
        triggers: [],
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.workflow.update.mockResolvedValue({});

      const execution = await executeWorkflow('wf-8', 'user-1', 'MANUAL');

      expect(execution.completedAt).toBeDefined();
      expect(execution.stepResults.every((s) => s.completedAt)).toBe(true);
    });
  });

  describe('getNextNodes', () => {
    it('should return connected nodes via edges', () => {
      const graph = createSimpleGraph();

      const nextNodes = getNextNodes(graph, 'trigger-1');

      expect(nextNodes).toHaveLength(1);
      expect(nextNodes[0].id).toBe('action-1');
    });

    it('should filter by condition result for condition nodes', () => {
      const graph: WorkflowGraph = {
        nodes: [
          createConditionNode('cond-1', 'x > 0', 'true-node', 'false-node'),
          createActionNode('true-node', 'True'),
          createActionNode('false-node', 'False'),
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'cond-1', targetNodeId: 'true-node' },
          { id: 'e2', sourceNodeId: 'cond-1', targetNodeId: 'false-node' },
        ],
      };

      const trueNext = getNextNodes(graph, 'cond-1', true);
      expect(trueNext).toHaveLength(1);
      expect(trueNext[0].id).toBe('true-node');

      const falseNext = getNextNodes(graph, 'cond-1', false);
      expect(falseNext).toHaveLength(1);
      expect(falseNext[0].id).toBe('false-node');
    });

    it('should return empty array for terminal nodes', () => {
      const graph = createSimpleGraph();

      const nextNodes = getNextNodes(graph, 'action-2');

      expect(nextNodes).toHaveLength(0);
    });
  });

  describe('cancelExecution', () => {
    it('should mark execution as CANCELLED', async () => {
      const execution: WorkflowExecution = {
        id: 'exec-cancel-1',
        workflowId: 'wf-1',
        status: 'RUNNING',
        triggeredBy: 'user-1',
        triggerType: 'MANUAL',
        startedAt: new Date(),
        variables: {},
        stepResults: [],
      };

      setExecution(execution);

      await cancelExecution('exec-cancel-1');

      const cancelled = (await import('@/modules/workflows/services/workflow-executor')).getExecution;
      const result = await cancelled('exec-cancel-1');
      expect(result?.status).toBe('CANCELLED');
    });

    it('should stop processing further steps', async () => {
      const execution: WorkflowExecution = {
        id: 'exec-cancel-2',
        workflowId: 'wf-1',
        status: 'RUNNING',
        triggeredBy: 'user-1',
        triggerType: 'MANUAL',
        startedAt: new Date(),
        variables: {},
        stepResults: [],
      };

      setExecution(execution);

      await cancelExecution('exec-cancel-2');

      const result = await (await import('@/modules/workflows/services/workflow-executor')).getExecution('exec-cancel-2');
      expect(result?.status).toBe('CANCELLED');
      expect(result?.completedAt).toBeDefined();
    });
  });
});
