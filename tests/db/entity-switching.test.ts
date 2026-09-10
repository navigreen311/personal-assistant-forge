/**
 * P-29 — ENTITY SWITCHING IS REAL. THIS FILE IS THE PROOF.
 *
 * ============================================================================
 * WHAT WAS BROKEN
 * ============================================================================
 *
 * `POST /api/auth/switch-entity` verified that the caller owned the entity and
 * then returned the value it had been handed:
 *
 *     return success({ activeEntityId: entityId });
 *
 * No row, no cookie, no re-minted token. `token.activeEntityId` was written in
 * exactly one place -- `src/lib/auth/config.ts`, inside `if (user)`, which runs
 * only at initial sign-in -- and set to `entities[0]` ordered by `createdAt
 * asc`. So every user was pinned to their OLDEST entity for the life of the
 * account, while the switch UI reported success and the client's `update()`
 * re-read the same cookie it already had.
 *
 * `tests/db/platform-surface.test.ts` recorded this as a FINDING it was not
 * allowed to fix. `docs/parallel-build/decision-01-entity-isolation.md` calls
 * it the blocker that has to clear before `record.entityId === scopedEntityId`
 * can be enforced at all: there was no working notion of "the entity I am
 * currently acting in" to compare a record against.
 *
 * ============================================================================
 * WHY THE FIRST TEST IS THE ONLY ONE THAT MATTERS
 * ============================================================================
 *
 * Everything else here is a guard rail. The headline is: create a task in
 * entity A and a different task in entity B, ask `GET /api/tasks` with NO
 * `?entityId=` so the answer can only come from the session's active entity,
 * switch, and ask again. Two different answers to the same request is the
 * whole feature, and on master it is impossible -- the second answer is the
 * first one.
 *
 * Deliberately NOT asserted by inspecting the token. The token is checked too,
 * further down, but a test that only decodes a JWT proves that a string was
 * written, not that anything reads it. This one goes through
 * `withEntityScope`'s real fallback and a real Postgres query.
 *
 * ============================================================================
 * HOW THE COOKIE TRAVELS
 * ============================================================================
 *
 * `requestAs` (tests/helpers/session.ts) accepts a bare token string as an
 * actor, so the token the route sets on its response can be lifted out of the
 * `Set-Cookie` header and presented on the next request exactly as a browser
 * would present it. No production code is patched to make this work; the
 * browser's behaviour is what is being simulated, and only that.
 *
 * Run: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paf_p29 \
 *        npm run test:db -- entity-switching
 */

import { decode } from 'next-auth/jwt';

import { POST as switchEntityPOST } from '@/app/api/auth/switch-entity/route';
import { GET as tasksGET } from '@/app/api/tasks/route';

import { db, setupTestDatabase } from '../helpers/db';
import { createEntity, createTask, createTenant, type Tenant } from '../helpers/factories';
import { readJson, requestAs, sessionTokenFor } from '../helpers/session';

setupTestDatabase();

interface OkBody<T> {
  success: true;
  data: T;
}

interface ErrBody {
  success: false;
  error: { code: string; message: string };
}

const SESSION_COOKIE = 'next-auth.session-token';

/**
 * The session token the response tells the browser to store, or null.
 *
 * `getSetCookie()` is the correct reader when more than one cookie is set;
 * `get('set-cookie')` is the fallback for a Headers implementation without it.
 * Both are handled because a wrong answer here would look exactly like the bug
 * under test.
 */
function sessionTokenFromResponse(res: Response): string | null {
  const headers: string[] =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*[A-Za-z0-9_.-]+=)/);

  for (const header of headers) {
    const match = header.trim().match(/^(?:__Secure-)?next-auth\.session-token=([^;]*)/);
    // A chunk cookie (`...session-token.0=`) never matches: the `=` is anchored
    // straight after the name.
    if (match && match[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

async function claimsOf(token: string): Promise<Record<string, unknown>> {
  const decoded = await decode({ token, secret: process.env.NEXTAUTH_SECRET! });
  if (!decoded) throw new Error('the re-minted token did not decrypt');
  return decoded;
}

function switchTo(actor: Parameters<typeof requestAs>[0], entityId: string): Promise<Response> {
  return switchEntityPOST(
    requestAs(actor, '/api/auth/switch-entity', { method: 'POST', body: { entityId } })
  );
}

/** Titles of the tasks `GET /api/tasks` answers with, given NO explicit entity. */
async function tasksVisibleTo(actor: Parameters<typeof requestAs>[0]): Promise<string[]> {
  const res = await tasksGET(requestAs(actor, '/api/tasks'));
  expect(res.status).toBe(200);
  const body = await readJson<{ data: { title: string }[] }>(res);
  return body.data.map((t) => t.title).sort();
}

describe('POST /api/auth/switch-entity — one user, two entities', () => {
  let owner: Tenant;
  let entityA: { id: string };
  let entityB: { id: string };

  beforeEach(async () => {
    // `createTenant` mints a session whose activeEntityId is this entity, which
    // is also the oldest -- i.e. exactly the state the broken code left every
    // user in permanently.
    owner = await createTenant({ entity: { name: 'MedLink' } });
    entityA = owner.entity;
    entityB = await createEntity(owner.user.id, { name: 'CRE Forge' });

    await createTask(entityA.id, { title: 'A: file the HIPAA attestation' });
    await createTask(entityB.id, { title: 'B: sign the LOI' });
  });

  // =========================================================================
  // THE HEADLINE
  // =========================================================================

  it('scopes a later request to the entity that was switched to', async () => {
    // Before: the session's active entity is A, so an unscoped list is A's.
    expect(await tasksVisibleTo(owner)).toEqual(['A: file the HIPAA attestation']);

    const res = await switchTo(owner, entityB.id);
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ activeEntityId: string }>>(res)).data.activeEntityId).toBe(
      entityB.id
    );

    const switchedSession = sessionTokenFromResponse(res);
    expect(switchedSession).not.toBeNull();
    // The session the browser now holds is a DIFFERENT one. On master this
    // header did not exist at all.
    expect(switchedSession).not.toBe(owner.token);

    // After: the identical request, no `?entityId=`, answers about B.
    expect(await tasksVisibleTo(switchedSession!)).toEqual(['B: sign the LOI']);

    // And it is not "everything now": A's task is no longer in scope.
    expect(await tasksVisibleTo(switchedSession!)).not.toContain(
      'A: file the HIPAA attestation'
    );

    // Switching back is symmetric, so the fix is not "always answer B".
    const back = await switchTo(switchedSession!, entityA.id);
    expect(back.status).toBe(200);
    const restored = sessionTokenFromResponse(back);
    expect(restored).not.toBeNull();
    expect(await tasksVisibleTo(restored!)).toEqual(['A: file the HIPAA attestation']);
  });

  // =========================================================================
  // The token itself
  // =========================================================================

  it('re-mints a token whose activeEntityId is the new entity', async () => {
    const before = await claimsOf(owner.token);
    expect(before.activeEntityId).toBe(entityA.id);

    const token = sessionTokenFromResponse(await switchTo(owner, entityB.id));
    expect(token).not.toBeNull();
    expect((await claimsOf(token!)).activeEntityId).toBe(entityB.id);
  });

  it('carries every other claim across unchanged', async () => {
    // A re-mint that dropped `role` would silently demote the whole user base
    // to the `viewer` default in withAuth, and a re-mint that dropped `userId`
    // would 401 them. Both would look like "switching is broken" and neither
    // would point here.
    const before = await claimsOf(owner.token);
    const after = await claimsOf(sessionTokenFromResponse(await switchTo(owner, entityB.id))!);

    expect(after.userId).toBe(before.userId);
    expect(after.role).toBe(before.role);
    expect(after.email).toBe(before.email);
    expect(after.name).toBe(before.name);
    expect(after.activeEntityId).not.toBe(before.activeEntityId);
  });

  it('does not extend the session, and issues a distinct token id', async () => {
    const before = await claimsOf(owner.token);
    const after = await claimsOf(sessionTokenFromResponse(await switchTo(owner, entityB.id))!);

    // Changing which entity you are acting in is not a reason to be logged in
    // for another 30 days. Allow a second of slack for the clock.
    expect(typeof after.exp).toBe('number');
    expect(Math.abs((after.exp as number) - (before.exp as number))).toBeLessThanOrEqual(1);

    // A fresh `jti`/`iat` -- the token really was re-issued rather than echoed.
    expect(after.jti).not.toBe(before.jti);
  });

  it('sets an httpOnly, lax, site-wide cookie under the name getToken reads', async () => {
    const res = await switchTo(owner, entityB.id);
    const header = (
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [res.headers.get('set-cookie') ?? '']
    ).find((h) => h.includes(SESSION_COOKIE));

    expect(header).toBeDefined();
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Path=/');
    expect(header?.toLowerCase()).toContain('samesite=lax');
    // Not a session cookie: it must outlive the browser window like the one it
    // replaces.
    expect(header).toMatch(/Max-Age=\d+/);
  });
});

describe('POST /api/auth/switch-entity — a token is a capability', () => {
  let owner: Tenant;
  let stranger: Tenant;

  beforeEach(async () => {
    owner = await createTenant();
    stranger = await createTenant();
  });

  it("mints nothing when the entity belongs to someone else", async () => {
    const res = await switchTo(owner, stranger.entity.id);

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
    // The refusal must not become a session. This is the assertion that stops
    // the fix from being a tenancy bypass: the id came off the request body,
    // and an unverified body value must never reach a token.
    expect(sessionTokenFromResponse(res)).toBeNull();
  });

  it('mints nothing for an entity that does not exist, with the same 403', async () => {
    const res = await switchTo(owner, 'entity-that-was-never-created');

    // 403 and not 404, deliberately: a distinguishable 404 would make this
    // endpoint an oracle for the existence of other tenants' entity ids.
    expect(res.status).toBe(403);
    expect(sessionTokenFromResponse(res)).toBeNull();
  });

  it('mints nothing for a request with no session', async () => {
    const res = await switchEntityPOST(
      requestAs('not-a-real-token', '/api/auth/switch-entity', {
        method: 'POST',
        body: { entityId: owner.entity.id },
      })
    );

    expect(res.status).toBe(401);
    expect(sessionTokenFromResponse(res)).toBeNull();
  });

  it('mints nothing when the body carries no entityId', async () => {
    const res = await switchEntityPOST(
      requestAs(owner, '/api/auth/switch-entity', { method: 'POST', body: {} })
    );

    expect(res.status).toBe(400);
    expect(sessionTokenFromResponse(res)).toBeNull();
  });

  it('cannot be used to widen a stranger scope even after a legitimate switch', async () => {
    const second = await createEntity(owner.user.id, { name: 'Second' });
    const token = sessionTokenFromResponse(await switchTo(owner, second.id));
    expect(token).not.toBeNull();

    // The re-minted token is still just a token: withEntityScope re-checks
    // ownership on every request, so naming someone else's entity explicitly
    // is refused exactly as before.
    const res = await tasksGET(
      requestAs(token!, '/api/tasks', { query: { entityId: stranger.entity.id } })
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/auth/switch-entity — sessions minted before this change', () => {
  it('switches a token that has no activeEntityId at all', async () => {
    // A user whose entity was created after they signed in holds a token with
    // the claim absent, and every unscoped route answers ENTITY_REQUIRED. That
    // session must not need a sign-out to recover.
    const user = await db.user.create({
      data: {
        name: 'Late Entity',
        email: `late-${Date.now()}@example.com`,
        preferences: {},
        timezone: 'America/Chicago',
      },
    });
    const entity = await createEntity(user.id, { name: 'Created afterwards' });
    await createTask(entity.id, { title: 'visible only once scoped' });

    const legacy = await sessionTokenFor({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: 'owner',
      // no activeEntityId -- the shape of a pre-change session
    });

    const before = await tasksGET(requestAs(legacy, '/api/tasks'));
    expect(before.status).toBe(400);
    expect((await readJson<ErrBody>(before)).error.code).toBe('ENTITY_REQUIRED');

    const token = sessionTokenFromResponse(await switchTo(legacy, entity.id));
    expect(token).not.toBeNull();
    expect(await tasksVisibleTo(token!)).toEqual(['visible only once scoped']);
  });

  it('leaves an un-switched token working exactly as before', async () => {
    // Nothing about the token SHAPE changed, so a session minted yesterday
    // keeps resolving to the entity it already named. This package adds a way
    // to move the value; it does not invalidate anyone.
    const owner = await createTenant();
    await createTask(owner.entity.id, { title: 'still mine' });

    expect(await tasksVisibleTo(owner)).toEqual(['still mine']);
  });
});

describe('POST /api/auth/switch-entity — after the entity goes away', () => {
  it('refuses rather than falling back to another tenant', async () => {
    // The question the card asks: what happens if the active entity is later
    // deleted or transferred? Answer: withEntityScope re-checks ownership on
    // every request, so the stale claim resolves to a refusal -- never to some
    // other entity's rows. The user recovers by switching again, which now
    // works.
    const owner = await createTenant();
    const doomed = await createEntity(owner.user.id, { name: 'Doomed' });
    const survivor = await createEntity(owner.user.id, { name: 'Survivor' });
    await createTask(survivor.id, { title: 'survivor task' });

    const token = sessionTokenFromResponse(await switchTo(owner, doomed.id));
    expect(token).not.toBeNull();

    await db.entity.delete({ where: { id: doomed.id } });

    const res = await tasksGET(requestAs(token!, '/api/tasks'));
    expect(res.status).toBe(404);
    expect((await readJson<ErrBody>(res)).error.code).toBe('NOT_FOUND');

    const recovered = sessionTokenFromResponse(await switchTo(token!, survivor.id));
    expect(recovered).not.toBeNull();
    expect(await tasksVisibleTo(recovered!)).toEqual(['survivor task']);
  });
});

describe('POST /api/auth/switch-entity — the audit log', () => {
  it('records the context change, and records the refusals', async () => {
    const owner = await createTenant();
    const stranger = await createTenant();
    const second = await createEntity(owner.user.id, { name: 'Second' });

    await switchTo(owner, second.id);
    await switchTo(owner, stranger.entity.id);

    const rows = await db.auditLogEntry.findMany({
      where: { resource: 'auth.switch-entity', actorId: owner.user.id },
      orderBy: { timestamp: 'asc' },
      select: { action: true, statusCode: true, sensitivityLevel: true },
    });

    expect(rows.map((r) => r.statusCode)).toEqual([200, 403]);
    expect(rows.every((r) => r.action === 'POST /api/auth/switch-entity')).toBe(true);
    // A cross-tenant refusal is the single most valuable line in a security
    // audit log, and before this package a tenant-context change produced no
    // line at all.
    expect(rows[1].sensitivityLevel).toBe('CONFIDENTIAL');
  });
});
