// ============================================================================
// P-27 (T-036) — THE EVENT SEAM.
//
// The producer half of "a workflow triggers on that task". Nothing in this
// platform connected a domain change to an automation: `executeWorkflow` had
// four call sites (a human pressing POST /trigger, the cron tick, the agent
// orchestrator, and the executor's own delay/resume re-enqueue), and not one
// of them was subscribed to anything a record does. `Workflow.triggers` could
// hold `triggerType: 'EVENT'` and nothing on earth read it.
//
// ============================================================================
// WHY A QUEUE JOB AND NOT AN IN-PROCESS EMITTER OR AN OUTBOX ROW
// ============================================================================
//
// REJECTED — an in-process emitter. `src/lib/realtime/events.ts` already has
// one: `emitEvent()` fans a `RealtimeEvent` out over `connectionManager`, the
// SSE connection registry, which is a Map of the HTTP connections held by THIS
// process. It declares a `'task.created'` type, so it looks like the seam. It
// is not one. The workflow engine runs in `scripts/worker.ts`, a different
// process with a different heap, and it would never see the event. Worse, an
// emitter that dies with the process gives no retry, no dead-letter and no
// visibility — a dropped automation would be indistinguishable from a workflow
// that ran and decided to do nothing.
//
// REJECTED — an outbox row written in the same transaction as the record, then
// drained by a relay. That is the answer with no lost-event window, and it is
// the one this package cannot build: the schema is FROZEN and there is no table
// to write it to. The missing table is named in the PR body as a blocker rather
// than faked here on top of some other model.
//
// CHOSEN — a BullMQ job, because it is what this platform already runs. P-11
// built the worker process, P-09 built the cron producer/consumer pair on the
// same substrate, and `scripts/worker.ts` is the deployed consumer. A job is
// durable in Redis, survives a restart of either side, retries with backoff,
// and is inspectable. `processCronTriggerJob` in `scheduler.ts` is the shape
// this file's consumer copies deliberately, so there is one way a workflow
// starts from something other than a person.
//
// WHAT IT DOES NOT GIVE, STATED PLAINLY. The record write and the enqueue are
// two stores, and nothing makes them atomic. If Redis is unreachable at the
// moment a task is created, the task commits and the event is LOST — logged
// loudly (see `emitDomainEvent`), never silently. That is the exact defect an
// outbox closes, and it stays open until there is a table for one. It is not
// hidden behind a retry that would only make the window smaller.
// ============================================================================

import { Queue } from 'bullmq';
import { getRedisUrl } from './connection';

export const DOMAIN_EVENT_QUEUE_NAME = 'domain-events';

/** How long a publish may take before the event is given up on and logged. */
const EMIT_TIMEOUT_MS = Number(process.env.DOMAIN_EVENT_PUBLISH_TIMEOUT_MS ?? 2000);

/**
 * Something that happened to a record, addressed to whatever wants to react.
 *
 * `entityId` is the TENANT and must have been read off the row that was just
 * written — never off a request. Everything downstream treats it as proven,
 * because by the time an event exists the write it describes has already been
 * authorised.
 */
export interface DomainEvent {
  /** The kind of record, e.g. `'task'`. */
  entity: string;
  /** What happened to it, e.g. `'created'`. */
  event: string;
  /** The tenant that owns the record. From a database column. */
  entityId: string;
  /** The record this is about. */
  recordId: string;
  /** Extra variables handed to any workflow this event starts. */
  payload?: Record<string, unknown>;
}

/** The dotted name a workflow trigger matches on, e.g. `task.created`. */
export function domainEventName(event: Pick<DomainEvent, 'entity' | 'event'>): string {
  return `${event.entity}.${event.event}`;
}

/**
 * The event names a workflow's stored triggers ask to be started by.
 *
 * Deliberately the same two-shape tolerance as `cronExpressionsOf` in
 * `scheduler.ts`, and for the same reason: `workflow-crud` stores a trigger as
 * `{ type, config }` where `config` is the whole `TriggerNodeConfig`, but rows
 * written before that wrapper hold the bare config. A trigger that silently
 * matches nothing is the failure this file exists to end, so both are read.
 *
 * The name comes from `TriggerNodeConfig.eventName` — the field the type
 * declares. Nothing else is accepted: an undeclared shape that happens to work
 * is how a trigger ends up looking configured while matching nothing forever.
 */
export function eventNamesOf(triggers: unknown): string[] {
  if (!Array.isArray(triggers)) return [];

  const out: string[] = [];
  for (const entry of triggers) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const config =
      record.config && typeof record.config === 'object'
        ? (record.config as Record<string, unknown>)
        : record;

    const triggerType = config.triggerType ?? record.type;
    if (triggerType !== 'EVENT') continue;

    const name = config.eventName;
    if (typeof name === 'string' && name.trim().length > 0) {
      out.push(name.trim());
    }
  }
  return out;
}

/** Does this workflow's trigger list ask for this event? */
export function triggersMatchEvent(triggers: unknown, eventName: string): boolean {
  return eventNamesOf(triggers).includes(eventName);
}

/**
 * The producer connection, cached PER PROCESS rather than per module.
 *
 * `globalThis` and not a module-level `let`, for the same reason `src/lib/db`
 * keeps the PrismaClient there. A module-level cache is one cache per module
 * REGISTRY, and a process can have several: Next.js replaces the registry on
 * every hot reload in development, and jest replaces it on every
 * `jest.resetModules()`. Each new registry would build a second Queue, and a
 * Queue is a live Redis socket — so the old one is unreachable, unclosable, and
 * keeps the event loop open forever.
 *
 * That is not hypothetical. `tests/db/restart-survivability.test.ts` calls
 * `jest.resetModules()` six times to simulate a restart, and with a module-level
 * cache its `afterAll` closed the queue belonging to the FIRST registry while
 * five others stayed open — measured as jest hanging with "did not exit one
 * second after the test run has completed" on a suite whose tests all passed.
 */
const globalForQueue = globalThis as unknown as {
  __pafDomainEventQueue?: Queue | null;
};

/**
 * The domain-event queue.
 *
 * Throws when Redis is explicitly disabled rather than opening a socket to a
 * default nobody configured — see `connection.ts`. `emitDomainEvent` checks
 * first, so the unit suite never reaches this.
 */
export function getDomainEventQueue(): Queue {
  if (!globalForQueue.__pafDomainEventQueue) {
    const url = getRedisUrl();
    if (!url) {
      throw new Error(
        'REDIS_URL is set to "disabled", so this process has no domain-event queue.',
      );
    }
    globalForQueue.__pafDomainEventQueue = new Queue(DOMAIN_EVENT_QUEUE_NAME, {
      connection: { url },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return globalForQueue.__pafDomainEventQueue;
}

/**
 * Close the producer connection and forget the cached queue.
 *
 * A `Queue` holds an ioredis socket for the life of the process, which is right
 * for a Next.js server and a worker and wrong for anything short-lived --
 * including a jest run. `emitDomainEvent` opens one the first time ANY code
 * path creates a task, so a suite that merely exercises the task routes now
 * owns a connection it never asked for and, without this, jest reports "did not
 * exit one second after the test run has completed" and hangs.
 *
 * That is the same pattern `end-to-end-proof.test.ts` and `queue-worker.test.ts`
 * already follow for the other four queues: whoever causes a queue to open
 * closes it. Every `tests/db` suite that can reach `insertTask` calls this in an
 * afterAll -- if you add another, add the hook, because the failure mode is a
 * hung CI job and not a red test.
 */
export async function closeDomainEventQueue(): Promise<void> {
  const open = globalForQueue.__pafDomainEventQueue;
  globalForQueue.__pafDomainEventQueue = null;
  if (open) await open.close();
}

/**
 * Publish one domain event. Returns the job id, or null when nothing was sent.
 *
 * NEVER THROWS. A task that was created must not be reported as a failure
 * because the notification about it could not be queued — the row is already
 * committed and the caller has already been told, so throwing here would report
 * a state that is not the one in the database. A failure is logged at error
 * level instead, which is the difference between an event-bus outage that is
 * visible and one that is not.
 *
 * Returns null, without opening a connection, when this process has no Redis
 * (`REDIS_URL=disabled` — the unit suite, and the documented degradation
 * path). Reaching the no-Redis branch by failing a connection is not the same
 * as not connecting: see tests/helpers/redis.ts for the nine failures that
 * distinction cost.
 */
export async function emitDomainEvent(event: DomainEvent): Promise<string | null> {
  if (!getRedisUrl()) return null;

  const name = domainEventName(event);
  try {
    const add = getDomainEventQueue().add(name, event, {
      // Deterministic, so a retried write cannot produce two events for one
      // record and start every matching workflow twice.
      jobId: `evt-${name}-${event.recordId}`,
    });

    // ioredis retries a command forever by default, so an unreachable Redis
    // does not make `add` fail — it makes it never return, and this call sits
    // on the request path of a write that has already committed. A bound turns
    // "the API hangs while Redis is down" into "the event is lost and said so",
    // which is the same failure the outbox note above describes and is the only
    // one of the two an operator can act on.
    const job = await Promise.race([
      add,
      new Promise<null>((resolve) => {
        const timer = setTimeout(() => resolve(null), EMIT_TIMEOUT_MS);
        // Do not hold a worker process open on a publish that is only slow.
        timer.unref?.();
      }),
    ]);

    if (job === null) {
      // The losing promise is still live; without this handler a later
      // rejection is an unhandledRejection, and `scripts/worker.ts` treats one
      // of those as a reason to shut the process down.
      void add.catch(() => undefined);
      console.error('[domain-events] publish timed out', {
        event: name,
        recordId: event.recordId,
        timeoutMs: EMIT_TIMEOUT_MS,
      });
      return null;
    }

    return job.id ?? null;
  } catch (err) {
    console.error('[domain-events] failed to publish', {
      event: name,
      recordId: event.recordId,
      entityId: event.entityId,
      err: err instanceof Error ? err.message : err,
    });
    return null;
  }
}
