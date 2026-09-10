/**
 * P-15 / T-014 — RBAC: what may this user DO to data they are already entitled
 * to see?
 *
 * ============================================================================
 * WHY THIS FILE CANNOT BE A TENANCY TEST
 * ============================================================================
 *
 * Eleven packages proved TENANCY: entity A's data is unreachable from entity
 * B's session. Every assertion in `tests/db/*-tenancy.test.ts` is a
 * cross-tenant assertion, and every one of them still passes if a `viewer`
 * deletes their own entity's invoices. The viewer is inside their own tenant.
 * There is nothing cross-tenant about it, so there is nothing for a tenancy
 * test to catch.
 *
 * So this file holds the other axis fixed. **One user, one entity, four
 * sessions** -- the same person presenting the same tenant with a different
 * `role` claim in the JWT. Nothing about tenancy varies between the cases; the
 * only difference is what the role is permitted to do. That is the whole point:
 * if a test here fails, it failed on authorization, and it cannot have failed
 * on tenancy.
 *
 * The last describe block does the converse -- it varies tenancy while holding
 * the role at its most privileged -- to prove the new role gates did not become
 * a way around the entity checks the previous eleven packages installed.
 *
 * ============================================================================
 * THE POLICY UNDER TEST
 * ============================================================================
 *
 *   owner + admin          DELETE anywhere; administrative surfaces; and
 *                          irreversible / blast-radius operations (bulk, purge,
 *                          rollback, outbound send, provisioning, export).
 *   owner + admin + member ordinary content writes.
 *   any authenticated role reads; POSTs that compute over readable data and
 *                          write nothing; routes touching only the caller's own
 *                          user record.
 *
 * ============================================================================
 * WHAT MAKES AN ASSERTION HERE WORTH ANYTHING
 * ============================================================================
 *
 * Three things, and a case is only counted if it has all three:
 *
 *   1. A refusal is asserted **together with the database being unchanged.**
 *      A 403 that still wrote the row is not a fix, it is a lie with a status
 *      code. Every refusal below re-counts the rows.
 *   2. The permitted roles are asserted too. A gate that refuses EVERYONE
 *      satisfies every refusal assertion in this file and ships a dead product.
 *      That is not hypothetical: seven routes in this repository were shipped
 *      gated on `['admin']`, a role no user in this system can hold, and the
 *      unit test that "covered" them asserted the ARGUMENT rather than the
 *      OUTCOME, so it stayed green while /api/admin returned 403 to everybody.
 *   3. `getToken` is not mocked. These are real encrypted NextAuth JWTs
 *      (tests/helpers/session.ts) against a real Postgres, so a route that
 *      stopped calling the middleware would be caught rather than stubbed.
 */

import { db, setupTestDatabase } from '../helpers/db';
import { createTenant, createTwoTenants, type Tenant } from '../helpers/factories';
import { encode } from 'next-auth/jwt';
import type { JWT } from 'next-auth/jwt';
import { sessionTokenFor, requestAs, anonymousRequest, readJson } from '../helpers/session';

import { POST as createTask, GET as listTasks } from '@/app/api/tasks/route';
import { PUT as updateTask, DELETE as deleteTask } from '@/app/api/tasks/[id]/route';
import { PATCH as bulkUpdateTasks } from '@/app/api/tasks/bulk/route';
import { POST as prioritizeTasks } from '@/app/api/tasks/prioritize/route';
import { POST as createContact } from '@/app/api/contacts/route';
import { DELETE as deleteContact } from '@/app/api/contacts/[id]/route';
import { POST as createPolicy, GET as listPolicies } from '@/app/api/admin/policies/route';

setupTestDatabase();

// ---------------------------------------------------------------------------
// The fixture: one tenant, four sessions over it.
// ---------------------------------------------------------------------------

type Role = 'owner' | 'admin' | 'member' | 'viewer';

interface Cast {
  tenant: Tenant;
  /** A session for the SAME user and SAME entity, at each role. */
  as: Record<Role, { token: string }>;
  /** A session whose JWT carries no `role` claim at all. */
  roleless: { token: string };
}

async function castOfFour(): Promise<Cast> {
  const tenant = await createTenant({ role: 'owner' });

  const mint = async (role?: Role) => ({
    token: await sessionTokenFor({
      userId: tenant.user.id,
      email: tenant.user.email,
      name: tenant.user.name,
      role,
      activeEntityId: tenant.entity.id,
    }),
  });

  return {
    tenant,
    as: {
      owner: { token: tenant.token },
      admin: await mint('admin'),
      member: await mint('member'),
      viewer: await mint('viewer'),
    },
    roleless: { token: await mintRolelessToken(tenant.user.id, tenant.entity.id) },
  };
}

/**
 * A real, correctly encrypted session JWT that carries NO `role` claim.
 *
 * `sessionTokenFor` defaults an omitted role to 'owner', and the augmented
 * `JWT` type declares `role` as required -- which is right for production code
 * and is precisely why this has to be built by hand here. The scenario is real:
 * a session cookie minted before the role claim existed decrypts fine and has
 * no role in it. The assertion this feeds is that such a session is treated as
 * a `viewer` (withAuth reads `token.role ?? 'viewer'`) rather than waved
 * through, so the cast below is constructing the token the type system says
 * cannot exist in order to prove the runtime handles it anyway.
 */
async function mintRolelessToken(userId: string, activeEntityId: string): Promise<string> {
  const claims = { userId, email: '', name: '', activeEntityId } as unknown as JWT;
  return encode({ token: claims, secret: process.env.NEXTAUTH_SECRET!, maxAge: 60 * 60 });
}

/** A task belonging to the cast's entity. */
async function seedTask(cast: Cast, title = 'seed'): Promise<string> {
  const task = await db.task.create({
    data: { title, entityId: cast.tenant.entity.id, status: 'TODO', priority: 'P1' },
  });
  return task.id;
}

const ROLES: Role[] = ['owner', 'admin', 'member', 'viewer'];

// ---------------------------------------------------------------------------
// 1. Ordinary content write: owner + admin + member yes, viewer no.
// ---------------------------------------------------------------------------

describe('RBAC — ordinary content writes (POST /api/tasks)', () => {
  it.each(['owner', 'admin', 'member'] as const)(
    'lets a %s create a task in their own entity',
    async (role) => {
      const cast = await castOfFour();

      const res = await createTask(
        requestAs(cast.as[role], '/api/tasks', {
          method: 'POST',
          body: { title: `written by ${role}` },
        })
      );

      expect(res.status).toBe(201);
      expect(await db.task.count({ where: { entityId: cast.tenant.entity.id } })).toBe(1);
    }
  );

  it('refuses a viewer, and writes nothing', async () => {
    const cast = await castOfFour();

    const res = await createTask(
      requestAs(cast.as.viewer, '/api/tasks', {
        method: 'POST',
        body: { title: 'a viewer should not be able to write this' },
      })
    );

    expect(res.status).toBe(403);
    const body = await readJson<{ error: { code: string } }>(res);
    expect(body.error.code).toBe('FORBIDDEN');

    // A 403 that still wrote the row is not a fix.
    expect(await db.task.count({ where: { entityId: cast.tenant.entity.id } })).toBe(0);
  });

  it('refuses a token that carries no role claim, because a missing role means viewer', async () => {
    const cast = await castOfFour();

    const res = await createTask(
      requestAs(cast.roleless, '/api/tasks', { method: 'POST', body: { title: 'no role claim' } })
    );

    // withAuth reads `token.role ?? 'viewer'`. Failing closed is the right
    // default, and it is worth pinning: it means sessions issued before the
    // role claim existed become read-only rather than silently privileged.
    expect(res.status).toBe(403);
    expect(await db.task.count()).toBe(0);
  });

  it('still returns 401, not 403, when there is no session at all', async () => {
    await castOfFour();

    const res = await createTask(
      anonymousRequest('/api/tasks', { method: 'POST', body: { title: 'anon' } })
    );

    // The order matters: authentication before authorization. A 403 here would
    // mean an anonymous caller had been given a role.
    expect(res.status).toBe(401);
    expect(await db.task.count()).toBe(0);
  });
});

describe('RBAC — content update (PUT /api/tasks/[id])', () => {
  it('lets a member edit an existing task', async () => {
    const cast = await castOfFour();
    const id = await seedTask(cast, 'before');

    const res = await updateTask(
      requestAs(cast.as.member, `/api/tasks/${id}`, { method: 'PUT', body: { title: 'after' } }),
      { params: Promise.resolve({ id }) }
    );

    expect(res.status).toBe(200);
    expect((await db.task.findUnique({ where: { id } }))?.title).toBe('after');
  });

  it('refuses a viewer, and leaves the row exactly as it was', async () => {
    const cast = await castOfFour();
    const id = await seedTask(cast, 'before');

    const res = await updateTask(
      requestAs(cast.as.viewer, `/api/tasks/${id}`, { method: 'PUT', body: { title: 'after' } }),
      { params: Promise.resolve({ id }) }
    );

    expect(res.status).toBe(403);
    expect((await db.task.findUnique({ where: { id } }))?.title).toBe('before');
  });
});

// ---------------------------------------------------------------------------
// 2. Destructive: owner + admin only. A member is a writer, not a deleter.
// ---------------------------------------------------------------------------

describe('RBAC — destructive writes (DELETE /api/tasks/[id])', () => {
  it.each(['owner', 'admin'] as const)('lets a %s delete', async (role) => {
    const cast = await castOfFour();
    const id = await seedTask(cast);

    const res = await deleteTask(
      requestAs(cast.as[role], `/api/tasks/${id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id }) }
    );

    expect(res.status).toBe(200);
    // deleteTask cancels rather than removing; either way the row must have moved.
    expect((await db.task.findUnique({ where: { id } }))?.status).toBe('CANCELLED');
  });

  it.each(['member', 'viewer'] as const)('refuses a %s, and the row survives', async (role) => {
    const cast = await castOfFour();
    const id = await seedTask(cast);

    const res = await deleteTask(
      requestAs(cast.as[role], `/api/tasks/${id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id }) }
    );

    expect(res.status).toBe(403);

    const row = await db.task.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row?.status).toBe('TODO');
  });

  it('refuses a viewer deleting a contact too, so this is a policy and not one route', async () => {
    const cast = await castOfFour();
    const contact = await db.contact.create({
      data: { name: 'Keep Me', entityId: cast.tenant.entity.id },
    });

    const res = await deleteContact(
      requestAs(cast.as.viewer, `/api/contacts/${contact.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: contact.id }) }
    );

    expect(res.status).toBe(403);
    expect(await db.contact.count({ where: { id: contact.id } })).toBe(1);
  });

  it('lets a member create a contact, so the deletion refusal is not just "members cannot touch contacts"', async () => {
    const cast = await castOfFour();

    const res = await createContact(
      requestAs(cast.as.member, '/api/contacts', { method: 'POST', body: { name: 'New Contact' } })
    );

    expect(res.status).toBe(201);
    expect(await db.contact.count({ where: { entityId: cast.tenant.entity.id } })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Blast radius: a bulk write is not an ordinary write.
// ---------------------------------------------------------------------------

describe('RBAC — blast radius (PATCH /api/tasks/bulk)', () => {
  it('lets an admin bulk-update', async () => {
    const cast = await castOfFour();
    const ids = [await seedTask(cast, 'a'), await seedTask(cast, 'b')];

    const res = await bulkUpdateTasks(
      requestAs(cast.as.admin, '/api/tasks/bulk', {
        method: 'PATCH',
        body: { taskIds: ids, updates: { status: 'DONE' } },
      })
    );

    expect(res.status).toBe(200);
    expect(await db.task.count({ where: { id: { in: ids }, status: 'DONE' } })).toBe(2);
  });

  it.each(['member', 'viewer'] as const)(
    'refuses a %s, and no row moves — a member may edit one task but not sweep them',
    async (role) => {
      const cast = await castOfFour();
      const ids = [await seedTask(cast, 'a'), await seedTask(cast, 'b')];

      const res = await bulkUpdateTasks(
        requestAs(cast.as[role], '/api/tasks/bulk', {
          method: 'PATCH',
          body: { taskIds: ids, updates: { status: 'DONE' } },
        })
      );

      expect(res.status).toBe(403);
      expect(await db.task.count({ where: { id: { in: ids }, status: 'TODO' } })).toBe(2);
    }
  );
});

// ---------------------------------------------------------------------------
// 4. Administrative surface — and the gate that refused everybody.
// ---------------------------------------------------------------------------

describe('RBAC — administrative surface (/api/admin/policies)', () => {
  it('lets an OWNER create an org policy', async () => {
    const cast = await castOfFour();

    const res = await createPolicy(
      requestAs(cast.as.owner, '/api/admin/policies', {
        method: 'POST',
        body: { name: 'Retention', type: 'RETENTION', config: { days: 30 } },
      })
    );

    // This is the assertion that fails against pre-P-15 code. The route was
    // gated `['admin']`, and `admin` is a role nobody can hold: config.ts
    // stamps every JWT with 'owner', there is no other assignment path, and
    // User has no role column. So the entire /api/admin surface answered 403
    // to every real caller, and no test noticed.
    expect(res.status).toBe(201);
    // An org policy is stored as a Rule with scope ORG_POLICY.
    expect(
      await db.rule.count({ where: { scope: 'ORG_POLICY', entityId: cast.tenant.entity.id } })
    ).toBe(1);
  });

  it('lets an OWNER read the administrative surface', async () => {
    const cast = await castOfFour();

    const res = await listPolicies(requestAs(cast.as.owner, '/api/admin/policies'));

    expect(res.status).toBe(200);
  });

  it.each(['member', 'viewer'] as const)('refuses a %s, and writes no policy', async (role) => {
    const cast = await castOfFour();

    const res = await createPolicy(
      requestAs(cast.as[role], '/api/admin/policies', {
        method: 'POST',
        body: { name: 'Retention', type: 'RETENTION', config: { days: 30 } },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.rule.count({ where: { scope: 'ORG_POLICY' } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. What a viewer MUST keep. A role gate that breaks reading is not RBAC.
// ---------------------------------------------------------------------------

describe('RBAC — reads and read-only POSTs stay open to every authenticated role', () => {
  it.each(ROLES)('lets a %s list tasks', async (role) => {
    const cast = await castOfFour();
    await seedTask(cast, 'visible to everyone');

    const res = await listTasks(requestAs(cast.as[role], '/api/tasks'));

    expect(res.status).toBe(200);
    const body = await readJson<{ data: unknown[] }>(res);
    expect(body.data).toHaveLength(1);
  });

  it('lets a viewer run POST /api/tasks/prioritize, because POST is not a synonym for mutation', async () => {
    const cast = await castOfFour();
    await seedTask(cast, 'rank me');

    const res = await prioritizeTasks(
      requestAs(cast.as.viewer, '/api/tasks/prioritize', { method: 'POST', body: {} })
    );

    // The route reads tasks and scores them in memory. Gating it would have
    // been the easy, wrong move: it looks like a write and is not one.
    expect(res.status).toBe(200);
    expect(await db.task.count({ where: { status: 'TODO' } })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. RBAC did not become a way around tenancy.
// ---------------------------------------------------------------------------

describe('RBAC is orthogonal to tenancy — holding the role at its highest', () => {
  it("refuses tenant A's OWNER writing into tenant B's entity", async () => {
    const { tenantA, tenantB } = await createTwoTenants();

    const res = await createTask(
      requestAs(tenantA, '/api/tasks', {
        method: 'POST',
        body: { title: 'cross-tenant', entityId: tenantB.entity.id },
      })
    );

    // Being an owner authorises the ACTION, never the TENANT. If the role gate
    // had been allowed to short-circuit withEntityScope this would be a 201.
    expect(res.status).toBe(403);
    expect(await db.task.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it("refuses tenant A's OWNER deleting tenant B's task", async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const foreign = await db.task.create({
      data: { title: 'B owns this', entityId: tenantB.entity.id, status: 'TODO', priority: 'P1' },
    });

    const res = await deleteTask(
      requestAs(tenantA, `/api/tasks/${foreign.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: foreign.id }) }
    );

    expect(res.status).toBe(403);
    expect((await db.task.findUnique({ where: { id: foreign.id } }))?.status).toBe('TODO');
  });

  it('refuses a viewer of tenant A writing into tenant B — both checks hold at once', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const viewerOfA = {
      token: await sessionTokenFor({
        userId: tenantA.user.id,
        role: 'viewer',
        activeEntityId: tenantA.entity.id,
      }),
    };

    const res = await createTask(
      requestAs(viewerOfA, '/api/tasks', {
        method: 'POST',
        body: { title: 'both wrong', entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.task.count()).toBe(0);
  });
});
