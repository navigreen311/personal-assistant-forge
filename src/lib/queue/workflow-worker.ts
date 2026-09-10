// ============================================================================
// Workflow Worker — BullMQ
// Processes workflow and step execution jobs from the queue
// ============================================================================
//
// P-31 (T-039) — WHAT THIS FILE USED TO DO.
//
// `processWorkflowJob` walked the graph itself and, for every node, wrote one
// `ActionLog` row with `status: 'EXECUTED'`. It dispatched no handler: no
// CREATE_TASK, no UPDATE_RECORD, no SEND_MESSAGE, nothing. `executionId` was
// destructured out of the job data and used only inside a `target` string, so
// the `WorkflowExecutionRecord` the producer had written stayed PENDING
// forever. `processStepJob` was worse — its entire body was one `ActionLog`
// row saying EXECUTED.
//
// Every cron-started workflow therefore logged that it ran, and ran nothing. A
// row saying EXECUTED is indistinguishable from execution to anyone reading the
// table, which is why this survived: the audit trail looked right.
//
// ============================================================================
// WHY IT NOW CALLS THE EXECUTOR INSTEAD OF WALKING THE GRAPH ITSELF
// ============================================================================
//
// `src/modules/workflows/services/workflow-executor.ts` already knows how to
// run a graph: it dispatches every node type, applies retry policies, routes
// failures to ERROR_HANDLER edges, checks the halt at every node boundary, and
// persists the run's state after each step. Keeping a second walk here would
// mean a second dispatch table, a second error path and a second persistence
// policy — and the two had ALREADY diverged, silently: the executor switches on
// `node.config.nodeType`, this file switched on `node.type`. Nothing enforces
// that those agree.
//
// FOR P-32, who validates the stored graph next: `config.nodeType` is the real
// discriminant. It is what every dispatch in `executeNode` reads, and it is the
// tag on the `WorkflowNodeConfig` union, so it is the field that decides which
// other fields a node must have (`actionType`, `delayType`, `expression`...).
// `node.type` is presentation and estimation only — designer colours and icons,
// `simulation-service`'s duration and cost tables, `workflow-crud`'s legacy
// mapping. Both are required on `WorkflowNode` and `WorkflowDesigner` writes
// both, so the schema should validate `config` as a discriminated union on
// `config.nodeType` AND refuse a node whose `type` disagrees with it. Today
// nothing does, and a graph where they disagree would have been simulated as
// one kind of node and executed as another.
//
// So the graph knowledge in this file is now zero. What is left is the part
// that genuinely belongs to a queue consumer: look the workflow up, honour the
// halt, hand the run to the executor, and write down what actually happened.
//
// The executor's existing entry points do not fit a job, and it matters why:
// `executeWorkflow` and `executeWorkflowForEntityOwner` both CREATE a run,
// while a job already carries one. `resumeQueuedExecution` is the entry point
// that adopts the record the producer wrote — see its own doc comment.
// ============================================================================

import { Worker, Job } from 'bullmq';
import { getRedisUrl } from './connection';
import { prisma } from '@/lib/db';
import { isEntityHalted } from '@/modules/execution/services/execution-gate';
import {
  resumeQueuedExecution,
  executeQueuedStep,
} from '@/modules/workflows/services/workflow-executor';
import { logStepResult } from '@/modules/workflows/services/execution-logger';

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
  const { executionId, workflowId, variables } = job.data;

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
  //
  // P-31 keeps this gate exactly as P-27 wrote it. It is now the OUTERMOST of
  // the checks on this path rather than the only one: `resumeQueuedExecution`
  // goes through `walkGraph`, which checks again at every node boundary, so a
  // halt landing mid-run stops the run in place.
  if (await isEntityHalted(workflow.entityId)) {
    console.warn(
      `[workflow-worker] execution ${executionId} skipped: entity ${workflow.entityId} is halted`
    );
    return;
  }

  await job.updateProgress(0);

  const { execution, steps, skipped } = await resumeQueuedExecution(
    executionId,
    variables
  );

  if (skipped === 'ALREADY_TERMINAL') {
    // A duplicate delivery, or a run cancelled while the job waited in Redis.
    // Doing nothing is the whole point: the side effects already happened once.
    console.warn(
      `[workflow-worker] execution ${executionId} not resumed: already ${execution.status}`
    );
    return;
  }

  // The audit trail is written FROM the step results, after the fact, and says
  // what each node did — `WORKFLOW_STEP_COMPLETED`, `WORKFLOW_STEP_FAILED`,
  // `WORKFLOW_STEP_SKIPPED`, with `status: 'EXECUTED'` only for the first.
  // That is the inversion this package is for: the row is now derived from the
  // outcome instead of asserted before the work.
  //
  // `logStepResult` rather than a bespoke `ActionLog.create` so a queue-driven
  // run leaves the same trail as any other run, and `getExecutionLog` and
  // `rollbackExecution` — which match on `execution:<id>` and on `EXECUTED` +
  // `reversible` — can read and reverse it.
  for (const step of steps) {
    await logStepResult(executionId, step);
  }

  await job.updateProgress(100);

  if (execution.status === 'FAILED') {
    // The run is already recorded FAILED on its own row; throwing puts the same
    // fact on the job, where BullMQ's retry and dead-letter machinery can see
    // it. A worker that swallowed this would report a green queue over a
    // workflow that did not work — the same class of lie this package removes.
    throw new Error(
      `Execution ${executionId} failed: ${execution.error ?? 'unknown error'}`
    );
  }
}

async function processStepJob(job: Job<StepJobData>): Promise<void> {
  const { executionId, nodeId, input } = job.data;

  // P-31. Was: one ActionLog row saying EXECUTED, and no execution.
  const result = await executeQueuedStep(executionId, nodeId, input);
  await logStepResult(executionId, result);

  if (result.status === 'FAILED') {
    throw new Error(
      `Step ${nodeId} of execution ${executionId} failed: ${result.error ?? 'unknown error'}`
    );
  }
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
