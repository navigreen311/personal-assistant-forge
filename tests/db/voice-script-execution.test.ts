/**
 * P-42 — a call's script id, proven in the database rather than in a return value.
 *
 * ============================================================================
 * WHAT WAS WRONG
 * ============================================================================
 *
 * `tests/e2e/voice-system.test.ts` ("Full Voice Lifecycle") started a script
 * execution from `(script as any).id` where `script` was a `ScriptDraft` — a
 * type that deliberately has no `id`, because a draft has not been persisted.
 * The execution's `scriptId` was therefore `undefined`, had always been
 * `undefined`, and the case passed because it only asserted `currentNodeId`.
 * P-35 removed the `as any` and reported it; the owner ruled: fix the caller.
 *
 * Fixing the test is necessary but not sufficient, because the same shape
 * existed in the product, durably and one layer down: `POST
 * /api/voice/calls/outbound` took `scriptId` off the request body as an
 * unchecked string and wrote it into `Call.scriptId` without ever asking
 * whether it named a script, or whether that script belonged to the caller's
 * tenant. An execution with no script and a Call row pointing at a script that
 * does not exist are the same defect.
 *
 * ============================================================================
 * WHAT THIS FILE ASSERTS
 * ============================================================================
 *
 * The real chain, through the real HTTP entry points, against real Postgres:
 *
 *   generateScriptWithAI  ->  POST /api/voice/scripts  ->  a Document row
 *                         ->  POST /api/voice/calls/outbound
 *                         ->  Call.scriptId IS that row's id
 *
 * Every assertion is on the row or the status code. `initiateOutboundCall`
 * returns an `OutboundCallResult` that has never carried a `scriptId` at all,
 * so a return value could not have shown any of this.
 *
 * THE ONE MOCK is `@/lib/ai`, for the same reason `platform-surface.test.ts`
 * stubs the S3 client: a real Anthropic call costs money, writes a metering
 * row, and is not what is under test. `@/lib/db` and `next-auth/jwt` are NOT
 * mocked; the voice provider is the repository's own MockVoiceProvider, which
 * is what runs in production today.
 *
 * Run: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paf_p42 \
 *        npm run test:db -- voice-script-execution
 */

const mockGenerateJSON = jest.fn();
const mockGenerateText = jest.fn();

jest.mock('@/lib/ai', () => ({
  generateJSON: mockGenerateJSON,
  generateText: mockGenerateText,
}));

import { POST as scriptsPOST } from '@/app/api/voice/scripts/route';
import { POST as campaignsPOST } from '@/app/api/voice/campaigns/route';
import { POST as outboundPOST } from '@/app/api/voice/calls/outbound/route';
import {
  initiateOutboundCallForCampaign,
  ScriptMismatchError,
} from '@/modules/voiceforge/services/outbound-agent';
import {
  createScript,
  generateScriptWithAI,
  startExecution,
} from '@/modules/voiceforge/services/script-engine';
import type { Campaign, CallScript } from '@/modules/voiceforge/types';

import { db, setupTestDatabase } from '../helpers/db';
import { createContact, createTwoTenants, verifiedEntityIdForTest, type Tenant } from '../helpers/factories';
import { readJson, requestAs } from '../helpers/session';

setupTestDatabase();

type ErrBody = { success: false; error: { code: string; message: string } };
type OkBody<T> = { success: true; data: T };

let tenantA: Tenant;
let tenantB: Tenant;
let contactA: { id: string };

beforeEach(async () => {
  ({ tenantA, tenantB } = await createTwoTenants());
  contactA = await createContact(tenantA.entity.id, { phone: '+15550000001' });
  mockGenerateJSON.mockReset();
  mockGenerateText.mockReset();
  mockGenerateText.mockResolvedValue('This is a voicemail.');
});

/**
 * The shape a model returns. The node types are the OLD prompt's vocabulary on
 * purpose — see the second describe block.
 */
function generatedScript() {
  return {
    name: 'Renewal outreach',
    description: 'Ask about the renewal',
    startNodeId: 'hello',
    nodes: [
      {
        id: 'hello',
        type: 'GREETING',
        content: 'Hi, calling about your renewal.',
        branches: [
          { condition: 'keyword=interested', targetNodeId: 'pitch' },
          { condition: 'keyword=stop', targetNodeId: 'bye' },
        ],
      },
      { id: 'pitch', type: 'STATEMENT', content: 'Here is the offer.', branches: [{ condition: 'keyword=ok', targetNodeId: 'bye' }] },
      { id: 'bye', type: 'CLOSING', content: 'Thanks for your time.', branches: [] },
    ],
  };
}

function guardrails() {
  return {
    maxCommitments: 1,
    forbiddenTopics: [],
    escalationTriggers: [],
    complianceProfile: [],
    maxSilenceSeconds: 10,
  };
}

function outboundBody(overrides: Record<string, unknown> = {}) {
  return {
    contactId: contactA.id,
    personaId: 'persona-p42',
    purpose: 'Renewal check-in',
    // Small on purpose: MockVoiceProvider arms a setTimeout at
    // maxDuration * 1000, and a five-minute timer outlives the suite.
    maxDuration: 1,
    guardrails: guardrails(),
    ...overrides,
  };
}

/** Persist a draft over HTTP, the way the product does, and return the row's id. */
async function persistDraftForTenant(tenant: Tenant): Promise<CallScript> {
  const draft = await generateScriptWithAI(verifiedEntityIdForTest(tenant.entity.id), {
    purpose: 'renewal',
    targetAudience: 'customers',
    tone: 'warm',
    maxDuration: 3,
    keyPoints: ['renewal date'],
  });

  const res = await scriptsPOST(
    requestAs(tenant, '/api/voice/scripts', {
      method: 'POST',
      body: {
        name: draft.name,
        description: draft.description,
        nodes: draft.nodes,
        startNodeId: draft.startNodeId,
        status: draft.status,
      },
    })
  );
  expect(res.status).toBe(201);
  return (await readJson<OkBody<CallScript>>(res)).data;
}

// ===========================================================================
// 1. The chain the E2E only pretended to run
// ===========================================================================

describe('an AI draft becomes a persisted script before a call can reference it', () => {
  it('a draft has no id, and persisting it is what produces one', async () => {
    mockGenerateJSON.mockResolvedValueOnce(generatedScript());
    const draft = await generateScriptWithAI(verifiedEntityIdForTest(tenantA.entity.id), {
      purpose: 'renewal',
      targetAudience: 'customers',
      tone: 'warm',
      maxDuration: 3,
      keyPoints: ['renewal date'],
    });

    // The hole the E2E's `as any` was covering, stated as an assertion.
    expect('id' in draft).toBe(false);
    expect(await db.document.count({ where: { type: 'CALL_SCRIPT' } })).toBe(0);

    const script = await createScript(draft);

    expect(script.id).toMatch(/^c[a-z0-9]+$/); // a real cuid from Postgres
    const stored = await db.document.findUnique({ where: { id: script.id } });
    expect(stored).not.toBeNull();
    expect(stored!.entityId).toBe(tenantA.entity.id);
    expect(stored!.type).toBe('CALL_SCRIPT');
  });

  it('POST /api/voice/calls/outbound records the PERSISTED script id on the Call row', async () => {
    mockGenerateJSON.mockResolvedValueOnce(generatedScript());
    const script = await persistDraftForTenant(tenantA);

    const res = await outboundPOST(
      requestAs(tenantA, '/api/voice/calls/outbound', {
        method: 'POST',
        body: outboundBody({ scriptId: script.id }),
      })
    );

    expect(res.status).toBe(201);
    const { callId } = (await readJson<OkBody<{ callId: string }>>(res)).data;

    // THE DURABLE EFFECT. Not the return value -- `OutboundCallResult` has no
    // scriptId field, which is precisely why nothing noticed.
    const call = await db.call.findUnique({ where: { id: callId } });
    expect(call).not.toBeNull();
    expect(call!.scriptId).toBe(script.id);
    expect(call!.entityId).toBe(tenantA.entity.id);

    // And the script that id points at is readable, in this tenant, with the
    // graph the model generated.
    const executed = await db.document.findUnique({ where: { id: call!.scriptId! } });
    expect(executed!.entityId).toBe(tenantA.entity.id);
    expect(executed!.content).toContain('hello');
  });

  it('an execution started from the persisted script carries that id, not undefined', async () => {
    mockGenerateJSON.mockResolvedValueOnce(generatedScript());
    const script = await persistDraftForTenant(tenantA);

    const execution = startExecution(script.id, 'call-p42', script.startNodeId);

    expect(execution.scriptId).toBe(script.id);
    expect(execution.scriptId).toBeDefined();
    // The id resolves to a row. Under the old E2E line this was `undefined`,
    // and `findUnique({ where: { id: undefined } })` is not even a query.
    expect(await db.document.findUnique({ where: { id: execution.scriptId } })).not.toBeNull();
  });
});

// ===========================================================================
// 2. The draft could not be saved at all, and a cast hid it
// ===========================================================================

describe('the generated node vocabulary is the one the write path accepts', () => {
  it('accepts a generated draft through the real route', async () => {
    // `generateScriptWithAI` asked the model for GREETING / QUESTION /
    // STATEMENT / BRANCH / OBJECTION_HANDLER / CLOSING and then wrote
    // `n.type as ScriptNode['type']`, whose union is SPEAK / LISTEN / BRANCH /
    // TRANSFER / END / COLLECT_INFO. Five of the six names were not node types.
    // `POST /api/voice/scripts` validates against a zod enum of the real six,
    // so before this package EVERY AI-generated draft was refused 400 by the
    // only route that can persist one -- and the cast is why that compiled.
    mockGenerateJSON.mockResolvedValueOnce(generatedScript());
    const script = await persistDraftForTenant(tenantA);

    expect(script.nodes.map((n) => n.type)).toEqual(['SPEAK', 'SPEAK', 'END']);
    const stored = await db.document.findUnique({ where: { id: script.id } });
    // The mapping is in the row, so a later read executes a real node type.
    expect(JSON.parse(stored!.content!).nodes[0].type).toBe('SPEAK');
  });

  it('refuses a generated node type that no engine can run, instead of casting it', async () => {
    mockGenerateJSON.mockResolvedValueOnce({
      ...generatedScript(),
      nodes: [{ id: 'hello', type: 'INTERPRETIVE_DANCE', content: 'Hi', branches: [] }],
    });

    await expect(
      generateScriptWithAI(verifiedEntityIdForTest(tenantA.entity.id), {
        purpose: 'renewal',
        targetAudience: 'customers',
        tone: 'warm',
        maxDuration: 3,
        keyPoints: ['renewal date'],
      })
    ).rejects.toThrow('unsupported type "INTERPRETIVE_DANCE"');

    expect(await db.document.count({ where: { type: 'CALL_SCRIPT' } })).toBe(0);
  });
});

// ===========================================================================
// 3. The caller is fixed: an unresolvable script stops the call
// ===========================================================================

describe('POST /api/voice/calls/outbound resolves the script before the call starts', () => {
  it('refuses a scriptId that names nothing, and writes no Call row', async () => {
    const res = await outboundPOST(
      requestAs(tenantA, '/api/voice/calls/outbound', {
        method: 'POST',
        body: outboundBody({ scriptId: 'script-that-never-existed' }),
      })
    );

    expect(res.status).toBe(404);
    expect((await readJson<ErrBody>(res)).error.code).toBe('SCRIPT_NOT_FOUND');
    // Before this package: 201, a Call row, and `scriptId` set to that string.
    expect(await db.call.count()).toBe(0);
  });

  it("refuses tenant B's script id for tenant A, and writes no Call row", async () => {
    mockGenerateJSON.mockResolvedValueOnce(generatedScript());
    const bScript = await persistDraftForTenant(tenantB);

    const res = await outboundPOST(
      requestAs(tenantA, '/api/voice/calls/outbound', {
        method: 'POST',
        body: outboundBody({ scriptId: bScript.id }),
      })
    );

    // 404 rather than 403: `getScript` carries the entity in its WHERE clause,
    // so a foreign script is genuinely not found, and answering "forbidden"
    // would confirm to tenant A that the id exists.
    expect(res.status).toBe(404);
    expect(await db.call.count()).toBe(0);
  });

  it('SYMMETRY — tenant B can place a call against its own script', async () => {
    // The case a refusal test cannot see: a "fix" that denies everyone passes
    // every assertion above.
    mockGenerateJSON.mockResolvedValueOnce(generatedScript());
    const bScript = await persistDraftForTenant(tenantB);
    const contactB = await createContact(tenantB.entity.id, { phone: '+15550000002' });

    const res = await outboundPOST(
      requestAs(tenantB, '/api/voice/calls/outbound', {
        method: 'POST',
        body: outboundBody({ scriptId: bScript.id, contactId: contactB.id }),
      })
    );

    expect(res.status).toBe(201);
    const { callId } = (await readJson<OkBody<{ callId: string }>>(res)).data;
    const call = await db.call.findUnique({ where: { id: callId } });
    expect(call!.scriptId).toBe(bScript.id);
    expect(call!.entityId).toBe(tenantB.entity.id);
  });

  it('still allows a purpose-only call, and records a real NULL rather than a ghost id', async () => {
    // `Call.scriptId` is nullable and a call with no script is legitimate. The
    // bug was never "a call without a script"; it was an id that was supposed
    // to be there and was not.
    const res = await outboundPOST(
      requestAs(tenantA, '/api/voice/calls/outbound', { method: 'POST', body: outboundBody() })
    );

    expect(res.status).toBe(201);
    const { callId } = (await readJson<OkBody<{ callId: string }>>(res)).data;
    const call = await db.call.findUnique({ where: { id: callId } });
    expect(call!.scriptId).toBeNull();
  });
});

// ===========================================================================
// 4. The campaign path — "resolved from the playbook", literally
// ===========================================================================

describe('initiateOutboundCallForCampaign takes the script from the campaign', () => {
  /** Create a campaign over HTTP, against a script that really exists. */
  async function persistCampaign(scriptId: string): Promise<Campaign> {
    const res = await campaignsPOST(
      requestAs(tenantA, '/api/voice/campaigns', {
        method: 'POST',
        body: {
          name: 'Renewal wave',
          description: 'Q1 renewals',
          personaId: 'persona-p42',
          scriptId,
          targetContactIds: [contactA.id],
          schedule: {
            startDate: new Date('2026-01-05T09:00:00Z').toISOString(),
            callWindowStart: '09:00',
            callWindowEnd: '17:00',
            timezone: 'America/Chicago',
            maxCallsPerDay: 10,
            retryAttempts: 1,
            retryDelayHours: 4,
          },
          stopConditions: [{ type: 'MAX_CALLS', threshold: 10 }],
        },
      })
    );
    expect(res.status).toBe(201);
    return (await readJson<OkBody<Campaign>>(res)).data;
  }

  it("uses the campaign's scriptId when the caller passes none", async () => {
    mockGenerateJSON.mockResolvedValueOnce(generatedScript());
    const script = await persistDraftForTenant(tenantA);
    const campaign = await persistCampaign(script.id);

    // The campaign write path kept the scriptId rather than discarding it —
    // P-16's disease, checked rather than assumed.
    expect(campaign.scriptId).toBe(script.id);

    const result = await initiateOutboundCallForCampaign({
      campaignId: campaign.id,
      entityId: verifiedEntityIdForTest(tenantA.entity.id),
      contactId: contactA.id,
      personaId: 'persona-p42',
      purpose: 'Renewal check-in',
      maxDuration: 1,
      guardrails: guardrails(),
      // NOTE: no scriptId. Before this package the call ran with none, and the
      // campaign's stats were then updated as though it had run the campaign's
      // script.
    });

    const call = await db.call.findUnique({ where: { id: result.callId } });
    expect(call!.scriptId).toBe(script.id);
  });

  it('refuses a call whose scriptId disagrees with the campaign, and writes no Call row', async () => {
    mockGenerateJSON.mockResolvedValueOnce(generatedScript());
    const campaignScript = await persistDraftForTenant(tenantA);
    mockGenerateJSON.mockResolvedValueOnce({ ...generatedScript(), name: 'Other' });
    const otherScript = await persistDraftForTenant(tenantA);
    const campaign = await persistCampaign(campaignScript.id);

    const callsBefore = await db.call.count();

    await expect(
      initiateOutboundCallForCampaign({
        campaignId: campaign.id,
        entityId: verifiedEntityIdForTest(tenantA.entity.id),
        contactId: contactA.id,
        personaId: 'persona-p42',
        purpose: 'Renewal check-in',
        maxDuration: 1,
        guardrails: guardrails(),
        // A real script, in the right tenant, and still the wrong one.
        scriptId: otherScript.id,
      })
    ).rejects.toBeInstanceOf(ScriptMismatchError);

    expect(await db.call.count()).toBe(callsBefore);
  });

  it('refuses a campaign that does not belong to the caller, and writes no Call row', async () => {
    mockGenerateJSON.mockResolvedValueOnce(generatedScript());
    const bScript = await persistDraftForTenant(tenantB);
    const bCampaignRes = await campaignsPOST(
      requestAs(tenantB, '/api/voice/campaigns', {
        method: 'POST',
        body: {
          name: "B's wave",
          description: 'theirs',
          personaId: 'persona-b',
          scriptId: bScript.id,
          targetContactIds: [],
          schedule: {
            startDate: new Date('2026-01-05T09:00:00Z').toISOString(),
            callWindowStart: '09:00',
            callWindowEnd: '17:00',
            timezone: 'America/Chicago',
            maxCallsPerDay: 10,
            retryAttempts: 1,
            retryDelayHours: 4,
          },
          stopConditions: [],
        },
      })
    );
    expect(bCampaignRes.status).toBe(201);
    const bCampaign = (await readJson<OkBody<Campaign>>(bCampaignRes)).data;

    await expect(
      initiateOutboundCallForCampaign({
        campaignId: bCampaign.id,
        entityId: verifiedEntityIdForTest(tenantA.entity.id),
        contactId: contactA.id,
        personaId: 'persona-p42',
        purpose: 'Renewal check-in',
        maxDuration: 1,
        guardrails: guardrails(),
      })
    ).rejects.toThrow('not found');

    expect(await db.call.count()).toBe(0);
  });
});
