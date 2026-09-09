// ============================================================================
// Core Workflow Executor — Graph Traversal Engine
// Walks the workflow graph, dispatches to node handlers, manages execution state
// ============================================================================
//
// P-09 (T-007, and P-11 finding 4): the execution store was a module-level
// `Map` with ids from a module-level counter. Both are gone. Runs now live in
// `WorkflowExecutionRecord`, which is the same table the cron producer writes
// to, so a run started by a schedule and a run started by a person are the same
// kind of row and are visible to each other.
//
// P-09 (T-001): `WorkflowExecutionRecord` has no entityId column; the scope
// comes from the parent `Workflow`, and is proved before any run row is read
// or written. `executeWorkflow` requires a VerifiedEntityId, so a caller
// holding only a workflow id off a request cannot start a run in another
// tenant -- that is a compile error, not a review miss.

import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
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

// --- Row <-> interface reconciliation ---

interface ExecutionRow {
  id: string;
  workflowId: string;
  status: string;
  triggeredBy: string;
  triggerType: string;
  startedAt: Date;
  completedAt: Date | null;
  currentNodeId: string | null;
  variables: unknown;
  stepResults: unknown;
  error: string | null;
}

function toExecution(row: ExecutionRow): WorkflowExecution {
  return {
    id: row.id,
    workflowId: row.workflowId,
    status: row.status as WorkflowExecution['status'],
    triggeredBy: row.triggeredBy,
    triggerType: row.triggerType,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? undefined,
    currentNodeId: row.currentNodeId ?? undefined,
    variables: (row.variables as Record<string, unknown>) ?? {},
    stepResults: (row.stepResults as StepExecutionResult[]) ?? [],
    error: row.error ?? undefined,
  };
}

/** Write the live state of a run back to its row. */
async function persistExecution(execution: WorkflowExecution): Promise<void> {
  await prisma.workflowExecutionRecord.updateMany({
    where: { id: execution.id },
    data: {
      status: execution.status,
      currentNodeId: execution.currentNodeId ?? null,
      variables: execution.variables as unknown as object,
      stepResults: execution.stepResults as unknown as object,
      completedAt: execution.completedAt ?? null,
      error: execution.error ?? null,
    },
  });
}

/**
 * The entity that owns a run, read off the parent workflow.
 *
 * Every entry point that takes only an execution id goes through here, so the
 * scope is a lookup rather than something a caller can assert.
 */
async function entityOfExecution(executionId: string): Promise<string | null> {
  const row = await prisma.workflowExecutionRecord.findUnique({
    where: { id: executionId },
    select: { workflowId: true },
  });
  if (!row) return null;

  const workflow = await prisma.workflow.findUnique({
    where: { id: row.workflowId },
    select: { entityId: true },
  });
  return workflow?.entityId ?? null;
}

async function requireExecution(
  executionId: string,
  entityId: string
): Promise<WorkflowExecution> {
  const owner = await entityOfExecution(executionId);
  if (owner === null || owner !== entityId) {
    throw new Error(`Execution ${executionId} not found`);
  }
  const row = await prisma.workflowExecutionRecord.findUnique({
    where: { id: executionId },
  });
  if (!row) {
    throw new Error(`Execution ${executionId} not found`);
  }
  return toExecution(row as ExecutionRow);
}

// --- Public API ---

/**
 * Start a run of a workflow this caller has been proved to own.
 *
 * `entityId` is required and branded, so `POST /api/workflows/<someone
 * else's id>/trigger` cannot reach this function at all.
 */
export async function executeWorkflow(
  workflowId: string,
  triggeredBy: string,
  triggerType: string,
  entityId: VerifiedEntityId,
  initialVariables?: Record<string, unknown>
): Promise<WorkflowExecution> {
  return runWorkflow(workflowId, triggeredBy, triggerType, entityId, initialVariables);
}

/**
 * Start a run on behalf of the entity that owns a stored workflow.
 *
 * TRUSTED PROVENANCE ONLY: the entity id must have come from a database
 * column. The two callers are the sub-workflow node (which reads the parent
 * run's entity) and the scheduler. Not re-exported from the module index.
 */
export async function executeWorkflowForEntityOwner(
  workflowId: string,
  triggeredBy: string,
  triggerType: string,
  entityId: string,
  initialVariables?: Record<string, unknown>
): Promise<WorkflowExecution> {
  return runWorkflow(workflowId, triggeredBy, triggerType, entityId, initialVariables);
}

async function runWorkflow(
  workflowId: string,
  triggeredBy: string,
  triggerType: string,
  entityId: string,
  initialVariables?: Record<string, unknown>
): Promise<WorkflowExecution> {
  // The scope is in the WHERE: another tenant's workflow is simply not found.
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, entityId },
  });

  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  const graph = workflow.steps as unknown as WorkflowGraph;
  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    throw new Error(`Workflow ${workflowId} has no nodes`);
  }

  const row = await prisma.workflowExecutionRecord.create({
    data: {
      workflowId,
      status: 'RUNNING',
      triggeredBy,
      triggerType,
      variables: (initialVariables ?? {}) as unknown as object,
      stepResults: [],
    },
  });

  const execution: WorkflowExecution = toExecution(row as ExecutionRow);
  execution.variables = initialVariables ?? {};
  execution.stepResults = [];

  try {
    // Find start nodes (no incoming edges)
    const nodesWithIncoming = new Set(graph.edges.map((e) => e.targetNodeId));
    const startNodes = graph.nodes.filter((n) => !nodesWithIncoming.has(n.id));

    if (startNodes.length === 0) {
      startNodes.push(graph.nodes[0]);
    }

    // Execute from each start node
    for (const startNode of startNodes) {
      await walkGraph(execution, graph, startNode, entityId);
    }

    // Only mark completed if not paused/cancelled by a step
    if (execution.status === 'RUNNING') {
      execution.status = 'COMPLETED';
      execution.completedAt = new Date();
    }

    await persistExecution(execution);

    // Update workflow last run and success rate
    await prisma.workflow.updateMany({
      where: { id: workflowId, entityId },
      data: {
        lastRun: new Date(),
        successRate: calculateSuccessRate(execution),
      },
    });
  } catch (err) {
    execution.status = 'FAILED';
    execution.error = err instanceof Error ? err.message : String(err);
    execution.completedAt = new Date();
    await persistExecution(execution);
  }

  return execution;
}

async function walkGraph(
  execution: WorkflowExecution,
  graph: WorkflowGraph,
  node: WorkflowNode,
  entityId: string
): Promise<void> {
  if (execution.status === 'CANCELLED' || execution.status === 'PAUSED') {
    return;
  }

  execution.currentNodeId = node.id;
  const result = await executeNode(execution, node, entityId);
  execution.stepResults.push(result);
  await persistExecution(execution);

  if (result.status === 'FAILED') {
    // Look for error handler
    const errorHandlerEdge = graph.edges.find(
      (e) => e.sourceNodeId === node.id && e.label === 'ERROR'
    );
    if (errorHandlerEdge) {
      const errorNode = graph.nodes.find((n) => n.id === errorHandlerEdge.targetNodeId);
      if (errorNode) {
        await walkGraph(execution, graph, errorNode, entityId);
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
    await walkGraph(execution, graph, next, entityId);
  }
}

export async function executeNode(
  execution: WorkflowExecution,
  node: WorkflowNode,
  entityId: string
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
          // Look up the sub-workflow definition. The parent run's entity is in
          // the WHERE, so a node naming another tenant's workflow does not
          // find it -- a sub-workflow reference is not a way across a tenancy
          // boundary.
          const subWorkflow = await prisma.workflow.findFirst({
            where: { id: subWorkflowId, entityId },
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

          // Recursively execute the sub-workflow. `entityId` came off the
          // parent workflow row, so this is the trusted-provenance entry point.
          const subResult = await executeWorkflowForEntityOwner(
            subWorkflowId,
            execution.id,
            'SUB_WORKFLOW',
            entityId,
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
        return executeNode(execution, node, entityId);
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

export async function pauseExecution(
  executionId: string,
  entityId: VerifiedEntityId
): Promise<void> {
  await requireExecution(executionId, entityId);
  await prisma.workflowExecutionRecord.updateMany({
    where: { id: executionId },
    data: { status: 'PAUSED' },
  });
}

export async function resumeExecution(
  executionId: string,
  entityId: VerifiedEntityId
): Promise<void> {
  const execution = await requireExecution(executionId, entityId);
  if (execution.status !== 'PAUSED') {
    throw new Error(
      `Execution ${executionId} is not paused (status: ${execution.status})`
    );
  }
  await prisma.workflowExecutionRecord.updateMany({
    where: { id: executionId },
    data: { status: 'RUNNING' },
  });
  // Re-enqueue for continued processing
  await enqueueWorkflowExecution(executionId, execution.workflowId, execution.variables);
}

export async function cancelExecution(
  executionId: string,
  entityId: VerifiedEntityId
): Promise<void> {
  await requireExecution(executionId, entityId);
  await prisma.workflowExecutionRecord.updateMany({
    where: { id: executionId },
    data: { status: 'CANCELLED', completedAt: new Date() },
  });
}

export async function getExecution(
  executionId: string,
  entityId: VerifiedEntityId
): Promise<WorkflowExecution | null> {
  const owner = await entityOfExecution(executionId);
  if (owner === null || owner !== entityId) return null;

  const row = await prisma.workflowExecutionRecord.findUnique({
    where: { id: executionId },
  });
  return row ? toExecution(row as ExecutionRow) : null;
}

export async function listExecutions(
  workflowId: string,
  entityId: VerifiedEntityId,
  page = 1,
  pageSize = 20
): Promise<{ data: WorkflowExecution[]; total: number }> {
  // Prove the parent first: an ordinary request for another tenant's workflow
  // returns an empty page, not that tenant's run history.
  const owner = await prisma.workflow.findFirst({
    where: { id: workflowId, entityId },
    select: { id: true },
  });
  if (!owner) return { data: [], total: 0 };

  const where = { workflowId };

  const [rows, total] = await Promise.all([
    prisma.workflowExecutionRecord.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.workflowExecutionRecord.count({ where }),
  ]);

  return { data: (rows as ExecutionRow[]).map(toExecution), total };
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

/** Remove every run record. A real delete now -- there is no Map to clear. */
export async function clearExecutionStore(): Promise<void> {
  await prisma.workflowExecutionRecord.deleteMany({});
}

/** Insert a run record directly. Test-only seam, unchanged in purpose. */
export async function setExecution(execution: WorkflowExecution): Promise<void> {
  await prisma.workflowExecutionRecord.upsert({
    where: { id: execution.id },
    create: {
      id: execution.id,
      workflowId: execution.workflowId,
      status: execution.status,
      triggeredBy: execution.triggeredBy,
      triggerType: execution.triggerType,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt ?? null,
      currentNodeId: execution.currentNodeId ?? null,
      variables: execution.variables as unknown as object,
      stepResults: execution.stepResults as unknown as object,
      error: execution.error ?? null,
    },
    update: {
      status: execution.status,
      completedAt: execution.completedAt ?? null,
      currentNodeId: execution.currentNodeId ?? null,
      variables: execution.variables as unknown as object,
      stepResults: execution.stepResults as unknown as object,
      error: execution.error ?? null,
    },
  });
}
