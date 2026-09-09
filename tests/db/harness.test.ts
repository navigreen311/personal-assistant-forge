/**
 * P-01 acceptance — the harness itself works.
 *
 * A test harness that is wrong is worse than no harness: ten packages (P-04 ..
 * P-14) will each write a cross-tenant refusal test using only these helpers,
 * and if the helpers are loose, all ten pass while proving nothing. That is the
 * exact failure this repository already has 5,268 examples of.
 *
 * So this file asserts the harness's own claims, in four groups:
 *
 *   1. The connection is a real Postgres, not a mock.
 *   2. Truncation actually isolates: one test cannot see another test's rows.
 *   3. The factories write real, related rows.
 *   4. The session token is genuinely verified -- a wrong secret, an expired
 *      token, and no token at all are each refused by the production
 *      `withAuth`, unmocked.
 *
 * Group 5 is the point of the whole package: `withEntityScope` refuses a
 * cross-tenant request when driven entirely through these helpers, and the test
 * that proves it is four lines.
 */

import { withAuth, withEntityScope } from '@/shared/middleware/auth';
import { success } from '@/shared/utils/api-response';
import type { NextRequest } from 'next/server';

import { db, listTruncatableTables, resetDatabase, setupTestDatabase } from '../helpers/db';
import {
  createContact,
  createEntity,
  createProject,
  createTask,
  createTenant,
  createTwoTenants,
  createUser,
} from '../helpers/factories';
import {
  anonymousRequest,
  readJson,
  requestAs,
  sessionTokenFor,
  TEST_NEXTAUTH_SECRET,
} from '../helpers/session';

setupTestDatabase();

/** Stand-in for a route handler, so the middleware can be exercised alone. */
const OK_AUTH = (req: NextRequest) => withAuth(req, async (_r, session) => success(session));
const OK_SCOPE = (req: NextRequest, explicit?: string) =>
  withEntityScope(req, async (_r, _s, entityId) => success({ entityId }), explicit);

type ErrBody = { success: false; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// 1. The connection is real
// ---------------------------------------------------------------------------

describe('the connection', () => {
  it('answers SELECT 1 from a real server', async () => {
    const rows = await db.$queryRaw<Array<{ one: number }>>`SELECT 1 as one`;
    expect(rows[0].one).toBe(1);
  });

  it('is Postgres, and reports a version', async () => {
    const rows = await db.$queryRaw<Array<{ version: string }>>`SELECT version() as version`;
    expect(rows[0].version).toMatch(/PostgreSQL/);
  });

  it('has the migrated schema, and does not truncate the migration ledger', async () => {
    const tables = await listTruncatableTables();
    expect(tables).toEqual(expect.arrayContaining(['User', 'Entity', 'Task', 'Project']));
    expect(tables).not.toContain('_prisma_migrations');

    const applied = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) as n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
    `;
    expect(Number(applied[0].n)).toBeGreaterThan(0);
  });

  it('is not a mocked client -- a delegate that is not in the schema does not exist', () => {
    // The shadow/compliance module called four delegates that were never in the
    // schema and the mocked suite accepted every one. On a real client they are
    // simply undefined.
    expect((db as unknown as Record<string, unknown>).tableThatDoesNotExist).toBeUndefined();
    expect(db.task).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Isolation
// ---------------------------------------------------------------------------

describe('per-test isolation', () => {
  it('starts empty and accepts writes', async () => {
    expect(await db.user.count()).toBe(0);
    const user = await createUser();
    await createEntity(user.id);
    expect(await db.user.count()).toBe(1);
    expect(await db.entity.count()).toBe(1);
  });

  it('cannot see the previous test\'s rows', async () => {
    expect(await db.user.count()).toBe(0);
    expect(await db.entity.count()).toBe(0);
  });

  it('truncates child rows too, without a foreign key ordering problem', async () => {
    const tenant = await createTenant();
    const project = await createProject(tenant.entity.id);
    await createTask(tenant.entity.id, { projectId: project.id });
    await createContact(tenant.entity.id);

    expect(await db.task.count()).toBe(1);

    await resetDatabase();

    expect(await db.task.count()).toBe(0);
    expect(await db.project.count()).toBe(0);
    expect(await db.contact.count()).toBe(0);
    expect(await db.entity.count()).toBe(0);
    expect(await db.user.count()).toBe(0);
  });

  it('is safe to reset an already-empty database', async () => {
    await expect(resetDatabase()).resolves.toBeUndefined();
    await expect(resetDatabase()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Factories
// ---------------------------------------------------------------------------

describe('factories', () => {
  it('write rows that are actually in the database', async () => {
    const user = await createUser({ name: 'Ada' });
    const readBack = await db.user.findUnique({ where: { id: user.id } });
    expect(readBack?.name).toBe('Ada');
  });

  it('give each user a distinct email', async () => {
    const a = await createUser();
    const b = await createUser();
    expect(a.email).not.toBe(b.email);
  });

  it('respect overrides', async () => {
    const user = await createUser();
    const entity = await createEntity(user.id, { name: 'Acme LLC', type: 'Business' });
    expect(entity.name).toBe('Acme LLC');
    expect(entity.type).toBe('Business');
  });

  it('wire real foreign keys, verified by a relational read', async () => {
    const user = await createUser();
    const entity = await createEntity(user.id);
    const project = await createProject(entity.id);
    const task = await createTask(entity.id, { projectId: project.id, priority: 'P0' });

    const loaded = await db.task.findUnique({
      where: { id: task.id },
      include: { entity: { include: { user: true } }, project: true },
    });

    expect(loaded?.entity.id).toBe(entity.id);
    expect(loaded?.entity.user.id).toBe(user.id);
    expect(loaded?.project?.id).toBe(project.id);
    expect(loaded?.priority).toBe('P0');
  });

  it('refuse a row whose parent does not exist -- the constraint is real', async () => {
    await expect(createTask('entity-that-does-not-exist')).rejects.toThrow();
  });

  it('createTwoTenants gives two users owning two different entities', async () => {
    const { tenantA, tenantB } = await createTwoTenants();

    expect(tenantA.user.id).not.toBe(tenantB.user.id);
    expect(tenantA.entity.id).not.toBe(tenantB.entity.id);
    expect(tenantA.entity.userId).toBe(tenantA.user.id);
    expect(tenantB.entity.userId).toBe(tenantB.user.id);
    expect(tenantA.token).toBeTruthy();
    expect(tenantA.token).not.toBe(tenantB.token);
  });
});

// ---------------------------------------------------------------------------
// 4. The session is verified, not asserted
// ---------------------------------------------------------------------------

describe('session tokens', () => {
  it('are accepted by the real withAuth, with no mocking of getToken', async () => {
    const tenant = await createTenant();
    const res = await OK_AUTH(requestAs(tenant, '/api/anything'));

    expect(res.status).toBe(200);
    const body = await readJson<{ data: { userId: string; activeEntityId: string } }>(res);
    expect(body.data.userId).toBe(tenant.user.id);
    expect(body.data.activeEntityId).toBe(tenant.entity.id);
  });

  it('are absent from anonymousRequest, which is refused 401', async () => {
    const res = await OK_AUTH(anonymousRequest('/api/anything'));
    expect(res.status).toBe(401);
    expect((await readJson<ErrBody>(res)).error.code).toBe('UNAUTHORIZED');
  });

  it('minted with the wrong secret are refused -- the decryption really runs', async () => {
    const tenant = await createTenant();
    const forged = await sessionTokenFor(
      { userId: tenant.user.id, activeEntityId: tenant.entity.id },
      { secret: 'a-different-secret-entirely' }
    );

    const res = await OK_AUTH(requestAs(forged, '/api/anything'));
    expect(res.status).toBe(401);
  });

  it('that have expired are refused', async () => {
    const tenant = await createTenant();
    const stale = await sessionTokenFor(
      { userId: tenant.user.id, activeEntityId: tenant.entity.id },
      { maxAge: -3600 }
    );

    const res = await OK_AUTH(requestAs(stale, '/api/anything'));
    expect(res.status).toBe(401);
  });

  it('that have been tampered with are refused', async () => {
    const tenant = await createTenant();
    const tampered = `${tenant.token.slice(0, -4)}AAAA`;

    const res = await OK_AUTH(requestAs(tampered, '/api/anything'));
    expect(res.status).toBe(401);
  });

  it('do not come from a client-settable header', async () => {
    // Identity never comes from a request header (tenancy-pattern.md). If a
    // future change started trusting x-user-id, this turns red.
    const tenant = await createTenant();
    const res = await OK_AUTH(
      anonymousRequest('/api/anything', {
        headers: { 'x-user-id': tenant.user.id, 'x-entity-id': tenant.entity.id },
      })
    );
    expect(res.status).toBe(401);
  });

  it('are minted against the same secret the middleware verifies with', () => {
    expect(process.env.NEXTAUTH_SECRET).toBeTruthy();
    if (process.env.NEXTAUTH_SECRET === TEST_NEXTAUTH_SECRET) {
      // Local default. CI supplies its own; either way both sides read the
      // same variable, so they cannot drift apart.
      expect(TEST_NEXTAUTH_SECRET).toMatch(/do-not-use-in-production/);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. The point: a cross-tenant refusal test is four lines
// ---------------------------------------------------------------------------

describe('withEntityScope, driven entirely through the harness', () => {
  it('refuses a cross-entity read', async () => {
    const { tenantA, tenantB } = await createTwoTenants();

    const res = await OK_SCOPE(requestAs(tenantA, `/api/tasks?entityId=${tenantB.entity.id}`));

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  it('refuses a cross-entity write', async () => {
    const { tenantA, tenantB } = await createTwoTenants();

    const res = await OK_SCOPE(
      requestAs(tenantA, '/api/tasks', {
        method: 'POST',
        body: { title: 'not yours', entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
  });

  it('refuses a cross-entity path parameter', async () => {
    const { tenantA, tenantB } = await createTwoTenants();

    const res = await OK_SCOPE(
      requestAs(tenantA, `/api/entities/${tenantB.entity.id}/tasks`),
      tenantB.entity.id
    );

    expect(res.status).toBe(403);
  });

  it('allows the caller\'s own entity, named explicitly', async () => {
    const tenant = await createTenant();

    const res = await OK_SCOPE(requestAs(tenant, `/api/tasks?entityId=${tenant.entity.id}`));

    expect(res.status).toBe(200);
    expect((await readJson<{ data: { entityId: string } }>(res)).data.entityId).toBe(
      tenant.entity.id
    );
  });

  it('falls back to the session\'s active entity when none is named', async () => {
    const tenant = await createTenant();

    const res = await OK_SCOPE(requestAs(tenant, '/api/tasks'));

    expect(res.status).toBe(200);
    expect((await readJson<{ data: { entityId: string } }>(res)).data.entityId).toBe(
      tenant.entity.id
    );
  });

  it('answers 404, not 403, for an entity that does not exist', async () => {
    const tenant = await createTenant();

    const res = await OK_SCOPE(requestAs(tenant, '/api/tasks?entityId=no-such-entity'));

    expect(res.status).toBe(404);
    expect((await readJson<ErrBody>(res)).error.code).toBe('NOT_FOUND');
  });

  it('answers 400 when nothing at all resolves to an entity', async () => {
    const user = await createUser();
    const token = await sessionTokenFor({ userId: user.id, email: user.email });

    const res = await OK_SCOPE(requestAs(token, '/api/tasks'));

    expect(res.status).toBe(400);
    expect((await readJson<ErrBody>(res)).error.code).toBe('ENTITY_REQUIRED');
  });

  it('leaves the body readable by the handler after peeking at it', async () => {
    // withEntityScope clones the request to read entityId out of the JSON body.
    // If that clone regressed, every POST route would see an empty body -- so a
    // helper-built POST must still deliver its payload downstream.
    const tenant = await createTenant();
    let seen: unknown = null;

    const res = await withEntityScope(
      requestAs(tenant, '/api/tasks', {
        method: 'POST',
        body: { title: 'readable', entityId: tenant.entity.id },
      }),
      async (req, _s, entityId) => {
        seen = await req.json();
        return success({ entityId });
      }
    );

    expect(res.status).toBe(200);
    expect(seen).toMatchObject({ title: 'readable' });
  });
});
