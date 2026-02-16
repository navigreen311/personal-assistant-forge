// ============================================================================
// Agent Orchestrator — Multi-Agent Coordination with Guardrails
// Manages agent registration, domain routing, handoffs, and autonomy levels
// ============================================================================

import type {
  AgentConfig,
  AgentDomain,
  AgentCollaboration,
  AgentHandoff,
  WorkflowExecution,
} from '@/modules/workflows/types';
import type { BlastRadius } from '@/shared/types';
import { executeWorkflow } from './workflow-executor';

// In-memory agent registry
const agentRegistry = new Map<string, AgentConfig>();
const collaborations = new Map<string, AgentCollaboration>();

let collaborationCounter = 0;

// --- Agent Registration ---

export function registerAgent(config: AgentConfig): void {
  agentRegistry.set(config.id, { ...config });
}

export function unregisterAgent(agentId: string): void {
  agentRegistry.delete(agentId);
}

export function getAgent(agentId: string): AgentConfig | null {
  return agentRegistry.get(agentId) ?? null;
}

export function getAgentForDomain(domain: AgentDomain): AgentConfig | null {
  let bestAgent: AgentConfig | null = null;
  let bestScore = -1;

  for (const agent of agentRegistry.values()) {
    if (agent.domain === domain && agent.accuracyScore > bestScore) {
      bestAgent = agent;
      bestScore = agent.accuracyScore;
    }
  }

  return bestAgent;
}

export function listAgents(): AgentConfig[] {
  return Array.from(agentRegistry.values());
}

// --- Autonomous Workflow Execution ---

const BLAST_RADIUS_LEVELS: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export async function executeAutonomousWorkflow(
  workflowId: string,
  agentId: string,
  maxSteps?: number
): Promise<WorkflowExecution> {
  const agent = agentRegistry.get(agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  // Apply guardrails based on autonomy level
  const guardedExecution = await executeWorkflow(
    workflowId,
    agentId,
    'AGENT',
    {
      __agentId: agentId,
      __autonomyLevel: agent.autonomyLevel,
      __maxSteps: maxSteps ?? 100,
    }
  );

  // Post-execution: check each step against blast radius guardrails
  for (const step of guardedExecution.stepResults) {
    const stepBlastRadius = inferBlastRadius(step.output);
    if (!isAllowedByAutonomy(agent.autonomyLevel, stepBlastRadius)) {
      guardedExecution.status = 'PAUSED';
      guardedExecution.error = `Step ${step.nodeId} requires human approval (blast radius: ${stepBlastRadius})`;
      break;
    }
  }

  return guardedExecution;
}

function inferBlastRadius(output: Record<string, unknown>): BlastRadius {
  // Infer blast radius from action output
  if (output.blastRadius) return output.blastRadius as BlastRadius;

  // Heuristics based on action type
  const actionType = output.actionType as string | undefined;
  if (!actionType) return 'LOW';

  const highRiskActions = ['EXECUTE_SCRIPT', 'LOG_FINANCIAL', 'CALL_API'];
  const mediumRiskActions = ['CREATE_TASK', 'UPDATE_RECORD', 'CREATE_EVENT', 'UPDATE_CONTACT'];

  if (highRiskActions.includes(actionType)) return 'HIGH';
  if (mediumRiskActions.includes(actionType)) return 'MEDIUM';
  return 'LOW';
}

function isAllowedByAutonomy(
  autonomyLevel: AgentConfig['autonomyLevel'],
  blastRadius: BlastRadius
): boolean {
  const radiusLevel = BLAST_RADIUS_LEVELS[blastRadius] ?? 1;

  switch (autonomyLevel) {
    case 'EXECUTE_AUTONOMOUS':
      // Can only execute LOW and MEDIUM blast radius autonomously
      return radiusLevel <= 2;
    case 'EXECUTE_WITH_APPROVAL':
      // All actions require approval, but LOW can proceed
      return radiusLevel <= 1;
    case 'DRAFT':
    case 'SUGGEST':
      // Cannot execute any actions autonomously
      return false;
    default:
      return false;
  }
}

// --- Agent Handoff ---

export async function handoff(
  fromAgentId: string,
  toAgentId: string,
  context: Record<string, unknown>,
  executionId: string
): Promise<AgentHandoff> {
  const fromAgent = agentRegistry.get(fromAgentId);
  const toAgent = agentRegistry.get(toAgentId);

  if (!fromAgent) throw new Error(`Source agent ${fromAgentId} not found`);
  if (!toAgent) throw new Error(`Target agent ${toAgentId} not found`);

  const handoffRecord: AgentHandoff = {
    fromAgentId,
    toAgentId,
    reason: `Handoff from ${fromAgent.domain} to ${toAgent.domain}`,
    context: filterContext(context, fromAgent.handoffProtocol.contextFields),
    timestamp: new Date(),
  };

  // Record in collaboration
  let collaboration = findCollaboration(executionId);
  if (!collaboration) {
    collaborationCounter++;
    collaboration = {
      id: `collab-${Date.now()}-${collaborationCounter}`,
      primaryAgentId: fromAgentId,
      collaboratorAgentIds: [toAgentId],
      workflowExecutionId: executionId,
      status: 'ACTIVE',
      handoffs: [],
    };
    collaborations.set(collaboration.id, collaboration);
  }

  collaboration.handoffs.push(handoffRecord);

  if (!collaboration.collaboratorAgentIds.includes(toAgentId)) {
    collaboration.collaboratorAgentIds.push(toAgentId);
  }

  return handoffRecord;
}

function filterContext(
  context: Record<string, unknown>,
  allowedFields: string[]
): Record<string, unknown> {
  if (allowedFields.length === 0) return { ...context };

  const filtered: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in context) {
      filtered[field] = context[field];
    }
  }
  return filtered;
}

function findCollaboration(executionId: string): AgentCollaboration | undefined {
  for (const collab of collaborations.values()) {
    if (collab.workflowExecutionId === executionId) {
      return collab;
    }
  }
  return undefined;
}

// --- Progressive Autonomy ---

export function adjustAutonomy(
  agentId: string,
  newLevel: AgentConfig['autonomyLevel']
): void {
  const agent = agentRegistry.get(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  const levelOrder: AgentConfig['autonomyLevel'][] = [
    'SUGGEST',
    'DRAFT',
    'EXECUTE_WITH_APPROVAL',
    'EXECUTE_AUTONOMOUS',
  ];

  const currentIndex = levelOrder.indexOf(agent.autonomyLevel);
  const newIndex = levelOrder.indexOf(newLevel);

  // Only allow one-level changes for safety
  if (Math.abs(newIndex - currentIndex) > 1) {
    throw new Error(
      `Autonomy can only be adjusted one level at a time. Current: ${agent.autonomyLevel}, requested: ${newLevel}`
    );
  }

  // Require minimum accuracy for autonomy increase
  if (newIndex > currentIndex && agent.accuracyScore < 0.8) {
    throw new Error(
      `Agent accuracy (${agent.accuracyScore}) is below threshold (0.8) for autonomy increase`
    );
  }

  agent.autonomyLevel = newLevel;
  agentRegistry.set(agentId, agent);
}

export function updateAgentAccuracy(agentId: string, outcome: boolean): void {
  const agent = agentRegistry.get(agentId);
  if (!agent) return;

  // Exponential moving average
  const alpha = 0.1;
  agent.accuracyScore = agent.accuracyScore * (1 - alpha) + (outcome ? 1 : 0) * alpha;
  agentRegistry.set(agentId, agent);
}

// --- Testing Helpers ---

export function clearAgentRegistry(): void {
  agentRegistry.clear();
  collaborations.clear();
  collaborationCounter = 0;
}
