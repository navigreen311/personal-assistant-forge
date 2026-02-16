// ============================================================================
// Agent Orchestrator — Unit Tests
// ============================================================================

import {
  registerAgent,
  getAgentForDomain,
  executeAutonomousWorkflow,
  handoff,
  adjustAutonomy,
  clearAgentRegistry,
} from '@/modules/workflows/services/agent-orchestrator';
import type { AgentConfig } from '@/modules/workflows/types';

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
      create: jest.fn().mockResolvedValue({ id: 'task-1', title: 'Test' }),
    },
  },
}));

jest.mock('@/lib/queue/workflow-queue', () => ({
  enqueueWorkflowExecution: jest.fn().mockResolvedValue('job-1'),
}));

const { prisma } = jest.requireMock('@/lib/db');

// --- Helpers ---

function createAgent(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    id: 'agent-1',
    name: 'Communication Agent',
    domain: 'COMMUNICATION',
    capabilities: ['send-email', 'draft-message'],
    autonomyLevel: 'EXECUTE_AUTONOMOUS',
    accuracyScore: 0.9,
    handoffProtocol: {
      triggerConditions: ['domain-mismatch'],
      targetAgentDomain: 'GENERAL',
      contextFields: ['entityId', 'contactId'],
      requiresHumanApproval: false,
    },
    ...overrides,
  };
}

// --- Tests ---

describe('AgentOrchestrator', () => {
  beforeEach(() => {
    clearAgentRegistry();
    jest.clearAllMocks();
  });

  describe('executeAutonomousWorkflow', () => {
    it('should execute steps within guardrails', async () => {
      const agent = createAgent();
      registerAgent(agent);

      const graph = {
        nodes: [
          {
            id: 'trigger-1',
            type: 'TRIGGER',
            label: 'Start',
            config: { nodeType: 'TRIGGER', triggerType: 'MANUAL' },
            position: { x: 0, y: 0 },
            inputs: [],
            outputs: [],
          },
        ],
        edges: [],
      };

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-agent-1',
        steps: graph,
        triggers: [],
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.workflow.update.mockResolvedValue({});

      const execution = await executeAutonomousWorkflow('wf-agent-1', 'agent-1');

      expect(execution).toBeDefined();
      expect(execution.triggeredBy).toBe('agent-1');
    });

    it('should block HIGH blast radius actions for autonomous agents', async () => {
      const agent = createAgent({ autonomyLevel: 'EXECUTE_AUTONOMOUS' });
      registerAgent(agent);

      const graph = {
        nodes: [
          {
            id: 'trigger-1',
            type: 'TRIGGER',
            label: 'Start',
            config: { nodeType: 'TRIGGER', triggerType: 'MANUAL' },
            position: { x: 0, y: 0 },
            inputs: [],
            outputs: [],
          },
          {
            id: 'action-1',
            type: 'ACTION',
            label: 'High Risk',
            config: {
              nodeType: 'ACTION',
              actionType: 'EXECUTE_SCRIPT',
              parameters: {},
            },
            position: { x: 200, y: 0 },
            inputs: [],
            outputs: [],
          },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'trigger-1', targetNodeId: 'action-1' },
        ],
      };

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-agent-2',
        steps: graph,
        triggers: [],
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.workflow.update.mockResolvedValue({});

      const execution = await executeAutonomousWorkflow('wf-agent-2', 'agent-1');

      // Should be paused due to high blast radius
      expect(execution.status).toBe('PAUSED');
    });

    it('should allow LOW blast radius actions autonomously', async () => {
      const agent = createAgent({ autonomyLevel: 'EXECUTE_AUTONOMOUS' });
      registerAgent(agent);

      const graph = {
        nodes: [
          {
            id: 'trigger-1',
            type: 'TRIGGER',
            label: 'Start',
            config: { nodeType: 'TRIGGER', triggerType: 'MANUAL' },
            position: { x: 0, y: 0 },
            inputs: [],
            outputs: [],
          },
        ],
        edges: [],
      };

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-agent-3',
        steps: graph,
        triggers: [],
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.workflow.update.mockResolvedValue({});

      const execution = await executeAutonomousWorkflow('wf-agent-3', 'agent-1');

      expect(execution.status).toBe('COMPLETED');
    });

    it('should respect maxSteps limit', async () => {
      const agent = createAgent();
      registerAgent(agent);

      const graph = {
        nodes: [
          {
            id: 'trigger-1',
            type: 'TRIGGER',
            label: 'Start',
            config: { nodeType: 'TRIGGER', triggerType: 'MANUAL' },
            position: { x: 0, y: 0 },
            inputs: [],
            outputs: [],
          },
        ],
        edges: [],
      };

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-agent-4',
        steps: graph,
        triggers: [],
        status: 'ACTIVE',
        lastRun: null,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.workflow.update.mockResolvedValue({});

      const execution = await executeAutonomousWorkflow('wf-agent-4', 'agent-1', 5);

      expect(execution.variables.__maxSteps).toBe(5);
    });

    it('should throw for non-existent agent', async () => {
      await expect(
        executeAutonomousWorkflow('wf-1', 'nonexistent-agent')
      ).rejects.toThrow('not found');
    });
  });

  describe('handoff', () => {
    it('should transfer context between agents', async () => {
      const agent1 = createAgent({ id: 'agent-from', domain: 'COMMUNICATION' });
      const agent2 = createAgent({ id: 'agent-to', domain: 'FINANCE' });
      registerAgent(agent1);
      registerAgent(agent2);

      const result = await handoff(
        'agent-from',
        'agent-to',
        { entityId: 'e1', amount: 500 },
        'exec-1'
      );

      expect(result.fromAgentId).toBe('agent-from');
      expect(result.toAgentId).toBe('agent-to');
      expect(result.timestamp).toBeDefined();
    });

    it('should record handoff in collaboration log', async () => {
      const agent1 = createAgent({ id: 'agent-a', domain: 'COMMUNICATION' });
      const agent2 = createAgent({ id: 'agent-b', domain: 'SCHEDULING' });
      registerAgent(agent1);
      registerAgent(agent2);

      const handoff1 = await handoff('agent-a', 'agent-b', {}, 'exec-collab');
      expect(handoff1.reason).toContain('COMMUNICATION');
      expect(handoff1.reason).toContain('SCHEDULING');
    });

    it('should throw for non-existent agents', async () => {
      await expect(
        handoff('nonexistent', 'agent-1', {}, 'exec-1')
      ).rejects.toThrow('not found');
    });
  });

  describe('adjustAutonomy', () => {
    it('should increase autonomy for high-accuracy agents', () => {
      const agent = createAgent({
        id: 'agent-adjust',
        autonomyLevel: 'DRAFT',
        accuracyScore: 0.9,
      });
      registerAgent(agent);

      adjustAutonomy('agent-adjust', 'EXECUTE_WITH_APPROVAL');

      const updated = getAgentForDomain('COMMUNICATION');
      expect(updated?.autonomyLevel).toBe('EXECUTE_WITH_APPROVAL');
    });

    it('should decrease autonomy for low-accuracy agents', () => {
      const agent = createAgent({
        id: 'agent-lower',
        autonomyLevel: 'EXECUTE_AUTONOMOUS',
        accuracyScore: 0.5,
      });
      registerAgent(agent);

      adjustAutonomy('agent-lower', 'EXECUTE_WITH_APPROVAL');

      const updated = getAgentForDomain('COMMUNICATION');
      expect(updated?.autonomyLevel).toBe('EXECUTE_WITH_APPROVAL');
    });

    it('should prevent skipping levels', () => {
      const agent = createAgent({
        id: 'agent-skip',
        autonomyLevel: 'SUGGEST',
        accuracyScore: 0.95,
      });
      registerAgent(agent);

      expect(() => adjustAutonomy('agent-skip', 'EXECUTE_AUTONOMOUS')).toThrow(
        'one level at a time'
      );
    });

    it('should require minimum accuracy for autonomy increase', () => {
      const agent = createAgent({
        id: 'agent-low',
        autonomyLevel: 'DRAFT',
        accuracyScore: 0.5,
      });
      registerAgent(agent);

      expect(() => adjustAutonomy('agent-low', 'EXECUTE_WITH_APPROVAL')).toThrow(
        'below threshold'
      );
    });
  });
});
