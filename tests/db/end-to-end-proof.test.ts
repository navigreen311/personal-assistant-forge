/**
 * P-20 (T-033/T-035) — THE END-TO-END PROOF.
 *
 * ============================================================================
 * THE SCENARIO, VERBATIM FROM THE AUDIT
 * ============================================================================
 *
 *   A new user registers and creates two entities, A and B. Acting in entity A,
 *   they create a task via the API. A workflow triggers on that task and
 *   executes through the queue to completion. The action is written to an
 *   append-only audit log attributed to the real authenticated user. The user
 *   then attempts, from entity A's session, to read and write entity B's tasks
 *   — and is refused. Finally they trip the dead-man's switch and the agent
 *   stops.
 *
 *   This runs with zero manual steps, survives a process restart mid-run, and
 *   is asserted by an automated test against a real Postgres.
 *
 * At the time of the audit, 2 of 8 legs passed. Eighteen packages have since
 * built every one of them, and each has a test that passes.
 *
 * ============================================================================
 * WHY THAT IS NOT THE SAME AS THIS FILE
 * ============================================================================
 *
 * Each of those eighteen tests builds its own fixture, proves its own leg
 * against it, and throws the fixture away. That is the right way to test a
 * component and it is structurally incapable of finding a seam, because a seam
 * is not inside either component: it is the mismatch between the shape one leg
 * hands over and the shape the next one expects. Every package can be right
 * about its own leg while the chain does not connect — which is precisely the
 * condition under which a system passes every test and does not work.
 *
 * So nothing here is fixtured. Each step consumes the previous step's actual
 * output: the session comes from the real credentials provider run against the
 * user the register route wrote; the entity ids come from the create-entity
 * responses; the task id comes from the task response; the workflow acts on
 * that task id; the queue job carries that workflow's real execution id; the
 * audit assertions read the rows those requests produced. Where a step cannot
 * be joined to the next, this file says so in an assertion rather than reaching
 * around it with a fixture.
 *
 * ============================================================================
 * WHAT IT FOUND, AND WHAT HAS SINCE BEEN JOINED
 * ============================================================================
 *
 * P-20 wrote this file and it found four legs that did not connect. Each was
 * invisible to a per-leg test because none of them is inside a component.
 *
 *   1. Nothing triggered a workflow from a task. There was no event bus and no
 *      subscriber; the only starts were a manual POST, a cron tick and a
 *      re-enqueue from inside a run.                          FIXED by P-27.
 *   2. `POST /api/tasks` wrote no audit row. The audit log was wired into 30
 *      route files, all under crisis / security / admin / delegation / safety.
 *      Task creation — the audit's own example — was not one of them.
 *                                                             FIXED by P-27.
 *   3. One user's two entities do NOT refuse each other. The frozen tenancy
 *      primitive proves the caller owns the entity, which is exactly the
 *      cross-USER check the eleven module suites assert. The audit's scenario
 *      is one user with two entities, and there ownership is satisfied.
 *                                                             STILL OPEN. P-29.
 *   4. The dead man switch fired and stopped nothing: it wrote an audit row
 *      naming a protocol, and afterwards every worker was still consuming and a
 *      workflow triggered a second later ran to completion.   FIXED by P-27.
 *
 * P-27 changed 1, 2 and 4 from FAIL to PASS, and this file is where that is
 * asserted rather than claimed. The `THE GAP` blocks for those three have been
 * replaced by `THE JOIN` blocks describing what now connects them; the one for
 * leg 7 is untouched, because leg 7 is untouched.
 *
 * Requires a real Postgres and a real Redis. There is deliberately no skip.
 */

// The one shim, and the same one queue-worker.test.ts carries: `uuid@13` is
// ESM-only, and this file loads the real capture worker through scripts/worker.
// A module-format substitution of Node's own randomUUID; nothing behavioural.
jest.mock('uuid', () => {
  const { randomUUID } = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return { v4: (): string => randomUUID() };
});

import IORedis from 'ioredis';
import type { Queue, Worker } from 'bullmq';
import { encode } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

import { db, setupTestDatabase } from '../helpers/db';
import { readJson, requestAs, anonymousRequest } from '../helpers/session';

import { POST as registerPOST } from '@/app/api/auth/register/route';
import { GET as entitiesGET, POST as entitiesPOST } from '@/app/api/entities/route';
import { POST as switchEntityPOST } from '@/app/api/auth/switch-entity/route';
import { GET as tasksGET, POST as tasksPOST } from '@/app/api/tasks/route';
import {
  GET as taskGET,
  PUT as taskPUT,
  DELETE as taskDELETE,
} from '@/app/api/tasks/[id]/route';
import { POST as workflowsPOST } from '@/app/api/workflows/route';
import { PUT as workflowPUT } from '@/app/api/workflows/[id]/route';
import { POST as triggerPOST } from '@/app/api/workflows/[id]/trigger/route';
import { POST as dmsPOST } from '@/app/api/crisis/dead-man-switch/route';
import { POST as checkInPOST } from '@/app/api/crisis/dead-man-switch/check-in/route';
import { POST as dmsEvaluatePOST } from '@/app/api/crisis/dead-man-switch/evaluate/route';
import { GET as accessLogGET } from '@/app/api/security/access-log/route';

import { authOptions } from '@/lib/auth/config';
import { createAllWorkers } from '../../scripts/worker';
import { getQueue } from '@/lib/queue/workflow-queue';
import { getJobQueue } from '@/lib/queue/jobs/registry';
import { getSchedulerQueue } from '@/lib/queue/scheduler';
import { getDomainEventQueue, closeDomainEventQueue } from '@/lib/queue/domain-events';
import { DMS_FIRED, DMS_PROTOCOL_EXECUTED } from '@/modules/crisis/services/dead-man-switch-service';
import { HALT_GATE_NAME } from '@/modules/execution/services/execution-gate';
import { auditService } from '@/modules/security/services/audit-service';

setupTestDatabase();
jest.setTimeout(180_000);

// P-27: the domain-event producer opens a Redis connection the first time any
// task is created, and it belongs to the process rather than to a test. The
// describe below closes the queue instance it obliterates; this also clears the
// module's cached handle, so nothing in a later describe can reach a closed one.
afterAll(async () => {
  await closeDomainEventQueue();
});

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const PASSWORD = 'Correct-Horse-9';

// ---------------------------------------------------------------------------
// Small utilities. None of them stands in for a production path.
// ---------------------------------------------------------------------------

async function assertRedisReachable(): Promise<void> {
  const probe = new IORedis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await probe.connect();
    if ((await probe.ping()) !== 'PONG') throw new Error('no PONG');
  } catch (err) {
    throw new Error(
      `tests/db/end-to-end-proof.test.ts requires a real Redis at ${REDIS_URL}: ` +
        `${err instanceof Error ? err.message : String(err)}\n` +
        'The scenario asserts a workflow executes THROUGH THE QUEUE. There is no ' +
        'in-memory fallback and no skip, because a queue leg that passes with no ' +
        'queue present is the decoration this package exists to remove.'
    );
  } finally {
    probe.disconnect();
  }
}

async function waitFor<T>(
  what: string,
  predicate: () => Promise<T | null | undefined | false>,
  timeoutMs = 30_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value as T;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${what}`);
}

/**
 * Sign in the way the product signs in, and mint the session that produces.
 *
 * `authorize` is the real credentials provider — it reads the User row the
 * register route wrote and runs the real bcrypt comparison, so a wrong password
 * fails here exactly as it fails in production. The `jwt` callback is the real
 * one too, which is what decides `activeEntityId`. Only NextAuth's HTTP shell
 * is absent, and `encode` is the same function it would call.
 *
 * Nothing is mocked: `getToken` in `withAuth` decrypts what this produces.
 */
type Authorize = (
  credentials: Record<string, string>
) => Promise<{ id: string; email: string; name: string } | null>;

/**
 * Reach the credentials provider's real `authorize`.
 *
 * A trap worth naming, because it fails in the direction of a green test:
 * NextAuth v4 builds the provider object with a placeholder `authorize: () =>
 * null` and keeps the configured one under `.options`, merging them only when it
 * normalises providers at request time. Calling the top-level property is
 * therefore a function that compiles, runs, and rejects every password — a
 * sign-in leg that "fails closed" for a reason that has nothing to do with the
 * product. The identity check below is what stops that from ever being silent.
 */
function credentialsAuthorize(): Authorize {
  const provider = authOptions.providers.find((p) => p.id === 'credentials') as unknown as {
    authorize: Authorize;
    options?: { authorize?: Authorize };
  };
  const real = provider.options?.authorize ?? provider.authorize;

  if (String(real).includes('=> null') && !String(real).includes('prisma')) {
    throw new Error(
      'The credentials provider resolved to NextAuth\'s placeholder authorize(). ' +
        'Its shape changed; find the configured function before trusting any ' +
        'sign-in assertion in this file.'
    );
  }
  return real;
}

async function signIn(email: string, password: string): Promise<{ token: string }> {
  const user = await credentialsAuthorize()({ email, password });
  if (!user) throw new Error(`Credentials rejected for ${email} — the sign-in leg failed`);

  // The token NextAuth hands its own `jwt` callback on first sign-in is not
  // empty: its JWT route seeds `{ name, email, picture, sub }` off the user
  // before any custom callback runs, and `src/lib/auth/config.ts` then adds
  // userId, role and activeEntityId. Passing `{}` here would mint a session with
  // no email — which authenticates perfectly well and writes the wrong actor on
  // every audit row, because `resolveActor` records `token.email ?? userId`.
  // Reproducing the shell means reproducing that seed.
  const claims = await authOptions.callbacks!.jwt!({
    token: { name: user.name, email: user.email, picture: null, sub: user.id },
    user: user as never,
    account: null,
    trigger: 'signIn',
  } as never);

  return {
    token: await encode({
      token: claims as never,
      secret: process.env.NEXTAUTH_SECRET!,
      maxAge: 3600,
    }),
  };
}

/** Unwrap `{ success: true, data }`, failing loudly on the other shape. */
async function dataOf<T>(res: Response, what: string): Promise<T> {
  const body = await readJson<{ success: boolean; data?: T; error?: { code: string; message: string } }>(res);
  if (!body.success) {
    throw new Error(
      `${what} failed with ${res.status} ${body.error?.code}: ${body.error?.message}`
    );
  }
  return body.data as T;
}

/**
 * A workflow whose last node hands the run to BullMQ.
 *
 * `scheduleDelay` re-enqueues onto `workflow-execution` for any `UNTIL` target
 * in the future, so this is the product's own API-reachable path from an HTTP
 * trigger into the queue — not a hand-rolled `queue.add` that would prove only
 * that BullMQ works.
 */
/**
 * How long the DELAY node defers the run for.
 *
 * `scheduleDelay` waits INLINE for a FIXED delay of 5000ms or less and only
 * re-enqueues above that, so this must exceed 5000 or the leg silently stops
 * testing the queue and starts testing `setTimeout`.
 *
 * FIXED rather than UNTIL deliberately. An `UNTIL` target is wall-clock, fixed
 * when the workflow is CREATED and evaluated when the node RUNS — so on a slow
 * runner the target can already be in the past by then, `scheduleDelay` returns
 * "Target time is in the past", nothing is enqueued, and the test fails 30
 * seconds later on a wait for a job that was never made. A FIXED delay is
 * measured from the moment the node runs and cannot expire in transit.
 */
const QUEUE_HANDOFF_DELAY_MS = 5_001;

function graphThatReachesTheQueue(taskId: string) {
  return {
    nodes: [
      {
        id: 'n-trigger',
        type: 'TRIGGER',
        label: 'Task created',
        config: { nodeType: 'TRIGGER', triggerType: 'EVENT', config: { taskId } },
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: ['out'],
      },
      {
        id: 'n-action',
        type: 'ACTION',
        label: 'Update the task that triggered this',
        config: {
          nodeType: 'ACTION',
          actionType: 'UPDATE_RECORD',
          parameters: { model: 'task', id: taskId, data: { status: 'IN_PROGRESS' } },
        },
        position: { x: 200, y: 0 },
        inputs: ['in'],
        outputs: ['out'],
      },
      {
        id: 'n-delay',
        type: 'DELAY',
        label: 'Hand off to the queue',
        config: {
          nodeType: 'DELAY',
          delayType: 'FIXED',
          delayMs: QUEUE_HANDOFF_DELAY_MS,
        },
        position: { x: 400, y: 0 },
        inputs: ['in'],
        outputs: [],
      },
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'n-trigger', targetNodeId: 'n-action' },
      { id: 'e2', sourceNodeId: 'n-action', targetNodeId: 'n-delay' },
    ],
  };
}

/**
 * The graph an EVENT-triggered workflow runs — P-27 (T-036).
 *
 * The ACTION node names NO task id. It carries the placeholder `{{taskId}}`,
 * which `executeActionNode` resolves against the run's variables, and those
 * variables come from the event payload. That is the difference between a
 * workflow triggered BY a task and a workflow about one particular task, and it
 * is the only version of this that proves the seam: a hard-coded id would pass
 * even if the trigger fired on some unrelated record.
 */
function graphThatActsOnWhicheverTaskTriggeredIt() {
  return {
    nodes: [
      {
        id: 'n-trigger',
        type: 'TRIGGER',
        label: 'Task created',
        config: { nodeType: 'TRIGGER', triggerType: 'EVENT', eventName: 'task.created' },
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: ['out'],
      },
      {
        id: 'n-action',
        type: 'ACTION',
        label: 'Update whichever task triggered this',
        config: {
          nodeType: 'ACTION',
          actionType: 'UPDATE_RECORD',
          parameters: { model: 'task', id: '{{taskId}}', data: { status: 'IN_PROGRESS' } },
        },
        position: { x: 200, y: 0 },
        inputs: ['in'],
        outputs: [],
      },
    ],
    edges: [{ id: 'e1', sourceNodeId: 'n-trigger', targetNodeId: 'n-action' }],
  };
}

// ---------------------------------------------------------------------------
// The scenario, once, start to finish.
// ---------------------------------------------------------------------------

describe('T-033 — the audit scenario, as one continuous story', () => {
  let workers: { name: string; worker: Worker }[] = [];
  let queues: Queue[] = [];

  beforeAll(async () => {
    await assertRedisReachable();
    queues = [getQueue(), getJobQueue(), getSchedulerQueue(), getDomainEventQueue()];
    for (const queue of queues) await queue.obliterate({ force: true });
    // The same set the container starts — five since P-27 added the
    // domain-event consumer. See scripts/worker.ts.
    workers = createAllWorkers();
  }, 60_000);

  afterAll(async () => {
    await Promise.all(workers.map(({ worker }) => worker.close()));
    for (const queue of queues) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
  }, 60_000);

  it('runs every leg with no manual step, and names the ones that do not connect', async () => {
    const legs: Record<string, 'PASS' | 'FAIL'> = {};
    const email = `p20-${Date.now()}@example.test`;

    // -----------------------------------------------------------------------
    // LEG 1 — a new user registers.
    // -----------------------------------------------------------------------
    const registerRes = await registerPOST(
      anonymousRequest('/api/auth/register', {
        method: 'POST',
        body: { name: 'P-20 Proof', email, password: PASSWORD },
      }) as NextRequest
    );
    expect(registerRes.status).toBe(201);
    const { userId } = await dataOf<{ userId: string }>(registerRes, 'register');

    // The row is in Postgres, and the password is hashed, not stored.
    const registered = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(registered.email).toBe(email);
    expect(JSON.stringify(registered.preferences)).not.toContain(PASSWORD);
    legs['1. register'] = 'PASS';

    // -----------------------------------------------------------------------
    // LEG 1b — sign in. The real credentials provider, the real bcrypt compare.
    // -----------------------------------------------------------------------
    await expect(signIn(email, 'wrong-password-entirely')).rejects.toThrow(/rejected/);
    const session = await signIn(email, PASSWORD);

    // -----------------------------------------------------------------------
    // LEG 2 — the user creates two entities, A and B.
    // -----------------------------------------------------------------------
    const entityA = await dataOf<{ id: string; name: string }>(
      await entitiesPOST(requestAs(session, '/api/entities', {
        method: 'POST',
        body: { name: 'Entity A', type: 'Personal' },
      })),
      'create entity A'
    );
    const entityB = await dataOf<{ id: string; name: string }>(
      await entitiesPOST(requestAs(session, '/api/entities', {
        method: 'POST',
        body: { name: 'Entity B', type: 'Business' },
      })),
      'create entity B'
    );
    expect(entityA.id).not.toBe(entityB.id);

    // Both are the caller's, read back through the list route rather than the
    // database, so the response the user would see is what is being asserted.
    const listed = await readJson<{ data: { id: string }[] }>(
      await entitiesGET(requestAs(session, '/api/entities'))
    );
    expect(listed.data.map((e) => e.id)).toEqual(expect.arrayContaining([entityA.id, entityB.id]));
    legs['2. two entities'] = 'PASS';

    // Acting in entity A: the same call the UI makes when you switch context.
    const switched = await switchEntityPOST(
      requestAs(session, '/api/auth/switch-entity', {
        method: 'POST',
        body: { entityId: entityA.id },
      })
    );
    expect(switched.status).toBe(200);

    // -----------------------------------------------------------------------
    // LEG 3 — acting in entity A, create a task via the API.
    // -----------------------------------------------------------------------
    const task = await dataOf<{ id: string; title: string; entityId: string }>(
      await tasksPOST(requestAs(session, '/api/tasks', {
        method: 'POST',
        query: { entityId: entityA.id },
        body: { title: 'Ship the platform proof', entityId: entityA.id, priority: 'P0' },
      })),
      'create task'
    );
    expect(task.entityId).toBe(entityA.id);
    expect(await db.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      entityId: entityA.id,
      title: 'Ship the platform proof',
    });
    legs['3. task via API'] = 'PASS';

    // -----------------------------------------------------------------------
    // LEG 4 — "a workflow triggers on that task".
    //
    // THE JOIN — P-27 (T-036). This was FAIL. Creating a task started nothing:
    // `executeWorkflow` had four call sites (a manual POST, the cron tick, the
    // agent orchestrator, and the executor's own delay/resume re-enqueue), and
    // none of them was subscribed to anything a record did. `Workflow.triggers`
    // could say `triggerType: 'EVENT'` and no code on earth read it.
    // `src/lib/realtime/events.ts` declared a `'task.created'` type and an
    // `emitEvent` that fans out over the SSE connections held by ONE process —
    // which the worker is not.
    //
    // Now `insertTask` publishes `task.created` onto a `domain-events` BullMQ
    // queue and `createDomainEventWorker` consumes it, matches the event name
    // against every ACTIVE workflow's stored triggers in that entity, and runs
    // the ones that asked. Nothing below reaches around that: the only thing
    // this leg does is create a task through the API and then wait.
    // -----------------------------------------------------------------------
    const reactive = await dataOf<{ id: string; status: string }>(
      await workflowsPOST(requestAs(session, '/api/workflows', {
        method: 'POST',
        query: { entityId: entityA.id },
        body: {
          name: 'On task created',
          entityId: entityA.id,
          triggers: [{ triggerType: 'EVENT', eventName: 'task.created' }],
          graph: graphThatActsOnWhicheverTaskTriggeredIt(),
        },
      })),
      'create the reactive workflow'
    );

    // `createWorkflow` writes DRAFT, and a DRAFT workflow must not fire. That
    // is the same rule the cron consumer applies to a schedule, and asserting
    // it here first is what makes the wait below evidence of a TRIGGER rather
    // than evidence that any task creation starts any workflow.
    expect(reactive.status).toBe('DRAFT');
    await dataOf<{ id: string }>(
      await tasksPOST(requestAs(session, '/api/tasks', {
        method: 'POST',
        query: { entityId: entityA.id },
        body: { title: 'Created while the workflow is still a draft', entityId: entityA.id },
      })),
      'create a task before the workflow is active'
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await db.workflowExecutionRecord.count()).toBe(0);

    const activated = await dataOf<{ status: string }>(
      await workflowPUT(
        requestAs(session, `/api/workflows/${reactive.id}`, {
          method: 'PUT',
          query: { entityId: entityA.id },
          body: { status: 'ACTIVE' },
        }),
        { params: Promise.resolve({ id: reactive.id }) }
      ),
      'activate the reactive workflow'
    );
    expect(activated.status).toBe('ACTIVE');

    // One ordinary task creation. No trigger call, no queue call, no fixture.
    const triggerTask = await dataOf<{ id: string; entityId: string }>(
      await tasksPOST(requestAs(session, '/api/tasks', {
        method: 'POST',
        query: { entityId: entityA.id },
        body: { title: 'The task that starts the workflow', entityId: entityA.id },
      })),
      'create the triggering task'
    );

    const eventRun = await waitFor(
      `a COMPLETED run of ${reactive.id} started by task ${triggerTask.id}`,
      async () => {
        const rows = await db.workflowExecutionRecord.findMany({
          where: { workflowId: reactive.id, status: 'COMPLETED' },
        });
        return (
          rows.find(
            (row) => (row.variables as { taskId?: string }).taskId === triggerTask.id
          ) ?? null
        );
      }
    );

    // The run knows what started it, and says so in a column rather than in a
    // log line: a run started by a task and a run started by a cron tick are
    // different provenances and the history has to be able to tell them apart.
    expect(eventRun.triggerType).toBe('EVENT');
    expect(eventRun.triggeredBy).toBe(`event:task.created:${triggerTask.id}`);

    // And it ACTED on the task that triggered it — the placeholder in the node
    // resolved against the event payload. This is the assertion that makes the
    // leg a join rather than a coincidence.
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: triggerTask.id } })).status
    ).toBe('IN_PROGRESS');

    // Exactly one run: the draft-era task was not retro-triggered by the
    // activation, and the event was not delivered twice.
    expect(await db.workflowExecutionRecord.count({ where: { workflowId: reactive.id } })).toBe(1);
    legs['4. workflow triggers ON THE TASK'] = 'PASS';

    // Leg 5 is a separate claim — "it executes THROUGH THE QUEUE to completion"
    // — and is settled below on its own workflow, whose DELAY node is the
    // product's own API-reachable path from a run into BullMQ.
    const workflow = await dataOf<{ id: string; status: string }>(
      await workflowsPOST(requestAs(session, '/api/workflows', {
        method: 'POST',
        query: { entityId: entityA.id },
        body: {
          name: 'On task created',
          entityId: entityA.id,
          triggers: [{ triggerType: 'EVENT', config: { entity: 'task', event: 'created' } }],
          graph: graphThatReachesTheQueue(task.id),
        },
      })),
      'create workflow'
    );

    // -----------------------------------------------------------------------
    // LEG 5 — it executes through the queue to completion.
    // -----------------------------------------------------------------------
    const execution = await dataOf<{ id: string; status: string }>(
      await triggerPOST(
        requestAs(session, `/api/workflows/${workflow.id}/trigger`, {
          method: 'POST',
          query: { entityId: entityA.id },
          body: { variables: { taskId: task.id } },
        }),
        { params: Promise.resolve({ id: workflow.id }) }
      ),
      'trigger workflow'
    );

    // The inline half ran: the ACTION node reached the task this story created.
    expect(execution.status).toBe('COMPLETED');
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: task.id } })).status
    ).toBe('IN_PROGRESS');

    // Nothing has reached the queue's CONSUMER yet: the job is sitting in Redis
    // under a five-second delay. Asserting that first is what makes the wait
    // below evidence of a worker rather than of the inline run, which has
    // already finished — and the distinction is sharp, because the inline run
    // did leave a row: `handleUpdateRecord` logs UPDATE_RECORD for the task it
    // just changed. Only `WORKFLOW_STEP_*` rows come from
    // src/lib/queue/workflow-worker.ts, and there are none of those yet.
    //
    // TWO UPDATE_RECORD rows since P-27, not one: the first is the event-driven
    // run in leg 4, the second is this manual one. Both went through the real
    // action handler, which is the point of counting them here.
    expect(
      (await db.actionLog.findMany()).map((r) => r.actionType)
    ).toEqual(['UPDATE_RECORD', 'UPDATE_RECORD']);

    // The queue half: the DELAY node handed this same execution id to BullMQ,
    // and the worker the container starts picked it up and wrote to Postgres.
    // The wait condition is the row, not the job state — "the job completed" is
    // a fact about Redis and proves nothing about the product.
    const stepRows = await waitFor(
      `WORKFLOW_STEP rows for execution ${execution.id} from the real worker`,
      async () => {
        const rows = await db.actionLog.findMany({
          where: { target: { contains: `execution:${execution.id}` } },
          orderBy: { timestamp: 'asc' },
        });
        return rows.length >= 3 ? rows : null;
      }
    );
    expect(stepRows.map((r) => r.actionType)).toEqual([
      'WORKFLOW_STEP_TRIGGER',
      'WORKFLOW_STEP_ACTION',
      'WORKFLOW_STEP_DELAY',
    ]);
    expect(stepRows.every((r) => r.status === 'EXECUTED')).toBe(true);
    expect(
      (await db.workflow.findUniqueOrThrow({ where: { id: workflow.id } })).lastRun
    ).toBeInstanceOf(Date);
    legs['5. executes through the queue'] = 'PASS';

    // -----------------------------------------------------------------------
    // LEG 6 — "the action is written to an append-only audit log attributed to
    //          the real authenticated user".
    //
    // THE JOIN, in two halves by two packages.
    //
    // P-20's assertion here was `count() === 0`: not one AuditLogEntry existed
    // for anything this story had done — register, two entity creations, an
    // entity switch, a task creation, a workflow creation and a workflow run.
    // The machinery was real (hash-chained, per-entity, tamper-verifiable, the
    // actor taken from the verified session) and was wired into 30 route files,
    // every one of them under crisis/, security/, admin/, delegation/ or
    // safety/ — none of them on this path.
    //
    // P-29 wired `POST /api/auth/switch-entity`, because a tenant-context
    // change is precisely what an auditor reconstructs a session from.
    // P-27 wired `POST /api/tasks` and the three `[id]` handlers, because task
    // creation is the audit's own example of "the action".
    //
    // Both are asserted below, and the set of audited resources is asserted
    // EXACTLY rather than loosely: the claim is that the log now reaches the
    // tenant-context change and the action and still nothing else on this path,
    // which a `count() > 0` would not say.
    //
    // `POST /api/tasks` and the three `[id]` handlers now go through
    // `audit-wiring.ts`. The assertion is on THE row for THE task this story
    // created, found by its resourceId — not on a count, which would pass for
    // any row from anywhere.
    // -----------------------------------------------------------------------
    const auditSoFar = await db.auditLogEntry.findMany({
      orderBy: { timestamp: 'asc' },
      select: { resource: true, action: true, actor: true, statusCode: true },
    });
    expect(new Set(auditSoFar.map((r) => r.resource))).toEqual(
      new Set(['auth.switch-entity', 'tasks'])
    );
    expect(auditSoFar[0]).toMatchObject({
      action: 'POST /api/auth/switch-entity',
      actor: email,
      statusCode: 200,
    });

    // And THE row for THE task this story created, found by its resourceId --
    // not by a count, which would pass for any row from anywhere.
    const taskRows = await db.auditLogEntry.findMany({
      where: { resource: 'tasks' },
      orderBy: { timestamp: 'asc' },
    });
    const createdRow = taskRows.find(
      (r) => r.requestMethod === 'POST' && r.resourceId === task.id
    );
    expect(createdRow).toBeDefined();
    expect(createdRow!.actor).toBe(email);
    expect(createdRow!.actorId).toBe(userId);
    expect(createdRow!.entityId).toBe(entityA.id);
    expect(createdRow!.statusCode).toBe(201);
    expect(createdRow!.action).toBe('POST /api/tasks');
    expect(createdRow!.hash).toMatch(/^[0-9a-f]{64}$/);

    // Append-only and tamper-evident is a claim about the CHAIN, so it is
    // checked by the product's own verifier over the rows this story produced,
    // rather than by re-implementing the comparison here. Entity A now HAS a
    // chain -- it had none at all when P-20 wrote this -- and the task rows are
    // in it. Which row is the genesis is deliberately not asserted: it depends
    // on whether the session's active entity at switch time was already A, and
    // that is P-29's question, not this leg's.
    const chainA = await db.auditLogEntry.findMany({
      where: { entityId: entityA.id },
      orderBy: { timestamp: 'asc' },
    });
    expect(chainA[0].previousHash).toBe('0');
    expect(chainA.some((r) => r.resource === 'tasks')).toBe(true);
    await expect(
      auditService.verifyAuditChain(entityA.id, {
        from: new Date(Date.now() - 60 * 60 * 1000),
        to: new Date(Date.now() + 60 * 1000),
      })
    ).resolves.toMatchObject({ valid: true });

    // The worker's ActionLog rows are still a DIFFERENT table, and the
    // distinction matters: no actor beyond the literal 'SYSTEM', no hash chain,
    // no tamper verifier, and no entityId column at all. Wiring the audit log
    // into the task routes did not turn those into audit rows.
    expect(stepRows.every((r) => r.actor === 'SYSTEM')).toBe(true);
    legs['6. audit row for the action'] = 'PASS';

    // The dead man switch has to be configured for leg 8 regardless. Its audit
    // row is asserted here too, because "the log reaches the crisis routes AND
    // the task routes" is the coverage claim, and one of the two used to be the
    // whole of it.
    await dmsPOST(
      requestAs(session, '/api/crisis/dead-man-switch', {
        method: 'POST',
        query: { entityId: entityA.id },
        body: {
          isEnabled: true,
          checkInIntervalHours: 1,
          triggerAfterMisses: 2,
          protocols: [
            {
              order: 1,
              action: 'NOTIFY_CONTACT',
              contactName: 'Next of kin',
              message: 'The switch fired.',
              delayHoursAfterTrigger: 0,
            },
          ],
        },
      })
    );
    // Scoped to this route's resource. Before P-29 and P-27 the switch and the
    // task routes wrote nothing, so the oldest row in the table was necessarily
    // this one; now it is not, and an unscoped `findFirst` would silently
    // assert against one of theirs instead.
    const dmsRow = await db.auditLogEntry.findFirstOrThrow({
      where: { resource: 'crisis.dead-man-switch' },
      orderBy: { timestamp: 'asc' },
    });
    expect(dmsRow.actor).toBe(email);
    expect(dmsRow.actorId).toBe(userId);
    expect(dmsRow.entityId).toBe(entityA.id);
    expect(dmsRow.hash).toMatch(/^[0-9a-f]{64}$/);
    // It is no longer the genesis row for entity A -- the switch or the task
    // creation is -- so it is chained to whatever preceded it rather than '0'.
    expect(dmsRow.previousHash).not.toBe('0');

    // -----------------------------------------------------------------------
    // LEG 7 — "from entity A's session, read and write entity B's tasks, and is
    //          refused".
    //
    // THE GAP, MEASURED, AND IT IS THE ONE THAT MATTERS MOST.
    //
    // `withEntityScope` resolves the entity and compares `entity.userId` to
    // `session.userId`. That is a check on WHO OWNS THE ENTITY, and it is
    // exactly right for the defect the audit found — user A reading user B's
    // records — which is what all ~138 refusal cases across eleven module
    // suites exercise, and what tests/db/cross-tenant-fuzz.test.ts sweeps.
    //
    // The scenario in this file is a different question: ONE user, TWO of their
    // own entities. Ownership is satisfied both times, so nothing refuses. The
    // task belonging to entity B is read, updated and deleted from a session
    // whose active entity is A.
    // -----------------------------------------------------------------------
    const taskInB = await dataOf<{ id: string }>(
      await tasksPOST(requestAs(session, '/api/tasks', {
        method: 'POST',
        query: { entityId: entityB.id },
        body: { title: 'Belongs to B', entityId: entityB.id },
      })),
      'create task in B'
    );

    const crossRead = await tasksGET(
      requestAs(session, '/api/tasks', { query: { entityId: entityB.id } })
    );
    expect(crossRead.status).toBe(200);
    const crossBody = await readJson<{ data: { id: string }[] }>(crossRead);
    expect(crossBody.data.map((t) => t.id)).toContain(taskInB.id);

    const crossReadOne = await taskGET(
      requestAs(session, `/api/tasks/${taskInB.id}`),
      { params: Promise.resolve({ id: taskInB.id }) }
    );
    expect(crossReadOne.status).toBe(200);

    const crossWrite = await taskPUT(
      requestAs(session, `/api/tasks/${taskInB.id}`, {
        method: 'PUT',
        body: { title: 'Written from entity A' },
      }),
      { params: Promise.resolve({ id: taskInB.id }) }
    );
    expect(crossWrite.status).toBe(200);
    // The write landed. This is the assertion that makes the finding a finding
    // rather than a status code.
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: taskInB.id } })).title
    ).toBe('Written from entity A');

    const crossDelete = await taskDELETE(
      requestAs(session, `/api/tasks/${taskInB.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: taskInB.id }) }
    );
    expect(crossDelete.status).toBe(200);
    // `deleteTask` is a soft delete, so the row survives with status CANCELLED.
    // That is the state change, and it happened from entity A's session.
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: taskInB.id } })).status
    ).toBe('CANCELLED');

    legs['7. entity A refused entity B'] = 'FAIL';

    // -----------------------------------------------------------------------
    // LEG 8 — "they trip the dead-man's switch and the agent stops".
    //
    // The switch fires. It is durable, it is idempotent, and every protocol it
    // executes lands in the hash-chained audit log with the right actor. All of
    // that is asserted below and all of it is real.
    //
    // THE JOIN — P-27 (T-038). This was FAIL. `fireDeadManSwitch` "executed" a
    // protocol by writing one AuditLogEntry naming it; `DeadManProtocol.action`
    // is a free string and no dispatcher read it. Measured then: after the
    // switch fired, every worker was still consuming, a workflow triggered a
    // second later ran to completion, and no ExecutionGateRule — the platform's
    // one real halt primitive — was created by the firing.
    //
    // The firing now writes a halt row per entity the user owns, and the
    // workflow engine consults that table before a run starts, at every node
    // boundary, and in the queue worker. Everything below reads the product's
    // own surfaces for that.
    // -----------------------------------------------------------------------
    await db.deadManSwitch.update({
      where: { userId },
      // Backdating the check-in is how an outage is expressed; there is no other
      // input to `evaluateSwitch`. Nothing about the firing path is bypassed.
      data: { lastCheckIn: new Date(Date.now() - 10 * 60 * 60 * 1000) },
    });

    const fired = await dataOf<{
      triggered: boolean;
      executed: { action: string }[];
      alreadyFired: boolean;
      haltedEntityIds: string[];
    }>(
      await dmsEvaluatePOST(
        requestAs(session, '/api/crisis/dead-man-switch/evaluate', {
          method: 'POST',
          query: { entityId: entityA.id },
          body: { entityId: entityA.id },
        })
      ),
      'evaluate dead man switch'
    );

    expect(fired.triggered).toBe(true);
    expect(fired.alreadyFired).toBe(false);
    expect(fired.executed.map((p) => p.action)).toEqual(['NOTIFY_CONTACT']);

    const firedRow = await db.auditLogEntry.findFirstOrThrow({
      where: { action: DMS_FIRED },
    });
    expect(firedRow.actorId).toBe(userId);
    expect(firedRow.resourceId).toBe(userId);
    expect(
      await db.auditLogEntry.count({ where: { action: DMS_PROTOCOL_EXECUTED } })
    ).toBe(1);
    legs['8a. switch fires and is audited'] = 'PASS';

    // ...and now the half the audit actually asked for.
    //
    // The halt is USER-scoped, so it covers EVERY entity this user owns and not
    // merely the one that happened to be in the request context. That
    // distinction is invisible to anyone with a single entity, which is exactly
    // why this story creates more than one -- and it turns out to be three, not
    // two, because `POST /api/auth/register` also creates a default 'Personal'
    // entity. The third one is the best evidence available that the halt is
    // derived from ownership rather than from what this test happened to name:
    // nothing in this file ever mentions it.
    const ownedEntityIds = (
      await db.entity.findMany({ where: { userId }, select: { id: true } })
    )
      .map((e) => e.id)
      .sort();
    expect(ownedEntityIds).toEqual(expect.arrayContaining([entityA.id, entityB.id]));
    expect(ownedEntityIds.length).toBeGreaterThan(2);

    const haltRows = await db.executionGateRule.findMany({
      where: { name: HALT_GATE_NAME },
    });
    expect(haltRows.map((r) => r.entityId).sort()).toEqual(ownedEntityIds);
    expect(haltRows.every((r) => r.isActive && r.expression === 'false')).toBe(true);
    expect([...fired.haltedEntityIds].sort()).toEqual(ownedEntityIds);

    // The workers are STILL RUNNING, and that is the design rather than a
    // leftover: all five are shared by every tenant on the platform, so a
    // per-user switch that shut them down would be everybody else's outage.
    // What stops is this user's execution, not the machine.
    expect(workers.every(({ worker }) => worker.isRunning())).toBe(true);

    const runsBeforeHalt = await db.workflowExecutionRecord.count();

    const refused = await triggerPOST(
      requestAs(session, `/api/workflows/${workflow.id}/trigger`, {
        method: 'POST',
        query: { entityId: entityA.id },
        body: { variables: { taskId: task.id } },
      }),
      { params: Promise.resolve({ id: workflow.id }) }
    );
    // 423 Locked: the workflow is intact and the refusal is temporary.
    expect(refused.status).toBe(423);
    const refusedBody = await readJson<{ success: boolean; error: { code: string } }>(refused);
    expect(refusedBody.success).toBe(false);
    expect(refusedBody.error.code).toBe('EXECUTION_HALTED');

    // Nothing started. Not a run recorded as cancelled — no run at all, which
    // is the difference between a refusal and a failure.
    expect(await db.workflowExecutionRecord.count()).toBe(runsBeforeHalt);

    // The EVENT path is stopped too, and this is the assertion that would have
    // caught a halt bolted onto one of the several doors: the reactive workflow
    // from leg 4 is still ACTIVE and still matches `task.created`.
    await dataOf<{ id: string }>(
      await tasksPOST(requestAs(session, '/api/tasks', {
        method: 'POST',
        query: { entityId: entityA.id },
        body: { title: 'Created after the switch fired', entityId: entityA.id },
      })),
      'create a task after the halt'
    );
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(
      await db.workflowExecutionRecord.count({ where: { workflowId: reactive.id } })
    ).toBe(1);

    // And it is a SWITCH, not a wall. A check-in is the user saying they are
    // here, and it lifts the halt through the product's own route — without
    // this the feature can only ever stop the agent once, permanently, and a
    // stop nobody can undo is a different product from the one described.
    const checkedIn = await checkInPOST(
      requestAs(session, '/api/crisis/dead-man-switch/check-in', {
        method: 'POST',
        query: { entityId: entityA.id },
      })
    );
    expect(checkedIn.status).toBe(200);
    expect(await db.executionGateRule.count({ where: { name: HALT_GATE_NAME } })).toBe(0);

    const resumed = await dataOf<{ id: string; status: string }>(
      await triggerPOST(
        requestAs(session, `/api/workflows/${workflow.id}/trigger`, {
          method: 'POST',
          query: { entityId: entityA.id },
          body: { variables: { taskId: task.id } },
        }),
        { params: Promise.resolve({ id: workflow.id }) }
      ),
      'trigger workflow after the check-in'
    );
    expect(resumed.status).toBe('COMPLETED');
    expect(resumed.id).not.toBe(execution.id);
    legs['8b. the agent STOPS'] = 'PASS';

    // -----------------------------------------------------------------------
    // The scoreboard, printed rather than hidden in a diff.
    // -----------------------------------------------------------------------
    console.log(
      '\nP-20 END-TO-END PROOF — leg by leg\n' +
        Object.entries(legs)
          .map(([leg, verdict]) => `  ${verdict === 'PASS' ? 'PASS' : 'FAIL'}  ${leg}`)
          .join('\n') +
        '\n'
    );

    const passed = Object.values(legs).filter((v) => v === 'PASS').length;
    // Nine rows for the audit's eight legs: the dead-man's switch leg is scored
    // twice on purpose, because "it fires" and "the agent stops" are different
    // claims and only the first is true. Collapsing them would let a firing that
    // halts nothing be reported as a pass.
    //
    // Recorded exactly, so that a later package closing one of the four gaps
    // fails this line and has to come here and say which.
    expect(Object.keys(legs).length).toBe(9);
    // Was 5 when P-20 wrote this file. P-27 joined legs 4, 6 and 8b, so it is
    // 8 — and the one that is still FAIL is leg 7, which P-29 owns. Recorded
    // exactly, so that closing it fails this line and forces whoever does it to
    // come here and say which.
    expect(passed).toBe(8);
    expect(legs['7. entity A refused entity B']).toBe('FAIL');
  });

  it('the access log serves the story back to the user who lived it', async () => {
    // A last join: the audit rows written above are readable through the
    // product's own route, scoped to the caller. An audit log with no reader
    // drifts back to being decorative.
    const email = `p20-reader-${Date.now()}@example.test`;
    await registerPOST(
      anonymousRequest('/api/auth/register', {
        method: 'POST',
        body: { name: 'Reader', email, password: PASSWORD },
      }) as NextRequest
    );
    const session = await signIn(email, PASSWORD);
    const entity = await dataOf<{ id: string }>(
      await entitiesPOST(requestAs(session, '/api/entities', {
        method: 'POST',
        body: { name: 'Only entity', type: 'Personal' },
      })),
      'create entity'
    );

    await dmsPOST(
      requestAs(session, '/api/crisis/dead-man-switch', {
        method: 'POST',
        query: { entityId: entity.id },
        body: { isEnabled: true, checkInIntervalHours: 24, triggerAfterMisses: 3, protocols: [] },
      })
    );

    const res = await accessLogGET(
      requestAs(session, '/api/security/access-log', { query: { entityId: entity.id } })
    );
    expect(res.status).toBe(200);
    const body = await readJson<{ data: { entries: { user: string; hash: string }[] } }>(res);
    expect(body.data.entries.length).toBeGreaterThan(0);
    expect(body.data.entries.every((e) => e.user === email)).toBe(true);
    expect(body.data.entries.every((e) => /^[0-9a-f]{64}$/.test(e.hash))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The seam under the seam.
// ---------------------------------------------------------------------------

describe('T-035 — the workflow engine is scoped at the route and not at the node', () => {
  /**
   * Found by joining leg 5 to leg 7 rather than by testing either.
   *
   * `POST /api/workflows/[id]/trigger` is correctly scoped: P-09 made it
   * resolve the entity from the workflow row and refuse a foreign one, and
   * `executeWorkflow` takes a `VerifiedEntityId`. Every cross-tenant test of
   * the workflows module passes.
   *
   * The nodes that run inside that execution do not carry the scope. `entityId`
   * is threaded through `walkGraph` and `executeNode` and then dropped:
   * `executeActionNode` calls `executeAction(config.actionType, params)` with
   * no scope argument, and the handlers in
   * `src/modules/workflows/services/action-handlers.ts` act on whatever ids the
   * node's stored parameters name — `handleUpdateRecord` does
   * `prisma[model].update({ where: { id } })` against an allowlist of five
   * models, and `handleCreateTask` writes `entityId: validated.entityId`
   * straight from the node config.
   *
   * A workflow is a stored object, so its node parameters are a caller-supplied
   * value that outlives the request that supplied them. No route-level fuzz can
   * see this, and neither can a workflows tenancy test that only asserts on
   * status codes.
   */
  it('lets a workflow owned by one user write into another user entity', async () => {
    const victimUser = await db.user.create({
      data: { name: 'Victim', email: `victim-${Date.now()}@example.test`, preferences: {} },
    });
    const victimEntity = await db.entity.create({
      data: { userId: victimUser.id, name: 'Victim entity', type: 'Personal' },
    });
    const victimTask = await db.task.create({
      data: { entityId: victimEntity.id, title: 'Untouched', status: 'TODO' },
    });

    const email = `attacker-${Date.now()}@example.test`;
    await registerPOST(
      anonymousRequest('/api/auth/register', {
        method: 'POST',
        body: { name: 'Attacker', email, password: PASSWORD },
      }) as NextRequest
    );
    const session = await signIn(email, PASSWORD);
    const own = await dataOf<{ id: string }>(
      await entitiesPOST(requestAs(session, '/api/entities', {
        method: 'POST',
        body: { name: 'Attacker entity', type: 'Personal' },
      })),
      'create attacker entity'
    );

    // The workflow is created in the attacker's OWN entity. Every tenancy check
    // on the way in is satisfied, because none of them looks at node parameters.
    const workflow = await dataOf<{ id: string }>(
      await workflowsPOST(requestAs(session, '/api/workflows', {
        method: 'POST',
        query: { entityId: own.id },
        body: {
          name: 'Reaches across',
          entityId: own.id,
          triggers: [],
          graph: {
            nodes: [
              {
                id: 'n1',
                type: 'ACTION',
                label: 'Update a record in another tenant',
                config: {
                  nodeType: 'ACTION',
                  actionType: 'UPDATE_RECORD',
                  parameters: {
                    model: 'task',
                    id: victimTask.id,
                    data: { title: 'Written by another tenant workflow' },
                  },
                },
                position: { x: 0, y: 0 },
                inputs: [],
                outputs: [],
              },
            ],
            edges: [],
          },
        },
      })),
      'create crossing workflow'
    );

    const res = await triggerPOST(
      requestAs(session, `/api/workflows/${workflow.id}/trigger`, {
        method: 'POST',
        query: { entityId: own.id },
        body: {},
      }),
      { params: Promise.resolve({ id: workflow.id }) }
    );
    expect(res.status).toBe(201);

    // The finding, as a row rather than a status code.
    const after = await db.task.findUniqueOrThrow({ where: { id: victimTask.id } });
    expect(after.title).toBe('Written by another tenant workflow');
    expect(after.entityId).toBe(victimEntity.id);
  });

  it('lets a workflow node create a task inside another user entity', async () => {
    const victimUser = await db.user.create({
      data: { name: 'Victim 2', email: `victim2-${Date.now()}@example.test`, preferences: {} },
    });
    const victimEntity = await db.entity.create({
      data: { userId: victimUser.id, name: 'Victim entity 2', type: 'Personal' },
    });

    const email = `attacker2-${Date.now()}@example.test`;
    await registerPOST(
      anonymousRequest('/api/auth/register', {
        method: 'POST',
        body: { name: 'Attacker 2', email, password: PASSWORD },
      }) as NextRequest
    );
    const session = await signIn(email, PASSWORD);
    const own = await dataOf<{ id: string }>(
      await entitiesPOST(requestAs(session, '/api/entities', {
        method: 'POST',
        body: { name: 'Attacker entity 2', type: 'Personal' },
      })),
      'create attacker entity'
    );

    const workflow = await dataOf<{ id: string }>(
      await workflowsPOST(requestAs(session, '/api/workflows', {
        method: 'POST',
        query: { entityId: own.id },
        body: {
          name: 'Plants a task',
          entityId: own.id,
          triggers: [],
          graph: {
            nodes: [
              {
                id: 'n1',
                type: 'ACTION',
                label: 'Create a task somewhere else',
                config: {
                  nodeType: 'ACTION',
                  actionType: 'CREATE_TASK',
                  parameters: { title: 'Planted', entityId: victimEntity.id },
                },
                position: { x: 0, y: 0 },
                inputs: [],
                outputs: [],
              },
            ],
            edges: [],
          },
        },
      })),
      'create planting workflow'
    );

    await triggerPOST(
      requestAs(session, `/api/workflows/${workflow.id}/trigger`, {
        method: 'POST',
        query: { entityId: own.id },
        body: {},
      }),
      { params: Promise.resolve({ id: workflow.id }) }
    );

    expect(
      await db.task.count({ where: { entityId: victimEntity.id, title: 'Planted' } })
    ).toBe(1);
  });
});
