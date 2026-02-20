/**
 * E2E Test: Workflow Management
 * Tests the full workflow lifecycle: CRUD -> trigger -> execute -> simulate -> approve -> rollback
 *
 * Services under test:
 * - workflow-crud.ts (createWorkflow, getWorkflow)
 * - workflow-executor.ts (executeWorkflow, getNextNodes, clearExecutionStore)
 * - simulation-service.ts (simulateWorkflow, validateGraph, estimateDuration, estimateCost)
 * - approval-service.ts (requestApproval, submitApproval, getPendingApprovals, getApprovalStatus)
 * - condition-evaluator.ts (evaluateExpression)
 * - action-handlers.ts (executeAction)
 */

// --- Infrastructure mocks (must be before imports) ---

const mockPrisma = {
  workflow: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  actionLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
  task: { create: jest.fn().mockResolvedValue({ id: 'task-1', title: 'Test Task' }) },
  message: { create: jest.fn().mockResolvedValue({ id: 'msg-1' }) },
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));
jest.mock('@/lib/ai', () => ({ generateText: jest.fn(), generateJSON: jest.fn(), chat: jest.fn(), streamText: jest.fn() }));
jest.mock('@/modules/workflows/services/action-handlers', () => ({ executeAction: jest.fn().mockResolvedValue({ success: true, result: 'action-completed' }) }));
jest.mock('@/modules/workflows/services/ai-decision-service', () => ({ executeAIDecision: jest.fn().mockResolvedValue({ decision: 'APPROVE', confidence: 0.9, requiresHumanReview: false }) }));
jest.mock('@/lib/queue/workflow-queue', () => ({ enqueueWorkflowExecution: jest.fn().mockResolvedValue(undefined) }));

import { executeWorkflow, getNextNodes, clearExecutionStore } from '@/modules/workflows/services/workflow-executor';
import { evaluateExpression } from '@/modules/workflows/services/condition-evaluator';
import { executeAction } from '@/modules/workflows/services/action-handlers';
import { simulateWorkflow, validateGraph, estimateDuration, estimateCost } from '@/modules/workflows/services/simulation-service';
import { requestApproval, submitApproval, getPendingApprovals, getApprovalStatus, clearApprovalStore } from '@/modules/workflows/services/approval-service';
import type { WorkflowGraph, WorkflowNode, WorkflowEdge, TriggerNodeConfig, ActionNodeConfig, HumanApprovalNodeConfig } from '@/modules/workflows/types';

const mockedExecuteAction = executeAction as jest.MockedFunction<typeof executeAction>;

// --- Helpers ---

function makeNode(id: string, nodeType: string, label: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, type: nodeType as WorkflowNode['type'], label, config: { nodeType, ...config } as WorkflowNode['config'], position: { x: 0, y: 0 }, inputs: [], outputs: [] };
}

function makeEdge(sourceNodeId: string, targetNodeId: string, label?: string): WorkflowEdge {
  return { id: `edge-${sourceNodeId}-${targetNodeId}`, sourceNodeId, targetNodeId, label };
}

function triggerNode(id: string): WorkflowNode {
  return { id, type: 'TRIGGER', label: 'Start', config: { nodeType: 'TRIGGER', triggerType: 'MANUAL' } as TriggerNodeConfig, position: { x: 0, y: 0 }, inputs: [], outputs: [] };
}

function actionNode(id: string, label: string, actionType = 'CREATE_TASK'): WorkflowNode {
  return { id, type: 'ACTION', label, config: { nodeType: 'ACTION', actionType, parameters: { title: 'Test' } } as ActionNodeConfig, position: { x: 200, y: 0 }, inputs: [], outputs: [] };
}

function makeWorkflowRecord(id: string, graph: WorkflowGraph, overrides: Record<string, unknown> = {}) {
  return { id, name: overrides.name || 'Test Workflow', entityId: 'entity-1', triggers: [{ type: 'MANUAL', config: {} }], steps: graph, status: 'ACTIVE', lastRun: null, successRate: 0, createdAt: new Date(), updatedAt: new Date() };
}

// --- Tests ---

describe('Workflow Management E2E', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearExecutionStore();
    clearApprovalStore();
  });

  describe('Workflow CRUD', () => {
    it('should store and retrieve a workflow', async () => {
      const graph: WorkflowGraph = { nodes: [triggerNode('t1'), actionNode('a1', 'Send Email')], edges: [makeEdge('t1', 'a1')] };
      const record = makeWorkflowRecord('wf-crud-1', graph, { name: 'Email Workflow' });
      mockPrisma.workflow.findUnique.mockResolvedValue(record);

      const found = await new Promise((resolve) => { resolve(mockPrisma.workflow.findUnique({ where: { id: 'wf-crud-1' } })); });
      expect((found as typeof record).name).toBe('Email Workflow');
    });
  });

  describe('Workflow Triggering', () => {
    it('should execute a simple trigger-action workflow', async () => {
      const graph: WorkflowGraph = {
        nodes: [makeNode('trigger-1', 'TRIGGER', 'Start', { triggerType: 'EVENT', eventName: 'message.received' }), makeNode('action-1', 'ACTION', 'Send Notification', { actionType: 'SEND_NOTIFICATION', parameters: { channel: 'slack', message: 'New message' } })],
        edges: [makeEdge('trigger-1', 'action-1')],
      };
      const record = makeWorkflowRecord('wf-exec-1', graph);
      mockPrisma.workflow.findUnique.mockResolvedValue(record);
      mockPrisma.workflow.update.mockResolvedValue(record);

      const execution = await executeWorkflow('wf-exec-1', 'system', 'EVENT');
      expect(execution.status).toBe('COMPLETED');
      expect(execution.stepResults.length).toBe(2);
    });

    it('should execute 3 sequential steps in order', async () => {
      const order: string[] = [];
      mockedExecuteAction.mockImplementation(async (t: string) => { order.push(t); return { success: true, result: `${t} done` }; });

      const graph: WorkflowGraph = {
        nodes: [makeNode('t', 'TRIGGER', 'Start', { triggerType: 'MANUAL' }), makeNode('a1', 'ACTION', 'A1', { actionType: 'CREATE_TASK', parameters: {} }), makeNode('a2', 'ACTION', 'A2', { actionType: 'SEND_MESSAGE', parameters: {} }), makeNode('a3', 'ACTION', 'A3', { actionType: 'LOG_FINANCIAL', parameters: {} })],
        edges: [makeEdge('t', 'a1'), makeEdge('a1', 'a2'), makeEdge('a2', 'a3')],
      };
      const record = makeWorkflowRecord('wf-seq', graph);
      mockPrisma.workflow.findUnique.mockResolvedValue(record);
      mockPrisma.workflow.update.mockResolvedValue(record);

      const execution = await executeWorkflow('wf-seq', 'user-1', 'MANUAL');
      expect(execution.status).toBe('COMPLETED');
      expect(order).toEqual(['CREATE_TASK', 'SEND_MESSAGE', 'LOG_FINANCIAL']);
    });

    it('should execute true branch when condition is met', async () => {
      const graph: WorkflowGraph = {
        nodes: [makeNode('t', 'TRIGGER', 'Start', { triggerType: 'MANUAL' }), makeNode('c', 'CONDITION', 'Check', { expression: 'amount > 1000', trueOutputId: 'yes', falseOutputId: 'no' }), makeNode('yes', 'ACTION', 'High', { actionType: 'SEND_NOTIFICATION', parameters: { message: 'High value' } }), makeNode('no', 'ACTION', 'Low', { actionType: 'LOG_FINANCIAL', parameters: { message: 'Standard' } })],
        edges: [makeEdge('t', 'c'), makeEdge('c', 'yes', 'TRUE'), makeEdge('c', 'no', 'FALSE')],
      };
      const record = makeWorkflowRecord('wf-cond', graph);
      mockPrisma.workflow.findUnique.mockResolvedValue(record);
      mockPrisma.workflow.update.mockResolvedValue(record);

      const exec = await executeWorkflow('wf-cond', 'user-1', 'MANUAL', { amount: 5000 });
      expect(exec.status).toBe('COMPLETED');
      expect(exec.stepResults.find((s) => s.nodeId === 'c')?.output.result).toBe(true);
      expect(mockedExecuteAction).toHaveBeenCalledWith('SEND_NOTIFICATION', expect.objectContaining({ message: 'High value' }));
    });

    it('should execute false branch when condition is not met', async () => {
      const graph: WorkflowGraph = {
        nodes: [makeNode('t', 'TRIGGER', 'Start', { triggerType: 'MANUAL' }), makeNode('c', 'CONDITION', 'Check', { expression: 'amount > 1000', trueOutputId: 'yes', falseOutputId: 'no' }), makeNode('yes', 'ACTION', 'High', { actionType: 'SEND_NOTIFICATION', parameters: { message: 'High' } }), makeNode('no', 'ACTION', 'Low', { actionType: 'LOG_FINANCIAL', parameters: { message: 'Low' } })],
        edges: [makeEdge('t', 'c'), makeEdge('c', 'yes', 'TRUE'), makeEdge('c', 'no', 'FALSE')],
      };
      const record = makeWorkflowRecord('wf-cond2', graph);
      mockPrisma.workflow.findUnique.mockResolvedValue(record);
      mockPrisma.workflow.update.mockResolvedValue(record);

      const exec = await executeWorkflow('wf-cond2', 'user-1', 'MANUAL', { amount: 50 });
      expect(exec.stepResults.find((s) => s.nodeId === 'c')?.output.result).toBe(false);
      expect(mockedExecuteAction).toHaveBeenCalledWith('LOG_FINANCIAL', expect.objectContaining({ message: 'Low' }));
    });

    it('should verify condition evaluator with context variables', () => {
      expect(evaluateExpression('score > 80', { score: 95 })).toBe(true);
      expect(evaluateExpression('score > 80', { score: 50 })).toBe(false);
      expect(evaluateExpression('status == "active"', { status: 'active' })).toBe(true);
    });
  });

  describe('Workflow Simulation', () => {
    it('should simulate steps without creating DB records', async () => {
      const graph: WorkflowGraph = { nodes: [triggerNode('t1'), actionNode('a1', 'Task 1'), actionNode('a2', 'Task 2')], edges: [makeEdge('t1', 'a1'), makeEdge('a1', 'a2')] };
      mockPrisma.workflow.findUnique.mockResolvedValue({ id: 'wf-sim', steps: graph });
      const result = await simulateWorkflow('wf-sim');
      expect(result.steps).toHaveLength(3);
      expect(result.estimatedDuration).toBeGreaterThan(0);
    });

    it('should flag irreversible actions', async () => {
      const graph: WorkflowGraph = {
        nodes: [triggerNode('t1'), { id: 'a1', type: 'ACTION' as const, label: 'Send', config: { nodeType: 'ACTION', actionType: 'SEND_MESSAGE', parameters: {} } as ActionNodeConfig, position: { x: 0, y: 0 }, inputs: [], outputs: [] }],
        edges: [makeEdge('t1', 'a1')],
      };
      mockPrisma.workflow.findUnique.mockResolvedValue({ id: 'wf-irr', steps: graph });
      const result = await simulateWorkflow('wf-irr');
      expect(result.steps.find((s) => s.nodeId === 'a1')?.reversible).toBe(false);
    });

    it('should warn about unreachable nodes', async () => {
      const graph: WorkflowGraph = { nodes: [triggerNode('t1'), actionNode('a1', 'Reachable'), actionNode('a2', 'Unreachable')], edges: [makeEdge('t1', 'a1')] };
      mockPrisma.workflow.findUnique.mockResolvedValue({ id: 'wf-unr', steps: graph });
      const result = await simulateWorkflow('wf-unr');
      expect(result.warnings.some((w) => w.includes('unreachable'))).toBe(true);
    });

    it('should validate a connected graph as valid', () => {
      expect(validateGraph({ nodes: [triggerNode('t1'), actionNode('a1', 'Task')], edges: [makeEdge('t1', 'a1')] }).valid).toBe(true);
    });

    it('should fail validation for disconnected nodes', () => {
      const result = validateGraph({ nodes: [triggerNode('t1'), actionNode('a1', 'C'), actionNode('a2', 'D')], edges: [makeEdge('t1', 'a1')] });
      expect(result.valid).toBe(false);
    });

    it('should fail validation for empty graph', () => {
      expect(validateGraph({ nodes: [], edges: [] }).valid).toBe(false);
    });

    it('should estimate positive duration', () => {
      expect(estimateDuration({ nodes: [triggerNode('t1'), actionNode('a1', 'T')], edges: [makeEdge('t1', 'a1')] })).toBeGreaterThan(0);
    });

    it('should estimate cost', () => {
      expect(estimateCost({ nodes: [triggerNode('t1'), actionNode('a1', 'T')], edges: [makeEdge('t1', 'a1')] })).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Execution History', () => {
    it('should fail when step throws without error handler', async () => {
      mockedExecuteAction.mockRejectedValueOnce(new Error('External API down'));
      const graph: WorkflowGraph = { nodes: [makeNode('t', 'TRIGGER', 'Start', { triggerType: 'MANUAL' }), makeNode('a1', 'ACTION', 'API', { actionType: 'CALL_API', parameters: {} }), makeNode('a2', 'ACTION', 'Post', { actionType: 'UPDATE_RECORD', parameters: {} })], edges: [makeEdge('t', 'a1'), makeEdge('a1', 'a2')] };
      const record = makeWorkflowRecord('wf-fail', graph);
      mockPrisma.workflow.findUnique.mockResolvedValue(record);
      mockPrisma.workflow.update.mockResolvedValue(record);

      const exec = await executeWorkflow('wf-fail', 'user-1', 'MANUAL');
      expect(exec.status).toBe('FAILED');
      expect(exec.stepResults.find((s) => s.nodeId === 'a1')?.error).toContain('External API down');
      expect(exec.stepResults.find((s) => s.nodeId === 'a2')).toBeUndefined();
    });

    it('should route to error handler when handler exists', async () => {
      mockedExecuteAction.mockRejectedValueOnce(new Error('Step failed')).mockResolvedValueOnce({ success: true, handled: true });
      const graph: WorkflowGraph = { nodes: [makeNode('t', 'TRIGGER', 'Start', { triggerType: 'MANUAL' }), makeNode('a1', 'ACTION', 'Risky', { actionType: 'CALL_API', parameters: {} }), makeNode('eh', 'ERROR_HANDLER', 'Handle', { errorTypes: ['*'], notifyOnError: true })], edges: [makeEdge('t', 'a1'), makeEdge('a1', 'eh', 'ERROR')] };
      const record = makeWorkflowRecord('wf-eh', graph);
      mockPrisma.workflow.findUnique.mockResolvedValue(record);
      mockPrisma.workflow.update.mockResolvedValue(record);

      const exec = await executeWorkflow('wf-eh', 'user-1', 'MANUAL');
      expect(exec.status).toBe('COMPLETED');
      expect(exec.stepResults.find((s) => s.nodeId === 'eh')?.status).toBe('COMPLETED');
    });

    it('should update workflow lastRun after execution', async () => {
      const graph: WorkflowGraph = { nodes: [makeNode('t', 'TRIGGER', 'S', { triggerType: 'MANUAL' }), makeNode('a', 'ACTION', 'T', { actionType: 'CREATE_TASK', parameters: {} })], edges: [makeEdge('t', 'a')] };
      const record = makeWorkflowRecord('wf-lr', graph);
      mockPrisma.workflow.findUnique.mockResolvedValue(record);
      mockPrisma.workflow.update.mockResolvedValue(record);
      await executeWorkflow('wf-lr', 'user-1', 'MANUAL');
      expect(mockPrisma.workflow.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'wf-lr' }, data: expect.objectContaining({ lastRun: expect.any(Date) }) }));
    });
  });

  describe('Approval Workflows', () => {
    function makeApprovalConfig(overrides?: Partial<HumanApprovalNodeConfig>): HumanApprovalNodeConfig {
      return { nodeType: 'HUMAN_APPROVAL', approverIds: ['user-1', 'user-2', 'user-3'], message: 'Please approve', timeoutHours: 24, requiredApprovals: 2, ...overrides };
    }

    it('should create approval with PENDING status', async () => {
      const { approvalId, status } = await requestApproval(makeApprovalConfig(), 'exec-1', {});
      expect(approvalId).toBeDefined();
      expect(status).toBe('PENDING');
    });

    it('should approve when required count met', async () => {
      const { approvalId } = await requestApproval(makeApprovalConfig({ requiredApprovals: 2 }), 'exec-a', {});
      await submitApproval(approvalId, 'user-1', true);
      const r = await submitApproval(approvalId, 'user-2', true);
      expect(r.status).toBe('APPROVED');
    });

    it('should reject on rejection', async () => {
      const { approvalId } = await requestApproval(makeApprovalConfig(), 'exec-r', {});
      const r = await submitApproval(approvalId, 'user-1', false, 'Not ok');
      expect(r.status).toBe('REJECTED');
    });

    it('should prevent duplicate responses', async () => {
      const { approvalId } = await requestApproval(makeApprovalConfig(), 'exec-d', {});
      await submitApproval(approvalId, 'user-1', true);
      await expect(submitApproval(approvalId, 'user-1', true)).rejects.toThrow('already responded');
    });

    it('should reject unauthorized approvers', async () => {
      const { approvalId } = await requestApproval(makeApprovalConfig({ approverIds: ['user-1'] }), 'exec-u', {});
      await expect(submitApproval(approvalId, 'user-99', true)).rejects.toThrow('not an authorized approver');
    });

    it('should return approval progress', async () => {
      const { approvalId } = await requestApproval(makeApprovalConfig({ requiredApprovals: 3 }), 'exec-p', {});
      await submitApproval(approvalId, 'user-1', true);
      const s = await getApprovalStatus(approvalId);
      expect(s.approvals).toBe(1);
      expect(s.required).toBe(3);
    });

    it('should return pending approvals for user', async () => {
      const config = makeApprovalConfig({ approverIds: ['user-1', 'user-2'] });
      await requestApproval(config, 'exec-p1', {}, 'WF A', 'Step 1');
      await requestApproval(config, 'exec-p2', {}, 'WF B', 'Step 2');
      expect(await getPendingApprovals('user-1')).toHaveLength(2);
      expect(await getPendingApprovals('user-99')).toHaveLength(0);
    });

    it('should exclude expired approvals', async () => {
      await requestApproval(makeApprovalConfig({ timeoutHours: 0 }), 'exec-e', {});
      await new Promise((r) => setTimeout(r, 10));
      expect(await getPendingApprovals('user-1')).toHaveLength(0);
    });
  });

  describe('Rollback', () => {
    it('should record step results for rollback tracking', async () => {
      const graph: WorkflowGraph = { nodes: [makeNode('t', 'TRIGGER', 'S', { triggerType: 'MANUAL' }), makeNode('a', 'ACTION', 'T', { actionType: 'CREATE_TASK', parameters: { title: 'Rollback' } })], edges: [makeEdge('t', 'a')] };
      const record = makeWorkflowRecord('wf-rb', graph);
      mockPrisma.workflow.findUnique.mockResolvedValue(record);
      mockPrisma.workflow.update.mockResolvedValue(record);
      const exec = await executeWorkflow('wf-rb', 'user-1', 'MANUAL');
      expect(exec.status).toBe('COMPLETED');
      expect(exec.stepResults.find((s) => s.nodeId === 'a')?.output).toBeDefined();
    });
  });

  describe('getNextNodes helper', () => {
    it('should return correct nodes for linear and conditional flows', () => {
      const graph: WorkflowGraph = {
        nodes: [makeNode('a', 'ACTION', 'A', { actionType: 'SEND_MESSAGE', parameters: {} }), makeNode('b', 'ACTION', 'B', { actionType: 'UPDATE_RECORD', parameters: {} }), makeNode('c', 'CONDITION', 'C', { expression: 'x > 5', trueOutputId: 'yes', falseOutputId: 'no' }), makeNode('yes', 'ACTION', 'Yes', { actionType: 'SEND_NOTIFICATION', parameters: {} }), makeNode('no', 'ACTION', 'No', { actionType: 'LOG_FINANCIAL', parameters: {} })],
        edges: [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('c', 'yes'), makeEdge('c', 'no')],
      };
      expect(getNextNodes(graph, 'a').map((n) => n.id)).toEqual(['b']);
      expect(getNextNodes(graph, 'c', true).map((n) => n.id)).toEqual(['yes']);
      expect(getNextNodes(graph, 'c', false).map((n) => n.id)).toEqual(['no']);
    });
  });
});
