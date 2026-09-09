/**
 * P-03 acceptance — the entity identity root, proven against a real database.
 *
 * ============================================================================
 * WHAT THIS FILE EXISTS TO PROVE
 * ============================================================================
 *
 * Until this package, `src/modules/entities/entity.service.ts` exported:
 *
 *     export function getCurrentUserId(headers?: Headers): string {
 *       const headerUserId = headers?.get('x-user-id');
 *       if (headerUserId) return headerUserId;
 *       return 'stub-user-id';
 *     }
 *
 * Four routes called it and then "verified ownership" against the result. A
 * client sets its own headers, so the ownership check asked the attacker who
 * they were; and with the header absent, every caller in the system collapsed
 * onto one shared fake user. The check ran, passed, and meant nothing.
 *
 * The three assertions that matter are therefore, for EACH of the four routes:
 *
 *   1. the owner reaches their own entity                              -> 200
 *   2. tenant A cannot reach tenant B's entity                         -> 403
 *   3. a FORGED `x-user-id` header naming the victim changes nothing   -> 403
 *   4. no session at all                                               -> 401
 *
 * (3) is the specific bypass being closed. It is asserted in three shapes:
 * forging the victim's id while holding A's session, forging it with no session
 * at all, and forging the old `'stub-user-id'` sentinel -- because the sentinel
 * was what an unauthenticated caller used to become.
 *
 * This runs against a real Postgres with `getToken` unmocked, so a request
 * presents a genuine NextAuth JWE and the production decrypt path runs. A
 * mocked-Prisma unit test cannot observe a missing tenant check -- that is how
 * 5,268 passing tests never saw this one.
 */

import type { NextRequest } from 'next/server';

import { GET as complianceGET } from '@/app/api/entities/[entityId]/compliance/route';
import { GET as dashboardGET } from '@/app/api/entities/[entityId]/dashboard/route';
import { GET as healthGET } from '@/app/api/entities/[entityId]/health/route';
import { GET as personaGET } from '@/app/api/entities/[entityId]/persona/route';

import { setupTestDatabase } from '../helpers/db';
import { createTwoTenants, type Tenant } from '../helpers/factories';
import { anonymousRequest, readJson, requestAs } from '../helpers/session';

setupTestDatabase();

type ErrBody = { success: false; error: { code: string; message: string } };

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<{ entityId: string }> }
) => Promise<Response>;

/** The four routes that used to trust `x-user-id`, each with its URL segment. */
const ROUTES: Array<{ name: string; segment: string; handler: RouteHandler }> = [
  { name: 'compliance', segment: 'compliance', handler: complianceGET },
  { name: 'dashboard', segment: 'dashboard', handler: dashboardGET },
  { name: 'health', segment: 'health', handler: healthGET },
  { name: 'persona', segment: 'persona', handler: personaGET },
];

/** Next 15 hands a route its path params as a promise; mirror that exactly. */
function ctx(entityId: string): { params: Promise<{ entityId: string }> } {
  return { params: Promise.resolve({ entityId }) };
}

function path(entityId: string, segment: string): string {
  return `/api/entities/${entityId}/${segment}`;
}

describe.each(ROUTES)('GET /api/entities/[entityId]/$name', ({ segment, handler }) => {
  let tenantA: Tenant;
  let tenantB: Tenant;

  beforeEach(async () => {
    ({ tenantA, tenantB } = await createTwoTenants());
  });

  // -------------------------------------------------------------------------
  // 1. The owner still gets their data. A tenancy fix that breaks the happy
  //    path is not a fix.
  // -------------------------------------------------------------------------

  it('lets the owner read their own entity', async () => {
    const res = await handler(
      requestAs(tenantA, path(tenantA.entity.id, segment)),
      ctx(tenantA.entity.id)
    );

    expect(res.status).toBe(200);
    const body = await readJson<{ success: boolean }>(res);
    expect(body.success).toBe(true);
  });

  it('lets the other tenant read their own entity too -- both directions work', async () => {
    const res = await handler(
      requestAs(tenantB, path(tenantB.entity.id, segment)),
      ctx(tenantB.entity.id)
    );

    expect(res.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // 2. Cross-tenant is refused.
  // -------------------------------------------------------------------------

  it("refuses tenant A reading tenant B's entity", async () => {
    const res = await handler(
      requestAs(tenantA, path(tenantB.entity.id, segment)),
      ctx(tenantB.entity.id)
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  // -------------------------------------------------------------------------
  // 3. THE BYPASS. A forged x-user-id header changes nothing.
  // -------------------------------------------------------------------------

  it("ignores a forged x-user-id header naming the victim (A's session, B's entity)", async () => {
    // Under the old code this returned 200: getCurrentUserId read the header,
    // handed back tenantB's id, and getEntity(entityB, userB) matched.
    const res = await handler(
      requestAs(tenantA, path(tenantB.entity.id, segment), {
        headers: { 'x-user-id': tenantB.user.id, 'x-entity-id': tenantB.entity.id },
      }),
      ctx(tenantB.entity.id)
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  it('ignores a forged x-user-id header naming the victim when there is no session at all', async () => {
    // The purest form of the bug: no credential whatsoever, one header, full
    // read of someone else's entity.
    const res = await handler(
      anonymousRequest(path(tenantB.entity.id, segment), {
        headers: { 'x-user-id': tenantB.user.id },
      }),
      ctx(tenantB.entity.id)
    );

    expect(res.status).toBe(401);
    expect((await readJson<ErrBody>(res)).error.code).toBe('UNAUTHORIZED');
  });

  it("ignores the old 'stub-user-id' sentinel", async () => {
    // The header-absent branch used to make every anonymous caller the same
    // fake user. Nothing may answer to that name now.
    const res = await handler(
      anonymousRequest(path(tenantA.entity.id, segment), {
        headers: { 'x-user-id': 'stub-user-id' },
      }),
      ctx(tenantA.entity.id)
    );

    expect(res.status).toBe(401);
  });

  it('does not let a forged header escalate the owner onto a foreign entity', async () => {
    // Owner session, own header, but someone else's entity in the path: the
    // path param is what gets verified, and it is not theirs.
    const res = await handler(
      requestAs(tenantB, path(tenantA.entity.id, segment), {
        headers: { 'x-user-id': tenantA.user.id },
      }),
      ctx(tenantA.entity.id)
    );

    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 4. No session at all.
  // -------------------------------------------------------------------------

  it('refuses an unauthenticated request', async () => {
    const res = await handler(
      anonymousRequest(path(tenantA.entity.id, segment)),
      ctx(tenantA.entity.id)
    );

    expect(res.status).toBe(401);
    expect((await readJson<ErrBody>(res)).error.code).toBe('UNAUTHORIZED');
  });

  it('refuses an authenticated request for an entity that does not exist', async () => {
    const res = await handler(
      requestAs(tenantA, path('entity-that-does-not-exist', segment)),
      ctx('entity-that-does-not-exist')
    );

    expect(res.status).toBe(404);
    expect((await readJson<ErrBody>(res)).error.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// The function itself is gone, not merely unused.
// ---------------------------------------------------------------------------

describe('the entities module surface', () => {
  it('no longer exports getCurrentUserId from the service', async () => {
    const service = await import('@/modules/entities/entity.service');
    expect('getCurrentUserId' in service).toBe(false);
  });

  it('no longer re-exports getCurrentUserId from the module index', async () => {
    const index = await import('@/modules/entities/index');
    expect('getCurrentUserId' in index).toBe(false);
  });
});
