/**
 * P-30 — DECISION 1: ENTITY ISOLATION IS ENFORCED *WITHIN* ONE ACCOUNT.
 *
 * ============================================================================
 * WHAT WAS WRONG
 * ============================================================================
 *
 * `withEntityScope` resolved a candidate entity by precedence -- explicit
 * argument, `?entityId=`, body, then `session.activeEntityId` -- and then
 * checked ONE thing: `entity.userId === session.userId`. That is a check on WHO
 * OWNS THE ENTITY. It is exactly right for the defect the original audit found
 * (user A reading user B's records) and it is what ~138 refusal cases across
 * eleven module suites assert.
 *
 * For ONE user with TWO of their own entities, ownership is satisfied both
 * times, so nothing refused. `tests/db/end-to-end-proof.test.ts` recorded that
 * as leg 7 of the audit's own scenario and pinned it FAIL: a task belonging to
 * entity B was read, retitled and cancelled from a session acting in entity A.
 *
 * The owner ruled (`docs/parallel-build/decision-01-entity-isolation.md`):
 *
 *   "The Green Companies architecture is built around entity separation --
 *    different compliance profiles (HIPAA on MedLink, not on CRE Forge),
 *    different disclosure rules, different contacts, different VIP lists. A
 *    request scoped to Entity A touching Entity B's records is a bug, even when
 *    the same person owns both."
 *
 * ============================================================================
 * WHY THIS FILE ASSERTS THE ROW AND NOT ONLY THE STATUS CODE
 * ============================================================================
 *
 * P-20's finding was deliberately written as `expect(task.title).toBe('Written
 * from entity A')` rather than as a status code, because a 403 that still
 * writes is not a fix. Every write case here does the same in the other
 * direction: the refusal is asserted AND the row is re-read and shown to be
 * untouched.
 *
 * ============================================================================
 * WHY IT REACHES INTO FOUR MODULES THAT WERE NEVER EDITED
 * ============================================================================
 *
 * `src/app/api/**` holds 49 local `with<Thing>Scope` helpers in 49 route files,
 * and all 49 hand the addressed row's OWN `entityId` to `withEntityScope` as
 * its explicit argument -- P-04 wrote `withTaskScope` and every module copied
 * it. The claim this package rests on is that ONE rule in `withEntityScope`
 * corrects all 49 by construction, with no change to any of them. Tasks,
 * contacts, documents and workflows are asserted below precisely because
 * nothing in those four route files was touched. If the claim were false, three
 * of the four would still leak.
 *
 * Run: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paf_p30 \
 *        npm run test:db -- entity-isolation
 */

import { POST as switchEntityPOST } from '@/app/api/auth/switch-entity/route';
import { GET as tasksGET, POST as tasksPOST } from '@/app/api/tasks/route';
import {
  GET as taskGET,
  PUT as taskPUT,
  DELETE as taskDELETE,
} from '@/app/api/tasks/[id]/route';
import { GET as contactGET, PUT as contactPUT } from '@/app/api/contacts/[id]/route';
import { GET as documentGET } from '@/app/api/documents/[id]/route';
import { GET as workflowGET } from '@/app/api/workflows/[id]/route';
import { GET as entityDashboardGET } from '@/app/api/entities/[entityId]/dashboard/route';

import { db, setupTestDatabase } from '../helpers/db';
import {
  createContact,
  createEntity,
  createTask,
  createTenant,
  type Tenant,
} from '../helpers/factories';
import { anonymousRequest, readJson, requestAs, sessionTokenFor } from '../helpers/session';

setupTestDatabase();

interface ErrBody {
  success: false;
  error: { code: string; message: string };
}

/**
 * The session token the response tells the browser to store.
 *
 * The same reader `tests/db/entity-switching.test.ts` uses. Switching entity is
 * a re-minted cookie (P-29), so "acting in B" means presenting the token B's
 * switch handed back -- not a flag a test sets for itself.
 */
function sessionTokenFromResponse(res: Response): string {
  const headers: string[] =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*[A-Za-z0-9_.-]+=)/);

  for (const header of headers) {
    const match = header.trim().match(/^(?:__Secure-)?next-auth\.session-token=([^;]*)/);
    if (match && match[1]) return decodeURIComponent(match[1]);
  }
  throw new Error('the switch set no session cookie');
}

/** Act in `entityId` the way the product does: switch, and keep the new cookie. */
async function actingIn(actor: Parameters<typeof requestAs>[0], entityId: string): Promise<string> {
  const res = await switchEntityPOST(
    requestAs(actor, '/api/auth/switch-entity', { method: 'POST', body: { entityId } })
  );
  if (res.status !== 200) {
    throw new Error(`switch to ${entityId} failed with ${res.status}`);
  }
  return sessionTokenFromResponse(res);
}

async function codeOf(res: Response): Promise<string> {
  return (await readJson<ErrBody>(res)).error.code;
}

// ===========================================================================
// THE HEADLINE — one user, two entities, and the row does not move
// ===========================================================================

describe('Decision 1 — one user, two of their own entities', () => {
  let owner: Tenant;
  let medlink: { id: string };
  let creForge: { id: string };
  let inA: string;
  let taskInB: { id: string; title: string };

  beforeEach(async () => {
    // `createTenant` mints a session whose activeEntityId is this entity.
    owner = await createTenant({ entity: { name: 'MedLink' } });
    medlink = owner.entity;
    creForge = await createEntity(owner.user.id, { name: 'CRE Forge' });

    taskInB = await createTask(creForge.id, { title: 'B: sign the LOI' });
    inA = await actingIn(owner, medlink.id);
  });

  it('refuses to READ a task in the other entity, by id', async () => {
    const res = await taskGET(requestAs(inA, `/api/tasks/${taskInB.id}`), {
      params: Promise.resolve({ id: taskInB.id }),
    });

    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('ENTITY_SCOPE_MISMATCH');
  });

  it('refuses to WRITE a task in the other entity, and the row is untouched', async () => {
    // P-20's finding, inverted. It asserted `.toBe('Written from entity A')`
    // because a 403 that still writes is not a fix; the same reason applies to
    // asserting the row here rather than only the status.
    const res = await taskPUT(
      requestAs(inA, `/api/tasks/${taskInB.id}`, {
        method: 'PUT',
        body: { title: 'Written from entity A' },
      }),
      { params: Promise.resolve({ id: taskInB.id }) }
    );

    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('ENTITY_SCOPE_MISMATCH');
    expect((await db.task.findUniqueOrThrow({ where: { id: taskInB.id } })).title).toBe(
      'B: sign the LOI'
    );
  });

  it('refuses to DELETE a task in the other entity, and it is not cancelled', async () => {
    const res = await taskDELETE(
      requestAs(inA, `/api/tasks/${taskInB.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: taskInB.id }) }
    );

    expect(res.status).toBe(403);
    // `deleteTask` is a soft delete: the tell is the status, not the row's
    // absence. Before this package it read CANCELLED here.
    expect((await db.task.findUniqueOrThrow({ where: { id: taskInB.id } })).status).not.toBe(
      'CANCELLED'
    );
  });

  it('refuses a LIST scoped to the other entity by ?entityId=', async () => {
    const res = await tasksGET(
      requestAs(inA, '/api/tasks', { query: { entityId: creForge.id } })
    );

    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('ENTITY_SCOPE_MISMATCH');
  });

  it('refuses a CREATE into the other entity via the body, and writes nothing', async () => {
    const before = await db.task.count({ where: { entityId: creForge.id } });

    const res = await tasksPOST(
      requestAs(inA, '/api/tasks', {
        method: 'POST',
        body: { title: 'Planted from MedLink', entityId: creForge.id },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.task.count({ where: { entityId: creForge.id } })).toBe(before);
  });

  it('an ordinary list does not leak the other entity rows either', async () => {
    // A refusal on `?entityId=B` is a different failure from B's rows appearing
    // in an unscoped answer. Both have to hold.
    await createTask(medlink.id, { title: 'A: file the HIPAA attestation' });

    const res = await tasksGET(requestAs(inA, '/api/tasks'));
    expect(res.status).toBe(200);

    const body = await readJson<{ data: { title: string }[] }>(res);
    expect(body.data.map((t) => t.title)).toEqual(['A: file the HIPAA attestation']);
  });

  // =========================================================================
  // SYMMETRY — the refusal is a SCOPE, not a denial
  // =========================================================================

  it('the same caller reaches the same row once they switch to it', async () => {
    // Without this, "refuse everything" would pass every assertion above. The
    // record never became unreachable; the caller has to be IN the entity.
    const inB = await actingIn(inA, creForge.id);

    const res = await taskGET(requestAs(inB, `/api/tasks/${taskInB.id}`), {
      params: Promise.resolve({ id: taskInB.id }),
    });
    expect(res.status).toBe(200);

    const put = await taskPUT(
      requestAs(inB, `/api/tasks/${taskInB.id}`, {
        method: 'PUT',
        body: { title: 'Written from entity B' },
      }),
      { params: Promise.resolve({ id: taskInB.id }) }
    );
    expect(put.status).toBe(200);
    expect((await db.task.findUniqueOrThrow({ where: { id: taskInB.id } })).title).toBe(
      'Written from entity B'
    );
  });

  it('naming the entity you are already in is still fine', async () => {
    // The 47+ `[id]` helpers all pass the row's own entity explicitly, and the
    // overwhelming majority of the time it IS the active one. That path must
    // not have become a refusal.
    const own = await createTask(medlink.id, { title: 'A: mine' });

    const byId = await taskGET(requestAs(inA, `/api/tasks/${own.id}`), {
      params: Promise.resolve({ id: own.id }),
    });
    expect(byId.status).toBe(200);

    const listed = await tasksGET(
      requestAs(inA, '/api/tasks', { query: { entityId: medlink.id } })
    );
    expect(listed.status).toBe(200);
  });

  it('refuses an unauthenticated request before any of this', async () => {
    expect(
      (
        await taskGET(anonymousRequest(`/api/tasks/${taskInB.id}`), {
          params: Promise.resolve({ id: taskInB.id }),
        })
      ).status
    ).toBe(401);
  });
});

// ===========================================================================
// THE 47-HELPERS-BY-CONSTRUCTION CLAIM
//
// Not one line of contacts/[id], documents/[id] or workflows/[id] was edited.
// If the rule had gone into the routes instead of into `withEntityScope`,
// these three would still leak.
// ===========================================================================

describe('Decision 1 reaches modules this package never opened', () => {
  let owner: Tenant;
  let entityA: { id: string };
  let entityB: { id: string };
  let inA: string;

  beforeEach(async () => {
    owner = await createTenant({ entity: { name: 'A' } });
    entityA = owner.entity;
    entityB = await createEntity(owner.user.id, { name: 'B' });
    inA = await actingIn(owner, entityA.id);
  });

  it('withContactScope — a contact in the other entity is refused, and not rewritten', async () => {
    const contact = await createContact(entityB.id, { name: 'B contact' });

    const read = await contactGET(requestAs(inA, `/api/contacts/${contact.id}`), {
      params: Promise.resolve({ id: contact.id }),
    });
    expect(read.status).toBe(403);
    expect(await codeOf(read)).toBe('ENTITY_SCOPE_MISMATCH');

    const write = await contactPUT(
      requestAs(inA, `/api/contacts/${contact.id}`, {
        method: 'PUT',
        body: { name: 'Renamed from A' },
      }),
      { params: Promise.resolve({ id: contact.id }) }
    );
    expect(write.status).toBe(403);
    expect((await db.contact.findUniqueOrThrow({ where: { id: contact.id } })).name).toBe(
      'B contact'
    );
  });

  it('withDocumentScope — a document in the other entity is refused', async () => {
    const doc = await db.document.create({
      data: { entityId: entityB.id, title: 'B doc', type: 'REPORT' },
    });

    const res = await documentGET(requestAs(inA, `/api/documents/${doc.id}`), {
      params: Promise.resolve({ id: doc.id }),
    });
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('ENTITY_SCOPE_MISMATCH');
  });

  it('withWorkflowScope — a workflow in the other entity is refused', async () => {
    const workflow = await db.workflow.create({
      data: { entityId: entityB.id, name: 'B workflow', steps: [], triggers: [] },
    });

    const res = await workflowGET(requestAs(inA, `/api/workflows/${workflow.id}`), {
      params: Promise.resolve({ id: workflow.id }),
    });
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('ENTITY_SCOPE_MISMATCH');
  });

  it('the entity-addressed routes are not an exception either', async () => {
    // `/api/entities/[entityId]/*` is the one family whose explicit id comes
    // from the URL PATH rather than from a row. Under Decision 1 it is the same
    // rule: reading entity B's dashboard is touching entity B.
    const res = await entityDashboardGET(requestAs(inA, `/api/entities/${entityB.id}/dashboard`), {
      params: Promise.resolve({ entityId: entityB.id }),
    });
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('ENTITY_SCOPE_MISMATCH');

    const own = await entityDashboardGET(
      requestAs(inA, `/api/entities/${entityA.id}/dashboard`),
      { params: Promise.resolve({ entityId: entityA.id }) }
    );
    expect(own.status).toBe(200);
  });
});

// ===========================================================================
// THE RULE THAT WAS ADDED, AND THE ONE THAT WAS NOT REPLACED
// ===========================================================================

describe('Decision 1 adds a rule; it does not replace the cross-USER one', () => {
  it("a stranger's entity is still the indistinct FORBIDDEN, never the scope code", async () => {
    // The ordering inside `withEntityScope` is the assertion. Ownership is
    // checked FIRST, so a caller probing an id that is not theirs learns
    // nothing about whether it exists -- exactly as the ~138 cross-user refusal
    // cases across eleven module suites require. Answering ENTITY_SCOPE_MISMATCH
    // here would confirm the id names a real entity.
    const owner = await createTenant();
    const stranger = await createTenant();
    const inMine = await actingIn(owner, owner.entity.id);

    const res = await tasksGET(
      requestAs(inMine, '/api/tasks', { query: { entityId: stranger.entity.id } })
    );

    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('FORBIDDEN');
  });

  it('an entity that does not exist at all is still 404, not the scope code', async () => {
    const owner = await createTenant();
    const inMine = await actingIn(owner, owner.entity.id);

    const res = await tasksGET(
      requestAs(inMine, '/api/tasks', { query: { entityId: 'no-such-entity-id' } })
    );

    expect(res.status).toBe(404);
    expect(await codeOf(res)).toBe('NOT_FOUND');
  });
});

// ===========================================================================
// THE ABSENT CLAIM — and why it is strict
// ===========================================================================

describe('a session acting in NO entity may not reach into one by naming it', () => {
  it('refuses an explicit entityId the caller genuinely owns', async () => {
    // The bypass this closes: before the rule, a token that merely OMITS
    // `activeEntityId` passed the ownership check and got in. A rule any caller
    // can switch off by sending less is not a rule -- the same shape as
    // `withHIPAAGuard` passing through when `x-entity-id` was absent, which is
    // the worst case the original audit found.
    const owner = await createTenant();
    await createTask(owner.entity.id, { title: 'mine' });

    const rootless = await sessionTokenFor({
      userId: owner.user.id,
      email: owner.user.email,
      name: owner.user.name,
      role: 'owner',
      // no activeEntityId -- the shape of a session minted before P-29
    });

    const res = await tasksGET(
      requestAs(rootless, '/api/tasks', { query: { entityId: owner.entity.id } })
    );

    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe('ENTITY_REQUIRED');
  });

  it('and recovers with one switch, without signing out', async () => {
    // The cost of being strict, measured rather than assumed. This is the same
    // recovery `tests/db/entity-switching.test.ts` proves for the unscoped case.
    const owner = await createTenant();
    await createTask(owner.entity.id, { title: 'mine' });

    const rootless = await sessionTokenFor({
      userId: owner.user.id,
      email: owner.user.email,
      name: owner.user.name,
      role: 'owner',
    });

    const recovered = await actingIn(rootless, owner.entity.id);
    const res = await tasksGET(requestAs(recovered, '/api/tasks'));

    expect(res.status).toBe(200);
    expect((await readJson<{ data: { title: string }[] }>(res)).data.map((t) => t.title)).toEqual([
      'mine',
    ]);
  });
});
