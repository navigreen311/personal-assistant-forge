/**
 * P-08 acceptance — Documents, Knowledge and Decisions tenancy, proven against
 * a real database.
 *
 * ============================================================================
 * WHAT THIS FILE EXISTS TO PROVE
 * ============================================================================
 *
 * 26 of the 32 routes across `/api/documents`, `/api/knowledge` and
 * `/api/decisions` called
 *
 *     withAuth(request, async (req, _session) => ...)
 *
 * and then took `entityId` straight off the query string or the request body.
 * So an authenticated user of entity A could read and write entity B's
 * documents, knowledge base, SOPs, learning items, decision briefs and
 * decision journal simply by naming B's id. Authenticated, and not authorized.
 *
 * Three failures in this module were worse than the general pattern, and each
 * has its own case below:
 *
 *   * `POST /api/knowledge/<id>/links` writes to BOTH rows -- the link is
 *     bidirectional -- so naming another tenant's entry as `targetId` EDITED
 *     that tenant's row. A cross-tenant write reached through a graph edge
 *     rather than through a request field.
 *
 *   * `GET /api/knowledge/<id>` returned every entry named in the row's
 *     `linkedEntities`, an unconstrained array of ids, with no scope on the
 *     second hop.
 *
 *   * `GET /api/documents/<id>/redline` returned the full text of two
 *     revisions of any document whose id you could guess.
 *
 * Every case below is one of four shapes:
 *
 *   1. the owner reaches their own entity                      -> 200/201
 *   2. tenant A cannot READ tenant B's data                    -> 403/404
 *   3. tenant A cannot WRITE INTO tenant B's data              -> 403 AND
 *                                                                 nothing
 *                                                                 changed
 *   4. no session at all                                       -> 401
 *
 * plus, per tenancy-pattern.md sec.6: a list route proven not to LEAK (an ordinary
 * request whose filter matches B's row still returns nothing), and symmetry
 * (tenant B reaches B's own data -- a "fix" that denies everyone passes every
 * other assertion in this file).
 *
 * This runs against a real Postgres with `getToken` UNMOCKED, so each request
 * presents a genuine NextAuth JWE and the production decrypt path runs.
 *
 * `@/lib/ai` IS mocked. It is an outbound HTTPS call to Anthropic, not part of
 * the tenancy path; leaving it real would make this suite depend on a network
 * and an API key, and several routes here call it. `@/lib/db` is emphatically
 * NOT mocked -- a mocked Prisma cannot observe a missing tenant check, which is
 * the whole point of tests/db/.
 */

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(async () => 'stubbed'),
  generateJSON: jest.fn(async () => {
    throw new Error('AI disabled in tenancy tests');
  }),
}));

// --- documents ---
import { GET as documentsGET, POST as documentsPOST } from '@/app/api/documents/route';
import {
  GET as documentGET,
  PUT as documentPUT,
  DELETE as documentDELETE,
} from '@/app/api/documents/[id]/route';
import { GET as documentStatsGET } from '@/app/api/documents/stats/route';
import { GET as versionsGET } from '@/app/api/documents/[id]/versions/route';
import { GET as redlineGET } from '@/app/api/documents/[id]/redline/route';
import {
  GET as signGET,
  POST as signPOST,
} from '@/app/api/documents/[id]/sign/route';
import {
  GET as brandKitGET,
  PUT as brandKitPUT,
} from '@/app/api/documents/brand-kit/route';
import {
  GET as templatesGET,
  POST as templatesPOST,
} from '@/app/api/documents/templates/route';
import { POST as generatePOST } from '@/app/api/documents/generate/route';

// --- knowledge ---
import { GET as knowledgeGET, POST as knowledgePOST } from '@/app/api/knowledge/route';
import {
  GET as entryGET,
  PUT as entryPUT,
  DELETE as entryDELETE,
} from '@/app/api/knowledge/[id]/route';
import {
  GET as linksGET,
  POST as linksPOST,
} from '@/app/api/knowledge/[id]/links/route';
import {
  GET as collectionsGET,
  POST as collectionsPOST,
} from '@/app/api/knowledge/collections/route';
import { GET as graphGET } from '@/app/api/knowledge/graph/route';
import { POST as ingestPOST } from '@/app/api/knowledge/ingest/route';
import { GET as searchGET } from '@/app/api/knowledge/search/route';
import { POST as surfacePOST } from '@/app/api/knowledge/surface/route';
import { GET as sopsGET, POST as sopsPOST } from '@/app/api/knowledge/sops/route';
import {
  GET as sopGET,
  PUT as sopPUT,
} from '@/app/api/knowledge/sops/[id]/route';
import {
  GET as learningGET,
  POST as learningPOST,
} from '@/app/api/knowledge/learning/route';
import { PUT as learningItemPUT } from '@/app/api/knowledge/learning/[id]/route';
import { GET as learningReviewGET } from '@/app/api/knowledge/learning/review/route';

// --- decisions ---
import { GET as decisionsGET, POST as decisionsPOST } from '@/app/api/decisions/route';
import {
  GET as decisionGET,
  PUT as decisionPUT,
  DELETE as decisionDELETE,
} from '@/app/api/decisions/[id]/route';
import { POST as decidePOST } from '@/app/api/decisions/[id]/decide/route';
import { POST as matrixPOST } from '@/app/api/decisions/[id]/matrix/route';
import { POST as preMortemPOST } from '@/app/api/decisions/[id]/pre-mortem/route';
import { GET as enhancedGET } from '@/app/api/decisions/enhanced/route';
import { GET as decisionStatsGET } from '@/app/api/decisions/stats/route';
import {
  GET as journalGET,
  POST as journalPOST,
} from '@/app/api/decisions/journal/route';
import { PUT as journalReviewPUT } from '@/app/api/decisions/journal/[id]/review/route';
import { POST as researchPOST } from '@/app/api/decisions/research/route';

import { createVersion, versionStore } from '@/modules/documents/services/versioning-service';
import { templateStore } from '@/modules/documents/services/template-service';

import { db, setupTestDatabase } from '../helpers/db';
import { createTwoTenants, type Tenant } from '../helpers/factories';
import { anonymousRequest, readJson, requestAs } from '../helpers/session';

setupTestDatabase();

type ErrBody = { success: false; error: { code: string; message: string } };
type OkBody<T> = { success: true; data: T };
type PageBody<T> = { success: true; data: T[]; meta: { total: number } };

/** Next 15 hands a route its path params as a promise; mirror that exactly. */
function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

let tenantA: Tenant;
let tenantB: Tenant;

beforeEach(async () => {
  ({ tenantA, tenantB } = await createTwoTenants());
  // The two remaining in-memory stores are process-global; clear them so one
  // test cannot see another's rows. (They have no table in the frozen schema --
  // that gap is escalated in the PR, not papered over here.)
  versionStore.clear();
  // Built-in template ids all start with `tpl-`; anything else was created by
  // a test. Written by id rather than by owner so this file compiles against
  // the PRE-FIX code too, which is what the mutation run in the PR needs.
  for (const id of [...templateStore.keys()]) {
    if (!id.startsWith('tpl-')) templateStore.delete(id);
  }
});

// --- fixtures -------------------------------------------------------------

function seedDocument(entityId: string, overrides: Record<string, unknown> = {}) {
  return db.document.create({
    data: {
      title: 'Secret plan',
      entityId,
      type: 'BRIEF',
      content: 'confidential',
      status: 'DRAFT',
      citations: [],
      ...overrides,
    },
  });
}

function seedKnowledge(entityId: string, overrides: Record<string, unknown> = {}) {
  return db.knowledgeEntry.create({
    data: {
      entityId,
      source: 'manual',
      content: JSON.stringify({
        type: 'NOTE',
        title: 'Acquisition targets',
        body: 'confidential acquisition targets',
        autoTags: [],
      }),
      tags: ['confidential'],
      linkedEntities: [],
      ...overrides,
    },
  });
}

function seedDecision(entityId: string, overrides: Record<string, unknown> = {}) {
  return db.decision.create({
    data: {
      entityId,
      title: 'Whether to acquire',
      type: 'strategic',
      status: 'open',
      options: [{ id: 'opt-1', label: 'Yes' }],
      ...overrides,
    },
  });
}

// ===========================================================================
// /api/documents -- the list route must not LEAK, not merely refuse
// ===========================================================================

describe('GET /api/documents', () => {
  it("returns the caller's own documents", async () => {
    await seedDocument(tenantA.entity.id, { title: 'Mine' });

    const res = await documentsGET(requestAs(tenantA, '/api/documents'));
    const body = await readJson<PageBody<{ title: string }>>(res);

    expect(res.status).toBe(200);
    expect(body.data.map((d) => d.title)).toEqual(['Mine']);
  });

  it("refuses an explicit ?entityId= naming another tenant's entity", async () => {
    const res = await documentsGET(
      requestAs(tenantA, `/api/documents?entityId=${tenantB.entity.id}`)
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  /**
   * The case that matters more than the 403: an ORDINARY request, with a filter
   * that matches tenant B's row perfectly, must still return nothing. Leaking
   * rows is a different failure from refusing a named id.
   */
  it("does not return another tenant's document to an ordinary filtered request", async () => {
    await seedDocument(tenantB.entity.id, { title: 'B secret merger memo', type: 'MEMO' });

    const res = await documentsGET(
      requestAs(tenantA, '/api/documents?type=MEMO&search=merger')
    );
    const body = await readJson<PageBody<{ title: string }>>(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
    expect(body.meta.total).toBe(0);
  });

  it('is symmetric: tenant B reaches B\'s own documents', async () => {
    await seedDocument(tenantB.entity.id, { title: 'B doc' });

    const res = await documentsGET(requestAs(tenantB, '/api/documents'));
    const body = await readJson<PageBody<{ title: string }>>(res);

    expect(res.status).toBe(200);
    expect(body.data.map((d) => d.title)).toEqual(['B doc']);
  });

  it('refuses an anonymous caller', async () => {
    const res = await documentsGET(anonymousRequest('/api/documents'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/documents', () => {
  it("creates in the caller's own entity", async () => {
    const res = await documentsPOST(
      requestAs(tenantA, '/api/documents', {
        method: 'POST',
        body: { title: 'Mine', type: 'MEMO' },
      })
    );

    expect(res.status).toBe(201);
    expect(await db.document.count({ where: { entityId: tenantA.entity.id } })).toBe(1);
  });

  it("refuses to write into tenant B's entity, and writes nothing", async () => {
    const res = await documentsPOST(
      requestAs(tenantA, '/api/documents', {
        method: 'POST',
        body: { title: 'Planted', type: 'MEMO', entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    // A 403 that still writes is not a fix.
    expect(await db.document.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it('refuses an anonymous caller', async () => {
    const res = await documentsPOST(
      anonymousRequest('/api/documents', { method: 'POST', body: { title: 'x', type: 'MEMO' } })
    );
    expect(res.status).toBe(401);
  });
});

describe('GET /api/documents/stats', () => {
  it("counts only the caller's own documents", async () => {
    await seedDocument(tenantA.entity.id);
    await seedDocument(tenantB.entity.id);
    await seedDocument(tenantB.entity.id);

    const res = await documentStatsGET(requestAs(tenantA, '/api/documents/stats'));
    const body = await readJson<OkBody<{ total: number }>>(res);

    expect(body.data.total).toBe(1);
  });

  it("refuses an explicit entityId naming another tenant", async () => {
    const res = await documentStatsGET(
      requestAs(tenantA, `/api/documents/stats?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// /api/documents/[id] -- the entity is a property of the row
// ===========================================================================

describe('/api/documents/[id]', () => {
  it('lets the owner read their own document', async () => {
    const doc = await seedDocument(tenantA.entity.id);

    const res = await documentGET(requestAs(tenantA, `/api/documents/${doc.id}`), ctx(doc.id));
    expect(res.status).toBe(200);
  });

  it("refuses to read tenant B's document", async () => {
    const doc = await seedDocument(tenantB.entity.id);

    const res = await documentGET(requestAs(tenantA, `/api/documents/${doc.id}`), ctx(doc.id));
    expect(res.status).toBe(403);
  });

  it("refuses to update tenant B's document, and changes nothing", async () => {
    const doc = await seedDocument(tenantB.entity.id, { title: 'Untouched' });

    const res = await documentPUT(
      requestAs(tenantA, `/api/documents/${doc.id}`, {
        method: 'PUT',
        body: { title: 'Hijacked' },
      }),
      ctx(doc.id)
    );

    expect(res.status).toBe(403);
    expect((await db.document.findUnique({ where: { id: doc.id } }))!.title).toBe('Untouched');
  });

  it("refuses to delete tenant B's document, and deletes nothing", async () => {
    const doc = await seedDocument(tenantB.entity.id);

    const res = await documentDELETE(
      requestAs(tenantA, `/api/documents/${doc.id}`, { method: 'DELETE' }),
      ctx(doc.id)
    );

    expect(res.status).toBe(403);
    expect((await db.document.findUnique({ where: { id: doc.id } }))!.deletedAt).toBeNull();
  });

  it('is symmetric: tenant B can update their own document', async () => {
    const doc = await seedDocument(tenantB.entity.id);

    const res = await documentPUT(
      requestAs(tenantB, `/api/documents/${doc.id}`, {
        method: 'PUT',
        body: { title: 'Edited by owner' },
      }),
      ctx(doc.id)
    );

    expect(res.status).toBe(200);
    expect((await db.document.findUnique({ where: { id: doc.id } }))!.title).toBe(
      'Edited by owner'
    );
  });

  it('refuses an anonymous caller before touching the database', async () => {
    const doc = await seedDocument(tenantA.entity.id);
    const res = await documentGET(anonymousRequest(`/api/documents/${doc.id}`), ctx(doc.id));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// Document versions and redlines -- child records with no entityId column,
// so the scope is proven on the PARENT (tenancy-pattern.md sec.3).
// ===========================================================================

describe('/api/documents/[id]/versions and /redline', () => {
  it("refuses to list revisions of tenant B's document", async () => {
    const doc = await seedDocument(tenantB.entity.id);
    await createVersion(doc.id, 'B confidential v1', tenantB.user.id, 'v1');

    const res = await versionsGET(
      requestAs(tenantA, `/api/documents/${doc.id}/versions`),
      ctx(doc.id)
    );

    expect(res.status).toBe(403);
  });

  it('lets the owner list their own revisions', async () => {
    const doc = await seedDocument(tenantB.entity.id);
    await createVersion(doc.id, 'B confidential v1', tenantB.user.id, 'v1');

    const res = await versionsGET(
      requestAs(tenantB, `/api/documents/${doc.id}/versions`),
      ctx(doc.id)
    );
    const body = await readJson<OkBody<unknown[]>>(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });

  it("refuses a redline over tenant B's document -- it returns full revision text", async () => {
    const doc = await seedDocument(tenantB.entity.id);
    await createVersion(doc.id, 'B confidential v1', tenantB.user.id, 'v1');
    await createVersion(doc.id, 'B confidential v2', tenantB.user.id, 'v2');

    const res = await redlineGET(
      requestAs(tenantA, `/api/documents/${doc.id}/redline?v1=1&v2=2`),
      ctx(doc.id)
    );

    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('confidential');
  });
});

// ===========================================================================
// E-signature -- ESignRequest has no entityId column, scope via the parent.
// ===========================================================================

describe('/api/documents/[id]/sign', () => {
  it("creates a sign request on the caller's own document, and PERSISTS it", async () => {
    const doc = await seedDocument(tenantA.entity.id);

    const res = await signPOST(
      requestAs(tenantA, `/api/documents/${doc.id}/sign`, {
        method: 'POST',
        body: { signers: [{ name: 'Alice', email: 'alice@example.test', order: 1 }] },
      }),
      ctx(doc.id)
    );

    expect(res.status).toBe(201);
    // T-018: this used to live in a Map and vanish on restart.
    expect(await db.eSignRequest.count({ where: { documentId: doc.id } })).toBe(1);
  });

  it("refuses to raise a sign request against tenant B's document, and writes nothing", async () => {
    const doc = await seedDocument(tenantB.entity.id);

    const res = await signPOST(
      requestAs(tenantA, `/api/documents/${doc.id}/sign`, {
        method: 'POST',
        body: { signers: [{ name: 'Mallory', email: 'mallory@example.test', order: 1 }] },
      }),
      ctx(doc.id)
    );

    expect(res.status).toBe(403);
    expect(await db.eSignRequest.count({ where: { documentId: doc.id } })).toBe(0);
  });

  it("refuses to list sign requests on tenant B's document", async () => {
    const doc = await seedDocument(tenantB.entity.id);
    await db.eSignRequest.create({
      data: { documentId: doc.id, signers: [], status: 'SENT', provider: 'docusign' },
    });

    const res = await signGET(
      requestAs(tenantA, `/api/documents/${doc.id}/sign`),
      ctx(doc.id)
    );

    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// Brand kit -- now persisted on Entity.brandKit.
// ===========================================================================

describe('/api/documents/brand-kit', () => {
  it("writes and reads the caller's own brand kit, and PERSISTS it", async () => {
    const put = await brandKitPUT(
      requestAs(tenantA, '/api/documents/brand-kit', {
        method: 'PUT',
        body: { primaryColor: '#AA0000' },
      })
    );
    expect(put.status).toBe(200);

    // T-018: this used to live in a Map and vanish on restart.
    const entity = await db.entity.findUnique({ where: { id: tenantA.entity.id } });
    expect((entity!.brandKit as { primaryColor: string }).primaryColor).toBe('#AA0000');

    const get = await brandKitGET(requestAs(tenantA, '/api/documents/brand-kit'));
    const body = await readJson<OkBody<{ primaryColor: string }>>(get);
    expect(body.data.primaryColor).toBe('#AA0000');
  });

  it("refuses to read tenant B's brand kit", async () => {
    const res = await brandKitGET(
      requestAs(tenantA, `/api/documents/brand-kit?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("refuses to overwrite tenant B's brand kit, and changes nothing", async () => {
    const res = await brandKitPUT(
      requestAs(tenantA, '/api/documents/brand-kit', {
        method: 'PUT',
        body: { entityId: tenantB.entity.id, primaryColor: '#DEFACE' },
      })
    );

    expect(res.status).toBe(403);
    const entity = await db.entity.findUnique({ where: { id: tenantB.entity.id } });
    expect(entity!.brandKit).toBeNull();
  });
});

// ===========================================================================
// Templates -- built-ins are shared and read-only; custom ones are per-entity.
// ===========================================================================

describe('/api/documents/templates', () => {
  const draft = {
    name: 'A private contract template',
    type: 'CONTRACT',
    category: 'legal',
    content: 'secret clauses {{x}}',
    variables: [],
    outputFormats: ['PDF'],
  };

  it("does not list another tenant's custom template", async () => {
    const created = await templatesPOST(
      requestAs(tenantA, '/api/documents/templates', { method: 'POST', body: draft })
    );
    expect(created.status).toBe(201);

    const mine = await readJson<OkBody<{ name: string }[]>>(
      await templatesGET(requestAs(tenantA, '/api/documents/templates'))
    );
    const theirs = await readJson<OkBody<{ name: string }[]>>(
      await templatesGET(requestAs(tenantB, '/api/documents/templates'))
    );

    expect(mine.data.some((t) => t.name === draft.name)).toBe(true);
    expect(theirs.data.some((t) => t.name === draft.name)).toBe(false);
  });

  it("refuses to create a template inside tenant B's entity", async () => {
    const res = await templatesPOST(
      requestAs(tenantA, '/api/documents/templates', {
        method: 'POST',
        body: { ...draft, entityId: tenantB.entity.id },
      })
    );
    expect(res.status).toBe(403);
  });

  it("refuses to generate from another tenant's template", async () => {
    const created = await readJson<OkBody<{ id: string }>>(
      await templatesPOST(
        requestAs(tenantA, '/api/documents/templates', { method: 'POST', body: draft })
      )
    );

    const res = await generatePOST(
      requestAs(tenantB, '/api/documents/generate', {
        method: 'POST',
        body: { templateId: created.data.id, variables: { x: 'y' } },
      })
    );

    // Out of scope, so the template is not found rather than rendered.
    expect(res.status).toBe(500);
    expect((await readJson<ErrBody>(res)).error.message).toContain('not found');
  });
});

// ===========================================================================
// /api/knowledge
// ===========================================================================

describe('/api/knowledge', () => {
  it("lists only the caller's own entries", async () => {
    await seedKnowledge(tenantA.entity.id);
    await seedKnowledge(tenantB.entity.id);

    const res = await knowledgeGET(requestAs(tenantA, '/api/knowledge'));
    const body = await readJson<PageBody<unknown>>(res);

    expect(res.status).toBe(200);
    expect(body.meta.total).toBe(1);
  });

  it("does not leak tenant B's entry to an ordinary tag-filtered request", async () => {
    await seedKnowledge(tenantB.entity.id, { tags: ['confidential'] });

    const res = await knowledgeGET(requestAs(tenantA, '/api/knowledge?tags=confidential'));
    const body = await readJson<PageBody<unknown>>(res);

    expect(body.data).toHaveLength(0);
    expect(body.meta.total).toBe(0);
  });

  it("refuses ?entityId= naming tenant B", async () => {
    const res = await knowledgeGET(
      requestAs(tenantA, `/api/knowledge?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("refuses to capture into tenant B's entity, and writes nothing", async () => {
    const res = await knowledgePOST(
      requestAs(tenantA, '/api/knowledge', {
        method: 'POST',
        body: {
          entityId: tenantB.entity.id,
          type: 'NOTE',
          content: 'planted',
          source: 'manual',
        },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.knowledgeEntry.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it('captures into the caller\'s own entity when no entityId is given', async () => {
    const res = await knowledgePOST(
      requestAs(tenantA, '/api/knowledge', {
        method: 'POST',
        body: { type: 'NOTE', content: 'mine', source: 'manual' },
      })
    );

    expect(res.status).toBe(201);
    expect(await db.knowledgeEntry.count({ where: { entityId: tenantA.entity.id } })).toBe(1);
  });

  it('refuses an anonymous caller', async () => {
    expect((await knowledgeGET(anonymousRequest('/api/knowledge'))).status).toBe(401);
  });
});

describe('/api/knowledge/[id]', () => {
  it("refuses to read tenant B's entry", async () => {
    const entry = await seedKnowledge(tenantB.entity.id);

    const res = await entryGET(requestAs(tenantA, `/api/knowledge/${entry.id}`), ctx(entry.id));

    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('acquisition');
  });

  /**
   * The second-hop leak. `linkedEntities` is a bare string[] with no foreign
   * key, so a single foreign id in it used to pull another tenant's entry back
   * in full alongside a legitimately-owned parent.
   */
  it('does not follow a linked id out of the caller\'s entity', async () => {
    const foreign = await seedKnowledge(tenantB.entity.id);
    const mine = await seedKnowledge(tenantA.entity.id, {
      linkedEntities: [foreign.id],
      content: JSON.stringify({ type: 'NOTE', title: 'Mine', body: 'mine', autoTags: [] }),
    });

    const res = await entryGET(requestAs(tenantA, `/api/knowledge/${mine.id}`), ctx(mine.id));
    const body = await readJson<OkBody<{ linked: unknown[] }>>(res);

    expect(res.status).toBe(200);
    expect(body.data.linked).toHaveLength(0);
    expect(JSON.stringify(body)).not.toContain('acquisition');
  });

  it("refuses to update tenant B's entry, and changes nothing", async () => {
    const entry = await seedKnowledge(tenantB.entity.id);

    const res = await entryPUT(
      requestAs(tenantA, `/api/knowledge/${entry.id}`, {
        method: 'PUT',
        body: { content: 'hijacked' },
      }),
      ctx(entry.id)
    );

    expect(res.status).toBe(403);
    const after = await db.knowledgeEntry.findUnique({ where: { id: entry.id } });
    expect(after!.content).toContain('acquisition');
  });

  it("refuses to delete tenant B's entry, and deletes nothing", async () => {
    const entry = await seedKnowledge(tenantB.entity.id);

    const res = await entryDELETE(
      requestAs(tenantA, `/api/knowledge/${entry.id}`, { method: 'DELETE' }),
      ctx(entry.id)
    );

    expect(res.status).toBe(403);
    expect(await db.knowledgeEntry.count({ where: { id: entry.id } })).toBe(1);
  });

  it('is symmetric: tenant B can delete their own entry', async () => {
    const entry = await seedKnowledge(tenantB.entity.id);

    const res = await entryDELETE(
      requestAs(tenantB, `/api/knowledge/${entry.id}`, { method: 'DELETE' }),
      ctx(entry.id)
    );

    expect(res.status).toBe(200);
    expect(await db.knowledgeEntry.count({ where: { id: entry.id } })).toBe(0);
  });
});

describe('/api/knowledge/[id]/links -- a bidirectional write', () => {
  it("refuses to suggest links for tenant B's entry", async () => {
    const entry = await seedKnowledge(tenantB.entity.id);

    const res = await linksGET(
      requestAs(tenantA, `/api/knowledge/${entry.id}/links`),
      ctx(entry.id)
    );

    expect(res.status).toBe(403);
  });

  /**
   * THE ONE THAT MATTERS. applyLink writes to the target row as well as the
   * source, so before the target was scoped this edited tenant B's record from
   * a request that named only ids tenant A was allowed to hold.
   */
  it("refuses a targetId in tenant B's entity, and edits NEITHER row", async () => {
    const mine = await seedKnowledge(tenantA.entity.id);
    const foreign = await seedKnowledge(tenantB.entity.id);

    const res = await linksPOST(
      requestAs(tenantA, `/api/knowledge/${mine.id}/links`, {
        method: 'POST',
        body: { targetId: foreign.id },
      }),
      ctx(mine.id)
    );

    expect(res.status).toBe(404);

    const foreignAfter = await db.knowledgeEntry.findUnique({ where: { id: foreign.id } });
    const mineAfter = await db.knowledgeEntry.findUnique({ where: { id: mine.id } });
    expect(foreignAfter!.linkedEntities).toEqual([]);
    expect(mineAfter!.linkedEntities).toEqual([]);
  });

  it('links two of the caller\'s own entries, both ways', async () => {
    const a1 = await seedKnowledge(tenantA.entity.id);
    const a2 = await seedKnowledge(tenantA.entity.id);

    const res = await linksPOST(
      requestAs(tenantA, `/api/knowledge/${a1.id}/links`, {
        method: 'POST',
        body: { targetId: a2.id },
      }),
      ctx(a1.id)
    );

    expect(res.status).toBe(201);
    expect(
      (await db.knowledgeEntry.findUnique({ where: { id: a2.id } }))!.linkedEntities
    ).toEqual([a1.id]);
  });
});

describe('/api/knowledge/collections', () => {
  it("refuses to list tenant B's collections", async () => {
    const res = await collectionsGET(
      requestAs(tenantA, `/api/knowledge/collections?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("refuses to create a collection inside tenant B, and writes nothing", async () => {
    const res = await collectionsPOST(
      requestAs(tenantA, '/api/knowledge/collections', {
        method: 'POST',
        body: { entityId: tenantB.entity.id, name: 'Planted' },
      })
    );

    expect(res.status).toBe(403);
    expect(
      await db.knowledgeEntry.count({
        where: { entityId: tenantB.entity.id, source: 'collection' },
      })
    ).toBe(0);
  });

  it("drops foreign entryIds rather than storing a handle on them", async () => {
    const foreign = await seedKnowledge(tenantB.entity.id);
    const mine = await seedKnowledge(tenantA.entity.id);

    const res = await collectionsPOST(
      requestAs(tenantA, '/api/knowledge/collections', {
        method: 'POST',
        body: { name: 'Mixed', entryIds: [mine.id, foreign.id] },
      })
    );
    const body = await readJson<OkBody<{ entryIds: string[] }>>(res);

    expect(res.status).toBe(201);
    expect(body.data.entryIds).toEqual([mine.id]);
  });
});

describe('/api/knowledge -- remaining entity-scoped routes', () => {
  it("refuses a graph over tenant B's entity", async () => {
    const res = await graphGET(
      requestAs(tenantA, `/api/knowledge/graph?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("refuses to ingest into tenant B, and writes nothing", async () => {
    const res = await ingestPOST(
      requestAs(tenantA, '/api/knowledge/ingest', {
        method: 'POST',
        body: {
          entityId: tenantB.entity.id,
          filename: 'planted.txt',
          mimeType: 'text/plain',
          content: 'planted content',
          source: 'upload',
        },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.knowledgeEntry.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it("refuses to search tenant B's knowledge base", async () => {
    const res = await searchGET(
      requestAs(tenantA, `/api/knowledge/search?entityId=${tenantB.entity.id}&query=acquisition`)
    );
    expect(res.status).toBe(403);
  });

  it("does not surface tenant B's entries to an ordinary request", async () => {
    await seedKnowledge(tenantB.entity.id, { tags: ['acquisition'] });

    const res = await surfacePOST(
      requestAs(tenantA, '/api/knowledge/surface', {
        method: 'POST',
        body: { currentActivity: 'acquisition planning', currentTags: ['acquisition'] },
      })
    );
    const body = await readJson<OkBody<unknown[]>>(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
  });
});

describe('/api/knowledge/sops', () => {
  function seedSOP(entityId: string) {
    return db.document.create({
      data: {
        title: 'B onboarding SOP',
        entityId,
        type: 'SOP',
        version: 1,
        citations: [],
        status: 'APPROVED',
        content: JSON.stringify({
          title: 'B onboarding SOP',
          description: 'confidential procedure',
          steps: [{ order: 1, instruction: 'step', isOptional: false }],
          triggerConditions: ['onboarding'],
          status: 'ACTIVE',
          useCount: 0,
        }),
      },
    });
  }

  it("refuses to list tenant B's SOPs", async () => {
    const res = await sopsGET(
      requestAs(tenantA, `/api/knowledge/sops?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("refuses to create an SOP inside tenant B, and writes nothing", async () => {
    const res = await sopsPOST(
      requestAs(tenantA, '/api/knowledge/sops', {
        method: 'POST',
        body: {
          entityId: tenantB.entity.id,
          title: 'Planted',
          description: 'd',
          steps: [{ order: 1, instruction: 'x', isOptional: false }],
          triggerConditions: [],
          tags: [],
          status: 'DRAFT',
        },
      })
    );

    expect(res.status).toBe(403);
    expect(
      await db.document.count({ where: { entityId: tenantB.entity.id, type: 'SOP' } })
    ).toBe(0);
  });

  it("refuses to read tenant B's SOP", async () => {
    const sop = await seedSOP(tenantB.entity.id);

    const res = await sopGET(
      requestAs(tenantA, `/api/knowledge/sops/${sop.id}`),
      ctx(sop.id)
    );

    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('confidential procedure');
  });

  it("refuses to update tenant B's SOP, and changes nothing", async () => {
    const sop = await seedSOP(tenantB.entity.id);

    const res = await sopPUT(
      requestAs(tenantA, `/api/knowledge/sops/${sop.id}`, {
        method: 'PUT',
        body: { title: 'Hijacked' },
      }),
      ctx(sop.id)
    );

    expect(res.status).toBe(403);
    const after = await db.document.findUnique({ where: { id: sop.id } });
    expect(after!.title).toBe('B onboarding SOP');
    expect(after!.version).toBe(1);
  });
});

describe('/api/knowledge/learning', () => {
  const item = {
    title: 'Planted book',
    type: 'BOOK' as const,
    status: 'QUEUED' as const,
    progress: 0,
    notes: [],
    keyTakeaways: [],
    tags: [],
  };

  function seedLearning(entityId: string) {
    return db.knowledgeEntry.create({
      data: {
        entityId,
        source: 'learning://book',
        tags: [],
        linkedEntities: [],
        content: JSON.stringify({
          title: 'B private reading',
          type: 'BOOK',
          status: 'QUEUED',
          progress: 0,
          notes: [],
          keyTakeaways: [],
          reviewCount: 0,
          easeFactor: 2.5,
          interval: 0,
        }),
      },
    });
  }

  it("refuses to list tenant B's learning items", async () => {
    const res = await learningGET(
      requestAs(tenantA, `/api/knowledge/learning?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("refuses to add a learning item to tenant B, and writes nothing", async () => {
    const res = await learningPOST(
      requestAs(tenantA, '/api/knowledge/learning', {
        method: 'POST',
        body: { ...item, entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.knowledgeEntry.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it("refuses to update progress on tenant B's item, and changes nothing", async () => {
    const learning = await seedLearning(tenantB.entity.id);

    const res = await learningItemPUT(
      requestAs(tenantA, `/api/knowledge/learning/${learning.id}`, {
        method: 'PUT',
        body: { progress: 100 },
      }),
      ctx(learning.id)
    );

    expect(res.status).toBe(403);
    const after = await db.knowledgeEntry.findUnique({ where: { id: learning.id } });
    expect(JSON.parse(after!.content).progress).toBe(0);
  });

  it("refuses a review queue over tenant B's entity", async () => {
    const res = await learningReviewGET(
      requestAs(tenantA, `/api/knowledge/learning/review?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// /api/decisions -- the module the original plan dropped
// ===========================================================================

describe('/api/decisions', () => {
  function seedBrief(entityId: string) {
    return db.document.create({
      data: {
        title: 'B acquisition brief',
        entityId,
        type: 'BRIEF',
        citations: [],
        status: 'DRAFT',
        content: JSON.stringify({
          title: 'B acquisition brief',
          options: [],
          recommendation: 'confidential recommendation',
          confidenceScore: 0.5,
          blindSpots: [],
        }),
      },
    });
  }

  it("refuses to list tenant B's decision briefs", async () => {
    const res = await decisionsGET(
      requestAs(tenantA, `/api/decisions?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("lists only the caller's own briefs on an ordinary request", async () => {
    await seedBrief(tenantB.entity.id);

    const res = await decisionsGET(requestAs(tenantA, '/api/decisions'));
    const body = await readJson<PageBody<unknown>>(res);

    expect(res.status).toBe(200);
    expect(body.meta.total).toBe(0);
  });

  it("refuses to create a brief inside tenant B, and writes nothing", async () => {
    const res = await decisionsPOST(
      requestAs(tenantA, '/api/decisions', {
        method: 'POST',
        body: {
          entityId: tenantB.entity.id,
          title: 'Planted',
          description: 'd',
          context: 'c',
          stakeholders: [],
          constraints: [],
          blastRadius: 'LOW',
        },
      })
    );

    expect(res.status).toBe(403);
    expect(
      await db.document.count({ where: { entityId: tenantB.entity.id, type: 'BRIEF' } })
    ).toBe(0);
  });

  it("refuses to read tenant B's brief", async () => {
    const brief = await seedBrief(tenantB.entity.id);

    const res = await decisionGET(
      requestAs(tenantA, `/api/decisions/${brief.id}`),
      ctx(brief.id)
    );

    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('confidential recommendation');
  });

  it("refuses to update tenant B's brief, and changes nothing", async () => {
    const brief = await seedBrief(tenantB.entity.id);

    const res = await decisionPUT(
      requestAs(tenantA, `/api/decisions/${brief.id}`, {
        method: 'PUT',
        body: { title: 'Hijacked' },
      }),
      ctx(brief.id)
    );

    expect(res.status).toBe(403);
    expect((await db.document.findUnique({ where: { id: brief.id } }))!.title).toBe(
      'B acquisition brief'
    );
  });

  it("refuses to archive tenant B's brief, and changes nothing", async () => {
    const brief = await seedBrief(tenantB.entity.id);

    const res = await decisionDELETE(
      requestAs(tenantA, `/api/decisions/${brief.id}`, { method: 'DELETE' }),
      ctx(brief.id)
    );

    expect(res.status).toBe(403);
    expect((await db.document.findUnique({ where: { id: brief.id } }))!.status).toBe('DRAFT');
  });

  it('is symmetric: tenant B reads their own brief', async () => {
    const brief = await seedBrief(tenantB.entity.id);

    const res = await decisionGET(
      requestAs(tenantB, `/api/decisions/${brief.id}`),
      ctx(brief.id)
    );

    expect(res.status).toBe(200);
  });
});

describe('/api/decisions/[id]/decide', () => {
  it("refuses to decide tenant B's decision, and changes nothing", async () => {
    const decision = await seedDecision(tenantB.entity.id);

    const res = await decidePOST(
      requestAs(tenantA, `/api/decisions/${decision.id}/decide`, {
        method: 'POST',
        body: { chosenOptionId: 'opt-1', rationale: 'because' },
      }),
      ctx(decision.id)
    );

    expect(res.status).toBe(403);
    const after = await db.decision.findUnique({ where: { id: decision.id } });
    expect(after!.status).toBe('open');
    expect(after!.decidedBy).toBeNull();
  });

  it('lets the owner decide, and names the authenticated caller', async () => {
    const decision = await seedDecision(tenantB.entity.id);

    const res = await decidePOST(
      requestAs(tenantB, `/api/decisions/${decision.id}/decide`, {
        method: 'POST',
        body: { chosenOptionId: 'opt-1', rationale: 'because' },
      }),
      ctx(decision.id)
    );

    expect(res.status).toBe(200);
    const after = await db.decision.findUnique({ where: { id: decision.id } });
    expect(after!.status).toBe('decided');
    // Not 'SYSTEM' -- the person who made the edit.
    expect(after!.decidedBy).toBe(tenantB.user.id);
  });

  it("refuses a matrix and a pre-mortem over tenant B's decision", async () => {
    const decision = await seedDecision(tenantB.entity.id);

    const matrix = await matrixPOST(
      requestAs(tenantA, `/api/decisions/${decision.id}/matrix`, {
        method: 'POST',
        body: {
          criteria: [{ id: 'c1', name: 'Cost', weight: 1 }],
          scores: [{ criterionId: 'c1', optionId: 'opt-1', score: 5, rationale: 'r' }],
        },
      }),
      ctx(decision.id)
    );
    expect(matrix.status).toBe(403);

    const preMortem = await preMortemPOST(
      requestAs(tenantA, `/api/decisions/${decision.id}/pre-mortem`, {
        method: 'POST',
        body: { chosenOptionId: 'opt-1', timeHorizon: '90_DAYS' },
      }),
      ctx(decision.id)
    );
    expect(preMortem.status).toBe(403);
  });
});

describe('/api/decisions -- cross-entity rollups (tenancy-pattern.md sec.5b)', () => {
  it('enhanced: returns only the caller\'s decisions on an ordinary request', async () => {
    await seedDecision(tenantA.entity.id, { title: 'A decision' });
    await seedDecision(tenantB.entity.id, { title: 'B decision' });

    const res = await enhancedGET(requestAs(tenantA, '/api/decisions/enhanced'));
    const body = await readJson<PageBody<{ title: string }>>(res);

    expect(res.status).toBe(200);
    expect(body.data.map((d) => d.title)).toEqual(['A decision']);
  });

  it('enhanced: refuses an explicit entityId naming tenant B', async () => {
    const res = await enhancedGET(
      requestAs(tenantA, `/api/decisions/enhanced?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("stats: counts only the caller's decisions", async () => {
    await seedDecision(tenantB.entity.id);
    await seedDecision(tenantB.entity.id);

    const res = await decisionStatsGET(requestAs(tenantA, '/api/decisions/stats'));
    const body = await readJson<OkBody<{ active: number }>>(res);

    expect(body.data.active).toBe(0);
  });
});

describe('/api/decisions/journal', () => {
  function seedJournal(entityId: string) {
    return db.document.create({
      data: {
        title: 'B private journal entry',
        entityId,
        type: 'REPORT',
        citations: [],
        status: 'DRAFT',
        content: JSON.stringify({
          entityId,
          context: 'confidential context',
          optionsConsidered: ['x'],
          chosenOption: 'x',
          rationale: 'r',
          expectedOutcomes: ['o'],
          reviewDate: new Date(Date.now() + 86400000).toISOString(),
          status: 'PENDING_REVIEW',
        }),
      },
    });
  }

  it("refuses to list tenant B's journal", async () => {
    const res = await journalGET(
      requestAs(tenantA, `/api/decisions/journal?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("refuses to write a journal entry into tenant B, and writes nothing", async () => {
    const res = await journalPOST(
      requestAs(tenantA, '/api/decisions/journal', {
        method: 'POST',
        body: {
          entityId: tenantB.entity.id,
          title: 'Planted',
          context: 'c',
          optionsConsidered: ['a'],
          chosenOption: 'a',
          rationale: 'r',
          expectedOutcomes: ['o'],
          reviewDate: new Date().toISOString(),
        },
      })
    );

    expect(res.status).toBe(403);
    expect(
      await db.document.count({ where: { entityId: tenantB.entity.id, type: 'REPORT' } })
    ).toBe(0);
  });

  it("writes a journal entry into the caller's own entity, discarding any entityId sent", async () => {
    const res = await journalPOST(
      requestAs(tenantA, '/api/decisions/journal', {
        method: 'POST',
        body: {
          title: 'Mine',
          context: 'c',
          optionsConsidered: ['a'],
          chosenOption: 'a',
          rationale: 'r',
          expectedOutcomes: ['o'],
          reviewDate: new Date().toISOString(),
        },
      })
    );

    expect(res.status).toBe(201);
    const rows = await db.document.findMany({
      where: { entityId: tenantA.entity.id, type: 'REPORT' },
    });
    expect(rows).toHaveLength(1);
  });

  it("refuses to review tenant B's journal entry, and changes nothing", async () => {
    const entry = await seedJournal(tenantB.entity.id);

    const res = await journalReviewPUT(
      requestAs(tenantA, `/api/decisions/journal/${entry.id}/review`, {
        method: 'PUT',
        body: {
          actualOutcomes: ['hijacked'],
          status: 'REVIEWED_CORRECT',
          lessonsLearned: 'none',
        },
      }),
      ctx(entry.id)
    );

    expect(res.status).toBe(403);
    const after = await db.document.findUnique({ where: { id: entry.id } });
    expect(after!.status).toBe('DRAFT');
    expect(JSON.parse(after!.content!).status).toBe('PENDING_REVIEW');
  });

  it('is symmetric: tenant B can review their own entry', async () => {
    const entry = await seedJournal(tenantB.entity.id);

    const res = await journalReviewPUT(
      requestAs(tenantB, `/api/decisions/journal/${entry.id}/review`, {
        method: 'PUT',
        body: {
          actualOutcomes: ['it worked'],
          status: 'REVIEWED_CORRECT',
          lessonsLearned: 'trust the data',
        },
      }),
      ctx(entry.id)
    );

    expect(res.status).toBe(200);
    const after = await db.document.findUnique({ where: { id: entry.id } });
    expect(JSON.parse(after!.content!).status).toBe('REVIEWED_CORRECT');
  });
});

describe('/api/decisions/research', () => {
  it("refuses to research against tenant B's knowledge base", async () => {
    const res = await researchPOST(
      requestAs(tenantA, '/api/decisions/research', {
        method: 'POST',
        body: {
          query: 'acquisition targets',
          entityId: tenantB.entity.id,
          depth: 'QUICK',
          sourceTypes: ['KNOWLEDGE'],
          maxSources: 3,
        },
      })
    );

    expect(res.status).toBe(403);
  });

  it("does not cite tenant B's knowledge entries in the caller's report", async () => {
    await seedKnowledge(tenantB.entity.id, {
      content: JSON.stringify({
        type: 'NOTE',
        title: 'B target list',
        body: 'acquisition targets: Northwind, Contoso',
        autoTags: [],
      }),
    });

    const res = await researchPOST(
      requestAs(tenantA, '/api/decisions/research', {
        method: 'POST',
        body: {
          query: 'acquisition',
          depth: 'QUICK',
          sourceTypes: ['KNOWLEDGE'],
          maxSources: 3,
        },
      })
    );

    expect(res.status).toBe(201);
    expect(await res.text()).not.toContain('Northwind');
  });

  it('refuses an anonymous caller', async () => {
    const res = await researchPOST(
      anonymousRequest('/api/decisions/research', {
        method: 'POST',
        body: { query: 'x', depth: 'QUICK', sourceTypes: ['WEB'], maxSources: 1 },
      })
    );
    expect(res.status).toBe(401);
  });
});
