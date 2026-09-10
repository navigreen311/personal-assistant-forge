// ============================================================================
// P-27 (T-036) — THE CONSUMER HALF OF THE EVENT SEAM.
//
// One job in, zero or more workflow runs out. This is the only thing in the
// platform that turns something a record did into something an automation does.
//
// ============================================================================
// WHY THE MATCHING IS HERE AND NOT IN THE ROUTE OR THE SERVICE
// ============================================================================
//
// A route-level hook — "after POST /api/tasks succeeds, look for workflows" —
// misses every server-side caller: the meeting processor, a webhook pipeline, a
// future importer. A service-level hook catches all of them, which is why
// `insertTask` is where the event is PUBLISHED (see task-crud.ts: it is the one
// private write both public entry points funnel through, the codebase's own
// answer to "two callers, one truth").
//
// But publishing and REACTING are different jobs and belong on different sides
// of the queue. Evaluating triggers inside `insertTask` would put an unbounded
// amount of other people's automation on the critical path of a POST that has
// already been told it succeeded, inside the request's transaction budget, with
// a workflow's failure able to fail a task creation that already committed.
// Producer in the service, consumer in the worker.
//
// ============================================================================
// WHY IT RUNS THE WORKFLOW INLINE RATHER THAN RE-ENQUEUEING
// ============================================================================
//
// `processCronTriggerJob` writes a PENDING `WorkflowExecutionRecord` and hands
// the id to `workflow-execution`. This file calls `executeWorkflowForEntityOwner`
// instead, and the difference is not stylistic: `processWorkflowJob` in
// `workflow-worker.ts` walks the graph writing one ActionLog row per node and
// never dispatches a single action handler — no UPDATE_RECORD, no CREATE_TASK,
// nothing — and never touches the execution record it was given. A workflow
// started that way logs that it ran and does not run. (Reported as a separate
// finding; not fixed here, because P-20's leg 5 asserts that worker's current
// behaviour and this package does not get to change an assertion it did not
// come to change.)
//
// So the event path uses the real executor, which dispatches real handlers,
// honours the halt at every node, and persists the run's status. It is already
// off the request path and inside a queue worker, which is what "executes
// through the queue" asks for.
// ============================================================================

import { Worker, type Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { getRedisUrl } from './connection';
import {
  DOMAIN_EVENT_QUEUE_NAME,
  domainEventName,
  triggersMatchEvent,
  type DomainEvent,
} from './domain-events';
import { isEntityHalted } from '@/modules/execution/services/execution-gate';
import { executeWorkflowForEntityOwner } from '@/modules/workflows/services/workflow-executor';

/**
 * What one event did, returned so it lands in the BullMQ job result and can be
 * read without querying Postgres — the same reason `CronTriggerResult` exists.
 */
export interface DomainEventResult {
  event: string;
  recordId: string;
  /** Workflows whose triggers asked for this event. */
  matched: number;
  /** Execution ids started, in the order they were started. */
  started: string[];
  /** Why nothing ran, when nothing ran for a reason worth naming. */
  reason?: string;
}

/**
 * The variables a triggered run begins with.
 *
 * `<entity>Id` (e.g. `taskId`) is the convention an ACTION node's
 * `{{taskId}}` placeholder resolves against — see `executeActionNode`. Without
 * it a workflow could be started by a task and have no way to name the task
 * that started it, which is a trigger that fires and cannot act.
 */
function variablesFor(event: DomainEvent): Record<string, unknown> {
  return {
    ...(event.payload ?? {}),
    [`${event.entity}Id`]: event.recordId,
    eventName: domainEventName(event),
    eventEntityId: event.entityId,
  };
}

export async function processDomainEventJob(
  job: Job<DomainEvent>
): Promise<DomainEventResult> {
  const event = job.data;
  const name = domainEventName(event);
  const base = { event: name, recordId: event.recordId };

  // A halted tenant reacts to nothing. Checked before the workflow query so a
  // stopped entity does no work at all, and checked again inside the executor,
  // because the halt can land between these two lines.
  if (await isEntityHalted(event.entityId)) {
    return { ...base, matched: 0, started: [], reason: 'HALTED' };
  }

  // ACTIVE only. A DRAFT workflow is one someone is still writing and a PAUSED
  // one is a workflow someone deliberately stopped; either firing because a
  // record changed would be the automation running itself. This is the same
  // rule `processCronTriggerJob` applies to a schedule, deliberately — a
  // workflow that will not run on a timer must not run on an event either.
  //
  // The tenant is in the WHERE, so an event can only ever start automations
  // belonging to the entity that owns the record it describes.
  const candidates = await prisma.workflow.findMany({
    where: { entityId: event.entityId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });

  const matches = candidates.filter((workflow) =>
    triggersMatchEvent(workflow.triggers, name)
  );

  if (matches.length === 0) {
    return { ...base, matched: 0, started: [], reason: 'NO_MATCHING_TRIGGER' };
  }

  const started: string[] = [];
  for (const workflow of matches) {
    try {
      const execution = await executeWorkflowForEntityOwner(
        workflow.id,
        // The actor is the event, named precisely. Not 'SYSTEM': a run started
        // by a task creation and a run started by a cron tick are different
        // provenances and the run history has to be able to tell them apart.
        `event:${name}:${event.recordId}`,
        'EVENT',
        // Off the workflow row, which is the trusted-provenance rule
        // `executeWorkflowForEntityOwner` documents.
        workflow.entityId,
        variablesFor(event)
      );
      started.push(execution.id);
    } catch (err) {
      // One workflow failing must not stop the others from being offered the
      // event. `runWorkflow` already catches everything a node can throw and
      // records FAILED on the run; what reaches here is a refusal to start —
      // a halt that landed mid-loop, or a workflow deleted since the query.
      console.error(`[domain-events] ${name} could not start workflow ${workflow.id}:`, err);
    }
  }

  return { ...base, matched: matches.length, started };
}

/**
 * The worker for the `domain-events` queue.
 *
 * Concurrency 5, matching the workflow worker: a job here can run a whole
 * workflow, so this is not the low-cost tick `createCronWorker` deliberately
 * throttles.
 */
export function createDomainEventWorker(options?: { concurrency?: number }): Worker {
  const worker = new Worker(
    DOMAIN_EVENT_QUEUE_NAME,
    async (job: Job) => processDomainEventJob(job as Job<DomainEvent>),
    {
      connection: { url: getRedisUrl() },
      concurrency: options?.concurrency ?? 5,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[domain-events] job ${job?.id ?? 'unknown'} failed:`, err.message);
  });

  // Unhandled, an EventEmitter 'error' terminates the process, which would make
  // a Redis blip look like a crash loop. Same reasoning as scripts/worker.ts.
  worker.on('error', (err) => {
    console.error('[domain-events] worker error:', err.message);
  });

  return worker;
}
