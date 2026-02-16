// ============================================================================
// Simulation Service — Dry-Run Workflow Execution
// Walks the graph without side effects, estimates duration/cost, validates graph
// ============================================================================

import { prisma } from '@/lib/db';
import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowSimulationResult,
  SimulatedStep,
  ActionNodeConfig,
  ConditionNodeConfig,
  AIDecisionNodeConfig,
  HumanApprovalNodeConfig,
  DelayNodeConfig,
  LoopNodeConfig,
} from '@/modules/workflows/types';

// --- Duration Estimates (ms) per node type ---

const DURATION_ESTIMATES: Record<string, number> = {
  TRIGGER: 100,
  ACTION: 2000,
  CONDITION: 50,
  AI_DECISION: 5000,
  HUMAN_APPROVAL: 3600000, // 1 hour
  DELAY: 0, // calculated from config
  LOOP: 1000,
  ERROR_HANDLER: 100,
  SUB_WORKFLOW: 10000,
};

// --- Cost Estimates per node type ---

const COST_ESTIMATES: Record<string, number> = {
  TRIGGER: 0,
  ACTION: 0.01,
  CONDITION: 0,
  AI_DECISION: 0.05,
  HUMAN_APPROVAL: 0,
  DELAY: 0,
  LOOP: 0.01,
  ERROR_HANDLER: 0,
  SUB_WORKFLOW: 0.1,
};

export async function simulateWorkflow(
  workflowId: string,
  variables?: Record<string, unknown>
): Promise<WorkflowSimulationResult> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
  });

  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  const graph = workflow.steps as unknown as WorkflowGraph;
  const validation = validateGraph(graph);

  const warnings = [...(validation.errors || [])];
  const steps: SimulatedStep[] = [];
  const context = variables ?? {};

  // Walk the graph in topological order — prefer TRIGGER nodes as entry points
  const visited = new Set<string>();
  const nodesWithIncoming = new Set(graph.edges.map((e) => e.targetNodeId));
  const triggerStarts = graph.nodes.filter(
    (n) => n.config.nodeType === 'TRIGGER' && !nodesWithIncoming.has(n.id)
  );
  const startNodes =
    triggerStarts.length > 0
      ? triggerStarts
      : graph.nodes.filter((n) => !nodesWithIncoming.has(n.id));

  if (startNodes.length === 0 && graph.nodes.length > 0) {
    startNodes.push(graph.nodes[0]);
    warnings.push('No clear start node found, using first node');
  }

  const queue = [...startNodes];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    const simStep = simulateNode(node, context);
    steps.push(simStep);

    // Follow edges
    const outgoing = graph.edges.filter((e) => e.sourceNodeId === node.id);
    for (const edge of outgoing) {
      const next = graph.nodes.find((n) => n.id === edge.targetNodeId);
      if (next && !visited.has(next.id)) {
        queue.push(next);
      }
    }
  }

  // Check for unvisited nodes
  const unvisited = graph.nodes.filter((n) => !visited.has(n.id));
  if (unvisited.length > 0) {
    warnings.push(
      `${unvisited.length} unreachable node(s): ${unvisited.map((n) => n.label).join(', ')}`
    );
  }

  return {
    workflowId,
    steps,
    estimatedDuration: estimateDuration(graph),
    estimatedCost: estimateCost(graph),
    warnings,
    wouldExecute: validation.valid && steps.length > 0,
  };
}

function simulateNode(
  node: WorkflowNode,
  context: Record<string, unknown>
): SimulatedStep {
  const baseStep: SimulatedStep = {
    nodeId: node.id,
    nodeLabel: node.label,
    wouldDo: '',
    impact: 'None',
    reversible: true,
    estimatedDuration: DURATION_ESTIMATES[node.type] ?? 1000,
  };

  switch (node.config.nodeType) {
    case 'TRIGGER':
      baseStep.wouldDo = `Trigger workflow via ${(node.config as { triggerType: string }).triggerType}`;
      baseStep.impact = 'None (entry point)';
      break;

    case 'ACTION': {
      const actionConfig = node.config as ActionNodeConfig;
      baseStep.wouldDo = `Execute ${actionConfig.actionType} action with parameters: ${Object.keys(actionConfig.parameters).join(', ')}`;
      baseStep.impact = getActionImpact(actionConfig.actionType);
      baseStep.reversible = isActionReversible(actionConfig.actionType);
      break;
    }

    case 'CONDITION': {
      const condConfig = node.config as ConditionNodeConfig;
      baseStep.wouldDo = `Evaluate condition: ${condConfig.expression}`;
      baseStep.impact = 'Branching decision';
      break;
    }

    case 'AI_DECISION': {
      const aiConfig = node.config as AIDecisionNodeConfig;
      baseStep.wouldDo = `AI ${aiConfig.decisionType} using prompt: "${aiConfig.prompt.substring(0, 50)}..."`;
      baseStep.impact = 'AI-generated decision, may affect downstream actions';
      baseStep.estimatedDuration = 5000;
      break;
    }

    case 'HUMAN_APPROVAL': {
      const approvalConfig = node.config as HumanApprovalNodeConfig;
      baseStep.wouldDo = `Request approval from ${approvalConfig.approverIds.length} approver(s): "${approvalConfig.message}"`;
      baseStep.impact = `Workflow pauses until ${approvalConfig.requiredApprovals} approval(s) received`;
      baseStep.estimatedDuration = approvalConfig.timeoutHours * 3600000;
      break;
    }

    case 'DELAY': {
      const delayConfig = node.config as DelayNodeConfig;
      const delayMs = delayConfig.delayMs ?? 0;
      baseStep.wouldDo = `Delay execution: ${delayConfig.delayType} (${delayMs}ms)`;
      baseStep.estimatedDuration = delayMs;
      baseStep.impact = 'Execution paused';
      break;
    }

    case 'LOOP': {
      const loopConfig = node.config as LoopNodeConfig;
      const collectionSize = Array.isArray(context[loopConfig.collection])
        ? (context[loopConfig.collection] as unknown[]).length
        : loopConfig.maxIterations;
      baseStep.wouldDo = `Loop over ${loopConfig.collection} (up to ${collectionSize} items)`;
      baseStep.estimatedDuration = collectionSize * 1000;
      break;
    }

    case 'ERROR_HANDLER':
      baseStep.wouldDo = 'Catch and handle errors from preceding nodes';
      baseStep.impact = 'Error recovery';
      break;

    case 'SUB_WORKFLOW':
      baseStep.wouldDo = 'Execute sub-workflow';
      baseStep.impact = 'Depends on sub-workflow definition';
      break;
  }

  return baseStep;
}

function getActionImpact(actionType: string): string {
  const impacts: Record<string, string> = {
    SEND_MESSAGE: 'Creates a message record (visible to recipient)',
    CREATE_TASK: 'Creates a new task in the system',
    UPDATE_RECORD: 'Modifies an existing database record',
    GENERATE_DOCUMENT: 'Creates a new document',
    CALL_API: 'Makes an external HTTP request',
    TRIGGER_AI_ANALYSIS: 'Triggers AI processing (cost incurred)',
    SEND_NOTIFICATION: 'Sends a notification to a user',
    CREATE_EVENT: 'Creates a calendar event',
    UPDATE_CONTACT: 'Updates contact information',
    LOG_FINANCIAL: 'Creates a financial record',
    EXECUTE_SCRIPT: 'Executes a custom script (high risk)',
  };
  return impacts[actionType] ?? 'Unknown action impact';
}

function isActionReversible(actionType: string): boolean {
  const irreversible = ['SEND_MESSAGE', 'CALL_API', 'SEND_NOTIFICATION', 'EXECUTE_SCRIPT'];
  return !irreversible.includes(actionType);
}

export function estimateDuration(graph: WorkflowGraph): number {
  let total = 0;
  for (const node of graph.nodes) {
    const baseDuration = DURATION_ESTIMATES[node.type] ?? 1000;
    if (node.config.nodeType === 'DELAY') {
      const delayConfig = node.config as DelayNodeConfig;
      total += delayConfig.delayMs ?? 0;
    } else {
      total += baseDuration;
    }
  }
  return total;
}

export function estimateCost(graph: WorkflowGraph): number {
  let total = 0;
  for (const node of graph.nodes) {
    total += COST_ESTIMATES[node.type] ?? 0;
  }
  return Math.round(total * 100) / 100;
}

export function validateGraph(graph: WorkflowGraph): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!graph.nodes || graph.nodes.length === 0) {
    errors.push('Graph has no nodes');
    return { valid: false, errors };
  }

  if (!graph.edges) {
    errors.push('Graph has no edges array');
    return { valid: false, errors };
  }

  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  // Check for duplicate node IDs
  if (nodeIds.size !== graph.nodes.length) {
    errors.push('Duplicate node IDs detected');
  }

  // Check edges reference valid nodes
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.sourceNodeId)) {
      errors.push(`Edge ${edge.id} references non-existent source node: ${edge.sourceNodeId}`);
    }
    if (!nodeIds.has(edge.targetNodeId)) {
      errors.push(`Edge ${edge.id} references non-existent target node: ${edge.targetNodeId}`);
    }
  }

  // Check for disconnected nodes
  const connected = new Set<string>();
  const nodesWithIncoming = new Set(graph.edges.map((e) => e.targetNodeId));
  const nodesWithOutgoing = new Set(graph.edges.map((e) => e.sourceNodeId));

  for (const node of graph.nodes) {
    if (nodesWithIncoming.has(node.id) || nodesWithOutgoing.has(node.id)) {
      connected.add(node.id);
    }
  }

  // Single-node graphs are valid
  if (graph.nodes.length > 1) {
    const disconnected = graph.nodes.filter((n) => !connected.has(n.id));
    if (disconnected.length > 0) {
      errors.push(
        `Disconnected nodes: ${disconnected.map((n) => `${n.label} (${n.id})`).join(', ')}`
      );
    }
  }

  // Check required configs
  for (const node of graph.nodes) {
    if (!node.config) {
      errors.push(`Node ${node.label} (${node.id}) has no configuration`);
      continue;
    }

    if (node.config.nodeType === 'CONDITION') {
      const condConfig = node.config as ConditionNodeConfig;
      if (!condConfig.expression) {
        errors.push(`Condition node ${node.label} has no expression`);
      }
    }

    if (node.config.nodeType === 'ACTION') {
      const actionConfig = node.config as ActionNodeConfig;
      if (!actionConfig.actionType) {
        errors.push(`Action node ${node.label} has no action type`);
      }
    }
  }

  // Detect cycles (excluding loop nodes)
  const cycleErrors = detectCycles(graph);
  errors.push(...cycleErrors);

  return { valid: errors.length === 0, errors };
}

function detectCycles(graph: WorkflowGraph): string[] {
  const errors: string[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) {
      // Check if this is a loop node (loops are allowed)
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (node && node.config.nodeType !== 'LOOP') {
        errors.push(`Cycle detected involving node: ${node.label} (${nodeId})`);
        return true;
      }
      return false;
    }

    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);

    const outgoing = graph.edges.filter((e) => e.sourceNodeId === nodeId);
    for (const edge of outgoing) {
      dfs(edge.targetNodeId);
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return errors;
}
