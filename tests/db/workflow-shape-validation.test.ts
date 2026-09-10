/**
 * P-32 (T-039) acceptance — what a caller can no longer store, over HTTP.
 *
 * ============================================================================
 * WHY THIS IS A DATABASE TEST AND NOT A UNIT TEST
 * ============================================================================
 *
 * `tests/unit/workflows/workflow-shape.test.ts` proves the schema refuses these
 * shapes. That is a claim about a function. The claim this package has to make
 * is about the API: that a malformed trigger is refused AT THE DOOR and that
 * NOTHING IS WRITTEN when it is -- because the failure being fixed is not "a
 * bad request was accepted", it is "a bad request was accepted, stored, listed
 * in the UI as a working automation, and then matched nothing forever". Only a
 * real row can settle whether the row exists.
 *
 * So every case below goes through the same exported route handlers Next.js
 * serves, with a real NextAuth session, and then looks in Postgres.
 *
 * No TIME triggers here on purpose: a TIME trigger makes `workflow-crud`
 * reconcile BullMQ's repeat state, which opens a Queue this suite would then
 * have to close. The scheduler's half of the contract is covered against the
 * real `cronExpressionsOf` in the unit suite.
 */

import { POST as workflowsPOST } from '@/app/api/workflows/route';
import { PUT as workflowPUT } from '@/app/api/workflows/[id]/route';
import { POST as workflowTriggerPOST } from '@/app/api/workflows/[id]/trigger/route';

import { db, setupTestDatabase } from '../helpers/db';
import { createTenant, type Tenant } from '../helpers/factories';
import { readJson, requestAs } from '../helpers/session';
import { triggersMatchEvent } from '@/lib/queue/domain-events';

setupTestDatabase();

type ErrBody = { success: false; error: { code: string; message: string } };
type OkBody<T> = { success: true; data: T };

/** Next 15 hands a route its path params as a promise; mirror that exactly. */
function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

let tenant: Tenant;

beforeEach(async () => {
  tenant = await createTenant();
});

/** The smallest graph that is a graph. */
function oneActionGraph(overrides: Record<string, unknown> = {}) {
  return {
    nodes: [
      {
        id: 'n1',
        type: 'ACTION',
        label: 'Do the thing',
        config: { nodeType: 'ACTION', actionType: 'CREATE_TASK', parameters: { title: 'x' } },
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: [],
        ...overrides,
      },
    ],
    edges: [],
  };
}

async function post(body: unknown): Promise<Response> {
  return workflowsPOST(
    requestAs(tenant, '/api/workflows', { method: 'POST', body: body as object })
  );
}

async function expectRefused(body: unknown, matching: RegExp): Promise<void> {
  const before = await db.workflow.count();
  const res = await post(body);
  expect(res.status).toBe(400);
  const json = await readJson<ErrBody>(res);
  expect(json.error.code).toBe('VALIDATION_ERROR');
  expect(json.error.message).toMatch(matching);
  // The refusal is only worth anything if nothing was written.
  expect(await db.workflow.count()).toBe(before);
}

// ---------------------------------------------------------------------------
// A malformed trigger is refused at the door
// ---------------------------------------------------------------------------

describe('POST /api/workflows — a trigger that could never match is refused', () => {
  // THE TRIGGER FROM P-20's OWN PROOF FILE. `{ triggerType: 'EVENT', config:
  // { entity, event } }` stored perfectly: `createWorkflow` wrote
  // `{ type: 'EVENT', config: <that> }`, `eventNamesOf` looked for
  // `config.eventName`, found nothing, and the workflow matched no event that
  // will ever be published. Nothing in the API, the UI or the logs distinguished
  // it from a trigger that was simply waiting.
  it('refuses an EVENT trigger whose name is in an undeclared key', async () => {
    await expectRefused(
      {
        name: 'On task created',
        triggers: [{ triggerType: 'EVENT', config: { entity: 'task', event: 'created' } }],
        graph: oneActionGraph(),
      },
      /EVENT trigger needs a non-empty eventName/
    );
  });

  it('refuses an EVENT trigger with no eventName at all', async () => {
    await expectRefused(
      { name: 'w', triggers: [{ nodeType: 'TRIGGER', triggerType: 'EVENT' }], graph: oneActionGraph() },
      /eventName/
    );
  });

  // What the browser's create form used to send for "Scheduled (Time)".
  it('refuses the empty { type, config } wrapper for a type that needs a target', async () => {
    await expectRefused(
      { name: 'w', triggers: [{ type: 'TIME', config: {} }], graph: oneActionGraph() },
      /TIME trigger needs a non-empty cronExpression/
    );
  });

  it('refuses a trigger with no triggerType anywhere', async () => {
    await expectRefused(
      { name: 'w', triggers: [{ nodeType: 'TRIGGER' }], graph: oneActionGraph() },
      /triggerType/
    );
  });

  // The wrapper shape is NORMALISED rather than rejected, because it is already
  // the shape both surviving matchers read -- and because rejecting it would
  // leave both browser create paths broken instead of fixing them.
  it('accepts the browser wrapper and stores a trigger the matcher finds', async () => {
    const res = await post({
      name: 'On contact created',
      triggers: [{ type: 'EVENT', config: { eventName: 'contact.created' } }],
      graph: oneActionGraph(),
    });
    expect(res.status).toBe(201);
    const { data } = await readJson<OkBody<{ id: string }>>(res);

    const row = await db.workflow.findUniqueOrThrow({ where: { id: data.id } });
    // Stored canonically: `type` is the trigger type, not null.
    expect(row.triggers).toEqual([
      {
        type: 'EVENT',
        config: { nodeType: 'TRIGGER', triggerType: 'EVENT', eventName: 'contact.created' },
      },
    ]);
    // And the consumer P-27 built can actually find it, which is the only
    // question that matters about a stored trigger.
    expect(triggersMatchEvent(row.triggers, 'contact.created')).toBe(true);
  });

  // The read-then-write round trip `handleDuplicate` performs in the workflow
  // list. It used to double-wrap and store `{ type: null, config: { type, config } }`,
  // so every duplicated workflow silently lost its trigger.
  it('a duplicate that re-posts what it read back keeps its trigger', async () => {
    const first = await post({
      name: 'Original',
      triggers: [{ nodeType: 'TRIGGER', triggerType: 'EVENT', eventName: 'task.created' }],
      graph: oneActionGraph(),
    });
    const { data: original } = await readJson<
      OkBody<{ triggers: { type: string; config: Record<string, unknown> }[] }>
    >(first);

    const copy = await post({
      name: 'Copy of Original',
      triggers: original.triggers,
      graph: oneActionGraph(),
    });
    expect(copy.status).toBe(201);
    const { data } = await readJson<OkBody<{ id: string }>>(copy);
    const row = await db.workflow.findUniqueOrThrow({ where: { id: data.id } });
    expect(triggersMatchEvent(row.triggers, 'task.created')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A node cannot be simulated as one type and executed as another
// ---------------------------------------------------------------------------

describe('POST /api/workflows — the graph is a discriminated union now', () => {
  it('refuses a node whose type disagrees with its config.nodeType', async () => {
    await expectRefused(
      {
        name: 'Looks like a wait, sends a message',
        triggers: [],
        graph: oneActionGraph({
          type: 'DELAY',
          config: { nodeType: 'ACTION', actionType: 'SEND_MESSAGE', parameters: {} },
        }),
      },
      /declared type DELAY but its config\.nodeType is ACTION/
    );
  });

  it('refuses a node with no config at all', async () => {
    await expectRefused(
      { name: 'w', triggers: [], graph: { nodes: [{ id: 'n1', type: 'ACTION' }], edges: [] } },
      /config/
    );
  });

  it('refuses an ACTION node with no actionType', async () => {
    await expectRefused(
      {
        name: 'w',
        triggers: [],
        graph: oneActionGraph({ config: { nodeType: 'ACTION', parameters: {} } }),
      },
      /actionType/
    );
  });

  // `nodes: z.array(z.record(z.string(), z.unknown()))` accepted this exactly.
  it('refuses the empty node object the old schema accepted', async () => {
    await expectRefused({ name: 'w', triggers: [], graph: { nodes: [{}], edges: [] } }, /./);
  });

  it('still accepts a blank workflow, which is what the designer creates first', async () => {
    const res = await post({ name: 'Untitled', triggers: [], graph: { nodes: [], edges: [] } });
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// 'ACTVIE' cannot be stored
// ---------------------------------------------------------------------------

describe("PUT /api/workflows/:id — a status typo cannot silently retire a workflow", () => {
  async function seed(): Promise<string> {
    const res = await post({ name: 'w', triggers: [], graph: oneActionGraph() });
    const { data } = await readJson<OkBody<{ id: string }>>(res);
    return data.id;
  }

  // `status: z.string().optional()` stored this. The workflow then failed the
  // literal 'ACTIVE' comparison in `syncCronTriggers`, in
  // `processCronTriggerJob` and in `domain-event-worker`'s query -- so it never
  // ran again, and no screen, log or error said why.
  it('refuses ACTVIE and leaves the stored status untouched', async () => {
    const id = await seed();
    const res = await workflowPUT(
      requestAs(tenant, `/api/workflows/${id}`, { method: 'PUT', body: { status: 'ACTVIE' } }),
      ctx(id)
    );
    expect(res.status).toBe(400);
    expect((await readJson<ErrBody>(res)).error.code).toBe('VALIDATION_ERROR');
    expect((await db.workflow.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT');
  });

  it.each(['active', 'ENABLED', 'RUNNING', ''])('refuses %p', async (status) => {
    const id = await seed();
    const res = await workflowPUT(
      requestAs(tenant, `/api/workflows/${id}`, { method: 'PUT', body: { status } }),
      ctx(id)
    );
    expect(res.status).toBe(400);
    expect((await db.workflow.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT');
  });

  // Symmetry: a fix that refuses everything passes every assertion above.
  it.each(['ACTIVE', 'PAUSED', 'DRAFT', 'ARCHIVED'])('accepts %p', async (status) => {
    const id = await seed();
    const res = await workflowPUT(
      requestAs(tenant, `/api/workflows/${id}`, { method: 'PUT', body: { status } }),
      ctx(id)
    );
    expect(res.status).toBe(200);
    expect((await db.workflow.findUniqueOrThrow({ where: { id } })).status).toBe(status);
  });

  it('refuses a graph edit that would make the workflow inconsistent', async () => {
    const id = await seed();
    const res = await workflowPUT(
      requestAs(tenant, `/api/workflows/${id}`, {
        method: 'PUT',
        body: {
          graph: oneActionGraph({
            type: 'CONDITION',
            config: { nodeType: 'ACTION', actionType: 'CREATE_TASK', parameters: {} },
          }),
        },
      }),
      ctx(id)
    );
    expect(res.status).toBe(400);
    // The graph on the row is the one that was there before.
    const row = await db.workflow.findUniqueOrThrow({ where: { id } });
    expect((row.steps as { nodes: { type: string }[] }).nodes[0].type).toBe('ACTION');
  });
});

// ---------------------------------------------------------------------------
// The read side: a row that got in another way is refused when it would run
// ---------------------------------------------------------------------------

describe('a stored workflow with a contradictory node refuses to run', () => {
  // The write side cannot stop `prisma.workflow.create` -- the seed script and
  // four db fixtures call it directly, and only a database constraint could,
  // and the schema is frozen. `readWorkflowGraph` is the backstop, and it runs
  // BEFORE the execution record is created, so a refused run leaves no row
  // claiming it started.
  it('refuses at trigger time and writes no execution record', async () => {
    const workflow = await db.workflow.create({
      data: {
        name: 'Written around the API',
        entityId: tenant.entity.id,
        status: 'ACTIVE',
        triggers: [],
        steps: {
          nodes: [
            {
              id: 'n1',
              type: 'DELAY',
              label: 'Harmless wait',
              config: { nodeType: 'ACTION', actionType: 'SEND_MESSAGE', parameters: {} },
              position: { x: 0, y: 0 },
              inputs: [],
              outputs: [],
            },
          ],
          edges: [],
        },
      },
    });

    const res = await workflowTriggerPOST(
      requestAs(tenant, `/api/workflows/${workflow.id}/trigger`, { method: 'POST', body: {} }),
      ctx(workflow.id)
    );

    expect(res.status).toBe(500);
    expect((await readJson<ErrBody>(res)).error.message).toMatch(
      /simulated as one node type and executed as another/
    );
    expect(await db.workflowExecutionRecord.count({ where: { workflowId: workflow.id } })).toBe(0);
  });

  // The other half of the read-side contract: a row whose nodes are merely
  // INCOMPLETE still runs, and fails one step at a time onto the record. A read
  // schema that refused this would turn a silent bug into an outage on rows
  // nobody can migrate.
  it('still runs a node that is incomplete, and records the step as FAILED', async () => {
    const workflow = await db.workflow.create({
      data: {
        name: 'Incomplete but runnable',
        entityId: tenant.entity.id,
        status: 'ACTIVE',
        triggers: [],
        steps: {
          nodes: [
            {
              id: 'n1',
              type: 'ACTION',
              // No `parameters`, and an actionType outside the union: exactly
              // the sort of row the write side now refuses and a legacy row may
              // still hold.
              config: { nodeType: 'ACTION', actionType: 'CUSTOM' },
            },
          ],
          edges: [],
        },
      },
    });

    const res = await workflowTriggerPOST(
      requestAs(tenant, `/api/workflows/${workflow.id}/trigger`, { method: 'POST', body: {} }),
      ctx(workflow.id)
    );

    expect(res.status).toBe(201);
    const record = await db.workflowExecutionRecord.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    expect((record.stepResults as { status: string }[])[0].status).toBe('FAILED');
  });
});
