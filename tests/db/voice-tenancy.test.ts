/**
 * P-14 acceptance -- Voice / VoiceForge tenancy, proven against a real database.
 *
 * ============================================================================
 * WHAT THIS FILE EXISTS TO PROVE
 * ============================================================================
 *
 * Before this package, 15 of the 17 route files under `/api/voice` called
 *
 *     withAuth(request, async (req, _session) => ...)
 *
 * and then took `entityId` straight off the query string or the request body.
 * The service layer had no notion of a caller at all: `getPersona(id)`,
 * `getScript(id)`, `getCampaign(id)` and `getNumber(id)` looked a row up by id
 * with no entity in the WHERE clause, and `updatePersona` / `updateScript` /
 * `releaseNumber` wrote through `prisma.document.update({ where: { id } })` --
 * a unique WHERE that cannot carry a tenant. So all of this succeeded:
 *
 *     POST /api/voice/persona    { "entityId": "<someone else's>", ... }
 *     GET  /api/voice/scripts?entityId=<someone else's>
 *     PUT  /api/voice/persona/<someone else's persona id>
 *     DELETE /api/voice/numbers/<someone else's number id>
 *
 * Authenticated, and not authorized.
 *
 * The worst single case was inbound config: `getInboundConfig(phoneNumber)` ran
 * `findMany({ where: { type: 'INBOUND_CONFIG' } })` over EVERY entity's
 * documents and returned the first row whose phone number matched. Phone
 * numbers are public, so any authenticated user could read any tenant's
 * greeting, persona, routing rules, VIP list and urgent escalation number by
 * typing a number they already knew.
 *
 * Every case below is one of four shapes:
 *
 *   1. the owner reaches their own data                        -> 200/201
 *   2. tenant A cannot READ tenant B's data                    -> 403
 *   3. tenant A cannot WRITE INTO tenant B's data              -> 403, and the
 *                                                                 database is
 *                                                                 unchanged
 *   4. no session at all                                       -> 401
 *
 * Plus, deliberately, the two shapes a 403 test cannot see:
 *   - a LIST route whose ordinary request must not return foreign rows;
 *   - SYMMETRY -- tenant B reaching B's own data. A "fix" that denies everyone
 *     passes every other assertion in this file.
 *
 * `getToken` is UNMOCKED here: each request carries a genuine NextAuth JWE and
 * the production decrypt path runs. The mocked-Prisma unit suite cannot observe
 * any of this, which is why 5,283 passing tests never saw it.
 */

import { GET as personasGET, POST as personasPOST } from '@/app/api/voice/persona/route';
import { GET as personaGET, PUT as personaPUT } from '@/app/api/voice/persona/[id]/route';
import { POST as personaClonePOST } from '@/app/api/voice/persona/clone/route';
import { GET as scriptsGET, POST as scriptsPOST } from '@/app/api/voice/scripts/route';
import { GET as scriptGET, PUT as scriptPUT } from '@/app/api/voice/scripts/[id]/route';
import { POST as scriptValidatePOST } from '@/app/api/voice/scripts/[id]/validate/route';
import { GET as campaignsGET, POST as campaignsPOST } from '@/app/api/voice/campaigns/route';
import { GET as campaignGET, PUT as campaignPUT } from '@/app/api/voice/campaigns/[id]/route';
import { GET as numbersGET } from '@/app/api/voice/numbers/route';
import { POST as provisionPOST } from '@/app/api/voice/numbers/provision/route';
import { GET as numberGET, DELETE as numberDELETE } from '@/app/api/voice/numbers/[id]/route';
import { GET as callGET, DELETE as callDELETE } from '@/app/api/voice/calls/[id]/route';
import { GET as transcriptGET } from '@/app/api/voice/calls/[id]/transcript/route';
import { GET as summaryGET } from '@/app/api/voice/calls/[id]/summary/route';
import {
  GET as inboundConfigGET,
  POST as inboundConfigPOST,
} from '@/app/api/voice/calls/inbound/config/route';
import { GET as statsGET } from '@/app/api/voice/stats/route';

import { db, setupTestDatabase } from '../helpers/db';
import { createTwoTenants, type Tenant } from '../helpers/factories';
import { anonymousRequest, readJson, requestAs } from '../helpers/session';

setupTestDatabase();

type ErrBody = { success: false; error: { code: string; message: string } };
type OkBody<T> = { success: true; data: T };

/** Next 15 hands a route its path params as a promise; mirror that exactly. */
function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

let tenantA: Tenant;
let tenantB: Tenant;

beforeEach(async () => {
  ({ tenantA, tenantB } = await createTwoTenants());
});

// ---------------------------------------------------------------------------
// Fixture bodies
// ---------------------------------------------------------------------------

function personaBody(name = 'Sales Agent') {
  return {
    name,
    description: 'Professional sales voice',
    voiceConfig: {
      provider: 'mock',
      voiceId: 'voice-1',
      speed: 1.0,
      pitch: 1.0,
      language: 'en-US',
    },
    personality: {
      defaultTone: 'WARM',
      formality: 7,
      empathy: 8,
      assertiveness: 5,
      humor: 3,
      vocabulary: 'MODERATE' as const,
    },
    status: 'DRAFT' as const,
  };
}

function scriptBody(name = 'Follow-up') {
  return {
    name,
    description: 'A follow-up script',
    nodes: [
      { id: 'n1', type: 'SPEAK' as const, content: 'Hello', branches: [], nextNodeId: 'n2' },
      { id: 'n2', type: 'END' as const, content: 'Bye', branches: [] },
    ],
    startNodeId: 'n1',
  };
}

function campaignBody(name = 'Q4 Outreach') {
  return {
    name,
    description: 'Test campaign',
    personaId: 'persona-x',
    scriptId: 'script-x',
    targetContactIds: ['c1', 'c2'],
    schedule: {
      startDate: new Date('2026-01-01T09:00:00Z').toISOString(),
      callWindowStart: '09:00',
      callWindowEnd: '17:00',
      timezone: 'America/Chicago',
      maxCallsPerDay: 100,
      retryAttempts: 2,
      retryDelayHours: 4,
    },
    stopConditions: [],
  };
}

function inboundBody(phoneNumber: string) {
  return {
    phoneNumber,
    greeting: 'Hello, thanks for calling.',
    personaId: 'persona-x',
    routingRules: [
      { id: 'r1', condition: 'vip=true', destination: '+15559999999', priority: 1 },
    ],
    afterHoursConfig: {
      enabled: false,
      message: 'We are closed.',
      businessHours: [{ day: 1, start: '09:00', end: '17:00' }],
      voicemailEnabled: true,
      urgentEscalationNumber: '+15557777777',
    },
    spamFilterEnabled: true,
    vipContactIds: ['contact-vip'],
  };
}

/** Create a document row directly, for the cases that need a foreign fixture. */
async function seedDoc(entityId: string, type: string, content: unknown, title = 'seed') {
  return db.document.create({
    data: { title, entityId, type, content: JSON.stringify(content), status: 'DRAFT' },
  });
}

// ===========================================================================
// PERSONAS
// ===========================================================================

describe('POST /api/voice/persona', () => {
  it("creates a persona in the caller's own entity", async () => {
    const res = await personasPOST(
      requestAs(tenantA, '/api/voice/persona', {
        method: 'POST',
        body: { ...personaBody(), entityId: tenantA.entity.id },
      })
    );

    expect(res.status).toBe(201);
    const body = await readJson<OkBody<{ entityId: string }>>(res);
    expect(body.data.entityId).toBe(tenantA.entity.id);
  });

  it("refuses to create a persona inside tenant B's entity, and writes nothing", async () => {
    // THE BUG, in its purest form. Under the old code this returned 201 and put
    // a VOICE_PERSONA document in tenant B's entity.
    const res = await personasPOST(
      requestAs(tenantA, '/api/voice/persona', {
        method: 'POST',
        body: { ...personaBody('Planted in B'), entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');

    // A 403 that still writes is not a fix.
    expect(await db.document.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it("falls back to the caller's active entity when the body names none", async () => {
    const res = await personasPOST(
      requestAs(tenantA, '/api/voice/persona', { method: 'POST', body: personaBody() })
    );

    expect(res.status).toBe(201);
    const body = await readJson<OkBody<{ entityId: string }>>(res);
    expect(body.data.entityId).toBe(tenantA.entity.id);
  });

  it('refuses an unauthenticated request', async () => {
    const res = await personasPOST(
      anonymousRequest('/api/voice/persona', {
        method: 'POST',
        body: { ...personaBody(), entityId: tenantA.entity.id },
      })
    );

    expect(res.status).toBe(401);
    expect(await db.document.count()).toBe(0);
  });
});

describe('GET /api/voice/persona (list)', () => {
  it("returns only the caller's own personas on an ORDINARY request", async () => {
    // Not merely "refuses ?entityId=B". A list route that leaks rows is a
    // different failure from a single-record 403, so the request here looks
    // completely unremarkable.
    await seedDoc(tenantA.entity.id, 'VOICE_PERSONA', personaBody('A-owned'), 'A-owned');
    await seedDoc(tenantB.entity.id, 'VOICE_PERSONA', personaBody('B-owned'), 'B-owned');

    const res = await personasGET(requestAs(tenantA, '/api/voice/persona'));
    expect(res.status).toBe(200);

    const body = await readJson<OkBody<Array<{ entityId: string; name: string }>>>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].entityId).toBe(tenantA.entity.id);
    expect(body.data.map((p) => p.name)).not.toContain('B-owned');
  });

  it("refuses ?entityId pointing at tenant B", async () => {
    const res = await personasGET(
      requestAs(tenantA, '/api/voice/persona', { query: { entityId: tenantB.entity.id } })
    );
    expect(res.status).toBe(403);
  });

  it('refuses an unauthenticated request', async () => {
    const res = await personasGET(anonymousRequest('/api/voice/persona'));
    expect(res.status).toBe(401);
  });

  it("SYMMETRY: tenant B reaches tenant B's own personas", async () => {
    // A fix that denies everyone passes every other assertion in this file.
    await seedDoc(tenantB.entity.id, 'VOICE_PERSONA', personaBody('B-owned'), 'B-owned');

    const res = await personasGET(requestAs(tenantB, '/api/voice/persona'));
    expect(res.status).toBe(200);
    const body = await readJson<OkBody<Array<{ entityId: string }>>>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].entityId).toBe(tenantB.entity.id);
  });
});

describe('GET|PUT /api/voice/persona/[id]', () => {
  it("lets the owner read and update their own persona", async () => {
    const doc = await seedDoc(tenantA.entity.id, 'VOICE_PERSONA', personaBody(), 'Mine');

    const getRes = await personaGET(
      requestAs(tenantA, `/api/voice/persona/${doc.id}`),
      ctx(doc.id)
    );
    expect(getRes.status).toBe(200);

    const putRes = await personaPUT(
      requestAs(tenantA, `/api/voice/persona/${doc.id}`, {
        method: 'PUT',
        body: { name: 'Renamed' },
      }),
      ctx(doc.id)
    );
    expect(putRes.status).toBe(200);
    expect((await readJson<OkBody<{ name: string }>>(putRes)).data.name).toBe('Renamed');
  });

  it("refuses to read tenant B's persona", async () => {
    const doc = await seedDoc(tenantB.entity.id, 'VOICE_PERSONA', personaBody(), 'B secret');

    const res = await personaGET(
      requestAs(tenantA, `/api/voice/persona/${doc.id}`),
      ctx(doc.id)
    );
    expect(res.status).toBe(403);
    // and the name did not leak in the error body
    expect(JSON.stringify(await readJson(res))).not.toContain('B secret');
  });

  it("refuses to update tenant B's persona, and leaves the row unchanged", async () => {
    const doc = await seedDoc(tenantB.entity.id, 'VOICE_PERSONA', personaBody(), 'B original');

    const res = await personaPUT(
      requestAs(tenantA, `/api/voice/persona/${doc.id}`, {
        method: 'PUT',
        body: { name: 'Hijacked' },
      }),
      ctx(doc.id)
    );
    expect(res.status).toBe(403);

    const after = await db.document.findUnique({ where: { id: doc.id } });
    expect(after?.title).toBe('B original');
    expect(after?.content).not.toContain('Hijacked');
  });

  it('refuses an unauthenticated request', async () => {
    const doc = await seedDoc(tenantA.entity.id, 'VOICE_PERSONA', personaBody());
    const res = await personaGET(anonymousRequest(`/api/voice/persona/${doc.id}`), ctx(doc.id));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/voice/persona/clone', () => {
  it("refuses to clone FROM tenant B's persona, and writes nothing", async () => {
    // The dangerous half is the source READ: an unscoped getPersona would copy
    // B's voiceConfig and personality into a persona A owns.
    const source = await seedDoc(
      tenantB.entity.id,
      'VOICE_PERSONA',
      personaBody('B voice print'),
      'B voice print'
    );

    const res = await personaClonePOST(
      requestAs(tenantA, '/api/voice/persona/clone', {
        method: 'POST',
        body: {
          sourcePersonaId: source.id,
          newName: 'Stolen',
          grantedBy: 'user-a',
          scope: 'voice',
        },
      })
    );

    expect(res.status).toBe(404);
    expect(await db.document.count({ where: { entityId: tenantA.entity.id } })).toBe(0);
  });

  it("clones within the caller's own entity", async () => {
    const source = await seedDoc(tenantA.entity.id, 'VOICE_PERSONA', personaBody('Origin'), 'Origin');

    const res = await personaClonePOST(
      requestAs(tenantA, '/api/voice/persona/clone', {
        method: 'POST',
        body: {
          sourcePersonaId: source.id,
          newName: 'Copy',
          grantedBy: 'user-a',
          scope: 'voice',
        },
      })
    );

    expect(res.status).toBe(201);
    const body = await readJson<OkBody<{ entityId: string; name: string }>>(res);
    expect(body.data.entityId).toBe(tenantA.entity.id);
    expect(body.data.name).toBe('Copy');
  });
});

// ===========================================================================
// SCRIPTS
// ===========================================================================

describe('/api/voice/scripts', () => {
  it("creates a script in the caller's own entity", async () => {
    const res = await scriptsPOST(
      requestAs(tenantA, '/api/voice/scripts', { method: 'POST', body: scriptBody() })
    );
    expect(res.status).toBe(201);
    expect((await readJson<OkBody<{ entityId: string }>>(res)).data.entityId).toBe(
      tenantA.entity.id
    );
  });

  it("refuses to create a script inside tenant B's entity, and writes nothing", async () => {
    const res = await scriptsPOST(
      requestAs(tenantA, '/api/voice/scripts', {
        method: 'POST',
        body: { ...scriptBody('Planted'), entityId: tenantB.entity.id },
      })
    );
    expect(res.status).toBe(403);
    expect(await db.document.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it("list returns no foreign rows on an ordinary request", async () => {
    await seedDoc(tenantA.entity.id, 'CALL_SCRIPT', scriptBody('A script'), 'A script');
    await seedDoc(tenantB.entity.id, 'CALL_SCRIPT', scriptBody('B script'), 'B script');

    const res = await scriptsGET(requestAs(tenantA, '/api/voice/scripts'));
    expect(res.status).toBe(200);
    const body = await readJson<OkBody<Array<{ entityId: string }>>>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].entityId).toBe(tenantA.entity.id);
  });

  it("refuses to read tenant B's script by id", async () => {
    const doc = await seedDoc(tenantB.entity.id, 'CALL_SCRIPT', scriptBody(), 'B script');
    const res = await scriptGET(requestAs(tenantA, `/api/voice/scripts/${doc.id}`), ctx(doc.id));
    expect(res.status).toBe(403);
  });

  it("refuses to update tenant B's script, and leaves the row unchanged", async () => {
    const doc = await seedDoc(tenantB.entity.id, 'CALL_SCRIPT', scriptBody('B original'), 'B original');

    const res = await scriptPUT(
      requestAs(tenantA, `/api/voice/scripts/${doc.id}`, {
        method: 'PUT',
        body: { name: 'Hijacked' },
      }),
      ctx(doc.id)
    );
    expect(res.status).toBe(403);

    const after = await db.document.findUnique({ where: { id: doc.id } });
    expect(after?.title).toBe('B original');
    expect(after?.content).not.toContain('Hijacked');
  });

  it("refuses to validate tenant B's script", async () => {
    const doc = await seedDoc(tenantB.entity.id, 'CALL_SCRIPT', scriptBody(), 'B script');
    const res = await scriptValidatePOST(
      requestAs(tenantA, `/api/voice/scripts/${doc.id}/validate`, { method: 'POST' }),
      ctx(doc.id)
    );
    expect(res.status).toBe(403);
  });

  it('validates the owner’s own script', async () => {
    const doc = await seedDoc(tenantA.entity.id, 'CALL_SCRIPT', scriptBody(), 'A script');
    const res = await scriptValidatePOST(
      requestAs(tenantA, `/api/voice/scripts/${doc.id}/validate`, { method: 'POST' }),
      ctx(doc.id)
    );
    expect(res.status).toBe(200);
  });

  it('refuses unauthenticated requests', async () => {
    expect((await scriptsGET(anonymousRequest('/api/voice/scripts'))).status).toBe(401);
    expect(
      (
        await scriptsPOST(
          anonymousRequest('/api/voice/scripts', { method: 'POST', body: scriptBody() })
        )
      ).status
    ).toBe(401);
  });
});

// ===========================================================================
// CAMPAIGNS
// ===========================================================================

describe('/api/voice/campaigns', () => {
  it("creates a campaign in the caller's own entity", async () => {
    const res = await campaignsPOST(
      requestAs(tenantA, '/api/voice/campaigns', { method: 'POST', body: campaignBody() })
    );
    expect(res.status).toBe(201);
    expect((await readJson<OkBody<{ entityId: string }>>(res)).data.entityId).toBe(
      tenantA.entity.id
    );
  });

  it("refuses to create a campaign inside tenant B's entity, and writes nothing", async () => {
    const res = await campaignsPOST(
      requestAs(tenantA, '/api/voice/campaigns', {
        method: 'POST',
        body: { ...campaignBody('Planted'), entityId: tenantB.entity.id },
      })
    );
    expect(res.status).toBe(403);
    expect(await db.document.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it('list returns no foreign rows on an ordinary request', async () => {
    await seedDoc(tenantA.entity.id, 'VOICE_CAMPAIGN', { ...campaignBody('A camp'), status: 'ACTIVE' });
    await seedDoc(tenantB.entity.id, 'VOICE_CAMPAIGN', { ...campaignBody('B camp'), status: 'ACTIVE' });

    const res = await campaignsGET(requestAs(tenantA, '/api/voice/campaigns'));
    expect(res.status).toBe(200);
    const body = await readJson<OkBody<Array<{ entityId: string }>>>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].entityId).toBe(tenantA.entity.id);
  });

  it("refuses to read tenant B's campaign by id", async () => {
    const doc = await seedDoc(tenantB.entity.id, 'VOICE_CAMPAIGN', campaignBody());
    const res = await campaignGET(requestAs(tenantA, `/api/voice/campaigns/${doc.id}`), ctx(doc.id));
    expect(res.status).toBe(403);
  });

  it("refuses to start tenant B's campaign, and leaves it unchanged", async () => {
    const doc = await seedDoc(tenantB.entity.id, 'VOICE_CAMPAIGN', {
      ...campaignBody(),
      status: 'DRAFT',
    });

    const res = await campaignPUT(
      requestAs(tenantA, `/api/voice/campaigns/${doc.id}`, {
        method: 'PUT',
        body: { action: 'start' },
      }),
      ctx(doc.id)
    );
    expect(res.status).toBe(403);

    const after = await db.document.findUnique({ where: { id: doc.id } });
    expect(after?.content).toContain('"status":"DRAFT"');
    expect(after?.content).not.toContain('"status":"ACTIVE"');
  });

  it("SYMMETRY: tenant B can start tenant B's own campaign", async () => {
    const doc = await seedDoc(tenantB.entity.id, 'VOICE_CAMPAIGN', {
      ...campaignBody(),
      status: 'DRAFT',
    });

    const res = await campaignPUT(
      requestAs(tenantB, `/api/voice/campaigns/${doc.id}`, {
        method: 'PUT',
        body: { action: 'start' },
      }),
      ctx(doc.id)
    );
    expect(res.status).toBe(200);

    const after = await db.document.findUnique({ where: { id: doc.id } });
    expect(after?.content).toContain('"status":"ACTIVE"');
  });
});

// ===========================================================================
// NUMBERS -- provisioning into another tenant is a BILLABLE write
// ===========================================================================

describe('/api/voice/numbers', () => {
  it("provisions a number into the caller's own entity", async () => {
    const res = await provisionPOST(
      requestAs(tenantA, '/api/voice/numbers/provision', {
        method: 'POST',
        body: { areaCode: '512', label: 'Main Line' },
      })
    );
    expect(res.status).toBe(201);
    expect((await readJson<OkBody<{ entityId: string }>>(res)).data.entityId).toBe(
      tenantA.entity.id
    );
  });

  it("refuses to provision a number into tenant B's entity, and writes nothing", async () => {
    const res = await provisionPOST(
      requestAs(tenantA, '/api/voice/numbers/provision', {
        method: 'POST',
        body: { entityId: tenantB.entity.id, areaCode: '512', label: 'On B’s bill' },
      })
    );
    expect(res.status).toBe(403);
    expect(await db.document.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it('list returns no foreign rows on an ordinary request', async () => {
    await seedDoc(tenantA.entity.id, 'MANAGED_NUMBER', { phoneNumber: '+15125550001' });
    await seedDoc(tenantB.entity.id, 'MANAGED_NUMBER', { phoneNumber: '+15125550002' });

    const res = await numbersGET(requestAs(tenantA, '/api/voice/numbers'));
    expect(res.status).toBe(200);
    const body = await readJson<OkBody<Array<{ phoneNumber: string }>>>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].phoneNumber).toBe('+15125550001');
  });

  it("refuses to read tenant B's number by id", async () => {
    const doc = await seedDoc(tenantB.entity.id, 'MANAGED_NUMBER', { phoneNumber: '+15125550002' });
    const res = await numberGET(requestAs(tenantA, `/api/voice/numbers/${doc.id}`), ctx(doc.id));
    expect(res.status).toBe(403);
  });

  it("refuses to RELEASE tenant B's number, and leaves it active", async () => {
    const doc = await seedDoc(tenantB.entity.id, 'MANAGED_NUMBER', {
      phoneNumber: '+15125550002',
      status: 'ACTIVE',
    });

    const res = await numberDELETE(
      requestAs(tenantA, `/api/voice/numbers/${doc.id}`, { method: 'DELETE' }),
      ctx(doc.id)
    );
    expect(res.status).toBe(403);

    const after = await db.document.findUnique({ where: { id: doc.id } });
    expect(after?.status).not.toBe('ARCHIVED');
    expect(after?.content).not.toContain('RELEASED');
  });
});

// ===========================================================================
// CALLS -- transcripts are the most sensitive rows in the module
// ===========================================================================

describe('/api/voice/calls/[id]', () => {
  async function seedCall(entityId: string, transcript: string) {
    return db.call.create({
      data: { entityId, direction: 'OUTBOUND', outcome: 'CONNECTED', duration: 60, transcript },
    });
  }

  it("lets the owner read their own call", async () => {
    const call = await seedCall(tenantA.entity.id, '[]');
    const res = await callGET(requestAs(tenantA, `/api/voice/calls/${call.id}`), ctx(call.id));
    expect(res.status).toBe(200);
  });

  it("refuses to read tenant B's call", async () => {
    const call = await seedCall(tenantB.entity.id, 'CONFIDENTIAL-B');
    const res = await callGET(requestAs(tenantA, `/api/voice/calls/${call.id}`), ctx(call.id));
    expect(res.status).toBe(403);
    expect(JSON.stringify(await readJson(res))).not.toContain('CONFIDENTIAL-B');
  });

  it("refuses to read tenant B's TRANSCRIPT", async () => {
    const call = await seedCall(tenantB.entity.id, 'CONFIDENTIAL-B');
    const res = await transcriptGET(
      requestAs(tenantA, `/api/voice/calls/${call.id}/transcript`),
      ctx(call.id)
    );
    expect(res.status).toBe(403);
    expect(JSON.stringify(await readJson(res))).not.toContain('CONFIDENTIAL-B');
  });

  it("refuses to summarise tenant B's call", async () => {
    const call = await seedCall(tenantB.entity.id, '[]');
    const res = await summaryGET(
      requestAs(tenantA, `/api/voice/calls/${call.id}/summary`),
      ctx(call.id)
    );
    expect(res.status).toBe(403);
  });

  it("refuses to DELETE tenant B's call, and the row survives", async () => {
    const call = await seedCall(tenantB.entity.id, 'CONFIDENTIAL-B');

    const res = await callDELETE(
      requestAs(tenantA, `/api/voice/calls/${call.id}`, { method: 'DELETE' }),
      ctx(call.id)
    );
    expect(res.status).toBe(403);
    expect(await db.call.count({ where: { id: call.id } })).toBe(1);
  });

  it("SYMMETRY: tenant B can delete tenant B's own call", async () => {
    const call = await seedCall(tenantB.entity.id, '[]');
    const res = await callDELETE(
      requestAs(tenantB, `/api/voice/calls/${call.id}`, { method: 'DELETE' }),
      ctx(call.id)
    );
    expect(res.status).toBe(200);
    expect(await db.call.count({ where: { id: call.id } })).toBe(0);
  });

  it('refuses an unauthenticated request', async () => {
    const call = await seedCall(tenantA.entity.id, '[]');
    const res = await callGET(anonymousRequest(`/api/voice/calls/${call.id}`), ctx(call.id));
    expect(res.status).toBe(401);
    expect(await db.call.count({ where: { id: call.id } })).toBe(1);
  });
});

// ===========================================================================
// INBOUND CONFIG -- the global phone-number scan was the worst read in the module
// ===========================================================================

describe('/api/voice/calls/inbound/config', () => {
  const B_NUMBER = '+15125559999';

  it("saves a config into the caller's own entity", async () => {
    const res = await inboundConfigPOST(
      requestAs(tenantA, '/api/voice/calls/inbound/config', {
        method: 'POST',
        body: inboundBody('+15125551111'),
      })
    );
    expect(res.status).toBe(201);
    expect(
      await db.document.count({
        where: { entityId: tenantA.entity.id, type: 'INBOUND_CONFIG' },
      })
    ).toBe(1);
  });

  it("does NOT return tenant B's config for a phone number the caller happens to know", async () => {
    // Phone numbers are public. Under the old code getInboundConfig scanned
    // every entity's documents and returned the first match, so this leaked B's
    // greeting, persona, routing rules, VIP list and escalation number.
    await seedDoc(tenantB.entity.id, 'INBOUND_CONFIG', {
      ...inboundBody(B_NUMBER),
      entityId: tenantB.entity.id,
    });

    const res = await inboundConfigGET(
      requestAs(tenantA, '/api/voice/calls/inbound/config', { query: { phoneNumber: B_NUMBER } })
    );

    expect(res.status).toBe(404);
    const raw = JSON.stringify(await readJson(res));
    expect(raw).not.toContain('+15557777777'); // B's urgent escalation number
    expect(raw).not.toContain('contact-vip');
  });

  it("refuses to save a config into tenant B's entity, and writes nothing", async () => {
    const res = await inboundConfigPOST(
      requestAs(tenantA, '/api/voice/calls/inbound/config', {
        method: 'POST',
        body: { ...inboundBody('+15125552222'), entityId: tenantB.entity.id },
      })
    );
    expect(res.status).toBe(403);
    expect(await db.document.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it("SYMMETRY: tenant B reads tenant B's own config", async () => {
    await seedDoc(tenantB.entity.id, 'INBOUND_CONFIG', {
      ...inboundBody(B_NUMBER),
      entityId: tenantB.entity.id,
    });

    const res = await inboundConfigGET(
      requestAs(tenantB, '/api/voice/calls/inbound/config', { query: { phoneNumber: B_NUMBER } })
    );
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ phoneNumber: string }>>(res)).data.phoneNumber).toBe(B_NUMBER);
  });

  it('refuses an unauthenticated request', async () => {
    const res = await inboundConfigGET(
      anonymousRequest('/api/voice/calls/inbound/config', { query: { phoneNumber: B_NUMBER } })
    );
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// STATS -- a genuine cross-entity rollup (section 5b). It must span the
// caller's OWN entities and stop there.
// ===========================================================================

describe('GET /api/voice/stats', () => {
  it("counts only the caller's own rows when no entity is named", async () => {
    await db.call.create({
      data: { entityId: tenantA.entity.id, direction: 'OUTBOUND', outcome: 'CONNECTED' },
    });
    await db.call.create({
      data: { entityId: tenantB.entity.id, direction: 'OUTBOUND', outcome: 'CONNECTED' },
    });
    await seedDoc(tenantB.entity.id, 'VOICE_PERSONA', personaBody('B persona'));

    const res = await statsGET(requestAs(tenantA, '/api/voice/stats'));
    expect(res.status).toBe(200);

    const body = await readJson<OkBody<{ totalCalls: number; totalPersonas: number }>>(res);
    expect(body.data.totalCalls).toBe(1);
    expect(body.data.totalPersonas).toBe(0);
  });

  it("spans EVERY entity the caller owns, not just the active one", async () => {
    // The regression a 403 test cannot see: narrowing this route from "all my
    // entities" to "my active entity" leaves every cross-tenant assertion green.
    const second = await db.entity.create({
      data: { userId: tenantA.user.id, name: 'A second entity', type: 'Business' },
    });
    await db.call.create({
      data: { entityId: tenantA.entity.id, direction: 'OUTBOUND', outcome: 'CONNECTED' },
    });
    await db.call.create({
      data: { entityId: second.id, direction: 'OUTBOUND', outcome: 'CONNECTED' },
    });

    const res = await statsGET(requestAs(tenantA, '/api/voice/stats'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ totalCalls: number }>>(res)).data.totalCalls).toBe(2);
  });

  it("refuses ?entityId pointing at tenant B", async () => {
    const res = await statsGET(
      requestAs(tenantA, '/api/voice/stats', { query: { entityId: tenantB.entity.id } })
    );
    expect(res.status).toBe(404);
  });

  it('refuses an unauthenticated request', async () => {
    const res = await statsGET(anonymousRequest('/api/voice/stats'));
    expect(res.status).toBe(401);
  });

  it('reports real figures rather than a confident zero', async () => {
    // The counters used to read (prisma as any).voiceCall / .voiceCampaign /
    // .phoneNumber / .voiceScript -- delegates that are not in the schema. Each
    // threw, each was swallowed, and every figure was 0 forever.
    await db.call.create({
      data: { entityId: tenantA.entity.id, direction: 'OUTBOUND', outcome: 'CONNECTED' },
    });
    await seedDoc(tenantA.entity.id, 'VOICE_PERSONA', personaBody());
    await seedDoc(tenantA.entity.id, 'CALL_SCRIPT', scriptBody());
    await seedDoc(tenantA.entity.id, 'MANAGED_NUMBER', { phoneNumber: '+15125550001' });
    await seedDoc(tenantA.entity.id, 'VOICE_CAMPAIGN', { ...campaignBody(), status: 'ACTIVE' });

    const res = await statsGET(requestAs(tenantA, '/api/voice/stats'));
    const body = await readJson<
      OkBody<{
        totalCalls: number;
        totalPersonas: number;
        totalScripts: number;
        phoneNumbers: number;
        activeCampaigns: number;
        connectRate: number;
      }>
    >(res);

    expect(body.data.totalCalls).toBe(1);
    expect(body.data.totalPersonas).toBe(1);
    expect(body.data.totalScripts).toBe(1);
    expect(body.data.phoneNumbers).toBe(1);
    expect(body.data.activeCampaigns).toBe(1);
    expect(body.data.connectRate).toBe(100);
  });
});
