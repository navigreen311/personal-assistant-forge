// ============================================================================
// Workflow Worker — BullMQ
// Processes workflow and step execution jobs from the queue
// ============================================================================

import { Worker, Job } from 'bullmq';
import { getRedisUrl } from './connection';
import { prisma } from '@/lib/db';
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
