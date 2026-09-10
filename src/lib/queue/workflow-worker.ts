// ============================================================================
// Workflow Worker — BullMQ
// Processes workflow and step execution jobs from the queue
// ============================================================================

import { Worker, Job } from 'bullmq';
import { getRedisUrl } from './connection';
import { prisma } from '@/lib/db';
import { isEntityHalted } from '@/modules/execution/services/execution-gate';
import type { WorkflowGraph, WorkflowNode } from '@/modules/workflows/types';

interface WorkflowJobData {
  executionId: string;
  workflowId: string;
  variables: Record<string, unknown>;
}

interface StepJobData {
  executionId: string;
  nodeId: string;
  input: Record<string, unknown>;
}

async function processWorkflowJob(job: Job<WorkflowJobData>): Promise<void> {
  const { executionId, workflowId, variables: _variables } = job.data;

  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
  });

  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  // P-27 (T-038). The third place a run can start, and it does not go through
  // `runWorkflow` at all -- a DELAY node re-enqueues here, and so does the cron
  // tick. A halt that only the executor honoured would be lifted by any
  // workflow that happened to contain a delay, which is the failure mode of a
  // gate placed at one of several doors.
  //
  // Returning rather than throwing: a halted tenant is a correct, expected
  // state, not a job failure. Throwing would burn three BullMQ attempts with
  // exponential backoff and then dead-letter the job, turning "stopped" into
  // "stopped and reported as broken".
  if (await isEntityHalted(workflow.entityId)) {
    console.warn(
      `[workflow-worker] execution ${executionId} skipped: entity ${workflow.entityId} is halted`
    );
    return;
  }

  const graph = workflow.steps as unknown as WorkflowGraph;
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  // Find trigger/start nodes (nodes with no incoming edges)
  const nodesWithIncoming = new Set(edges.map((e) => e.targetNodeId));
  const startNodes = nodes.filter((n) => !nodesWithIncoming.has(n.id));

  if (startNodes.length === 0 && nodes.length > 0) {
    // Fallback: use first node
    startNodes.push(nodes[0]);
  }

  // Walk the graph in topological order
  const visited = new Set<string>();
  const queue: WorkflowNode[] = [...startNodes];
  let stepIndex = 0;

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    // Log step execution to ActionLog
    await prisma.actionLog.create({
      data: {
        actor: 'SYSTEM',
        actionType: `WORKFLOW_STEP_${node.type}`,
        target: `workflow:${workflowId}/execution:${executionId}/node:${node.id}`,
        reason: `Executing workflow step: ${node.label}`,
        blastRadius: 'LOW',
        reversible: true,
        status: 'EXECUTED',
      },
    });

    // Update job progress
    stepIndex++;
    await job.updateProgress(Math.round((stepIndex / nodes.length) * 100));

    // Find next nodes via edges
    const outgoing = edges.filter((e) => e.sourceNodeId === node.id);
    for (const edge of outgoing) {
      const nextNode = nodes.find((n) => n.id === edge.targetNodeId);
      if (nextNode && !visited.has(nextNode.id)) {
        queue.push(nextNode);
      }
    }
  }

  // Update workflow last run
  await prisma.workflow.update({
    where: { id: workflowId },
    data: { lastRun: new Date() },
  });
}

async function processStepJob(job: Job<StepJobData>): Promise<void> {
  const { executionId, nodeId, input } = job.data;

  await prisma.actionLog.create({
    data: {
      actor: 'SYSTEM',
      actionType: 'WORKFLOW_STEP_EXECUTE',
      target: `execution:${executionId}/node:${nodeId}`,
      reason: `Step execution with input keys: ${Object.keys(input).join(', ')}`,
      blastRadius: 'LOW',
      reversible: true,
      status: 'EXECUTED',
    },
  });
}

export function createWorkflowWorker(): Worker {
  const worker = new Worker(
    'workflow-execution',
    async (job: Job) => {
      if (job.name === 'execute-workflow') {
        await processWorkflowJob(job as Job<WorkflowJobData>);
      } else if (job.name === 'execute-step') {
        await processStepJob(job as Job<StepJobData>);
      }
    },
    {
      connection: { url: getRedisUrl() },
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  return worker;
}
