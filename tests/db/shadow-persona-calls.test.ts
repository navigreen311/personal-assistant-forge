/**
 * P-16 (Sprint 5) — ENTITY PERSONAS, CALL PLAYBOOKS, DNC AND QUIET HOURS.
 *
 * ============================================================================
 * THE FOUR THINGS THIS FILE EXISTS TO PROVE
 * ============================================================================
 *
 * 6. An entity voice profile can be listed, read, written and SWITCHED TO, and
 *    the switch moves `ShadowVoiceSession.activeEntityId` in Postgres.
 *
 * 7. The agent's `switch_entity` tool switches the agent. P-34 left the note in
 *    `tool-router.ts`: "it still does not switch anything ... the name is a
 *    promise the code does not keep". The proof that it is kept now is a
 *    durable session row plus the persona recorded on the assistant message.
 *
 * 8. A stored playbook becomes a plan for a specific call — and the request
 *    schema in front of the playbook routes stopped silently discarding every
 *    compliance field a caller sent.
 *
 * 9. `ContactCallPreference.doNotCall` stops a call, and the contact's own
 *    quiet hours are read rather than a hard-coded window.
 *
 * Nothing below calls a service directly except where a route does not exist to
 * call; every assertion is a row read back out of Postgres after a route ran.
 */

// The agent calls Claude three times per turn (classify, tool loop, finish).
// The model is the external service; the entry point under test is
// `POST /api/shadow/chat`, which is called for real.
const anthropicCreate = jest.fn();

jest.mock('@/lib/ai', () => ({
  anthropic: { messages: { create: (...args: unknown[]) => anthropicCreate(...args) } },
  generateText: jest.fn().mockResolvedValue(''),
  generateJSON: jest.fn().mockResolvedValue({}),
  chat: jest.fn(),
  streamText: jest.fn(),
}));

import { db, setupTestDatabase } from '../helpers/db';
import { createTenant, createTwoTenants, type Tenant } from '../helpers/factories';
import { readJson, requestAs } from '../helpers/session';

import { GET as entityProfilesGET } from '@/app/api/shadow/config/entity/route';
import {
  GET as entityProfileGET,
  PUT as entityProfilePUT,
} from '@/app/api/shadow/config/entity/[id]/route';
import { POST as entitySwitchPOST } from '@/app/api/shadow/config/entity/[id]/switch/route';
import { POST as chatPOST } from '@/app/api/shadow/chat/route';
import {
  GET as playbooksGET,
  POST as playbooksPOST,
} from '@/app/api/shadow/playbooks/route';
import {
  GET as playbookGET,
  PUT as playbookPUT,
} from '@/app/api/shadow/playbooks/[id]/route';
import { POST as callPlanPOST } from '@/app/api/shadow/voiceforge/calls/plan/route';
import {
  GET as callPrefsGET,
  PUT as callPrefsPUT,
} from '@/app/api/contacts/[id]/call-preferences/route';

setupTestDatabase();

type Envelope<T> = { success: boolean; data: T };

beforeEach(() => {
  anthropicCreate.mockReset();
});

// ===========================================================================
// DELIVERABLE 6 — entity voice profile CRUD and switching
// ===========================================================================

describe('entity voice profiles', () => {
  it('lists every entity the user owns and says which have a profile', async () => {
    const tenant = await createTenant();
    const second = await db.entity.create({
      data: { name: 'MedLink Pro', type: 'Business', userId: tenant.user.id },
    });
    await db.shadowEntityProfile.create({
      data: { entityId: second.id, tone: 'formal', voicePersona: 'clinical' },
    });

    const res = await entityProfilesGET(requestAs(tenant, '/api/shadow/config/entity'));
    expect(res.status).toBe(200);

    const body = await readJson<
      Envelope<Array<{ entityId: string; tone: string; configured: boolean }>>
    >(res);

    expect(body.data).toHaveLength(2);
    const medlink = body.data.find((p) => p.entityId === second.id);
    expect(medlink?.tone).toBe('formal');
    expect(medlink?.configured).toBe(true);

    const other = body.data.find((p) => p.entityId === tenant.entity.id);
    // A default-filled answer for an entity nobody configured, flagged as such.
    expect(other?.configured).toBe(false);
    expect(other?.tone).toBe('professional-friendly');
  });

  it('never lists another tenant entities', async () => {
    const { tenantA, tenantB } = await createTwoTenants();

    const res = await entityProfilesGET(requestAs(tenantA, '/api/shadow/config/entity'));
    const body = await readJson<Envelope<Array<{ entityId: string }>>>(res);

    expect(body.data.map((p) => p.entityId)).toEqual([tenantA.entity.id]);
    expect(body.data.map((p) => p.entityId)).not.toContain(tenantB.entity.id);
  });

  it('writes a profile through PUT and reads the same values back', async () => {
    const tenant = await createTenant();

    const put = await entityProfilePUT(
      requestAs(tenant, `/api/shadow/config/entity/${tenant.entity.id}`, {
        method: 'PUT',
        body: {
          voicePersona: 'warm-female',
          tone: 'formal',
          signature: 'Shadow from MedLink Pro Staffing',
          neverDisclose: ['patient records', 'employee SSN'],
          complianceProfiles: ['HIPAA'],
        },
      }),
      { params: Promise.resolve({ id: tenant.entity.id }) }
    );
    expect(put.status).toBe(200);

    const row = await db.shadowEntityProfile.findUnique({
      where: { entityId: tenant.entity.id },
    });
    expect(row?.tone).toBe('formal');
    expect(row?.neverDisclose).toEqual(['patient records', 'employee SSN']);

    const get = await entityProfileGET(
      requestAs(tenant, `/api/shadow/config/entity/${tenant.entity.id}`),
      { params: Promise.resolve({ id: tenant.entity.id }) }
    );
    const body = await readJson<Envelope<{ signature: string }>>(get);
    expect(body.data.signature).toBe('Shadow from MedLink Pro Staffing');
  });
});

describe('POST /api/shadow/config/entity/[id]/switch', () => {
  async function sessionFor(tenant: Tenant, entityId: string) {
    return db.shadowVoiceSession.create({
      data: { userId: tenant.user.id, currentChannel: 'web', activeEntityId: entityId },
    });
  }

  it('moves the session active entity in the database', async () => {
    const tenant = await createTenant();
    const medlink = await db.entity.create({
      data: { name: 'MedLink Pro', type: 'Business', userId: tenant.user.id },
    });
    const session = await sessionFor(tenant, tenant.entity.id);

    const res = await entitySwitchPOST(
      requestAs(tenant, `/api/shadow/config/entity/${medlink.id}/switch`, {
        method: 'POST',
        body: { sessionId: session.id },
      }),
      { params: Promise.resolve({ id: medlink.id }) }
    );
    expect(res.status).toBe(200);

    const body = await readJson<Envelope<{ personaChanged: boolean; entityName: string }>>(res);
    expect(body.data.personaChanged).toBe(true);
    expect(body.data.entityName).toBe('MedLink Pro');

    const after = await db.shadowVoiceSession.findUnique({ where: { id: session.id } });
    expect(after?.activeEntityId).toBe(medlink.id);
  });

  it('reports personaChanged false when the session is already on that entity', async () => {
    const tenant = await createTenant();
    const session = await sessionFor(tenant, tenant.entity.id);

    const res = await entitySwitchPOST(
      requestAs(tenant, `/api/shadow/config/entity/${tenant.entity.id}/switch`, {
        method: 'POST',
        body: { sessionId: session.id },
      }),
      { params: Promise.resolve({ id: tenant.entity.id }) }
    );

    const body = await readJson<Envelope<{ personaChanged: boolean }>>(res);
    expect(body.data.personaChanged).toBe(false);
  });

  it('refuses another tenant session, and switches nothing', async () => {
    // The old implementation swallowed this into `personaChanged: true` and
    // announced "Context switched to X. All subsequent actions will be in the X
    // context" -- while writing `activeEntityId` into a session belonging to
    // someone else. Both halves are asserted.
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionB = await sessionFor(tenantB, tenantB.entity.id);

    const res = await entitySwitchPOST(
      requestAs(tenantA, `/api/shadow/config/entity/${tenantA.entity.id}/switch`, {
        method: 'POST',
        body: { sessionId: sessionB.id },
      }),
      { params: Promise.resolve({ id: tenantA.entity.id }) }
    );
    expect(res.status).toBe(403);

    const after = await db.shadowVoiceSession.findUnique({ where: { id: sessionB.id } });
    expect(after?.activeEntityId).toBe(tenantB.entity.id);
  });

  it('refuses another tenant entity', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionA = await sessionFor(tenantA, tenantA.entity.id);

    const res = await entitySwitchPOST(
      requestAs(tenantA, `/api/shadow/config/entity/${tenantB.entity.id}/switch`, {
        method: 'POST',
        body: { sessionId: sessionA.id },
      }),
      { params: Promise.resolve({ id: tenantB.entity.id }) }
    );
    expect(res.status).toBe(403);

    const after = await db.shadowVoiceSession.findUnique({ where: { id: sessionA.id } });
    expect(after?.activeEntityId).toBe(tenantA.entity.id);
  });

  it('refuses a session that does not exist rather than announcing a switch', async () => {
    const tenant = await createTenant();

    const res = await entitySwitchPOST(
      requestAs(tenant, `/api/shadow/config/entity/${tenant.entity.id}/switch`, {
        method: 'POST',
        body: { sessionId: 'no-such-session' },
      }),
      { params: Promise.resolve({ id: tenant.entity.id }) }
    );
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// DELIVERABLE 7 — persona switching inside the agent
// ===========================================================================

describe('the agent switch_entity tool switches the agent', () => {
  const INTENT_JSON = JSON.stringify({
    primaryIntent: 'general_question',
    confidence: 0.9,
    entities: {},
    reasoning: 'test',
  });

  function textResponse(text: string) {
    return {
      content: [{ type: 'text', text }],
      usage: { input_tokens: 10, output_tokens: 10 },
    };
  }

  function toolUseResponse(name: string, input: Record<string, unknown>) {
    return {
      content: [{ type: 'tool_use', id: 'toolu_test', name, input }],
      usage: { input_tokens: 10, output_tokens: 10 },
    };
  }

  beforeAll(() => {
    // The chat route refuses to reach the agent at all without a key.
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-for-db-suite';
  });

  it('moves the session entity durably and records the persona on the message', async () => {
    const tenant = await createTenant({ entity: { name: 'CRE Forge' } });
    const medlink = await db.entity.create({
      data: {
        name: 'MedLink Pro',
        type: 'Business',
        userId: tenant.user.id,
        complianceProfile: ['HIPAA'],
      },
    });
    await db.shadowEntityProfile.create({
      data: {
        entityId: medlink.id,
        tone: 'formal',
        voicePersona: 'clinical',
        neverDisclose: ['patient records', 'other client info'],
        complianceProfiles: ['HIPAA', 'GENERAL'],
      },
    });

    const session = await db.shadowVoiceSession.create({
      data: {
        userId: tenant.user.id,
        currentChannel: 'web',
        activeEntityId: tenant.entity.id,
      },
    });

    anthropicCreate
      .mockResolvedValueOnce(textResponse(INTENT_JSON)) // classify
      .mockResolvedValueOnce(toolUseResponse('switch_entity', { entityId: medlink.id }))
      .mockResolvedValueOnce(textResponse('Switched to MedLink Pro.'));

    const res = await chatPOST(
      requestAs(tenant, '/api/shadow/chat', {
        method: 'POST',
        body: { message: 'switch to MedLink', sessionId: session.id },
      })
    );
    expect(res.status).toBe(200);

    // 1. DURABLE. The next turn, and the next session resume, start in MedLink.
    const after = await db.shadowVoiceSession.findUnique({ where: { id: session.id } });
    expect(after?.activeEntityId).toBe(medlink.id);

    // 2. RECORDED. The assistant message says which persona produced it.
    // Two assistant rows are written per turn: the agent's own (carrying
    // telemetry) and the chat route's copy (not). The telemetry is the point,
    // so the row is selected by having it rather than by being last.
    const assistant = (
      await db.shadowMessage.findMany({
        where: { sessionId: session.id, role: 'assistant' },
        orderBy: { createdAt: 'desc' },
      })
    ).find((m) => m.telemetry !== null);
    const telemetry = assistant?.telemetry as {
      persona?: {
        entityId: string;
        tone: string;
        complianceProfiles: string[];
        switchedDuringTurn: boolean;
      };
    } | null;

    expect(telemetry?.persona?.entityId).toBe(medlink.id);
    expect(telemetry?.persona?.tone).toBe('formal');
    expect(telemetry?.persona?.complianceProfiles).toEqual(['HIPAA', 'GENERAL']);
    expect(telemetry?.persona?.switchedDuringTurn).toBe(true);

    // 3. IN THE PROMPT. The turn after the switch was told the new entity's
    //    disclosure rules; the turn before it was not.
    const systemPrompts = anthropicCreate.mock.calls.map(
      (call) => (call[0] as { system?: string }).system ?? ''
    );
    const beforeSwitch = systemPrompts[1];
    const afterSwitch = systemPrompts[2];
    expect(beforeSwitch).toContain('CRE Forge');
    expect(beforeSwitch).not.toContain('patient records');
    expect(afterSwitch).toContain('MedLink Pro');
    expect(afterSwitch).toContain('patient records');
    expect(afterSwitch).toContain('MUST NEVER disclose');
  });

  it('does not switch to an entity the user does not own, and says so on the message', async () => {
    // `findOwnedEntityById` in the tool layer already refused the foreign id;
    // what is new is that a refusal cannot leave the session or the telemetry
    // claiming a switch happened.
    const { tenantA, tenantB } = await createTwoTenants();

    const session = await db.shadowVoiceSession.create({
      data: {
        userId: tenantA.user.id,
        currentChannel: 'web',
        activeEntityId: tenantA.entity.id,
      },
    });

    anthropicCreate
      .mockResolvedValueOnce(textResponse(INTENT_JSON))
      .mockResolvedValueOnce(toolUseResponse('switch_entity', { entityId: tenantB.entity.id }))
      .mockResolvedValueOnce(textResponse('I could not find that entity.'));

    await chatPOST(
      requestAs(tenantA, '/api/shadow/chat', {
        method: 'POST',
        body: { message: 'switch to their company', sessionId: session.id },
      })
    );

    const after = await db.shadowVoiceSession.findUnique({ where: { id: session.id } });
    expect(after?.activeEntityId).toBe(tenantA.entity.id);

    // Two assistant rows are written per turn: the agent's own (carrying
    // telemetry) and the chat route's copy (not). The telemetry is the point,
    // so the row is selected by having it rather than by being last.
    const assistant = (
      await db.shadowMessage.findMany({
        where: { sessionId: session.id, role: 'assistant' },
        orderBy: { createdAt: 'desc' },
      })
    ).find((m) => m.telemetry !== null);
    const telemetry = assistant?.telemetry as {
      persona?: { entityId: string; switchedDuringTurn: boolean };
    } | null;

    expect(telemetry?.persona?.entityId).toBe(tenantA.entity.id);
    expect(telemetry?.persona?.switchedDuringTurn).toBe(false);
  });
});

// ===========================================================================
// DELIVERABLE 8 — the playbook routes stop discarding what they are sent
// ===========================================================================

describe('call playbook CRUD', () => {
  it('persists the compliance fields the old schema silently stripped', async () => {
    // `CreatePlaybookSchema` declared `description`, `type`, `steps`,
    // `isActive` and `tags` -- none of which are columns -- and zod strips
    // unknown keys, so `neverDisclose` never reached the service. The route
    // returned 200 and wrote column defaults.
    const tenant = await createTenant();

    const res = await playbooksPOST(
      requestAs(tenant, '/api/shadow/playbooks', {
        method: 'POST',
        body: {
          name: 'AP Collections — Friendly Reminder',
          scenario: 'ap_collections',
          openingScript: 'Hi, this is Shadow calling on behalf of MedLink Pro.',
          dataAllowed: ['invoice_number', 'amount_due', 'due_date'],
          neverDisclose: ['ssn', 'medical_records', 'other_client_info'],
          escalationTriggers: ['caller becomes hostile', 'requests manager'],
          escalationAction: 'transfer_to_human',
          maxDuration: 240,
          outcomeFields: ['payment_date_promised', 'amount_committed'],
        },
      })
    );
    expect(res.status).toBe(201);

    const row = await db.voiceforgeCallPlaybook.findFirst({
      where: { entityId: tenant.entity.id },
    });
    expect(row).not.toBeNull();
    expect(row?.scenario).toBe('ap_collections');
    expect(row?.neverDisclose).toEqual(['ssn', 'medical_records', 'other_client_info']);
    expect(row?.dataAllowed).toEqual(['invoice_number', 'amount_due', 'due_date']);
    expect(row?.escalationAction).toBe('transfer_to_human');
    expect(row?.maxDuration).toBe(240);
  });

  it('updates neverDisclose, which PUT used to report as changed without changing', async () => {
    const tenant = await createTenant();
    const playbook = await db.voiceforgeCallPlaybook.create({
      data: {
        entityId: tenant.entity.id,
        name: 'Scheduling',
        scenario: 'scheduling',
        neverDisclose: ['ssn'],
      },
    });

    const res = await playbookPUT(
      requestAs(tenant, `/api/shadow/playbooks/${playbook.id}`, {
        method: 'PUT',
        body: { neverDisclose: ['ssn', 'diagnosis', 'other_client_info'] },
      }),
      { params: Promise.resolve({ id: playbook.id }) }
    );
    expect(res.status).toBe(200);

    const row = await db.voiceforgeCallPlaybook.findUnique({ where: { id: playbook.id } });
    expect(row?.neverDisclose).toEqual(['ssn', 'diagnosis', 'other_client_info']);

    const get = await playbookGET(
      requestAs(tenant, `/api/shadow/playbooks/${playbook.id}`),
      { params: Promise.resolve({ id: playbook.id }) }
    );
    const body = await readJson<Envelope<{ neverDisclose: string[] }>>(get);
    expect(body.data.neverDisclose).toEqual(['ssn', 'diagnosis', 'other_client_info']);
  });

  it('refuses a request with neither scenario nor description instead of 500ing', async () => {
    const tenant = await createTenant();

    const res = await playbooksPOST(
      requestAs(tenant, '/api/shadow/playbooks', {
        method: 'POST',
        body: { name: 'Nameless purpose' },
      })
    );

    expect(res.status).toBe(400);
    expect(await db.voiceforgeCallPlaybook.count()).toBe(0);
  });

  it('does not read another tenant playbooks', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    await db.voiceforgeCallPlaybook.create({
      data: { entityId: tenantB.entity.id, name: 'B secret', scenario: 'ap_collections' },
    });

    const res = await playbooksGET(requestAs(tenantA, '/api/shadow/playbooks'));
    const body = await readJson<Envelope<Array<{ name: string }>>>(res);
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// DELIVERABLE 8 + 9 — the plan, the DNC gate and the weekly budget
// ===========================================================================

describe('POST /api/shadow/voiceforge/calls/plan', () => {
  async function fixture() {
    const tenant = await createTenant();
    const contact = await db.contact.create({
      data: { name: 'Dr. Martinez', entityId: tenant.entity.id },
    });
    const playbook = await db.voiceforgeCallPlaybook.create({
      data: {
        entityId: tenant.entity.id,
        name: 'AP Collections',
        scenario: 'ap_collections',
        openingScript: 'Hi, this is Shadow calling on behalf of MedLink Pro.',
        dataAllowed: ['invoice_number'],
        neverDisclose: ['ssn', 'medical_records'],
        maxDuration: 240,
      },
    });
    return { tenant, contact, playbook };
  }

  /** Quiet hours that cannot be in force at any time this suite might run. */
  const ALWAYS_OPEN = { quietHoursStart: '23:58', quietHoursEnd: '23:59' };

  async function openTheWindow(contactId: string) {
    await db.contactCallPreference.upsert({
      where: { contactId },
      create: { contactId, ...ALWAYS_OPEN },
      update: ALWAYS_OPEN,
    });
  }

  it('returns the playbook guardrails for the scenario', async () => {
    const { tenant, contact } = await fixture();
    await openTheWindow(contact.id);

    const res = await callPlanPOST(
      requestAs(tenant, '/api/shadow/voiceforge/calls/plan', {
        method: 'POST',
        body: { contactId: contact.id, scenario: 'ap_collections' },
      })
    );
    expect(res.status).toBe(200);

    const body = await readJson<
      Envelope<{
        allowed: boolean;
        playbook: { neverDisclose: string[]; openingScript: string; maxDuration: number };
        consent: { consentType: string; requiresExplicitConsent: boolean };
        recorded: boolean;
      }>
    >(res);

    expect(body.data.allowed).toBe(true);
    expect(body.data.playbook.neverDisclose).toEqual(['ssn', 'medical_records']);
    expect(body.data.playbook.maxDuration).toBe(240);
    // Addition 3.2 is joined in: a plan carries the consent script decision.
    expect(body.data.consent.consentType).toBeDefined();
    // A plan is not a call: the weekly budget is untouched.
    expect(body.data.recorded).toBe(false);
    expect(await db.shadowCallAttempt.count()).toBe(0);
  });

  it('refuses a call with no playbook rather than allowing a freeform one', async () => {
    const { tenant, contact } = await fixture();
    await openTheWindow(contact.id);

    const res = await callPlanPOST(
      requestAs(tenant, '/api/shadow/voiceforge/calls/plan', {
        method: 'POST',
        body: { contactId: contact.id, scenario: 'credential_chase' },
      })
    );

    const body = await readJson<Envelope<{ allowed: boolean; blockedReason: string }>>(res);
    expect(body.data.allowed).toBe(false);
    expect(body.data.blockedReason).toContain('No playbook configured');
  });

  it('refuses a contact on the do-not-call list and names the channel to use instead', async () => {
    // `ContactCallPreference.doNotCall` existed as a column, could be written by
    // nothing, and was read by a checker with no caller.
    const { tenant, contact } = await fixture();

    const put = await callPrefsPUT(
      requestAs(tenant, `/api/contacts/${contact.id}/call-preferences`, {
        method: 'PUT',
        body: { doNotCall: true, preferredChannel: 'phone' },
      }),
      { params: Promise.resolve({ id: contact.id }) }
    );
    expect(put.status).toBe(200);

    const res = await callPlanPOST(
      requestAs(tenant, '/api/shadow/voiceforge/calls/plan', {
        method: 'POST',
        body: { contactId: contact.id, scenario: 'ap_collections', record: true },
      })
    );

    const body = await readJson<
      Envelope<{ allowed: boolean; blockedReason: string; alternateChannel: string; recorded: boolean }>
    >(res);

    expect(body.data.allowed).toBe(false);
    expect(body.data.blockedReason).toContain('Do Not Call');
    expect(body.data.alternateChannel).toBe('email');
    // And a refused call does not spend the contact's budget.
    expect(body.data.recorded).toBe(false);
    expect(await db.shadowCallAttempt.count()).toBe(0);
  });

  it('refuses inside the contact own quiet hours, not a hard-coded window', async () => {
    const { tenant, contact } = await fixture();

    // A window covering the whole day, so the refusal cannot depend on when the
    // suite runs, and a window that is NOT the old hard-coded 21:00-08:00.
    await callPrefsPUT(
      requestAs(tenant, `/api/contacts/${contact.id}/call-preferences`, {
        method: 'PUT',
        body: { quietHoursStart: '00:00', quietHoursEnd: '23:59' },
      }),
      { params: Promise.resolve({ id: contact.id }) }
    );

    const res = await callPlanPOST(
      requestAs(tenant, '/api/shadow/voiceforge/calls/plan', {
        method: 'POST',
        body: { contactId: contact.id, scenario: 'ap_collections' },
      })
    );

    const body = await readJson<Envelope<{ allowed: boolean; blockedReason: string }>>(res);
    expect(body.data.allowed).toBe(false);
    expect(body.data.blockedReason).toContain('00:00 - 23:59');
  });

  it('spends the weekly budget when asked to, and refuses once it is spent', async () => {
    const { tenant, contact } = await fixture();
    await callPrefsPUT(
      requestAs(tenant, `/api/contacts/${contact.id}/call-preferences`, {
        method: 'PUT',
        body: { maxCallsPerWeek: 1, quietHoursStart: '23:58', quietHoursEnd: '23:59' },
      }),
      { params: Promise.resolve({ id: contact.id }) }
    );

    const first = await callPlanPOST(
      requestAs(tenant, '/api/shadow/voiceforge/calls/plan', {
        method: 'POST',
        body: { contactId: contact.id, scenario: 'ap_collections', record: true },
      })
    );
    const firstBody = await readJson<Envelope<{ allowed: boolean; recorded: boolean }>>(first);
    expect(firstBody.data.allowed).toBe(true);
    expect(firstBody.data.recorded).toBe(true);
    expect(await db.shadowCallAttempt.count({ where: { contactId: contact.id } })).toBe(1);

    const second = await callPlanPOST(
      requestAs(tenant, '/api/shadow/voiceforge/calls/plan', {
        method: 'POST',
        body: { contactId: contact.id, scenario: 'ap_collections', record: true },
      })
    );
    const secondBody = await readJson<
      Envelope<{ allowed: boolean; blockedReason: string; recorded: boolean }>
    >(second);
    expect(secondBody.data.allowed).toBe(false);
    expect(secondBody.data.blockedReason).toContain('Weekly call limit reached');
    expect(secondBody.data.recorded).toBe(false);
    // The refused second attempt did not add a row either.
    expect(await db.shadowCallAttempt.count({ where: { contactId: contact.id } })).toBe(1);
  });

  it('refuses to plan a call to another tenant contact', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const contactB = await db.contact.create({
      data: { name: 'B contact', entityId: tenantB.entity.id },
    });
    await db.voiceforgeCallPlaybook.create({
      data: { entityId: tenantA.entity.id, name: 'AP', scenario: 'ap_collections' },
    });

    const res = await callPlanPOST(
      requestAs(tenantA, '/api/shadow/voiceforge/calls/plan', {
        method: 'POST',
        body: { contactId: contactB.id, scenario: 'ap_collections', record: true },
      })
    );

    const body = await readJson<Envelope<{ allowed: boolean; blockedReason: string }>>(res);
    expect(body.data.allowed).toBe(false);
    expect(body.data.blockedReason).toContain('not in the active entity');
    expect(await db.shadowCallAttempt.count()).toBe(0);
  });
});

describe('GET /api/contacts/[id]/call-preferences', () => {
  it('answers with the live callable decision, not just the stored row', async () => {
    const tenant = await createTenant();
    const contact = await db.contact.create({
      data: { name: 'Dr. Martinez', entityId: tenant.entity.id },
    });

    await callPrefsPUT(
      requestAs(tenant, `/api/contacts/${contact.id}/call-preferences`, {
        method: 'PUT',
        body: { doNotCall: true },
      }),
      { params: Promise.resolve({ id: contact.id }) }
    );

    const res = await callPrefsGET(
      requestAs(tenant, `/api/contacts/${contact.id}/call-preferences`),
      { params: Promise.resolve({ id: contact.id }) }
    );

    const body = await readJson<
      Envelope<{ doNotCall: boolean; callableNow: boolean; blockedReason: string }>
    >(res);
    expect(body.data.doNotCall).toBe(true);
    expect(body.data.callableNow).toBe(false);
    expect(body.data.blockedReason).toContain('Do Not Call');
  });

  it('rejects half a quiet-hours window', async () => {
    const tenant = await createTenant();
    const contact = await db.contact.create({
      data: { name: 'Dr. Martinez', entityId: tenant.entity.id },
    });

    const res = await callPrefsPUT(
      requestAs(tenant, `/api/contacts/${contact.id}/call-preferences`, {
        method: 'PUT',
        body: { quietHoursStart: '18:00' },
      }),
      { params: Promise.resolve({ id: contact.id }) }
    );

    expect(res.status).toBe(400);
    expect(await db.contactCallPreference.count()).toBe(0);
  });

  it('refuses another tenant contact', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const contactB = await db.contact.create({
      data: { name: 'B contact', entityId: tenantB.entity.id },
    });

    const res = await callPrefsPUT(
      requestAs(tenantA, `/api/contacts/${contactB.id}/call-preferences`, {
        method: 'PUT',
        body: { doNotCall: true },
      }),
      { params: Promise.resolve({ id: contactB.id }) }
    );

    expect(res.status).toBe(403);
    expect(await db.contactCallPreference.count()).toBe(0);
  });
});
