// ============================================================================
// Core Workflow Executor — Graph Traversal Engine
// Walks the workflow graph, dispatches to node handlers, manages execution state
// ============================================================================

import { prisma } from '@/lib/db';
import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowExecution,
  StepExecutionResult,
  ActionNodeConfig,
  ConditionNodeConfig,
  AIDecisionNodeConfig,
  HumanApprovalNodeConfig,
  DelayNodeConfig,
  LoopNodeConfig,
  ErrorHandlerNodeConfig,
  SubWorkflowNodeConfig,
} from '@/modules/workflows/types';
import { evaluateExpression } from './condition-evaluator';
import { executeAction } from './action-handlers';
import { executeAIDecision } from './ai-decision-service';
import { requestApproval } from './approval-service';
import { enqueueWorkflowExecution } from '@/lib/queue/workflow-queue';

// In-memory execution store (in production, use a database table)
const executionStore = new Map<string, WorkflowExecution>();

let executionCounter = 0;

function generateExecutionId(): string {
  executionCounter++;
  return `exec-${Date.now()}-${executionCounter}`;
}

export async function executeWorkflow(
  workflowId: string,
  triggeredBy: string,
  triggerType: string,
  initialVariables?: Record<string, unknown>
): Promise<WorkflowExecution> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
  });

  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  const graph = workflow.steps as unknown as WorkflowGraph;
  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    throw new Error(`Workflow ${workflowId} has no nodes`);
  }

  const execution: WorkflowExecution = {
    id: generateExecutionId(),
    workflowId,
    status: 'RUNNING',
    triggeredBy,
    triggerType,
    startedAt: new Date(),
    variables: initialVariables ?? {},
    stepResults: [],
  };

  executionStore.set(execution.id, execution);

  try {
    // Find start nodes (no incoming edges)
    const nodesWithIncoming = new Set(graph.edges.map((e) => e.targetNodeId));
    const startNodes = graph.nodes.filter((n) => !nodesWithIncoming.has(n.id));

    if (startNodes.length === 0) {
      startNodes.push(graph.nodes[0]);
    }

    // Execute from each start node
    for (const startNode of startNodes) {
      await walkGraph(execution, graph, startNode);
    }

    // Only mark completed if not paused/cancelled by a step
    if (execution.status === 'RUNNING') {
      execution.status = 'COMPLETED';
      execution.completedAt = new Date();
    }

    // Update workflow last run and success rate
    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        lastRun: new Date(),
        successRate: calculateSuccessRate(execution),
      },
    });
  } catch (err) {
    execution.status = 'FAILED';
    execution.error = err instanceof Error ? err.message : String(err);
    execution.completedAt = new Date();
  }

  return execution;
}

async function walkGraph(
  execution: WorkflowExecution,
  graph: WorkflowGraph,
  node: WorkflowNode
): Promise<void> {
  if (execution.status === 'CANCELLED' || execution.status === 'PAUSED') {
    return;
  }

  execution.currentNodeId = node.id;
  const result = await executeNode(execution, node);
  execution.stepResults.push(result);

  if (result.status === 'FAILED') {
    // Look for error handler
    const errorHandlerEdge = graph.edges.find(
      (e) => e.sourceNodeId === node.id && e.label === 'ERROR'
    );
    if (errorHandlerEdge) {
      const errorNode = graph.nodes.find((n) => n.id === errorHandlerEdge.targetNodeId);
      if (errorNode) {
        await walkGraph(execution, graph, errorNode);
        return;
      }
    }
    // No error handler, propagate
    throw new Error(`Step ${node.id} (${node.label}) failed: ${result.error}`);
  }

  if (result.status === 'SKIPPED') return;

  // Determine condition result for condition nodes
  let conditionResult: boolean | undefined;
  if (node.config.nodeType === 'CONDITION') {
    conditionResult = result.output.result as boolean;
  }

  // Get next nodes
  const nextNodes = getNextNodes(graph, node.id, conditionResult);

  for (const next of nextNodes) {
    await walkGraph(execution, graph, next);
  }
}

export async function executeNode(
  execution: WorkflowExecution,
  node: WorkflowNode
): Promise<StepExecutionResult> {
  const result: StepExecutionResult = {
    nodeId: node.id,
    status: 'RUNNING',
    startedAt: new Date(),
    input: { ...execution.variables },
    output: {},
    retryCount: 0,
  };

  try {
    switch (node.config.nodeType) {
      case 'TRIGGER':
        // Trigger nodes are entry points, no execution needed
        result.output = { triggered: true };
        result.status = 'COMPLETED';
        break;

      case 'ACTION':
        result.output = await executeActionNode(node.config as ActionNodeConfig, execution);
        result.status = 'COMPLETED';
        break;

      case 'CONDITION':
        result.output = evaluateCondition(node.config as ConditionNodeConfig, execution.variables);
        result.status = 'COMPLETED';
        break;

      case 'AI_DECISION': {
        const aiResult = await executeAIDecisionNode(
          node.config as AIDecisionNodeConfig,
          execution.variables
        );
        result.output = aiResult;
        result.status = 'COMPLETED';
        break;
      }

      case 'HUMAN_APPROVAL': {
        const approvalResult = await requestHumanApproval(
          node.config as HumanApprovalNodeConfig,
          execution.id
        );
        result.output = approvalResult;
        // Pause execution waiting for approval
        execution.status = 'PAUSED';
        result.status = 'COMPLETED';
        break;
      }

      case 'DELAY': {
        const delayResult = await scheduleDelay(
          node.config as DelayNodeConfig,
          execution.id,
          execution.workflowId
        );
        result.output = delayResult;
        result.status = 'COMPLETED';
        break;
      }

      case 'LOOP':
        result.output = await executeLoop(
          node.config as LoopNodeConfig,
          execution
        );
        result.status = 'COMPLETED';
        break;

      case 'ERROR_HANDLER': {
        const ehConfig = node.config as ErrorHandlerNodeConfig;
        result.output = {
          handled: true,
          errorTypes: ehConfig.errorTypes,
          notified: ehConfig.notifyOnError,
        };
        result.status = 'COMPLETED';
        break;
      }

      case 'SUB_WORKFLOW': {
        const subConfig = node.config as SubWorkflowNodeConfig;
        const subWorkflowId = subConfig.workflowId;
        try {
          // Look up the sub-workflow definition
          const subWorkflow = await prisma.workflow.findUnique({
            where: { id: subWorkflowId },
          });
          if (!subWorkflow) {
            throw new Error(`Sub-workflow ${subWorkflowId} not found`);
          }

          // Map input variables from parent execution into sub-workflow variables
          const subVariables: Record<string, unknown> = {};
          for (const [subKey, parentKey] of Object.entries(subConfig.inputMapping)) {
            if (parentKey in execution.variables) {
              subVariables[subKey] = execution.variables[parentKey];
            }
          }

          // Recursively execute the sub-workflow
          const subResult = await executeWorkflow(
            subWorkflowId,
            execution.id,
            'SUB_WORKFLOW',
            subVariables,
          );

          // Map output variables from sub-workflow back to parent execution
          for (const [parentKey, subKey] of Object.entries(subConfig.outputMapping)) {
            if (subKey in subResult.variables) {
              execution.variables[parentKey] = subResult.variables[subKey];
            }
          }

          result.output = { subWorkflowId, status: 'COMPLETED', output: subResult };
          result.status = 'COMPLETED';
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.output = { subWorkflowId, status: 'FAILED', error: message };
          result.status = 'FAILED';
          result.error = message;
        }
        break;
      }

      default:
        result.status = 'SKIPPED';
        result.output = { reason: `Unknown node type: ${node.type}` };
    }
  } catch (err) {
    result.status = 'FAILED';
    result.error = err instanceof Error ? err.message : String(err);
    result.completedAt = new Date();

    // Apply retry policy if configured
    if (node.config.nodeType === 'ACTION') {
      const actionConfig = node.config as ActionNodeConfig;
      if (actionConfig.retryPolicy && result.retryCount < actionConfig.retryPolicy.maxRetries) {
        result.retryCount++;
        const backoff = Math.min(
          actionConfig.retryPolicy.backoffMs *
            Math.pow(actionConfig.retryPolicy.backoffMultiplier, result.retryCount - 1),
          actionConfig.retryPolicy.maxBackoffMs
        );
        await delay(backoff);
        return executeNode(execution, node);
      }
    }
  }

  result.completedAt = new Date();

  // Merge output into execution variables
  if (result.status === 'COMPLETED') {
    Object.assign(execution.variables, result.output);
  }

  return result;
}

async function executeActionNode(
  config: ActionNodeConfig,
  execution: WorkflowExecution
): Promise<Record<string, unknown>> {
  // Merge execution variables into parameters
  const params = { ...config.parameters };
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
      const varName = value.slice(2, -2).trim();
      if (varName in execution.variables) {
        params[key] = execution.variables[varName];
      }
    }
  }

  const result = await executeAction(config.actionType, params);
  // Include actionType in output for downstream guardrail checks
  return { ...result, actionType: config.actionType };
}

function evaluateCondition(
  config: ConditionNodeConfig,
  variables: Record<string, unknown>
): Record<string, unknown> {
  const result = evaluateExpression(config.expression, variables);
  return {
    result,
    expression: config.expression,
    trueOutputId: config.trueOutputId,
    falseOutputId: config.falseOutputId,
  };
}

async function executeAIDecisionNode(
  config: AIDecisionNodeConfig,
  variables: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const result = await executeAIDecision(config, variables);
  return {
    decision: result.decision,
    confidence: result.confidence,
    requiresHumanReview: result.requiresHumanReview,
  };
}

async function requestHumanApproval(
  config: HumanApprovalNodeConfig,
  executionId: string
): Promise<Record<string, unknown>> {
  const result = await requestApproval(config, executionId, {});
  return {
    approvalId: result.approvalId,
    status: result.status,
    message: config.message,
    requiredApprovals: config.requiredApprovals,
  };
}

async function scheduleDelay(
  config: DelayNodeConfig,
  executionId: string,
  workflowId: string
): Promise<Record<string, unknown>> {
  if (config.delayType === 'FIXED' && config.delayMs) {
    // For short delays, wait inline
    if (config.delayMs <= 5000) {
      await delay(config.delayMs);
      return { delayed: true, delayMs: config.delayMs };
    }
    // For longer delays, re-enqueue for later
    await enqueueWorkflowExecution(executionId, workflowId, {}, config.delayMs);
    return { delayed: true, delayMs: config.delayMs, requeued: true };
  }

  if (config.delayType === 'UNTIL' && config.delayUntil) {
    const targetTime = new Date(config.delayUntil);
    const delayMs = targetTime.getTime() - Date.now();
    if (delayMs > 0) {
      await enqueueWorkflowExecution(executionId, workflowId, {}, delayMs);
      return { delayed: true, until: config.delayUntil, requeued: true };
    }
    return { delayed: false, reason: 'Target time is in the past' };
  }

  return { delayed: false, delayType: config.delayType };
}

async function executeLoop(
  config: LoopNodeConfig,
  execution: WorkflowExecution
): Promise<Record<string, unknown>> {
  const collection = execution.variables[config.collection];
  if (!Array.isArray(collection)) {
    return { iterations: 0, error: `Variable ${config.collection} is not an array` };
  }

  const results: Record<string, unknown>[] = [];
  const maxIter = Math.min(collection.length, config.maxIterations);

  for (let i = 0; i < maxIter; i++) {
    execution.variables[config.iteratorVariable] = collection[i];
    results.push({ iteration: i, item: collection[i] });
  }

  return { iterations: maxIter, results };
}

export function getNextNodes(
  graph: WorkflowGraph,
  currentNodeId: string,
  conditionResult?: boolean
): WorkflowNode[] {
  const currentNode = graph.nodes.find((n) => n.id === currentNodeId);
  if (!currentNode) return [];

  const outgoingEdges = graph.edges.filter((e) => e.sourceNodeId === currentNodeId);

  if (outgoingEdges.length === 0) return [];

  // For condition nodes, filter by true/false output
  if (currentNode.config.nodeType === 'CONDITION' && conditionResult !== undefined) {
    const condConfig = currentNode.config as ConditionNodeConfig;
    const targetId = conditionResult ? condConfig.trueOutputId : condConfig.falseOutputId;
    const targetNode = graph.nodes.find((n) => n.id === targetId);
    return targetNode ? [targetNode] : [];
  }

  // For other nodes, return all connected nodes
  const nextNodes: WorkflowNode[] = [];
  for (const edge of outgoingEdges) {
    if (edge.label === 'ERROR') continue; // Skip error handler edges in normal flow
    const node = graph.nodes.find((n) => n.id === edge.targetNodeId);
    if (node) nextNodes.push(node);
  }

  return nextNodes;
}

// --- Execution Management ---

export async function pauseExecution(executionId: string): Promise<void> {
  const execution = executionStore.get(executionId);
  if (!execution) throw new Error(`Execution ${executionId} not found`);
  execution.status = 'PAUSED';
}

export async function resumeExecution(executionId: string): Promise<void> {
  const execution = executionStore.get(executionId);
  if (!execution) throw new Error(`Execution ${executionId} not found`);
  if (execution.status !== 'PAUSED') {
    throw new Error(`Execution ${executionId} is not paused (status: ${execution.status})`);
  }
  execution.status = 'RUNNING';
  // Re-enqueue for continued processing
  await enqueueWorkflowExecution(executionId, execution.workflowId, execution.variables);
}

export async function cancelExecution(executionId: string): Promise<void> {
  const execution = executionStore.get(executionId);
  if (!execution) throw new Error(`Execution ${executionId} not found`);
  execution.status = 'CANCELLED';
  execution.completedAt = new Date();
}

export async function getExecution(executionId: string): Promise<WorkflowExecution | null> {
  return executionStore.get(executionId) ?? null;
}

export async function listExecutions(
  workflowId: string,
  page = 1,
  pageSize = 20
): Promise<{ data: WorkflowExecution[]; total: number }> {
  const all = Array.from(executionStore.values()).filter(
    (e) => e.workflowId === workflowId
  );

  all.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  const start = (page - 1) * pageSize;
  return {
    data: all.slice(start, start + pageSize),
    total: all.length,
  };
}

// --- Helpers ---

function calculateSuccessRate(execution: WorkflowExecution): number {
  const completed = execution.stepResults.filter((s) => s.status === 'COMPLETED').length;
  const total = execution.stepResults.length;
  return total > 0 ? completed / total : 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Testing Helpers ---

export function clearExecutionStore(): void {
  executionStore.clear();
  executionCounter = 0;
}

export function setExecution(execution: WorkflowExecution): void {
  executionStore.set(execution.id, execution);
}
