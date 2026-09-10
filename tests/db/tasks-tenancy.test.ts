/**
 * P-04 acceptance — Tasks & Projects tenancy, proven against a real database.
 *
 * ============================================================================
 * WHAT THIS FILE EXISTS TO PROVE
 * ============================================================================
 *
 * Before this package, 9 of the 12 routes under `/api/tasks` and
 * `/api/projects` called
 *
 *     withAuth(request, async (req, _session) => ...)
 *
 * and then took `entityId` from the request body or the query string.
 * `src/modules/tasks/services/task-crud.ts` and `project-crud.ts` contained
 * ZERO references to `userId`: `createTask` verified that the entity *existed*
 * and never that the caller owned it. So this succeeded:
 *
 *     POST /api/tasks   { "title": "...", "entityId": "<someone else's>" }
 *     GET  /api/tasks?entityId=<someone else's>
 *
 * Authenticated, and not authorized.
 *
 * Every case below is one of four shapes, across the route surface:
 *
 *   1. the owner reaches their own entity                      -> 200/201
 *   2. tenant A cannot READ tenant B's data                    -> 403
 *   3. tenant A cannot WRITE INTO tenant B's data              -> 403
 *   4. no session at all                                       -> 401
 *
 * A list endpoint that leaks rows is a different failure from a single-record
 * 403, so the list and bulk routes are covered separately: they must not
 * merely refuse a foreign id, they must not return or write foreign rows when
 * the request looks perfectly ordinary.
 *
 * This runs against a real Postgres with `getToken` UNMOCKED, so each request
 * presents a genuine NextAuth JWE and the production decrypt path runs. A
 * mocked-Prisma unit test cannot observe a missing tenant check -- which is why
 * 5,265 passing tests never saw this, and why `tests/e2e/task-management.test.ts`
 * (which builds a `mockPrisma` and calls `jest.mock('@/lib/db')`) is not
 * evidence of anything here despite its name.
 */

import { GET as tasksGET, POST as tasksPOST } from '@/app/api/tasks/route';
import {
  GET as taskGET,
  PUT as taskPUT,
  DELETE as taskDELETE,
} from '@/app/api/tasks/[id]/route';
import { PATCH as tasksBulkPATCH } from '@/app/api/tasks/bulk/route';
import { GET as prioritizeGET } from '@/app/api/tasks/prioritize/route';
import { GET as procrastinationGET } from '@/app/api/tasks/procrastination/route';
import { GET as dependenciesGET } from '@/app/api/tasks/dependencies/route';
import { GET as projectsGET, POST as projectsPOST } from '@/app/api/projects/route';
import {
  GET as projectGET,
  PUT as projectPUT,
  DELETE as projectDELETE,
} from '@/app/api/projects/[id]/route';
import { GET as projectStatsGET } from '@/app/api/projects/stats/route';

import { db, setupTestDatabase } from '../helpers/db';
import { closeDomainEventQueue } from '@/lib/queue/domain-events';
import {
  createProject,
  createTask,
  createTwoTenants,
  type Tenant,
} from '../helpers/factories';
import { anonymousRequest, readJson, requestAs } from '../helpers/session';

setupTestDatabase();

// P-27: `POST /api/tasks` publishes `task.created`, which opens a producer
// connection to Redis the first time any test in this file creates a task. It
// belongs to the process, not to a test, so it is closed here -- otherwise jest
// reports "did not exit one second after the test run has completed" and the
// run hangs rather than failing.
afterAll(async () => {
  await closeDomainEventQueue();
});

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
});

// ===========================================================================
// POST /api/tasks -- writing INTO another tenant
// ===========================================================================

describe('POST /api/tasks', () => {
  it("creates a task in the caller's own entity", async () => {
    const res = await tasksPOST(
      requestAs(tenantA, '/api/tasks', {
        method: 'POST',
        body: { title: 'Mine', entityId: tenantA.entity.id },
      })
    );

    expect(res.status).toBe(201);
    const body = await readJson<OkBody<{ id: string; entityId: string }>>(res);
    expect(body.data.entityId).toBe(tenantA.entity.id);
  });

  it("refuses to create a task inside tenant B's entity, and writes nothing", async () => {
    // THE BUG, in its purest form. Under the old code this returned 201 and
    // put a row in tenant B's entity.
    const res = await tasksPOST(
      requestAs(tenantA, '/api/tasks', {
        method: 'POST',
        body: { title: 'Planted in B', entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');

    // A 403 that still writes is not a fix.
    expect(await db.task.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it("falls back to the caller's active entity when the body names none", async () => {
    const res = await tasksPOST(
      requestAs(tenantA, '/api/tasks', { method: 'POST', body: { title: 'No entity named' } })
    );

    expect(res.status).toBe(201);
    const body = await readJson<OkBody<{ entityId: string }>>(res);
    expect(body.data.entityId).toBe(tenantA.entity.id);
  });

  it('refuses an unauthenticated request', async () => {
    const res = await tasksPOST(
      anonymousRequest('/api/tasks', {
        method: 'POST',
        body: { title: 'Anon', entityId: tenantA.entity.id },
      })
    );

    expect(res.status).toBe(401);
    expect(await db.task.count()).toBe(0);
  });
});

// ===========================================================================
// GET /api/tasks -- the LIST route. Leaking rows is its own failure mode.
// ===========================================================================

describe('GET /api/tasks (list)', () => {
  beforeEach(async () => {
    await createTask(tenantA.entity.id, { title: 'A-one' });
    await createTask(tenantA.entity.id, { title: 'A-two' });
    await createTask(tenantB.entity.id, { title: 'B-secret' });
  });

  it("lists only the caller's own tasks", async () => {
    const res = await tasksGET(
      requestAs(tenantA, '/api/tasks', { query: { entityId: tenantA.entity.id } })
    );

    expect(res.status).toBe(200);
    const body = await readJson<PageBody<{ title: string }>>(res);
    expect(body.data.map((t) => t.title).sort()).toEqual(['A-one', 'A-two']);
    expect(body.meta.total).toBe(2);
  });

  it("refuses ?entityId=<tenant B> outright", async () => {
    const res = await tasksGET(
      requestAs(tenantA, '/api/tasks', { query: { entityId: tenantB.entity.id } })
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  it("does not leak tenant B's rows through an ordinary-looking filter", async () => {
    // No entity named, so the scope is the caller's own. A filter that matches
    // B's row by title must still not return it: the scope is applied to the
    // query, not merely checked against the request.
    const res = await tasksGET(
      requestAs(tenantA, '/api/tasks', { query: { search: 'B-secret' } })
    );

    expect(res.status).toBe(200);
    const body = await readJson<PageBody<unknown>>(res);
    expect(body.data).toHaveLength(0);
    expect(body.meta.total).toBe(0);
  });

  it('refuses an unauthenticated request', async () => {
    const res = await tasksGET(anonymousRequest('/api/tasks'));

    expect(res.status).toBe(401);
    expect((await readJson<ErrBody>(res)).error.code).toBe('UNAUTHORIZED');
  });
});

// ===========================================================================
// /api/tasks/[id] -- resource-scoped: the entity is a property of the row
// ===========================================================================

describe('/api/tasks/[id]', () => {
  let ownTask: { id: string };
  let foreignTask: { id: string };

  beforeEach(async () => {
    ownTask = await createTask(tenantA.entity.id, { title: 'A owns this' });
    foreignTask = await createTask(tenantB.entity.id, { title: 'B owns this' });
  });

  it('lets the owner read their own task', async () => {
    const res = await taskGET(
      requestAs(tenantA, `/api/tasks/${ownTask.id}`),
      ctx(ownTask.id)
    );

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ title: string }>>(res);
    expect(body.data.title).toBe('A owns this');
  });

  it("refuses reading tenant B's task", async () => {
    const res = await taskGET(
      requestAs(tenantA, `/api/tasks/${foreignTask.id}`),
      ctx(foreignTask.id)
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  it("refuses updating tenant B's task, and leaves it untouched", async () => {
    const res = await taskPUT(
      requestAs(tenantA, `/api/tasks/${foreignTask.id}`, {
        method: 'PUT',
        body: { title: 'Renamed by A' },
      }),
      ctx(foreignTask.id)
    );

    expect(res.status).toBe(403);
    const after = await db.task.findUnique({ where: { id: foreignTask.id } });
    expect(after?.title).toBe('B owns this');
  });

  it("refuses deleting tenant B's task, and leaves it untouched", async () => {
    const res = await taskDELETE(
      requestAs(tenantA, `/api/tasks/${foreignTask.id}`, { method: 'DELETE' }),
      ctx(foreignTask.id)
    );

    expect(res.status).toBe(403);
    const after = await db.task.findUnique({ where: { id: foreignTask.id } });
    expect(after?.status).not.toBe('CANCELLED');
  });

  it('lets the owner delete their own task', async () => {
    const res = await taskDELETE(
      requestAs(tenantA, `/api/tasks/${ownTask.id}`, { method: 'DELETE' }),
      ctx(ownTask.id)
    );

    expect(res.status).toBe(200);
    const after = await db.task.findUnique({ where: { id: ownTask.id } });
    expect(after?.status).toBe('CANCELLED');
  });

  it('returns 404 for a task that does not exist', async () => {
    const res = await taskGET(
      requestAs(tenantA, '/api/tasks/no-such-task'),
      ctx('no-such-task')
    );

    expect(res.status).toBe(404);
  });

  it('refuses an unauthenticated request', async () => {
    const res = await taskGET(
      anonymousRequest(`/api/tasks/${ownTask.id}`),
      ctx(ownTask.id)
    );

    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// PATCH /api/tasks/bulk -- a bulk WRITE that used to span every tenant
// ===========================================================================

describe('PATCH /api/tasks/bulk', () => {
  it("updates the caller's own tasks", async () => {
    const one = await createTask(tenantA.entity.id);
    const two = await createTask(tenantA.entity.id);

    const res = await tasksBulkPATCH(
      requestAs(tenantA, '/api/tasks/bulk', {
        method: 'PATCH',
        body: {
          taskIds: [one.id, two.id],
          updates: { status: 'DONE' },
          entityId: tenantA.entity.id,
        },
      })
    );

    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ updated: number }>>(res)).data.updated).toBe(2);
  });

  it("silently matches none of tenant B's tasks, and changes none of them", async () => {
    // Under the old code this returned { updated: 2 } and marked two of another
    // tenant's tasks DONE. The ids are perfectly valid -- they are simply not
    // in the caller's scope, so the WHERE clause matches nothing.
    const theirs1 = await createTask(tenantB.entity.id, { status: 'TODO' });
    const theirs2 = await createTask(tenantB.entity.id, { status: 'TODO' });

    const res = await tasksBulkPATCH(
      requestAs(tenantA, '/api/tasks/bulk', {
        method: 'PATCH',
        body: { taskIds: [theirs1.id, theirs2.id], updates: { status: 'DONE' } },
      })
    );

    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ updated: number }>>(res)).data.updated).toBe(0);

    const after = await db.task.findMany({
      where: { id: { in: [theirs1.id, theirs2.id] } },
    });
    expect(after.map((t) => t.status)).toEqual(['TODO', 'TODO']);
  });

  it("refuses a bulk update aimed at tenant B's entity", async () => {
    const res = await tasksBulkPATCH(
      requestAs(tenantA, '/api/tasks/bulk', {
        method: 'PATCH',
        body: {
          taskIds: ['whatever'],
          updates: { status: 'DONE' },
          entityId: tenantB.entity.id,
        },
      })
    );

    expect(res.status).toBe(403);
  });

  it('refuses an unauthenticated request', async () => {
    const res = await tasksBulkPATCH(
      anonymousRequest('/api/tasks/bulk', {
        method: 'PATCH',
        body: { taskIds: ['x'], updates: { status: 'DONE' } },
      })
    );

    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// Read-only analysis routes
// ===========================================================================

describe('GET /api/tasks/prioritize', () => {
  it("answers for the caller's own entity", async () => {
    await createTask(tenantA.entity.id, { status: 'TODO' });

    const res = await prioritizeGET(
      requestAs(tenantA, '/api/tasks/prioritize', {
        query: { entityId: tenantA.entity.id },
      })
    );

    expect(res.status).toBe(200);
  });

  it("refuses tenant B's entity", async () => {
    const res = await prioritizeGET(
      requestAs(tenantA, '/api/tasks/prioritize', {
        query: { entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
  });

  it('ignores a ?userId= naming somebody else', async () => {
    // This route used to read BOTH halves of "whose day is this" off the query
    // string. `userId` now comes from the session; passing tenant B's id
    // changes nothing, and certainly does not produce B's day.
    await createTask(tenantA.entity.id, { title: 'A task', status: 'TODO' });

    const res = await prioritizeGET(
      requestAs(tenantA, '/api/tasks/prioritize', {
        query: { entityId: tenantA.entity.id, userId: tenantB.user.id },
      })
    );

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ tasks: Array<{ task: { entityId: string } }> }>>(res);
    for (const entry of body.data.tasks) {
      expect(entry.task.entityId).toBe(tenantA.entity.id);
    }
  });
});

describe('GET /api/tasks/procrastination', () => {
  it("refuses tenant B's entity", async () => {
    const res = await procrastinationGET(
      requestAs(tenantA, '/api/tasks/procrastination', {
        query: { entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
  });

  it('refuses an unauthenticated request', async () => {
    const res = await procrastinationGET(
      anonymousRequest('/api/tasks/procrastination', {
        query: { entityId: tenantA.entity.id },
      })
    );

    expect(res.status).toBe(401);
  });
});

describe('GET /api/tasks/dependencies', () => {
  it("refuses a graph for a project in tenant B's entity", async () => {
    const theirProject = await createProject(tenantB.entity.id);

    const res = await dependenciesGET(
      requestAs(tenantA, '/api/tasks/dependencies', {
        query: { projectId: theirProject.id },
      })
    );

    expect(res.status).toBe(403);
  });

  it("builds a graph for the caller's own project", async () => {
    const mine = await createProject(tenantA.entity.id);
    await createTask(tenantA.entity.id, { projectId: mine.id });

    const res = await dependenciesGET(
      requestAs(tenantA, '/api/tasks/dependencies', { query: { projectId: mine.id } })
    );

    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// Projects
// ===========================================================================

describe('POST /api/projects', () => {
  it("creates a project in the caller's own entity", async () => {
    const res = await projectsPOST(
      requestAs(tenantA, '/api/projects', {
        method: 'POST',
        body: { name: 'Mine', entityId: tenantA.entity.id },
      })
    );

    expect(res.status).toBe(201);
  });

  it("refuses to create a project inside tenant B's entity, and writes nothing", async () => {
    const res = await projectsPOST(
      requestAs(tenantA, '/api/projects', {
        method: 'POST',
        body: { name: 'Planted in B', entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.project.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });
});

describe('GET /api/projects (list)', () => {
  beforeEach(async () => {
    await createProject(tenantA.entity.id, { name: 'A-project' });
    await createProject(tenantB.entity.id, { name: 'B-project' });
  });

  it("lists only the caller's own projects when no entity is named", async () => {
    const res = await projectsGET(requestAs(tenantA, '/api/projects'));

    expect(res.status).toBe(200);
    const body = await readJson<PageBody<{ name: string }>>(res);
    expect(body.data.map((p) => p.name)).toEqual(['A-project']);
  });

  it("refuses ?entityId=<tenant B>", async () => {
    const res = await projectsGET(
      requestAs(tenantA, '/api/projects', { query: { entityId: tenantB.entity.id } })
    );

    expect(res.status).toBe(403);
  });

  it("does not leak tenant B's projects through a search filter", async () => {
    const res = await projectsGET(
      requestAs(tenantA, '/api/projects', { query: { search: 'B-project' } })
    );

    expect(res.status).toBe(200);
    expect((await readJson<PageBody<unknown>>(res)).data).toHaveLength(0);
  });

  it('refuses an unauthenticated request', async () => {
    const res = await projectsGET(anonymousRequest('/api/projects'));
    expect(res.status).toBe(401);
  });
});

describe('/api/projects/[id]', () => {
  let mine: { id: string };
  let theirs: { id: string };

  beforeEach(async () => {
    mine = await createProject(tenantA.entity.id, { name: 'A owns this' });
    theirs = await createProject(tenantB.entity.id, { name: 'B owns this' });
  });

  it('lets the owner read their own project', async () => {
    const res = await projectGET(
      requestAs(tenantA, `/api/projects/${mine.id}`),
      ctx(mine.id)
    );

    expect(res.status).toBe(200);
  });

  it("refuses reading tenant B's project", async () => {
    const res = await projectGET(
      requestAs(tenantA, `/api/projects/${theirs.id}`),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);
  });

  it("refuses renaming tenant B's project, and leaves it untouched", async () => {
    const res = await projectPUT(
      requestAs(tenantA, `/api/projects/${theirs.id}`, {
        method: 'PUT',
        body: { name: 'Renamed by A' },
      }),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);
    const after = await db.project.findUnique({ where: { id: theirs.id } });
    expect(after?.name).toBe('B owns this');
  });

  it("refuses deleting tenant B's project, and it still exists", async () => {
    const res = await projectDELETE(
      requestAs(tenantA, `/api/projects/${theirs.id}`, { method: 'DELETE' }),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);
    expect(await db.project.findUnique({ where: { id: theirs.id } })).not.toBeNull();
  });

  it('refuses an unauthenticated request', async () => {
    const res = await projectGET(anonymousRequest(`/api/projects/${mine.id}`), ctx(mine.id));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/projects/stats', () => {
  beforeEach(async () => {
    await createProject(tenantA.entity.id);
    await createProject(tenantB.entity.id);
    await createProject(tenantB.entity.id);
  });

  it("counts only the caller's own projects", async () => {
    const res = await projectStatsGET(requestAs(tenantA, '/api/projects/stats'));

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ total: number }>>(res);
    expect(body.data.total).toBe(1);
  });

  it("refuses ?entityId=<tenant B>", async () => {
    const res = await projectStatsGET(
      requestAs(tenantA, '/api/projects/stats', { query: { entityId: tenantB.entity.id } })
    );

    expect(res.status).toBe(403);
  });

  it('refuses an unauthenticated request', async () => {
    const res = await projectStatsGET(anonymousRequest('/api/projects/stats'));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// Both directions. A "fix" that simply denies tenant B everything would pass
// every assertion above.
// ===========================================================================

describe('symmetry', () => {
  it('tenant B reaches their own data just as tenant A does', async () => {
    const theirTask = await createTask(tenantB.entity.id, { title: 'B-owned' });

    const res = await taskGET(
      requestAs(tenantB, `/api/tasks/${theirTask.id}`),
      ctx(theirTask.id)
    );

    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ title: string }>>(res)).data.title).toBe('B-owned');
  });

  it("tenant B cannot reach tenant A's data either", async () => {
    const myTask = await createTask(tenantA.entity.id);

    const res = await taskGET(
      requestAs(tenantB, `/api/tasks/${myTask.id}`),
      ctx(myTask.id)
    );

    expect(res.status).toBe(403);
  });
});
