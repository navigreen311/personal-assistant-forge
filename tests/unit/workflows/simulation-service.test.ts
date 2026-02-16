// ============================================================================
// Simulation Service — Unit Tests
// ============================================================================

import {
  simulateWorkflow,
  validateGraph,
  estimateDuration,
  estimateCost,
} from '@/modules/workflows/services/simulation-service';
import type {
  WorkflowGraph,
  WorkflowNode,
  TriggerNodeConfig,
  ActionNodeConfig,
  ConditionNodeConfig,
} from '@/modules/workflows/types';

// --- Mocks ---

jest.mock('@/lib/db', () => ({
  prisma: {
    workflow: {
      findUnique: jest.fn(),
    },
  },
}));

const { prisma } = jest.requireMock('@/lib/db');

// --- Helpers ---

function makeGraph(nodes: WorkflowNode[], edges: WorkflowGraph['edges']): WorkflowGraph {
  return { nodes, edges };
}

function triggerNode(id: string): WorkflowNode {
  return {
    id,
    type: 'TRIGGER',
    label: 'Start',
    config: { nodeType: 'TRIGGER', triggerType: 'MANUAL' } as TriggerNodeConfig,
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
  };
}

function actionNode(id: string, label: string): WorkflowNode {
  return {
    id,
    type: 'ACTION',
    label,
    config: {
      nodeType: 'ACTION',
      actionType: 'CREATE_TASK',
      parameters: { title: 'Test' },
    } as ActionNodeConfig,
    position: { x: 200, y: 0 },
    inputs: [],
    outputs: [],
  };
}

// --- Tests ---

describe('SimulationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('simulateWorkflow', () => {
    it('should return simulated steps for each node', async () => {
      const graph = makeGraph(
        [triggerNode('t1'), actionNode('a1', 'Task 1'), actionNode('a2', 'Task 2')],
        [
          { id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1' },
          { id: 'e2', sourceNodeId: 'a1', targetNodeId: 'a2' },
        ]
      );

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-sim-1',
        steps: graph,
      });

      const result = await simulateWorkflow('wf-sim-1');

      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].nodeId).toBe('t1');
    });

    it('should describe what each action would do', async () => {
      const graph = makeGraph(
        [triggerNode('t1'), actionNode('a1', 'Send Email')],
        [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1' }]
      );

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-sim-2',
        steps: graph,
      });

      const result = await simulateWorkflow('wf-sim-2');

      const actionStep = result.steps.find((s) => s.nodeId === 'a1');
      expect(actionStep?.wouldDo).toContain('CREATE_TASK');
    });

    it('should calculate estimated duration', async () => {
      const graph = makeGraph(
        [triggerNode('t1'), actionNode('a1', 'Task')],
        [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1' }]
      );

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-sim-3',
        steps: graph,
      });

      const result = await simulateWorkflow('wf-sim-3');

      expect(result.estimatedDuration).toBeGreaterThan(0);
    });

    it('should flag irreversible actions', async () => {
      const graph = makeGraph(
        [
          triggerNode('t1'),
          {
            id: 'a1',
            type: 'ACTION' as const,
            label: 'Send Message',
            config: {
              nodeType: 'ACTION',
              actionType: 'SEND_MESSAGE',
              parameters: {},
            } as ActionNodeConfig,
            position: { x: 200, y: 0 },
            inputs: [],
            outputs: [],
          },
        ],
        [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1' }]
      );

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-sim-4',
        steps: graph,
      });

      const result = await simulateWorkflow('wf-sim-4');

      const sendStep = result.steps.find((s) => s.nodeId === 'a1');
      expect(sendStep?.reversible).toBe(false);
    });

    it('should not create any database records', async () => {
      const graph = makeGraph(
        [triggerNode('t1'), actionNode('a1', 'Task')],
        [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1' }]
      );

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-sim-5',
        steps: graph,
      });

      await simulateWorkflow('wf-sim-5');

      // Only findUnique should be called (to load the workflow), no create/update
      expect(prisma.workflow.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateGraph', () => {
    it('should pass for valid connected graph', () => {
      const graph = makeGraph(
        [triggerNode('t1'), actionNode('a1', 'Task')],
        [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1' }]
      );

      const result = validateGraph(graph);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for disconnected nodes', () => {
      const graph = makeGraph(
        [triggerNode('t1'), actionNode('a1', 'Connected'), actionNode('a2', 'Disconnected')],
        [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1' }]
      );

      const result = validateGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Disconnected'))).toBe(true);
    });

    it('should fail for missing required configs', () => {
      const graph = makeGraph(
        [
          triggerNode('t1'),
          {
            id: 'c1',
            type: 'CONDITION' as const,
            label: 'Bad Condition',
            config: {
              nodeType: 'CONDITION',
              expression: '',
              trueOutputId: '',
              falseOutputId: '',
            } as ConditionNodeConfig,
            position: { x: 200, y: 0 },
            inputs: [],
            outputs: [],
          },
        ],
        [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'c1' }]
      );

      const result = validateGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('expression'))).toBe(true);
    });

    it('should detect unreachable nodes', async () => {
      const graph = makeGraph(
        [
          triggerNode('t1'),
          actionNode('a1', 'Reachable'),
          actionNode('a2', 'Unreachable'),
        ],
        [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1' }]
      );

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-unreach',
        steps: graph,
      });

      const result = await simulateWorkflow('wf-unreach');

      expect(result.warnings.some((w) => w.includes('unreachable'))).toBe(true);
    });

    it('should fail for empty graph', () => {
      const result = validateGraph({ nodes: [], edges: [] });
      expect(result.valid).toBe(false);
    });
  });

  describe('estimateDuration', () => {
    it('should return positive duration for non-empty graph', () => {
      const graph = makeGraph(
        [triggerNode('t1'), actionNode('a1', 'Task')],
        [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1' }]
      );

      expect(estimateDuration(graph)).toBeGreaterThan(0);
    });
  });

  describe('estimateCost', () => {
    it('should return cost estimate for graph with action nodes', () => {
      const graph = makeGraph(
        [triggerNode('t1'), actionNode('a1', 'Task')],
        [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1' }]
      );

      expect(estimateCost(graph)).toBeGreaterThanOrEqual(0);
    });
  });
});
