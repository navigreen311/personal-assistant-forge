/**
 * P-23 — the platform surface, proven against a real database.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 *
 * The nine module packages covered 301 of 335 route files. The 15 routes under
 * `auth`, `settings`, `trust`, `trust-scores`, `permissions`, `notifications`,
 * `events`, `search`, `uploads` and `webhooks` belong to no feature module, so
 * nobody owned them and nobody would have tested them. Most were already
 * correct -- this file's job is largely to say so with evidence rather than
 * with an assumption. Three were not, and those are marked.
 *
 * ============================================================================
 * THE ONE THAT MATTERS MORE THAN ITS SIZE
 * ============================================================================
 *
 * `POST /api/auth/switch-entity` decides the session's `activeEntityId`, and
 * that value is what `withEntityScope` falls back to when a request names no
 * entity. It is therefore the input to the tenancy mechanism every other
 * package built on. If its ownership check were ever removed, every
 * `withEntityScope` fallback in the codebase would widen at once, and no
 * module's own tenancy test would notice -- they all pass an explicit entityId.
 *
 * The existing coverage in `tests/e2e/auth-flow.test.ts` mocks Prisma, so
 * `entity.findFirst` returns whatever the test told it to: it proves the route
 * branches on the result, not that the query is scoped. The cases below run the
 * real query against real rows.
 *
 * ============================================================================
 * WHAT WAS BROKEN, AND IS FIXED IN THIS PACKAGE
 * ============================================================================
 *
 *   GET  /api/search        -- `?entityId=` was passed to the search layer
 *                              unchecked. With no entity resolvable at all it
 *                              passed `undefined`, and the filter builder emits
 *                              no WHERE clause for an undefined entity: a
 *                              search across every tenant in the database.
 *   GET  /api/events/stream -- `?entityId=` subscribed the caller to another
 *                              tenant's SSE bus and replayed its buffer.
 *   POST /api/uploads       -- form `entityId` wrote a document into another
 *                              tenant's entity. The only cross-tenant WRITE on
 *                              this surface.
 *
 * Run: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paf_p23 \
 *        npm run test:db -- platform-surface
 */

import { NextRequest } from 'next/server';

import { POST as registerPOST } from '@/app/api/auth/register/route';
import { GET as profileGET, PATCH as profilePATCH } from '@/app/api/auth/profile/route';
import { POST as switchEntityPOST } from '@/app/api/auth/switch-entity/route';
import { GET as settingsGET, PATCH as settingsPATCH } from '@/app/api/settings/route';
import { GET as apiKeysGET } from '@/app/api/settings/api-keys/route';
import { POST as exportPOST } from '@/app/api/settings/export/route';
import { GET as consentLogGET } from '@/app/api/trust/consent-log/route';
import { GET as trustScoresGET } from '@/app/api/trust-scores/route';
import { GET as permissionsGET, PATCH as permissionsPATCH } from '@/app/api/permissions/route';
import {
  GET as notificationsGET,
  PATCH as notificationsPATCH,
  DELETE as notificationsDELETE,
} from '@/app/api/notifications/route';
import { GET as streamGET } from '@/app/api/events/stream/route';
import { GET as searchGET } from '@/app/api/search/route';
import { POST as uploadsPOST } from '@/app/api/uploads/route';
import { POST as stripeWebhookPOST } from '@/app/api/webhooks/stripe/route';

import { listDocuments, _resetStore } from '@/lib/integrations/storage/documents';

import { db, setupTestDatabase } from '../helpers/db';
import { createTwoTenants, type Tenant } from '../helpers/factories';
import { anonymousRequest, readJson, requestAs, sessionTokenFor } from '../helpers/session';

/**
 * The ONLY mock in this file, and it is not the thing under test.
 *
 * `processUpload` ends in an S3 PutObject. There is no bucket in CI and the
 * upload is not what these cases assert -- the ownership gate in front of it
 * is. Stubbing the S3 client keeps the owner-succeeds half of the upload
 * assertions meaningful (201, not a 500 from a missing bucket) while leaving
 * `withEntityScope`, the real Prisma ownership query and the real document
 * store exactly as they run in production.
 *
 * Note what is NOT mocked: `@/lib/db` and `next-auth/jwt`. A tests/db file that
 * mocked either would prove nothing.
 */
jest.mock('@/lib/integrations/storage/client', () => ({
  uploadFile: jest.fn(async (key: string) => `s3://test-bucket/${key}`),
  getSignedDownloadUrl: jest.fn(async (key: string) => `https://test/${key}`),
  getSignedUploadUrl: jest.fn(async (key: string) => `https://test/${key}`),
  deleteFile: jest.fn(async () => undefined),
}));

setupTestDatabase();

type ErrBody = { success: false; error: { code: string; message: string } };
type OkBody<T> = { success: true; data: T };

let tenantA: Tenant;
let tenantB: Tenant;

beforeEach(async () => {
  await _resetStore();
  const pair = await createTwoTenants();
  tenantA = pair.tenantA;
  tenantB = pair.tenantB;
});

/** A NOTIFICATION-shaped ActionLog row, which is how /api/notifications stores them. */
async function createNotification(userId: string, title: string, status = 'PENDING') {
  return db.actionLog.create({
    data: {
      actor: 'SYSTEM',
      actorId: userId,
      actionType: 'NOTIFICATION',
      target: title,
      reason: `body of ${title}`,
      blastRadius: 'info',
      status,
    },
  });
}

/** A multipart upload request carrying a session cookie. */
function uploadRequest(actor: Tenant | null, entityId: string | null, fileName = 'note.txt') {
  const form = new FormData();
  form.set('file', new File(['hello world'], fileName, { type: 'text/plain' }), fileName);
  if (entityId !== null) form.set('entityId', entityId);
  form.set('title', `upload ${fileName}`);

  const headers: Record<string, string> = {};
  if (actor) {
    headers.cookie = [
      `next-auth.session-token=${actor.token}`,
      `__Secure-next-auth.session-token=${actor.token}`,
    ].join('; ');
  }

  return new NextRequest('http://localhost:3000/api/uploads', {
    method: 'POST',
    headers,
    body: form,
  });
}

// ===========================================================================
// 1. POST /api/auth/switch-entity -- the load-bearing one
// ===========================================================================

describe('POST /api/auth/switch-entity', () => {
  it("switches to an entity the caller owns", async () => {
    const second = await db.entity.create({
      data: { userId: tenantA.user.id, name: 'Second', type: 'LLC' },
    });

    const res = await switchEntityPOST(
      requestAs(tenantA, '/api/auth/switch-entity', {
        method: 'POST',
        body: { entityId: second.id },
      })
    );

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ activeEntityId: string }>>(res);
    expect(body.data.activeEntityId).toBe(second.id);
  });

  it("refuses another user's entity -- the whole tenancy mechanism rests on this", async () => {
    const res = await switchEntityPOST(
      requestAs(tenantA, '/api/auth/switch-entity', {
        method: 'POST',
        body: { entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    const body = await readJson<ErrBody>(res);
    expect(body.error.code).toBe('FORBIDDEN');
    // The refusal must not disclose that the entity exists.
    expect(body.error.message).not.toContain(tenantB.entity.id);
  });

  it('refuses an entity that does not exist, with the same 403', async () => {
    const res = await switchEntityPOST(
      requestAs(tenantA, '/api/auth/switch-entity', {
        method: 'POST',
        body: { entityId: 'entity-that-was-never-created' },
      })
    );

    expect(res.status).toBe(403);
  });

  it('is symmetric: B reaches B, so the fix is not "deny everyone"', async () => {
    const res = await switchEntityPOST(
      requestAs(tenantB, '/api/auth/switch-entity', {
        method: 'POST',
        body: { entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(200);
  });

  it('refuses with no session at all', async () => {
    const res = await switchEntityPOST(
      anonymousRequest('/api/auth/switch-entity', {
        method: 'POST',
        body: { entityId: tenantA.entity.id },
      })
    );

    expect(res.status).toBe(401);
  });

  it('rejects a missing entityId with 400, not a silent success', async () => {
    const res = await switchEntityPOST(
      requestAs(tenantA, '/api/auth/switch-entity', { method: 'POST', body: {} })
    );

    expect(res.status).toBe(400);
    expect((await readJson<ErrBody>(res)).error.code).toBe('VALIDATION_ERROR');
  });

  /**
   * P-23 recorded this as a FINDING it was not allowed to fix, and wrote the
   * assertions to pass against the broken code:
   *
   *     expect(res.headers.get('set-cookie')).toBeNull();
   *     expect(searchBody.data.filters.entityId).toBe(tenantA.entity.id);
   *
   * -- i.e. "the switch changes nothing", pinned so the gap stayed visible. The
   * route returned `{ activeEntityId }` and stopped; `token.activeEntityId` was
   * written only in the `jwt` callback's `if (user)` branch, at initial sign-in,
   * from `entities[0]` ordered by `createdAt asc`.
   *
   * P-29 fixed it (`docs/parallel-build/decision-01-entity-isolation.md` makes
   * a working switch the prerequisite for entity isolation), so the assertions
   * are inverted here: the same two observations, now expecting the opposite.
   * The behaviour was wrong, not the test. `tests/db/entity-switching.test.ts`
   * carries the full proof.
   */
  it('a successful switch re-mints the session token and moves the scope', async () => {
    const second = await db.entity.create({
      data: { userId: tenantA.user.id, name: 'Second', type: 'LLC' },
    });

    const res = await switchEntityPOST(
      requestAs(tenantA, '/api/auth/switch-entity', {
        method: 'POST',
        body: { entityId: second.id },
      })
    );

    expect(res.status).toBe(200);

    // A Set-Cookie: the session JWT the browser holds is replaced.
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('next-auth.session-token=');

    const switched = /(?:^|[;,\s])(?:__Secure-)?next-auth\.session-token=([^;]+)/.exec(
      setCookie ?? ''
    )?.[1];
    expect(switched).toBeTruthy();

    // And the fallback that withEntityScope uses is now the NEW entity. Proven
    // through a real scoped route rather than by inspection.
    const searchRes = await searchGET(requestAs(switched!, '/api/search?q=anything'));
    expect(searchRes.status).toBe(200);
    const searchBody = await readJson<OkBody<{ filters: { entityId?: string } }>>(searchRes);
    expect(searchBody.data.filters.entityId).toBe(second.id);
    expect(searchBody.data.filters.entityId).not.toBe(tenantA.entity.id);

    // The pre-switch token is untouched and still scoped where it was, so the
    // fix moves a session forward rather than rewriting history.
    const oldRes = await searchGET(requestAs(tenantA, '/api/search?q=anything'));
    const oldBody = await readJson<OkBody<{ filters: { entityId?: string } }>>(oldRes);
    expect(oldBody.data.filters.entityId).toBe(tenantA.entity.id);
  });

  it('a token whose activeEntityId names a foreign entity still cannot use it', async () => {
    // The forged-fallback case: even if a switch DID persist, or a token were
    // tampered with, withEntityScope re-checks ownership on every request.
    const forged = await sessionTokenFor({
      userId: tenantA.user.id,
      email: tenantA.user.email,
      activeEntityId: tenantB.entity.id,
    });

    const res = await searchGET(requestAs(forged, '/api/search?q=anything'));

    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// 2. POST /api/auth/register
// ===========================================================================

describe('POST /api/auth/register', () => {
  it('creates a user and their default Personal entity', async () => {
    const res = await registerPOST(
      anonymousRequest('/api/auth/register', {
        method: 'POST',
        body: { name: 'New Person', email: 'p23-new@example.test', password: 'Sup3rSecret!pw' },
      })
    );

    expect(res.status).toBe(201);
    const body = await readJson<OkBody<{ userId: string }>>(res);

    const entities = await db.entity.findMany({ where: { userId: body.data.userId } });
    expect(entities).toHaveLength(1);
    expect(entities[0].name).toBe('Personal');
    expect(entities[0].userId).toBe(body.data.userId);
  });

  it('never stores the password in plaintext', async () => {
    const password = 'Sup3rSecret!pw';
    const res = await registerPOST(
      anonymousRequest('/api/auth/register', {
        method: 'POST',
        body: { name: 'New Person', email: 'p23-hash@example.test', password },
      })
    );
    const body = await readJson<OkBody<{ userId: string }>>(res);

    const user = await db.user.findUnique({ where: { id: body.data.userId } });
    const prefs = user!.preferences as Record<string, unknown>;
    expect(prefs.hashedPassword).toBeDefined();
    expect(prefs.hashedPassword).not.toBe(password);
    expect(JSON.stringify(prefs)).not.toContain(password);
  });

  it('refuses a duplicate email with 409 and writes nothing', async () => {
    const before = await db.user.count();

    const res = await registerPOST(
      anonymousRequest('/api/auth/register', {
        method: 'POST',
        body: { name: 'Impostor', email: tenantA.user.email, password: 'Sup3rSecret!pw' },
      })
    );

    expect(res.status).toBe(409);
    expect(await db.user.count()).toBe(before);
  });
});

// ===========================================================================
// 3. GET/PATCH /api/auth/profile
// ===========================================================================

describe('/api/auth/profile', () => {
  it("returns only the caller's own entities", async () => {
    const res = await profileGET(requestAs(tenantA, '/api/auth/profile'));

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ id: string; entityIds: string[] }>>(res);
    expect(body.data.id).toBe(tenantA.user.id);
    expect(body.data.entityIds).toEqual([tenantA.entity.id]);
    expect(body.data.entityIds).not.toContain(tenantB.entity.id);
  });

  it('never returns the password hash', async () => {
    await db.user.update({
      where: { id: tenantA.user.id },
      data: { preferences: { hashedPassword: '$2a$12$secret', defaultTone: 'WARM' } },
    });

    const res = await profileGET(requestAs(tenantA, '/api/auth/profile'));
    const raw = JSON.stringify(await readJson(res));

    expect(raw).not.toContain('hashedPassword');
    expect(raw).not.toContain('$2a$12$secret');
  });

  it("a PATCH cannot reach another user's row", async () => {
    const res = await profilePATCH(
      requestAs(tenantA, '/api/auth/profile', {
        method: 'PATCH',
        // There is no id field on the schema, but send one anyway: the route
        // must key off the session, not the body.
        body: { name: 'Renamed By A', id: tenantB.user.id, userId: tenantB.user.id },
      })
    );

    expect(res.status).toBe(200);
    const a = await db.user.findUnique({ where: { id: tenantA.user.id } });
    const b = await db.user.findUnique({ where: { id: tenantB.user.id } });
    expect(a!.name).toBe('Renamed By A');
    expect(b!.name).not.toBe('Renamed By A');
  });

  it('preserves the password hash through a preferences PATCH', async () => {
    await db.user.update({
      where: { id: tenantA.user.id },
      data: { preferences: { hashedPassword: '$2a$12$secret' } },
    });

    await profilePATCH(
      requestAs(tenantA, '/api/auth/profile', {
        method: 'PATCH',
        body: { preferences: { attentionBudget: 7 } },
      })
    );

    const a = await db.user.findUnique({ where: { id: tenantA.user.id } });
    const prefs = a!.preferences as Record<string, unknown>;
    expect(prefs.hashedPassword).toBe('$2a$12$secret');
    expect(prefs.attentionBudget).toBe(7);
  });

  it('refuses with no session', async () => {
    expect((await profileGET(anonymousRequest('/api/auth/profile'))).status).toBe(401);
  });
});

// ===========================================================================
// 4. GET/PATCH /api/settings, GET /api/settings/api-keys, POST /api/settings/export
// ===========================================================================

describe('/api/settings', () => {
  it('a PATCH writes to the calling session only', async () => {
    const res = await settingsPATCH(
      requestAs(tenantA, '/api/settings', {
        method: 'PATCH',
        body: { theme: 'dark', userId: tenantB.user.id },
      })
    );

    expect(res.status).toBe(200);

    const aGet = await settingsGET(requestAs(tenantA, '/api/settings'));
    const bGet = await settingsGET(requestAs(tenantB, '/api/settings'));

    expect((await readJson<OkBody<{ theme: string }>>(aGet)).data.theme).toBe('dark');
    expect((await readJson<OkBody<{ theme: string }>>(bGet)).data.theme).toBe('system');
  });

  it('refuses with no session', async () => {
    expect((await settingsGET(anonymousRequest('/api/settings'))).status).toBe(401);
    expect(
      (await settingsPATCH(anonymousRequest('/api/settings', { method: 'PATCH', body: {} }))).status
    ).toBe(401);
  });
});

describe('GET /api/settings/api-keys', () => {
  it('requires a session', async () => {
    expect((await apiKeysGET(anonymousRequest('/api/settings/api-keys'))).status).toBe(401);
  });

  it('never returns a raw key', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-p23-do-not-leak-this-value';
    try {
      const res = await apiKeysGET(requestAs(tenantA, '/api/settings/api-keys'));
      const raw = JSON.stringify(await readJson(res));

      expect(res.status).toBe(200);
      expect(raw).not.toContain('do-not-leak-this-value');
      expect(raw).toContain('****');
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });
});

describe('POST /api/settings/export', () => {
  it("derives the export from the session, not the body", async () => {
    const res = await exportPOST(
      requestAs(tenantA, '/api/settings/export', {
        method: 'POST',
        body: { format: 'csv', userId: tenantB.user.id },
      })
    );

    expect(res.status).toBe(202);
    const body = await readJson<OkBody<{ exportId: string; message: string }>>(res);
    expect(body.data.exportId).toContain(tenantA.user.id.slice(0, 8));
    expect(body.data.message).toContain(tenantA.user.email);
    expect(body.data.message).not.toContain(tenantB.user.email);
  });

  it('refuses with no session', async () => {
    const res = await exportPOST(
      anonymousRequest('/api/settings/export', { method: 'POST', body: { format: 'json' } })
    );
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// 5. GET /api/trust/consent-log and GET /api/trust-scores
// ===========================================================================

describe('GET /api/trust/consent-log', () => {
  it("returns only the caller's own action log and receipts", async () => {
    const aLog = await db.actionLog.create({
      data: { actor: 'AI', actorId: tenantA.user.id, actionType: 'EMAIL', target: 'inbox', reason: 'A reason' },
    });
    const bLog = await db.actionLog.create({
      data: { actor: 'AI', actorId: tenantB.user.id, actionType: 'EMAIL', target: 'inbox', reason: 'B reason' },
    });
    await db.consentReceipt.create({
      data: { actionId: aLog.id, description: 'A receipt', reason: 'A' },
    });
    await db.consentReceipt.create({
      data: { actionId: bLog.id, description: 'B SECRET receipt', reason: 'B' },
    });

    const res = await consentLogGET(requestAs(tenantA, '/api/trust/consent-log'));

    expect(res.status).toBe(200);
    const raw = JSON.stringify(await readJson(res));
    expect(raw).toContain('A receipt');
    expect(raw).not.toContain('B SECRET receipt');
  });

  it('ignores a caller-supplied userId', async () => {
    const bLog = await db.actionLog.create({
      data: { actor: 'AI', actorId: tenantB.user.id, actionType: 'EMAIL', target: 'inbox', reason: 'B reason' },
    });
    await db.consentReceipt.create({
      data: { actionId: bLog.id, description: 'B SECRET receipt', reason: 'B' },
    });

    const res = await consentLogGET(
      requestAs(tenantA, `/api/trust/consent-log?userId=${tenantB.user.id}`)
    );

    expect(JSON.stringify(await readJson(res))).not.toContain('B SECRET receipt');
  });

  it('refuses with no session', async () => {
    expect((await consentLogGET(anonymousRequest('/api/trust/consent-log'))).status).toBe(401);
  });
});

describe('GET /api/trust-scores', () => {
  it('scores the session user, not the ?userId= the caller named', async () => {
    // Give B a pile of executed actions so their score cannot match A's.
    for (let i = 0; i < 12; i += 1) {
      await db.actionLog.create({
        data: {
          actor: 'AI',
          actorId: tenantB.user.id,
          // DEFAULT_DOMAINS in trust-score-service.ts are uppercase and the
          // service matches with `contains`, which is case-sensitive.
          actionType: 'COMMUNICATION',
          target: 'inbox',
          reason: 'b',
          status: 'EXECUTED',
        },
      });
    }

    const asA = await trustScoresGET(requestAs(tenantA, '/api/trust-scores'));
    const asAForgingB = await trustScoresGET(
      requestAs(tenantA, `/api/trust-scores?userId=${tenantB.user.id}`)
    );
    const asB = await trustScoresGET(requestAs(tenantB, '/api/trust-scores'));

    const bodyA = await readJson<OkBody<unknown[]>>(asA);
    const bodyForged = await readJson<OkBody<unknown[]>>(asAForgingB);
    const bodyB = await readJson<OkBody<unknown[]>>(asB);

    expect(asA.status).toBe(200);
    // Forging the query string changes nothing.
    expect(bodyForged.data).toEqual(bodyA.data);
    // And B genuinely differs, so the equality above is not two empty answers.
    expect(bodyB.data).not.toEqual(bodyA.data);
  });

  it('refuses with no session', async () => {
    expect((await trustScoresGET(anonymousRequest('/api/trust-scores'))).status).toBe(401);
  });
});

// ===========================================================================
// 6. GET/PATCH /api/permissions
// ===========================================================================

describe('/api/permissions', () => {
  it('grants are created against the session user', async () => {
    const res = await permissionsGET(
      requestAs(tenantA, `/api/permissions?userId=${tenantB.user.id}`)
    );

    expect(res.status).toBe(200);
    const grants = await db.permissionGrant.findMany();
    expect(grants.length).toBeGreaterThan(0);
    expect(grants.every((g) => g.userId === tenantA.user.id)).toBe(true);
    expect(grants.some((g) => g.userId === tenantB.user.id)).toBe(false);
  });

  it("a PATCH naming another user's id still updates only the caller's grant", async () => {
    await permissionsGET(requestAs(tenantA, '/api/permissions'));
    await permissionsGET(requestAs(tenantB, '/api/permissions'));

    const integrationId = (await db.permissionGrant.findFirst({
      where: { userId: tenantB.user.id },
    }))!.resource;

    const res = await permissionsPATCH(
      requestAs(tenantA, '/api/permissions', {
        method: 'PATCH',
        body: { userId: tenantB.user.id, integrationId, execute: true },
      })
    );

    expect(res.status).toBe(200);

    const aGrant = await db.permissionGrant.findFirst({
      where: { userId: tenantA.user.id, resource: integrationId },
    });
    const bGrant = await db.permissionGrant.findFirst({
      where: { userId: tenantB.user.id, resource: integrationId },
    });

    expect((aGrant!.actions as { execute: boolean }).execute).toBe(true);
    expect((bGrant!.actions as { execute: boolean }).execute).toBe(false);
  });

  it('refuses with no session', async () => {
    expect((await permissionsGET(anonymousRequest('/api/permissions'))).status).toBe(401);
    expect(
      (
        await permissionsPATCH(
          anonymousRequest('/api/permissions', {
            method: 'PATCH',
            body: { integrationId: 'gmail', read: true },
          })
        )
      ).status
    ).toBe(401);
  });
});

// ===========================================================================
// 7. GET/PATCH/DELETE /api/notifications -- the bulk routes
// ===========================================================================

describe('/api/notifications', () => {
  it("a list request returns none of the other tenant's notifications", async () => {
    await createNotification(tenantA.user.id, 'A NOTICE');
    await createNotification(tenantB.user.id, 'B SECRET NOTICE');

    const res = await notificationsGET(requestAs(tenantA, '/api/notifications'));
    const raw = JSON.stringify(await readJson(res));

    expect(res.status).toBe(200);
    expect(raw).toContain('A NOTICE');
    expect(raw).not.toContain('B SECRET NOTICE');
  });

  it("an ordinary filtered request cannot surface the other tenant's row", async () => {
    // Not merely "refuses ?userId=B" -- a filter that MATCHES B's row still
    // returns nothing, which is the leak shape a single-record 403 misses.
    await createNotification(tenantB.user.id, 'B SECRET NOTICE', 'PENDING');

    const res = await notificationsGET(requestAs(tenantA, '/api/notifications?read=false'));
    const body = await readJson<{ data: unknown[]; meta: { total: number } }>(res);

    expect(body.data).toHaveLength(0);
    expect(body.meta.total).toBe(0);
  });

  it("a bulk mark-read over foreign ids reports 0 and changes nothing", async () => {
    const bNotice = await createNotification(tenantB.user.id, 'B NOTICE', 'PENDING');

    const res = await notificationsPATCH(
      requestAs(tenantA, '/api/notifications', {
        method: 'PATCH',
        body: { ids: [bNotice.id] },
      })
    );

    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ updated: number }>>(res)).data.updated).toBe(0);

    const after = await db.actionLog.findUnique({ where: { id: bNotice.id } });
    expect(after!.status).toBe('PENDING');
  });

  it('mark-all touches only the calling tenant', async () => {
    await createNotification(tenantA.user.id, 'A NOTICE', 'PENDING');
    const bNotice = await createNotification(tenantB.user.id, 'B NOTICE', 'PENDING');

    const res = await notificationsPATCH(
      requestAs(tenantA, '/api/notifications', { method: 'PATCH', body: { all: true } })
    );

    expect((await readJson<OkBody<{ updated: number }>>(res)).data.updated).toBe(1);
    expect((await db.actionLog.findUnique({ where: { id: bNotice.id } }))!.status).toBe('PENDING');
  });

  it("a bulk delete over foreign ids reports 0 and deletes nothing", async () => {
    const bNotice = await createNotification(tenantB.user.id, 'B NOTICE');

    const res = await notificationsDELETE(
      requestAs(tenantA, '/api/notifications', {
        method: 'DELETE',
        body: { ids: [bNotice.id] },
      })
    );

    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ deleted: number }>>(res)).data.deleted).toBe(0);
    expect(await db.actionLog.findUnique({ where: { id: bNotice.id } })).not.toBeNull();
  });

  it('is symmetric: B reaches B\'s own notifications', async () => {
    const bNotice = await createNotification(tenantB.user.id, 'B NOTICE', 'PENDING');

    const res = await notificationsPATCH(
      requestAs(tenantB, '/api/notifications', {
        method: 'PATCH',
        body: { ids: [bNotice.id] },
      })
    );

    expect((await readJson<OkBody<{ updated: number }>>(res)).data.updated).toBe(1);
  });

  it('refuses with no session', async () => {
    expect((await notificationsGET(anonymousRequest('/api/notifications'))).status).toBe(401);
  });
});

// ===========================================================================
// 8. GET /api/events/stream -- REPAIRED IN THIS PACKAGE
// ===========================================================================

describe('GET /api/events/stream', () => {
  it("refuses a subscription to another tenant's event bus", async () => {
    const res = await streamGET(
      requestAs(tenantA, `/api/events/stream?entityId=${tenantB.entity.id}`)
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
    // A refusal, not a stream.
    expect(res.headers.get('content-type')).not.toContain('text/event-stream');
  });

  it('opens a stream on the caller\'s own entity', async () => {
    const res = await streamGET(
      requestAs(tenantA, `/api/events/stream?entityId=${tenantA.entity.id}`)
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    await res.body?.cancel();
  });

  it('falls back to the session entity when none is named', async () => {
    const res = await streamGET(requestAs(tenantA, '/api/events/stream'));

    expect(res.status).toBe(200);
    await res.body?.cancel();
  });

  it('refuses with no session', async () => {
    const res = await streamGET(
      anonymousRequest(`/api/events/stream?entityId=${tenantA.entity.id}`)
    );
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// 9. GET /api/search -- REPAIRED IN THIS PACKAGE
// ===========================================================================

describe('GET /api/search', () => {
  beforeEach(async () => {
    await db.task.create({
      data: {
        entityId: tenantA.entity.id,
        title: 'Alpha quarterly review',
        description: 'A private note',
        status: 'TODO',
        priority: 'MEDIUM',
      },
    });
    await db.task.create({
      data: {
        entityId: tenantB.entity.id,
        title: 'Bravo quarterly review',
        description: 'B CONFIDENTIAL merger memo',
        status: 'TODO',
        priority: 'MEDIUM',
      },
    });
  });

  it("refuses a search scoped to another tenant's entity", async () => {
    const res = await searchGET(
      requestAs(tenantA, `/api/search?q=quarterly&entityId=${tenantB.entity.id}`)
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  it("an ordinary search whose terms match B's row returns nothing of B's", async () => {
    // The leak shape a 403 test misses entirely: no foreign entityId is named,
    // the query simply matches both tenants' rows.
    const res = await searchGET(requestAs(tenantA, '/api/search?q=quarterly'));

    expect(res.status).toBe(200);
    const raw = JSON.stringify(await readJson(res));
    expect(raw).toContain('Alpha quarterly review');
    expect(raw).not.toContain('Bravo quarterly review');
    expect(raw).not.toContain('B CONFIDENTIAL merger memo');
  });

  it('a typed search is scoped too', async () => {
    const res = await searchGET(requestAs(tenantA, '/api/search?q=quarterly&type=task'));

    expect(res.status).toBe(200);
    expect(JSON.stringify(await readJson(res))).not.toContain('Bravo quarterly review');
  });

  it('suggestions refuse a foreign entity before running any query', async () => {
    const foreign = await searchGET(
      requestAs(tenantA, `/api/search?suggestions=true&q=qu&entityId=${tenantB.entity.id}`)
    );

    expect(foreign.status).toBe(403);
    expect((await readJson<ErrBody>(foreign)).error.code).toBe('FORBIDDEN');
  });

  /**
   * WAS a P-23 FINDING, pinned rather than repaired. FIXED BY P-26.
   *
   * `getSearchSuggestions` in `src/lib/search/index.ts` issued
   *
   *     SELECT DISTINCT title FROM "Task"
   *     WHERE "entityId" = $1 AND title ILIKE $2
   *     ORDER BY "updatedAt" DESC LIMIT $3
   *
   * which Postgres rejects outright: 42P10, "for SELECT DISTINCT, ORDER BY
   * expressions must appear in select list". `GET /api/search?suggestions=true`
   * had therefore never worked against a real database, for any tenant, and the
   * route did not catch it -- the rejection escaped the handler rather than
   * becoming a 4xx/5xx response body.
   *
   * It was invisible because `tests/unit/search/unified.test.ts` mocks
   * `prisma.$queryRawUnsafe` and returns rows, so the invalid SQL was never
   * sent. The suite was green and the endpoint was dead.
   *
   * `src/lib/search/index.ts` was outside the P-23 file list, so P-23 pinned
   * the behaviour and left the instruction: "change the assertion to a 200 when
   * the query is fixed". P-26 owns that file, rewrote the statement as
   * `GROUP BY title ORDER BY MAX("updatedAt") DESC`, and this is that change --
   * the ONLY line P-26 altered in this file. The full repair, including the
   * ordering and distinctness the old query was reaching for, is proved in
   * `tests/db/search.test.ts`.
   */
  it('an owner-scoped suggestions query works (P-23 finding, repaired by P-26)', async () => {
    const res = await searchGET(
      requestAs(tenantA, '/api/search?suggestions=true&q=Alpha')
    );

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ suggestions: string[] }>>(res);
    expect(body.data.suggestions).toContain('Alpha quarterly review');
  });

  it('a session with NO active entity gets a refusal, not a global search', async () => {
    // The worst of the three defects: `entityId ?? undefined` reached a filter
    // builder that emits no WHERE clause for an undefined entity, so this
    // request used to search every tenant in the database.
    const rootless = await sessionTokenFor({
      userId: tenantA.user.id,
      email: tenantA.user.email,
      // no activeEntityId
    });

    const res = await searchGET(requestAs(rootless, '/api/search?q=quarterly'));

    expect(res.status).toBe(400);
    expect((await readJson<ErrBody>(res)).error.code).toBe('ENTITY_REQUIRED');
  });

  it('is symmetric: B finds B\'s own row', async () => {
    const res = await searchGET(requestAs(tenantB, '/api/search?q=quarterly'));

    expect(res.status).toBe(200);
    expect(JSON.stringify(await readJson(res))).toContain('Bravo quarterly review');
  });

  it('refuses with no session', async () => {
    expect((await searchGET(anonymousRequest('/api/search?q=quarterly'))).status).toBe(401);
  });
});

// ===========================================================================
// 10. POST /api/uploads -- REPAIRED IN THIS PACKAGE (the only cross-tenant write)
// ===========================================================================

describe('POST /api/uploads', () => {
  it("refuses to write a document into the other tenant's entity, and writes nothing", async () => {
    const res = await uploadsPOST(uploadRequest(tenantA, tenantB.entity.id));

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');

    // A 403 that still writes is not a fix.
    const bDocs = await listDocuments({ entityId: tenantB.entity.id });
    expect(bDocs.documents).toHaveLength(0);
  });

  it("uploads into the caller's own entity", async () => {
    const res = await uploadsPOST(uploadRequest(tenantA, tenantA.entity.id));

    expect(res.status).toBe(201);
    const docs = await listDocuments({ entityId: tenantA.entity.id });
    expect(docs.documents).toHaveLength(1);
    expect(docs.documents[0].entityId).toBe(tenantA.entity.id);
  });

  it('refuses an entity that does not exist', async () => {
    const res = await uploadsPOST(uploadRequest(tenantA, 'entity-that-was-never-created'));

    expect(res.status).toBe(404);
  });

  it('still requires an entityId in the form', async () => {
    const res = await uploadsPOST(uploadRequest(tenantA, null));

    expect(res.status).toBe(400);
    expect((await readJson<ErrBody>(res)).error.code).toBe('MISSING_ENTITY_ID');
  });

  it('is symmetric: B uploads into B', async () => {
    const res = await uploadsPOST(uploadRequest(tenantB, tenantB.entity.id));

    expect(res.status).toBe(201);
  });

  it('refuses with no session, before parsing the body', async () => {
    const res = await uploadsPOST(uploadRequest(null, tenantA.entity.id));

    expect(res.status).toBe(401);
    const docs = await listDocuments({ entityId: tenantA.entity.id });
    expect(docs.documents).toHaveLength(0);
  });
});

// ===========================================================================
// 11. POST /api/webhooks/stripe -- unauthenticated by design, signed instead
// ===========================================================================

describe('POST /api/webhooks/stripe', () => {
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  });

  function webhookRequest(body: string, signature?: string): NextRequest {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (signature) headers['stripe-signature'] = signature;
    return new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers,
      body,
    });
  }

  it('refuses an unsigned request', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_p23_test';

    const res = await stripeWebhookPOST(webhookRequest('{"id":"evt_1","type":"x"}'));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ received: false });
  });

  it('refuses a forged signature', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_p23_test';

    const res = await stripeWebhookPOST(
      webhookRequest('{"id":"evt_1","type":"x"}', 't=1,v1=deadbeef')
    );

    expect(res.status).toBe(400);
  });

  it('refuses rather than fails open when no secret is configured', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const res = await stripeWebhookPOST(webhookRequest('{"id":"evt_1"}', 't=1,v1=deadbeef'));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ received: false });
  });
});
