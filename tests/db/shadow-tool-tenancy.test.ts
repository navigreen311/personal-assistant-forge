/**
 * P-34 — THE SHADOW TOOL ROUTER, CALLED WITH ANOTHER TENANT'S IDS.
 *
 * ============================================================================
 * WHAT WAS WRONG
 * ============================================================================
 *
 * `src/modules/shadow/agent/tool-router.ts` registers 31 tools that Claude may
 * call. Eleven of them took an id straight out of `input` and queried on it
 * with no entity filter:
 *
 *     input.taskId (x2)   input.messageId (x2)  input.eventId
 *     input.contactId     input.invoiceId       input.workflowId (x2)
 *     input.entityId      input.projectId
 *
 * `input` is the tool_use block of an LLM response. It is not typed by a
 * person; it is whatever the model emitted after reading an inbox, a knowledge
 * entry, a call transcript or a web page. So a prompt injection naming another
 * tenant's cuid reached Postgres unfiltered -- and `update_task` and
 * `classify_email` were WRITES.
 *
 * The spec forbids exactly this and names this layer as the place it is
 * enforced (Addition 5.2: "Enforced at the tool router level: tools only return
 * data for the active entity"), and v3's own adversarial suite requires it
 * (§10.3 test 5, ENTITY_DATA_LEAK).
 *
 * There was ONE layer further up with the same shape and it is asserted first
 * in this file: `POST /api/shadow/session/start` wrote any `entityId` from the
 * request body onto `ShadowVoiceSession.activeEntityId`, and `buildContext`
 * fetched that entity with `findUnique` and no ownership check. So the entity
 * the tools were "scoped" to was itself attacker-chosen. Scoping the tools
 * without closing that would have been theatre, which is why both are here.
 *
 * ============================================================================
 * EVERY REFUSAL IN THIS FILE HAS A POSITIVE CONTROL
 * ============================================================================
 *
 * P-20 counted 267 route/method pairs that refuse EVERYONE and are counted as
 * evidence nowhere. A tool that returns `{ error: ... }` for every id is not a
 * scoped tool, it is a broken one, and it satisfies every negative assertion
 * anybody would write.
 *
 * So each id-taking tool is exercised twice in the same test, against the same
 * live database, with the same context: once with tenant B's id (must refuse)
 * and once with tenant A's own id (must return the real record). The control is
 * asserted on the PAYLOAD -- the task's title, the contact's email, the
 * execution's status -- not on the absence of an error field.
 *
 * Run: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paf_p34 \
 *        npx jest --config jest.db.config.ts --runInBand shadow-tool-tenancy
 */

import { POST as sessionStartPOST } from '@/app/api/shadow/session/start/route';
import { ToolRouter } from '@/modules/shadow/agent/tool-router';
import { buildContext } from '@/modules/shadow/agent/context-engine';
import type { AgentContext } from '@/modules/shadow/types';
import { db, setupTestDatabase } from '../helpers/db';
import { createTenant, createTwoTenants, type Tenant } from '../helpers/factories';
import { requestAs } from '../helpers/session';

setupTestDatabase();

const router = new ToolRouter();

/** What a tool hands back to the model, once `executeTool` has wrapped it. */
type ToolData = Record<string, unknown>;

async function callTool(
  name: string,
  input: Record<string, unknown>,
  context: AgentContext
): Promise<ToolData> {
  const result = await router.executeTool(name, input, context);
  // A thrown Prisma error would surface here as `success: false` with a driver
  // message. That is never an acceptable answer -- it is an uncontrolled
  // disclosure to the model -- so it fails the test rather than passing as "it
  // refused somehow".
  expect(result.error).toBeUndefined();
  expect(result.success).toBe(true);
  return result.data as ToolData;
}

/** The context the agent runs a turn with, built the production way. */
async function contextFor(tenant: Tenant, entityId?: string): Promise<AgentContext> {
  return buildContext({
    userId: tenant.user.id,
    sessionId: 'shadow-session-fixture',
    channel: 'web',
    activeEntityId: entityId ?? tenant.entity.id,
  });
}

// ---------------------------------------------------------------------------
// Fixtures: one addressable row of every kind the eleven sites can name
// ---------------------------------------------------------------------------

interface Rows {
  taskId: string;
  messageId: string;
  eventId: string;
  contactId: string;
  invoiceId: string;
  workflowId: string;
  projectId: string;
}

async function seedRows(entityId: string, _userId: string, label: string): Promise<Rows> {
  const project = await db.project.create({
    data: { entityId, name: `${label} project`, description: label, status: 'IN_PROGRESS' },
  });
  const task = await db.task.create({
    data: { entityId, title: `${label} task`, priority: 'P1', status: 'TODO' },
  });
  const contact = await db.contact.create({
    data: { entityId, name: `${label} contact`, email: `${label}@example.test` },
  });
  // `senderId` is foreign-key constrained to `Contact.id` (baseline migration
  // line 1466), NOT to User -- which is the whole of the `draft_email` finding
  // asserted at the bottom of this file. The fixture uses a real contact so
  // that it is testing the tools and not the constraint.
  const message = await db.message.create({
    data: {
      entityId,
      channel: 'email',
      senderId: contact.id,
      recipientId: contact.id,
      subject: `${label} subject`,
      body: `${label} body`,
      draftStatus: 'DRAFT',
      sensitivity: 'INTERNAL',
      triageScore: 1,
    },
  });
  const event = await db.calendarEvent.create({
    data: {
      entityId,
      title: `${label} event`,
      startTime: new Date(Date.now() + 3_600_000),
      endTime: new Date(Date.now() + 7_200_000),
    },
  });
  const invoice = await db.financialRecord.create({
    data: {
      entityId,
      type: 'invoice',
      amount: 4200,
      currency: 'USD',
      category: 'consulting',
      status: 'PENDING',
    },
  });
  const workflow = await db.workflow.create({
    data: {
      entityId,
      name: `${label} workflow`,
      status: 'ACTIVE',
      triggers: [{ type: 'MANUAL', config: { nodeType: 'TRIGGER', triggerType: 'MANUAL' } }],
      steps: {
        nodes: [
          {
            id: 'n1',
            type: 'TRIGGER',
            label: 'Start',
            config: { nodeType: 'TRIGGER', triggerType: 'MANUAL' },
            position: { x: 0, y: 0 },
            inputs: [],
            outputs: [],
          },
        ],
        edges: [],
      },
    },
  });

  return {
    taskId: task.id,
    messageId: message.id,
    eventId: event.id,
    contactId: contact.id,
    invoiceId: invoice.id,
    workflowId: workflow.id,
    projectId: project.id,
  };
}

// ---------------------------------------------------------------------------
// 1. The layer above: the entity the tools are scoped to is itself verified
// ---------------------------------------------------------------------------

describe('T-034 — the active entity in an agent context is proved, not accepted', () => {
  it('drops an entity the user does not own, and keeps the one they do', async () => {
    const { tenantA, tenantB } = await createTwoTenants();

    // The attack. `POST /api/shadow/session/start` accepts `entityId` from the
    // request body and writes it to `ShadowVoiceSession.activeEntityId` with no
    // ownership check; `buildContext` then received it here. Before P-34 this
    // returned tenant B's entity -- name, type and COMPLIANCE PROFILE -- which
    // `core.ts` prints verbatim into Shadow's system prompt.
    const stolen = await contextFor(tenantA, tenantB.entity.id);
    expect(stolen.activeEntity).toBeUndefined();

    // The control, same call, own entity: the context is fully populated. A
    // `buildContext` that had simply stopped returning entities would satisfy
    // the line above and nothing else in this file would notice.
    const own = await contextFor(tenantA);
    expect(own.activeEntity?.id).toBe(tenantA.entity.id);
    expect(own.activeEntity?.name).toBe(tenantA.entity.name);
    expect(own.user.id).toBe(tenantA.user.id);
  });

  it('refuses to start a voice session in an entity the caller does not own', async () => {
    const { tenantA, tenantB } = await createTwoTenants();

    // The provenance of the whole defect. This route wrote the body's
    // `entityId` to `ShadowVoiceSession.activeEntityId` unchecked, and that
    // column is what `POST /api/shadow/chat` hands to `buildContext`.
    const stolen = await sessionStartPOST(
      requestAs(tenantA, '/api/shadow/session/start', {
        method: 'POST',
        body: { channel: 'web', entityId: tenantB.entity.id },
      })
    );
    expect(stolen.status).toBe(403);
    expect(await db.shadowVoiceSession.count({ where: { activeEntityId: tenantB.entity.id } })).toBe(0);

    // The positive control: the same route, the caller's own entity, still
    // starts a session and still records the entity on it.
    const own = await sessionStartPOST(
      requestAs(tenantA, '/api/shadow/session/start', {
        method: 'POST',
        body: { channel: 'web', entityId: tenantA.entity.id },
      })
    );
    expect(own.status).toBe(201);
    expect(
      await db.shadowVoiceSession.count({ where: { activeEntityId: tenantA.entity.id } })
    ).toBe(1);
  });

  it('leaves every scoped tool with nothing to act on when the entity is not the user\'s', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    await seedRows(tenantB.entity.id, tenantB.user.id, 'B');

    const stolen = await contextFor(tenantA, tenantB.entity.id);
    const data = await callTool('list_tasks', {}, stolen);

    expect(data.error).toContain('No active entity');
    expect(data.tasks).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. The eleven sites, each refused and each still working
// ---------------------------------------------------------------------------

describe('T-034 — a tool called with another tenant id refuses it and still serves its own', () => {
  it('refuses B and serves A on every tool that takes an id from LLM input', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const a = await seedRows(tenantA.entity.id, tenantA.user.id, 'A');
    const b = await seedRows(tenantB.entity.id, tenantB.user.id, 'B');
    const context = await contextFor(tenantA);

    // --- update_task (a WRITE, and one of the two that reached the database)
    expect(await callTool('update_task', { taskId: b.taskId, title: 'owned' }, context)).toEqual({
      error: 'Task not found in the active entity.',
    });
    expect(
      await callTool('update_task', { taskId: a.taskId, title: 'renamed by A' }, context)
    ).toEqual({ updated: true, taskId: a.taskId, title: 'renamed by A', status: 'TODO' });

    // --- complete_task (a WRITE)
    expect(await callTool('complete_task', { taskId: b.taskId }, context)).toEqual({
      error: 'Task not found in the active entity.',
    });
    expect(await callTool('complete_task', { taskId: a.taskId }, context)).toEqual({
      completed: true,
      taskId: a.taskId,
      title: 'renamed by A',
    });

    // --- classify_email (a WRITE)
    expect(
      await callTool('classify_email', { messageId: b.messageId, triageScore: 9 }, context)
    ).toEqual({ error: 'Message not found in the active entity.' });
    expect(
      await callTool('classify_email', { messageId: a.messageId, triageScore: 9 }, context)
    ).toEqual({ classified: true, messageId: a.messageId, triageScore: 9 });

    // --- send_email, draft branch (a WRITE)
    expect(await callTool('send_email', { messageId: b.messageId }, context)).toEqual({
      error: 'Message not found in the active entity.',
    });
    expect(await callTool('send_email', { messageId: a.messageId }, context)).toEqual({
      sent: true,
      messageId: a.messageId,
    });

    // --- modify_calendar_event (a WRITE)
    expect(
      await callTool('modify_calendar_event', { eventId: b.eventId, title: 'owned' }, context)
    ).toEqual({ error: 'Calendar event not found in the active entity.' });
    expect(
      await callTool('modify_calendar_event', { eventId: a.eventId, title: 'A moved it' }, context)
    ).toEqual({ updated: true, eventId: a.eventId, title: 'A moved it' });

    // --- get_contact
    expect(await callTool('get_contact', { contactId: b.contactId }, context)).toEqual({
      error: 'Contact not found in the active entity.',
    });
    const contactRead = await callTool('get_contact', { contactId: a.contactId }, context);
    expect((contactRead.contact as ToolData).name).toBe('A contact');

    // --- send_invoice_reminder
    expect(await callTool('send_invoice_reminder', { invoiceId: b.invoiceId }, context)).toEqual({
      error: 'Invoice not found in the active entity.',
    });
    expect(await callTool('send_invoice_reminder', { invoiceId: a.invoiceId }, context)).toEqual({
      reminderSent: true,
      invoiceId: a.invoiceId,
      amount: 4200,
    });

    // --- get_workflow_status
    expect(await callTool('get_workflow_status', { workflowId: b.workflowId }, context)).toEqual({
      error: 'Workflow not found in the active entity.',
    });
    const status = await callTool('get_workflow_status', { workflowId: a.workflowId }, context);
    expect(status.name).toBe('A workflow');
    expect(status.status).toBe('ACTIVE');

    // --- get_project_status
    expect(await callTool('get_project_status', { projectId: b.projectId }, context)).toEqual({
      error: 'Project not found in the active entity.',
    });
    const project = await callTool('get_project_status', { projectId: a.projectId }, context);
    expect((project.project as ToolData).name).toBe('A project');

    // --- switch_entity: the one cross-USER site. It was
    // `entity.findUnique({ where: { id } })`, so an injected cuid read out a
    // stranger's company name and type.
    expect(await callTool('switch_entity', { entityId: tenantB.entity.id }, context)).toEqual({
      error: 'Entity not found',
    });
    expect(await callTool('switch_entity', { entityId: tenantA.entity.id }, context)).toEqual({
      switched: true,
      entityId: tenantA.entity.id,
      name: tenantA.entity.name,
      type: tenantA.entity.type,
    });

    // --- create_task's projectId: not one of the eleven reads, but the same
    // shape on the write side. `Task.projectId` has no entity constraint, so an
    // injected project id filed A's task under B's project -- and
    // `get_project_status` counts tasks by projectId, so it was readable from
    // the other side.
    expect(await callTool('create_task', { title: 'x', projectId: b.projectId }, context)).toEqual({
      error: 'Project not found in the active entity.',
    });
    const created = await callTool(
      'create_task',
      { title: 'legitimate', projectId: a.projectId },
      context
    );
    expect(created.created).toBe(true);
  });

  it('wrote nothing at all into tenant B while doing it', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const b = await seedRows(tenantB.entity.id, tenantB.user.id, 'B');
    const context = await contextFor(tenantA);

    await callTool('update_task', { taskId: b.taskId, title: 'OWNED', status: 'DONE' }, context);
    await callTool('complete_task', { taskId: b.taskId }, context);
    await callTool('classify_email', { messageId: b.messageId, triageScore: 10 }, context);
    await callTool('send_email', { messageId: b.messageId }, context);
    await callTool('modify_calendar_event', { eventId: b.eventId, title: 'OWNED' }, context);

    // The status code is not the claim; the row is. A refusal that still writes
    // is not a fix (P-20's finding, asserted the same way in
    // tests/db/entity-isolation.test.ts).
    const task = await db.task.findUniqueOrThrow({ where: { id: b.taskId } });
    expect(task.title).toBe('B task');
    expect(task.status).toBe('TODO');

    const message = await db.message.findUniqueOrThrow({ where: { id: b.messageId } });
    expect(message.triageScore).toBe(1);
    expect(message.draftStatus).toBe('DRAFT');

    const event = await db.calendarEvent.findUniqueOrThrow({ where: { id: b.eventId } });
    expect(event.title).toBe('B event');
  });

  it('answers a foreign id exactly as it answers an id that does not exist', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const b = await seedRows(tenantB.entity.id, tenantB.user.id, 'B');
    const context = await contextFor(tenantA);

    // P-30 gave routes a DISTINCT code for this case (403
    // ENTITY_SCOPE_MISMATCH) and was right to: there, the caller is the account
    // holder and already knows the entity exists. A tool's caller is a token
    // stream that may have been written by somebody else, so a distinguishable
    // answer is a confirmed-existence oracle addressable in natural language,
    // with no status code for anything to count. These must be identical.
    const foreign = await callTool('get_contact', { contactId: b.contactId }, context);
    const absent = await callTool('get_contact', { contactId: 'clx0000000000000000000000' }, context);
    expect(foreign).toEqual(absent);

    const foreignTask = await callTool('update_task', { taskId: b.taskId, title: 'x' }, context);
    const absentTask = await callTool(
      'update_task',
      { taskId: 'clx0000000000000000000000', title: 'x' },
      context
    );
    expect(foreignTask).toEqual(absentTask);
  });

  it('refuses another tenant contact as an email recipient, and says which failure is which', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const a = await seedRows(tenantA.entity.id, tenantA.user.id, 'A');
    const b = await seedRows(tenantB.entity.id, tenantB.user.id, 'B');
    const context = await contextFor(tenantA);

    // `Message.recipientId` carries no foreign key, so before P-34 an injected
    // contact id was simply stored -- and `relationship-intelligence.ts` reads
    // messages by `OR: [{ senderId }, { recipientId }]` on contact id, so the
    // row became readable from the other tenant's side.
    const refused = await router.executeTool(
      'draft_email',
      { recipientId: b.contactId, subject: 's', body: 'b' },
      context
    );
    expect(refused.data).toEqual({ error: 'Contact not found in the active entity.' });
    expect(await db.message.count({ where: { recipientId: b.contactId } })).toBe(1); // the fixture's own, nothing new

    // THE POSITIVE CONTROL, AND IT IS NOT A PASS -- STATED RATHER THAN HIDDEN.
    //
    // The card is explicit that a test which cannot tell "refused correctly"
    // from "broken entirely" is evidence and must say which. `draft_email` is
    // BROKEN ENTIRELY, and was before this package: it writes
    // `senderId: context.user.id`, a User id, into a column foreign-keyed to
    // `Contact.id`. It has never inserted a row, here or in production.
    //
    // So the control below does NOT show the tool working. It shows the tool
    // getting PAST the tenancy gate with its own tenant's contact and failing
    // at a different, older, non-tenancy fault -- which is the distinction
    // being asserted. `prisma/schema.prisma` is frozen for this package; see
    // PARALLEL_BUILD_ESCALATION_P34.md. When that constraint moves, this
    // assertion fails and is replaced by a real one.
    const control = await router.executeTool(
      'draft_email',
      { recipientId: a.contactId, subject: 's', body: 'b' },
      context
    );
    expect(control.success).toBe(false);
    expect(control.error).toContain('Message_senderId_fkey');
  });

  it('refuses a non-string id from the model instead of handing Prisma the value', async () => {
    // `input` is LLM-generated, so a number or an object can arrive where the
    // schema said string. Prisma throws on those, and `executeTool`'s catch
    // turns the throw into `error: <driver message>` -- a raw internal string
    // returned to the model. `callTool` asserts `success` is true, so this test
    // fails if any of these throws.
    const { tenantA } = await createTwoTenants();
    const context = await contextFor(tenantA);

    expect(await callTool('update_task', { taskId: 42 }, context)).toEqual({
      error: 'Task not found in the active entity.',
    });
    expect(await callTool('get_contact', { contactId: { $ne: null } }, context)).toEqual({
      error: 'Contact not found in the active entity.',
    });
    expect(await callTool('get_project_status', { projectId: [] }, context)).toEqual({
      error: 'Project not found in the active entity.',
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Decision 1: the rule holds between two entities of ONE user
// ---------------------------------------------------------------------------

describe('T-034 — Decision 1 inside one account: MedLink is not CRE Forge', () => {
  it('refuses the user\'s OTHER entity and serves the one in scope', async () => {
    const tenant = await createTenant();
    const second = await db.entity.create({
      data: {
        userId: tenant.user.id,
        name: 'Second Entity',
        type: 'Business',
        complianceProfile: ['HIPAA'],
      },
    });

    const inScope = await seedRows(tenant.entity.id, tenant.user.id, 'First');
    const other = await seedRows(second.id, tenant.user.id, 'Second');

    const context = await contextFor(tenant, tenant.entity.id);

    // Ownership passes for both -- the same person owns them. That is exactly
    // the case `withEntityScope`'s original userId check could not see, and the
    // reason decision-01 exists: different compliance profiles, and this one
    // carries HIPAA.
    expect(await callTool('get_contact', { contactId: other.contactId }, context)).toEqual({
      error: 'Contact not found in the active entity.',
    });
    const own = await callTool('get_contact', { contactId: inScope.contactId }, context);
    expect((own.contact as ToolData).name).toBe('First contact');

    // ...and switching contexts flips the answer both ways, which proves the
    // scope is what decides and not something about the rows.
    const otherContext = await contextFor(tenant, second.id);
    const nowVisible = await callTool('get_contact', { contactId: other.contactId }, otherContext);
    expect((nowVisible.contact as ToolData).name).toBe('Second contact');
    expect(await callTool('get_contact', { contactId: inScope.contactId }, otherContext)).toEqual({
      error: 'Contact not found in the active entity.',
    });
  });

  it('does not let list tools see the account\'s other entity either', async () => {
    const tenant = await createTenant();
    const second = await db.entity.create({
      data: { userId: tenant.user.id, name: 'Second Entity', type: 'Business' },
    });
    await seedRows(tenant.entity.id, tenant.user.id, 'First');
    await seedRows(second.id, tenant.user.id, 'Second');

    const context = await contextFor(tenant, tenant.entity.id);
    const tasks = await callTool('list_tasks', {}, context);
    const titles = (tasks.tasks as Array<{ title: string }>).map((t) => t.title);

    expect(titles).toEqual(['First task']);
  });
});

// ---------------------------------------------------------------------------
// 4. trigger_workflow: the phantom execution and the phantom audit row
// ---------------------------------------------------------------------------

describe('T-034 — trigger_workflow runs the workflow, or writes nothing', () => {
  it('actually executes, and the audit row records the run that happened', async () => {
    const tenant = await createTenant();
    const rows = await seedRows(tenant.entity.id, tenant.user.id, 'A');
    const context = await contextFor(tenant);

    const data = await callTool('trigger_workflow', { workflowId: rows.workflowId }, context);

    // Before P-34 the answer was `{ triggered: true, workflowId, name }` and
    // nothing ran. There was no execution id to return because there was no
    // execution.
    expect(data.triggered).toBe(true);
    expect(data.status).toBe('COMPLETED');
    expect(typeof data.executionId).toBe('string');
    expect(data.stepsRun).toBe(1);

    // The run is on the record, which is the claim the ActionLog row was making
    // on its own before.
    const record = await db.workflowExecutionRecord.findUniqueOrThrow({
      where: { id: data.executionId as string },
    });
    expect(record.workflowId).toBe(rows.workflowId);
    expect(record.status).toBe('COMPLETED');
    expect(record.triggeredBy).toBe(tenant.user.id);

    const logs = await db.actionLog.findMany({ where: { actionType: 'WORKFLOW_TRIGGERED' } });
    expect(logs).toHaveLength(1);
    expect(logs[0].target).toBe(rows.workflowId);
    expect(logs[0].reason).toContain(record.id);
    expect(logs[0].reason).toContain('COMPLETED');

    // And `lastRun` was stamped by the executor, from the real result --
    // not by the tool, ahead of work it never did.
    const workflow = await db.workflow.findUniqueOrThrow({ where: { id: rows.workflowId } });
    expect(workflow.lastRun).not.toBeNull();
  });

  it('finds another tenant workflow by name too, and refuses that as well', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    await seedRows(tenantB.entity.id, tenantB.user.id, 'B');
    const a = await seedRows(tenantA.entity.id, tenantA.user.id, 'A');
    const context = await contextFor(tenantA);

    // The name branch was ALREADY scoped correctly -- that is the finding:
    // one tool held two different opinions about tenancy three lines apart.
    // It stays correct, and now agrees with the id branch.
    expect(await callTool('trigger_workflow', { workflowName: 'B workflow' }, context)).toEqual({
      error: 'Workflow not found in the active entity.',
    });
    const own = await callTool('trigger_workflow', { workflowName: 'A workflow' }, context);
    expect(own.triggered).toBe(true);
    expect(own.workflowId).toBe(a.workflowId);
  });

  it('writes no audit row and starts no execution when it refuses', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const b = await seedRows(tenantB.entity.id, tenantB.user.id, 'B');
    const context = await contextFor(tenantA);

    expect(await callTool('trigger_workflow', { workflowId: b.workflowId }, context)).toEqual({
      error: 'Workflow not found in the active entity.',
    });

    // The three things the old tool did on this path, none of which may happen:
    // it stamped `lastRun` on another tenant's workflow, it wrote an ActionLog
    // row claiming WORKFLOW_TRIGGERED, and it told the model `triggered: true`.
    const workflow = await db.workflow.findUniqueOrThrow({ where: { id: b.workflowId } });
    expect(workflow.lastRun).toBeNull();
    expect(await db.actionLog.count()).toBe(0);
    expect(await db.workflowExecutionRecord.count()).toBe(0);
  });
});
