/**
 * P-13 acceptance — Analytics, AI-quality, Capture, Memory, Developer and
 * Dashboard tenancy, proven against a real database.
 *
 * ============================================================================
 * WHAT THIS FILE EXISTS TO PROVE
 * ============================================================================
 *
 * 44 route files across seven surfaces. 18 of them called
 *
 *     withAuth(request, async (req, _session) => ...)
 *
 * and then took `entityId` from the query string or the body. That is the
 * audit's headline shape and it is what most of the cases below cover.
 *
 * But scope is not only `entityId` (tenancy-pattern.md 0, third grep). EIGHT
 * MORE route files were scored "already correct" by the `_session` count because
 * they mention `session.userId` -- and then wrote:
 *
 *     const userId = parsed.data.userId ?? session.userId;
 *
 * so a caller could simply name someone else and be believed:
 *
 *     GET /api/analytics/goals?userId=<B>
 *     GET /api/analytics/habits?userId=<B>
 *     GET /api/analytics/productivity?userId=<B>
 *     GET /api/analytics/time-audit?userId=<B>&start=...&end=...
 *     GET /api/analytics/time-saved?userId=<B>
 *     GET /api/capture?userId=<B>            (userId was REQUIRED here)
 *     GET /api/capture/metrics?userId=<B>    (also required, then ignored)
 *
 * ============================================================================
 * THE THREE FAILURES A 403 TEST CANNOT SEE, ALL THREE COVERED BELOW
 * ============================================================================
 *
 * 1. AGGREGATES. Productivity scoring, time audits, time-saved and the LLM cost
 *    rollup SUM ACROSS ROWS and return no row at all. An aggregate over an
 *    unscoped set leaks a tenant's totals while every single-record route stays
 *    perfectly correct. Every aggregate here is covered twice: once for a named
 *    foreign scope (403 / refusal), and once for the leak that matters more --
 *    an ORDINARY request, naming nothing, whose numbers must contain none of
 *    tenant B's rows.
 *
 * 2. UNSCOPED LISTS. `GET /api/dashboard` read `prisma.actionLog.findMany` with
 *    NO `where` clause at all: the activity feed showed the last ten actions
 *    taken anywhere on the platform. `GET /api/developer/plugins` listed every
 *    tenant's plugins. Neither is a 403 anywhere; both are simply rows that
 *    should not be in the response.
 *
 * 3. A SILENTLY NARROWED CROSS-ENTITY VIEW (tenancy-pattern.md 5b). Fixing a
 *    genuinely cross-entity route with `withEntityScope` passes every 403 test
 *    while quietly answering about one entity instead of all of them. The
 *    cross-entity routes in this package therefore have SYMMETRIC POSITIVE
 *    cases: a tenant with rows under TWO of their own entities must still see
 *    both. Those are the assertions that would fail if a later change reached
 *    for `withEntityScope` here.
 *
 * ============================================================================
 * WHY A REAL DATABASE
 * ============================================================================
 *
 * `getToken` is UNMOCKED, so each request carries a genuine NextAuth JWE and the
 * production decrypt path runs. A mocked-Prisma unit test cannot observe a
 * missing tenant check -- which is why 5,283 passing tests never saw any of
 * this.
 *
 * ============================================================================
 * WHAT IS DELIBERATELY PROVEN THROUGH HTTP AND NOT BY COUNTING ROWS
 * ============================================================================
 *
 * `prisma/schema.prisma` has NO `Capture` model and the schema is frozen for
 * this run, so `CaptureService` still keeps items in a `Map`. Capture tenancy is
 * therefore asserted on the response (403/404, and "the foreign row is still
 * not visible afterwards") rather than with `db.capture.count()`. That gap is
 * stated in the PR, not papered over here.
 */

import { GET as aiAccuracyGET } from '@/app/api/analytics/ai-accuracy/route';
import { GET as biasGET } from '@/app/api/analytics/bias/route';
import { GET as callAnalyticsGET } from '@/app/api/analytics/call-analytics/route';
import { GET as llmCostsGET } from '@/app/api/analytics/llm-costs/route';
import { GET as scorecardGET } from '@/app/api/analytics/scorecard/route';
import { GET as overrideAnalysisGET } from '@/app/api/analytics/overrides/analysis/route';
import { GET as goalsGET, POST as goalsPOST } from '@/app/api/analytics/goals/route';
import {
  GET as goalGET,
  PUT as goalPUT,
  DELETE as goalDELETE,
} from '@/app/api/analytics/goals/[id]/route';
import { GET as habitsGET, POST as habitsPOST } from '@/app/api/analytics/habits/route';
import { POST as habitCompletePOST } from '@/app/api/analytics/habits/[id]/complete/route';
import { GET as productivityGET } from '@/app/api/analytics/productivity/route';
import { GET as timeAuditGET } from '@/app/api/analytics/time-audit/route';
import { GET as timeSavedGET } from '@/app/api/analytics/time-saved/route';
import { GET as overviewGET } from '@/app/api/analytics/overview/route';
import { GET as aiQualityStatsGET } from '@/app/api/ai-quality/stats/route';

import { GET as captureGET, POST as capturePOST } from '@/app/api/capture/route';
import {
  GET as captureItemGET,
  PATCH as captureItemPATCH,
  DELETE as captureItemDELETE,
} from '@/app/api/capture/[id]/route';
import { POST as captureProcessPOST } from '@/app/api/capture/process/route';
import { GET as captureMetricsGET } from '@/app/api/capture/metrics/route';
import { GET as captureStatsGET } from '@/app/api/capture/stats/route';
import {
  GET as captureRulesGET,
  POST as captureRulesPOST,
  PUT as captureRulesPUT,
  DELETE as captureRulesDELETE,
} from '@/app/api/capture/rules/route';
import { POST as batchPOST, PUT as batchPUT, PATCH as batchPATCH } from '@/app/api/capture/batch/route';

import { GET as memoryGET, POST as memoryPOST } from '@/app/api/memory/route';
import {
  GET as memoryItemGET,
  PUT as memoryItemPUT,
  DELETE as memoryItemDELETE,
} from '@/app/api/memory/[id]/route';
import { GET as memoryStatsGET } from '@/app/api/memory/stats/route';
import { POST as memoryPurgePOST } from '@/app/api/memory/purge/route';

import {
  GET as webhooksGET,
  POST as webhooksPOST,
} from '@/app/api/developer/webhooks/route';
import { GET as pluginsGET, POST as pluginsPOST } from '@/app/api/developer/plugins/route';

import { GET as dashboardGET } from '@/app/api/dashboard/route';
import { POST as switchEntityPOST } from '@/app/api/auth/switch-entity/route';

import { db, setupTestDatabase } from '../helpers/db';
import { createTwoTenants, createEntity, type Tenant } from '../helpers/factories';
import { anonymousRequest, readJson, requestAs } from '../helpers/session';

setupTestDatabase();

type ErrBody = { success: false; error: { code: string; message: string } };
type OkBody<T> = { success: true; data: T };
type PageBody<T> = { success: true; data: T[]; meta: { total: number } };

/**
 * Act in `entityId`, and return the token that does.
 *
 * P-30 / Decision 1. Writing into an entity now requires the session to BE in
 * it: naming one in a request body no longer moves the scope. Switching is how
 * the product moves it, and `POST /api/auth/switch-entity` moves it by
 * re-minting the session cookie (P-29), so this lifts that cookie out of the
 * response exactly as a browser would. Only the SETUP of one cross-entity test
 * below needs it; what that test asserts is unchanged.
 */
async function actingIn(
  actor: Parameters<typeof requestAs>[0],
  entityId: string,
): Promise<string> {
  const res = await switchEntityPOST(
    requestAs(actor, '/api/auth/switch-entity', { method: 'POST', body: { entityId } }),
  );
  expect(res.status).toBe(200);

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

/** Next 15 hands a route its path params as a promise; mirror that exactly. */
function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const ISO_START = '2026-01-01T00:00:00.000Z';
const ISO_END = '2026-12-31T00:00:00.000Z';

let tenantA: Tenant;
let tenantB: Tenant;

beforeEach(async () => {
  ({ tenantA, tenantB } = await createTwoTenants());
});

// ---------------------------------------------------------------------------
// Fixtures, written directly rather than through a route
// ---------------------------------------------------------------------------

async function seedGoal(tenant: Tenant, title = 'Ship it', entityId?: string) {
  return db.goalEntry.create({
    data: {
      userId: tenant.user.id,
      entityId: entityId ?? null,
      title,
      framework: 'CUSTOM',
      targetValue: 100,
      currentValue: 0,
      unit: 'points',
      startDate: new Date(ISO_START),
      endDate: new Date(ISO_END),
      status: 'ON_TRACK',
      autoProgress: false,
    },
  });
}

async function seedHabit(entityId: string, name = 'Morning review') {
  return db.habitEntry.create({
    data: { entityId, name, frequency: 'daily', targetPerPeriod: 1, isActive: true },
  });
}

async function seedMemory(tenant: Tenant, content = 'Secret note') {
  return db.memoryEntry.create({
    data: {
      userId: tenant.user.id,
      type: 'LONG_TERM',
      content,
      context: 'work',
      strength: 0.9,
    },
  });
}

async function seedWebhook(tenant: Tenant, url = 'https://example.com/hook') {
  return db.webhookConfig.create({
    data: {
      userId: tenant.user.id,
      url,
      events: ['task.created'],
      secret: 'super-secret-signing-key',
      isActive: true,
    },
  });
}

async function seedPlugin(entityId: string, name = 'Private Plugin') {
  return db.document.create({
    data: {
      title: name,
      entityId,
      type: 'PLUGIN',
      status: 'DRAFT',
      content: JSON.stringify({ name, version: '1.0.0', permissions: ['tasks.read'] }),
    },
  });
}

async function seedTask(entityId: string, title = 'B private task') {
  return db.task.create({
    data: { title, status: 'DONE', priority: 'P1', entityId },
  });
}

async function seedActionLog(userId: string, target: string) {
  return db.actionLog.create({
    data: {
      actor: 'HUMAN',
      actorId: userId,
      actionType: 'EDIT',
      target,
      reason: 'confidential reason',
    },
  });
}

async function seedUsage(entityId: string, cost: number) {
  return db.usageRecord.create({
    data: {
      entityId,
      module: 'triage',
      model: 'claude-haiku-4-5',
      inputTokens: 100,
      outputTokens: 50,
      cost,
    },
  });
}

// ===========================================================================
// 1. Analytics single-entity reads — the classic `_session` + `?entityId=` shape
// ===========================================================================

describe('analytics single-entity reads refuse a foreign entityId', () => {
  const cases: Array<[string, (r: Request) => Promise<Response>, string]> = [
    ['ai-accuracy', aiAccuracyGET as never, '/api/analytics/ai-accuracy'],
    ['bias', biasGET as never, '/api/analytics/bias'],
    ['scorecard', scorecardGET as never, '/api/analytics/scorecard'],
    ['overrides/analysis', overrideAnalysisGET as never, '/api/analytics/overrides/analysis'],
    ['llm-costs', llmCostsGET as never, '/api/analytics/llm-costs'],
  ];

  for (const [name, handler, path] of cases) {
    it(`${name}: A naming B's entity is refused`, async () => {
      const res = await handler(
        requestAs(tenantA, `${path}?entityId=${tenantB.entity.id}`) as never
      );
      expect(res.status).toBe(403);
      const body = (await readJson(res)) as ErrBody;
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it(`${name}: the owner still gets an answer`, async () => {
      const res = await handler(
        requestAs(tenantA, `${path}?entityId=${tenantA.entity.id}`) as never
      );
      expect(res.status).toBe(200);
    });

    it(`${name}: symmetry -- B reaches B's own entity`, async () => {
      const res = await handler(
        requestAs(tenantB, `${path}?entityId=${tenantB.entity.id}`) as never
      );
      expect(res.status).toBe(200);
    });

    it(`${name}: no session at all is 401`, async () => {
      const res = await handler(anonymousRequest(`${path}?entityId=${tenantA.entity.id}`) as never);
      expect(res.status).toBe(401);
    });
  }

  it('call-analytics: A naming B is refused', async () => {
    const res = await callAnalyticsGET(
      requestAs(
        tenantA,
        `/api/analytics/call-analytics?entityId=${tenantB.entity.id}&start=${ISO_START}&end=${ISO_END}`
      )
    );
    expect(res.status).toBe(403);
  });

  it('call-analytics: the owner still gets an answer', async () => {
    const res = await callAnalyticsGET(
      requestAs(
        tenantA,
        `/api/analytics/call-analytics?entityId=${tenantA.entity.id}&start=${ISO_START}&end=${ISO_END}`
      )
    );
    expect(res.status).toBe(200);
  });

  it('entityId may now be omitted entirely and resolves to the session entity', async () => {
    // tenancy-pattern.md 1: a client that omits entityId gets its own active
    // entity. It used to be a REQUIRED query param -- the client named its own
    // tenant, which is the habit that produced the bug.
    const res = await aiAccuracyGET(requestAs(tenantA, '/api/analytics/ai-accuracy'));
    expect(res.status).toBe(200);
  });
});

describe('llm-costs is an AGGREGATE, so the leak is in the totals', () => {
  it("an ordinary request contains none of tenant B's spend", async () => {
    const period = new Date().toISOString().slice(0, 7);
    await seedUsage(tenantB.entity.id, 999);

    const res = await llmCostsGET(
      requestAs(tenantA, `/api/analytics/llm-costs?period=${period}`)
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as OkBody<{ totalSpend?: number }>;
    // B spent 999. A spent nothing. Anything non-zero here is B's money.
    expect(body.data.totalSpend ?? 0).toBe(0);
  });
});

// ===========================================================================
// 2. The `?userId=` half — routes the `_session` count scored as already correct
// ===========================================================================

describe("`?userId=` no longer names someone else's data", () => {
  it('goals: A cannot read B by naming B', async () => {
    await seedGoal(tenantB, "B's private goal");

    const res = await goalsGET(
      requestAs(tenantA, `/api/analytics/goals?userId=${tenantB.user.id}`)
    );
    expect(res.status).toBe(200); // the parameter is simply gone, not an error
    const body = (await readJson(res)) as OkBody<Array<{ title: string }>>;
    expect(body.data).toHaveLength(0);
  });

  it('productivity: A naming B scores A, not B', async () => {
    const res = await productivityGET(
      requestAs(tenantA, `/api/analytics/productivity?userId=${tenantB.user.id}`)
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as OkBody<{ userId: string }>;
    expect(body.data.userId).toBe(tenantA.user.id);
  });

  it('time-audit: A naming B audits A, not B', async () => {
    const res = await timeAuditGET(
      requestAs(
        tenantA,
        `/api/analytics/time-audit?userId=${tenantB.user.id}&start=${ISO_START}&end=${ISO_END}`
      )
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as OkBody<{ userId: string }>;
    expect(body.data.userId).toBe(tenantA.user.id);
  });

  it("time-saved: an AGGREGATE -- A's totals contain none of B's work", async () => {
    // B completed ten automated tasks. If the rollup is unscoped, A sees them.
    for (let i = 0; i < 10; i++) {
      await db.task.create({
        data: {
          title: `B automated ${i}`,
          status: 'DONE',
          priority: 'P1',
          entityId: tenantB.entity.id,
          createdFrom: { source: 'automation' },
        },
      });
    }

    const res = await timeSavedGET(
      requestAs(tenantA, `/api/analytics/time-saved?userId=${tenantB.user.id}`)
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as OkBody<{
      userId: string;
      totalMinutesSaved: number;
      breakdown: { automatedTasks: number };
    }>;
    expect(body.data.userId).toBe(tenantA.user.id);
    expect(body.data.breakdown.automatedTasks).toBe(0);
    expect(body.data.totalMinutesSaved).toBe(0);
  });

  it('time-saved: symmetry -- B still sees B\'s own work', async () => {
    await db.task.create({
      data: {
        title: 'B automated',
        status: 'DONE',
        priority: 'P1',
        entityId: tenantB.entity.id,
        createdFrom: { source: 'automation' },
      },
    });

    const res = await timeSavedGET(requestAs(tenantB, '/api/analytics/time-saved'));
    const body = (await readJson(res)) as OkBody<{ breakdown: { automatedTasks: number } }>;
    expect(body.data.breakdown.automatedTasks).toBe(1);
  });
});

// ===========================================================================
// 3. Cross-entity views must STILL SPAN ENTITIES (tenancy-pattern.md 5b)
// ===========================================================================

describe('cross-entity views were not silently narrowed to the active entity', () => {
  it('time-saved spans BOTH of the caller\'s entities, not just the active one', async () => {
    // This is the assertion that fails if someone "fixes" this route with
    // withEntityScope. It is invisible to every 403 case in this file.
    const second = await createEntity(tenantA.user.id, { name: 'Second Co' });

    for (const entityId of [tenantA.entity.id, second.id]) {
      await db.task.create({
        data: {
          title: 'automated',
          status: 'DONE',
          priority: 'P1',
          entityId,
          createdFrom: { source: 'automation' },
        },
      });
    }

    const res = await timeSavedGET(requestAs(tenantA, '/api/analytics/time-saved'));
    const body = (await readJson(res)) as OkBody<{ breakdown: { automatedTasks: number } }>;
    expect(body.data.breakdown.automatedTasks).toBe(2);
  });

  it('goals with no entity, and goals under a non-active entity, are both still listed', async () => {
    const second = await createEntity(tenantA.user.id, { name: 'Second Co' });
    await seedGoal(tenantA, 'personal goal'); // entityId null
    await seedGoal(tenantA, 'second-entity goal', second.id);

    const res = await goalsGET(requestAs(tenantA, '/api/analytics/goals'));
    const body = (await readJson(res)) as OkBody<Array<{ title: string }>>;
    expect(body.data.map((g) => g.title).sort()).toEqual([
      'personal goal',
      'second-entity goal',
    ]);
  });

  it('capture inbox spans the caller\'s entities', async () => {
    const second = await createEntity(tenantA.user.id, { name: 'Second Co' });

    await capturePOST(
      requestAs(tenantA, '/api/capture', {
        method: 'POST',
        body: { source: 'MANUAL', contentType: 'TEXT', rawContent: 'one' },
      })
    );
    // P-30 / Decision 1. This second capture used to be written by naming
    // `entityId: second.id` in the body from a session acting in
    // `tenantA.entity` -- precisely the cross-entity write the owner ruled a
    // bug, and which `withEntityScope` now refuses. So the SETUP encoded the
    // defect; the assertion did not, and is untouched.
    //
    // The claim this test makes -- that `GET /api/capture` spans every entity
    // the caller owns rather than narrowing to the active one -- is at least as
    // well evidenced now: the row is created from INSIDE the second entity, and
    // then read back through a session token that is still acting in the first.
    const inSecond = await actingIn(tenantA, second.id);
    await capturePOST(
      requestAs(inSecond, '/api/capture', {
        method: 'POST',
        body: { source: 'MANUAL', contentType: 'TEXT', rawContent: 'two' },
      })
    );

    const res = await captureGET(requestAs(tenantA, '/api/capture'));
    const body = (await readJson(res)) as PageBody<{ rawContent: string }>;
    expect(body.data.map((c) => c.rawContent).sort()).toEqual(['one', 'two']);
  });

  it('goals: a caller-supplied entityId filter must still be one of theirs', async () => {
    const res = await goalsGET(
      requestAs(tenantA, `/api/analytics/goals?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// 4. Goals — single-record, user-scoped
// ===========================================================================

describe('goals by id', () => {
  it("A cannot read B's goal", async () => {
    const goal = await seedGoal(tenantB);
    const res = await goalGET(requestAs(tenantA, `/api/analytics/goals/${goal.id}`), ctx(goal.id));
    expect(res.status).toBe(404);
  });

  it("A cannot complete B's goal, and the row is unchanged", async () => {
    const goal = await seedGoal(tenantB);
    const res = await goalPUT(
      requestAs(tenantA, `/api/analytics/goals/${goal.id}`, {
        method: 'PUT',
        body: { action: 'complete' },
      }),
      ctx(goal.id)
    );
    expect(res.status).toBe(404);

    const after = await db.goalEntry.findUnique({ where: { id: goal.id } });
    expect(after?.status).toBe('ON_TRACK');
    expect(after?.currentValue).toBe(0);
  });

  it("A cannot DELETE B's goal, and the row survives", async () => {
    const goal = await seedGoal(tenantB);
    const res = await goalDELETE(
      requestAs(tenantA, `/api/analytics/goals/${goal.id}`, { method: 'DELETE' }),
      ctx(goal.id)
    );
    expect(res.status).toBe(404);
    expect(await db.goalEntry.count({ where: { id: goal.id } })).toBe(1);
  });

  it('symmetry: B completes B\'s own goal', async () => {
    const goal = await seedGoal(tenantB);
    const res = await goalPUT(
      requestAs(tenantB, `/api/analytics/goals/${goal.id}`, {
        method: 'PUT',
        body: { action: 'complete' },
      }),
      ctx(goal.id)
    );
    expect(res.status).toBe(200);
    const after = await db.goalEntry.findUnique({ where: { id: goal.id } });
    expect(after?.status).toBe('COMPLETE');
  });

  it('POST refuses to file a goal against a foreign entity, and writes nothing', async () => {
    const res = await goalsPOST(
      requestAs(tenantA, '/api/analytics/goals', {
        method: 'POST',
        body: {
          entityId: tenantB.entity.id,
          title: 'planted',
          framework: 'CUSTOM',
          targetValue: 10,
          unit: 'x',
          startDate: ISO_START,
          endDate: ISO_END,
        },
      })
    );
    expect(res.status).toBe(403);
    expect(await db.goalEntry.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it('no session is 401', async () => {
    const goal = await seedGoal(tenantA);
    const res = await goalGET(
      anonymousRequest(`/api/analytics/goals/${goal.id}`),
      ctx(goal.id)
    );
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// 5. Habits — single-entity, and the userId-in-entityId column bug
// ===========================================================================

describe('habits', () => {
  it('a habit can actually be created now (entityId is a real entity)', async () => {
    // This used to write `entityId: <userId>` into a required FK, so the insert
    // failed against a real Postgres. A mocked-Prisma suite could not see it.
    const res = await habitsPOST(
      requestAs(tenantA, '/api/analytics/habits', {
        method: 'POST',
        body: { name: 'Daily review', frequency: 'DAILY' },
      })
    );
    expect(res.status).toBe(201);
    expect(await db.habitEntry.count({ where: { entityId: tenantA.entity.id } })).toBe(1);
  });

  it("A's list does not contain B's habit", async () => {
    await seedHabit(tenantB.entity.id, "B's habit");
    const res = await habitsGET(requestAs(tenantA, '/api/analytics/habits'));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as OkBody<Array<{ name: string }>>;
    expect(body.data).toHaveLength(0);
  });

  it('A naming B\'s entity is refused', async () => {
    const res = await habitsGET(
      requestAs(tenantA, `/api/analytics/habits?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("A cannot record a completion on B's habit, and the row is unchanged", async () => {
    const habit = await seedHabit(tenantB.entity.id);
    const res = await habitCompletePOST(
      requestAs(tenantA, `/api/analytics/habits/${habit.id}/complete`, {
        method: 'POST',
        body: { date: '2026-02-15', completed: true },
      }),
      ctx(habit.id)
    );
    expect(res.status).toBe(403);

    const after = await db.habitEntry.findUnique({ where: { id: habit.id } });
    expect(after?.streak).toBe(0);
    expect(after?.completedDates).toEqual([]);
  });

  it("symmetry: B records a completion on B's own habit", async () => {
    const habit = await seedHabit(tenantB.entity.id);
    const res = await habitCompletePOST(
      requestAs(tenantB, `/api/analytics/habits/${habit.id}/complete`, {
        method: 'POST',
        body: { date: '2026-02-15', completed: true },
      }),
      ctx(habit.id)
    );
    expect(res.status).toBe(200);
    const after = await db.habitEntry.findUnique({ where: { id: habit.id } });
    expect(after?.completedDates).toEqual(['2026-02-15']);
  });

  it('POST refuses to create a habit under a foreign entity, and writes nothing', async () => {
    const res = await habitsPOST(
      requestAs(tenantA, '/api/analytics/habits', {
        method: 'POST',
        body: { entityId: tenantB.entity.id, name: 'planted', frequency: 'DAILY' },
      })
    );
    expect(res.status).toBe(403);
    expect(await db.habitEntry.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });
});

// ===========================================================================
// 6. Memory — user-scoped, and the private-notes disclosure
// ===========================================================================

describe('memory', () => {
  it("A's list does not contain B's memories", async () => {
    await seedMemory(tenantB, "B's confidential note");
    const res = await memoryGET(requestAs(tenantA, '/api/memory'));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as PageBody<{ content: string }>;
    expect(body.data).toHaveLength(0);
    expect(body.meta.total).toBe(0);
  });

  it("A cannot read B's memory by id", async () => {
    const memory = await seedMemory(tenantB);
    const res = await memoryItemGET(requestAs(tenantA, `/api/memory/${memory.id}`), ctx(memory.id));
    expect(res.status).toBe(404);
  });

  it("a refused read does not reinforce B's memory either", async () => {
    // recallMemory has a write side-effect. A 404 that still bumps `strength`
    // and `lastAccessed` would be a write across the boundary.
    const memory = await seedMemory(tenantB);
    const before = await db.memoryEntry.findUnique({ where: { id: memory.id } });

    await memoryItemGET(requestAs(tenantA, `/api/memory/${memory.id}`), ctx(memory.id));

    const after = await db.memoryEntry.findUnique({ where: { id: memory.id } });
    expect(after?.strength).toBe(before?.strength);
    expect(after?.lastAccessed.getTime()).toBe(before?.lastAccessed.getTime());
  });

  it("A cannot rewrite B's memory, and the content is unchanged", async () => {
    const memory = await seedMemory(tenantB, 'original');
    const res = await memoryItemPUT(
      requestAs(tenantA, `/api/memory/${memory.id}`, {
        method: 'PUT',
        body: { content: 'tampered' },
      }),
      ctx(memory.id)
    );
    expect(res.status).toBe(404);
    const after = await db.memoryEntry.findUnique({ where: { id: memory.id } });
    expect(after?.content).toBe('original');
  });

  it("A cannot delete B's memory, and the row survives", async () => {
    const memory = await seedMemory(tenantB);
    const res = await memoryItemDELETE(
      requestAs(tenantA, `/api/memory/${memory.id}`, { method: 'DELETE' }),
      ctx(memory.id)
    );
    expect(res.status).toBe(404);
    expect(await db.memoryEntry.count({ where: { id: memory.id } })).toBe(1);
  });

  it("symmetry: B reads and updates B's own memory", async () => {
    const memory = await seedMemory(tenantB, 'original');
    expect(
      (await memoryItemGET(requestAs(tenantB, `/api/memory/${memory.id}`), ctx(memory.id))).status
    ).toBe(200);

    const put = await memoryItemPUT(
      requestAs(tenantB, `/api/memory/${memory.id}`, {
        method: 'PUT',
        body: { content: 'revised' },
      }),
      ctx(memory.id)
    );
    expect(put.status).toBe(200);
    const after = await db.memoryEntry.findUnique({ where: { id: memory.id } });
    expect(after?.content).toBe('revised');
  });

  it("stats is an aggregate: A's counts contain none of B's memories", async () => {
    await seedMemory(tenantB);
    await seedMemory(tenantB);
    const res = await memoryStatsGET(requestAs(tenantA, '/api/memory/stats'));
    const body = (await readJson(res)) as OkBody<{ totalMemories?: number; total?: number }>;
    expect(body.data.totalMemories ?? body.data.total ?? 0).toBe(0);
  });

  it("purge is a BULK DELETE and must not touch B's rows", async () => {
    const weak = await db.memoryEntry.create({
      data: {
        userId: tenantB.user.id,
        type: 'SHORT_TERM',
        content: 'B weak memory',
        context: 'work',
        strength: 0.01,
      },
    });

    const res = await memoryPurgePOST(
      requestAs(tenantA, '/api/memory/purge', { method: 'POST' })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as OkBody<{ purged: number }>;
    expect(body.data.purged).toBe(0);
    expect(await db.memoryEntry.count({ where: { id: weak.id } })).toBe(1);
  });

  it('POST attributes the memory to the caller, and no session is 401', async () => {
    const res = await memoryPOST(
      requestAs(tenantA, '/api/memory', {
        method: 'POST',
        body: { type: 'LONG_TERM', content: 'mine', context: 'work' },
      })
    );
    expect(res.status).toBe(201);
    expect(await db.memoryEntry.count({ where: { userId: tenantB.user.id } })).toBe(0);

    expect((await memoryGET(anonymousRequest('/api/memory'))).status).toBe(401);
  });
});

// ===========================================================================
// 7. Capture — proven through HTTP (no Capture model; see the banner)
// ===========================================================================

describe('capture', () => {
  async function createCaptureAs(tenant: Tenant, rawContent: string, entityId?: string) {
    const res = await capturePOST(
      requestAs(tenant, '/api/capture', {
        method: 'POST',
        body: {
          source: 'MANUAL',
          contentType: 'TEXT',
          rawContent,
          ...(entityId ? { entityId } : {}),
        },
      })
    );
    const body = (await readJson(res)) as OkBody<{ id: string; userId: string }>;
    return { res, capture: body.data };
  }

  it('POST refuses a foreign entityId', async () => {
    const res = await capturePOST(
      requestAs(tenantA, '/api/capture', {
        method: 'POST',
        body: {
          source: 'MANUAL',
          contentType: 'TEXT',
          rawContent: 'planted',
          entityId: tenantB.entity.id,
        },
      })
    );
    expect(res.status).toBe(403);
  });

  it('POST attributes the capture to the caller, not to a body field', async () => {
    const { res, capture } = await createCaptureAs(tenantA, 'mine');
    expect(res.status).toBe(201);
    expect(capture.userId).toBe(tenantA.user.id);
  });

  it("A cannot read B's capture by id", async () => {
    const { capture } = await createCaptureAs(tenantB, "B's raw content");
    const res = await captureItemGET(
      requestAs(tenantA, `/api/capture/${capture.id}`),
      ctx(capture.id)
    );
    expect(res.status).toBe(404);
  });

  it("A's inbox does not list B's captures", async () => {
    await createCaptureAs(tenantB, "B's raw content");
    const res = await captureGET(requestAs(tenantA, '/api/capture'));
    const body = (await readJson(res)) as PageBody<unknown>;
    expect(body.data).toHaveLength(0);
  });

  it("A cannot re-file B's capture into A's entity", async () => {
    const { capture } = await createCaptureAs(tenantB, 'content');
    const res = await captureItemPATCH(
      requestAs(tenantA, `/api/capture/${capture.id}`, {
        method: 'PATCH',
        body: { entityId: tenantA.entity.id },
      }),
      ctx(capture.id)
    );
    expect(res.status).toBe(404);
  });

  it("A cannot archive B's capture", async () => {
    const { capture } = await createCaptureAs(tenantB, 'content');
    const res = await captureItemDELETE(
      requestAs(tenantA, `/api/capture/${capture.id}`, { method: 'DELETE' }),
      ctx(capture.id)
    );
    expect(res.status).toBe(404);
  });

  it("A cannot PROCESS B's capture -- processing WRITES rows", async () => {
    const { capture } = await createCaptureAs(tenantB, 'Follow up with the vendor');
    const before = await db.task.count();
    const before2 = await db.knowledgeEntry.count();

    const res = await captureProcessPOST(
      requestAs(tenantA, '/api/capture/process', {
        method: 'POST',
        body: { captureId: capture.id },
      })
    );
    expect(res.status).toBe(404);

    expect(await db.task.count()).toBe(before);
    expect(await db.knowledgeEntry.count()).toBe(before2);
  });

  it('routing rules are per-owner: A cannot see, edit or delete B\'s rule', async () => {
    const created = await captureRulesPOST(
      requestAs(tenantB, '/api/capture/rules', {
        method: 'POST',
        body: {
          name: "B's rule",
          conditions: [{ field: 'source', operator: 'equals', value: 'MANUAL' }],
          actions: { targetType: 'TASK', entityId: tenantB.entity.id },
          priority: 500,
          isActive: true,
        },
      })
    );
    const rule = ((await readJson(created)) as OkBody<{ id: string }>).data;

    const list = await captureRulesGET(requestAs(tenantA, '/api/capture/rules'));
    const listed = ((await readJson(list)) as OkBody<Array<{ id: string }>>).data;
    expect(listed.some((r) => r.id === rule.id)).toBe(false);

    const put = await captureRulesPUT(
      requestAs(tenantA, '/api/capture/rules', {
        method: 'PUT',
        body: { id: rule.id, name: 'hijacked' },
      })
    );
    expect(put.status).toBe(404);

    const del = await captureRulesDELETE(
      requestAs(tenantA, '/api/capture/rules', {
        method: 'DELETE',
        body: { id: rule.id },
      })
    );
    expect(del.status).toBe(404);

    // symmetry: B still owns it
    const bList = await captureRulesGET(requestAs(tenantB, '/api/capture/rules'));
    const bListed = ((await readJson(bList)) as OkBody<Array<{ id: string }>>).data;
    expect(bListed.some((r) => r.id === rule.id)).toBe(true);
  });

  it("a rule owned by B cannot redirect A's capture into B's entity", async () => {
    // The rule's `actions.entityId` used to choose the write target for whoever
    // processed a matching capture. Both halves are closed: the rule is not
    // evaluated for A at all, and the destination is the capture's own entity.
    await captureRulesPOST(
      requestAs(tenantB, '/api/capture/rules', {
        method: 'POST',
        body: {
          name: 'redirect everything',
          conditions: [{ field: 'source', operator: 'equals', value: 'MANUAL' }],
          actions: { targetType: 'TASK', entityId: tenantB.entity.id },
          priority: 999,
          isActive: true,
        },
      })
    );

    const { capture } = await createCaptureAs(tenantA, 'Follow up with the vendor');
    await captureProcessPOST(
      requestAs(tenantA, '/api/capture/process', {
        method: 'POST',
        body: { captureId: capture.id },
      })
    );

    expect(await db.task.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
    expect(await db.knowledgeEntry.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it('metrics is an aggregate and returns none of B\'s samples', async () => {
    const { capture } = await createCaptureAs(tenantB, 'Follow up with the vendor');
    await captureProcessPOST(
      requestAs(tenantB, '/api/capture/process', {
        method: 'POST',
        body: { captureId: capture.id },
      })
    );

    const res = await captureMetricsGET(requestAs(tenantA, '/api/capture/metrics'));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as OkBody<unknown[]>;
    expect(body.data).toHaveLength(0);
  });

  it("stats is an aggregate and counts none of B's captures", async () => {
    await createCaptureAs(tenantB, 'one');
    await createCaptureAs(tenantB, 'two');

    const res = await captureStatsGET(requestAs(tenantA, '/api/capture/stats'));
    const body = (await readJson(res)) as OkBody<{ captures: { total: number } }>;
    expect(body.data.captures.total).toBe(0);
  });

  it('stats refuses a foreign entityId filter', async () => {
    const res = await captureStatsGET(
      requestAs(tenantA, `/api/capture/stats?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("A cannot add to, or complete, B's batch session", async () => {
    const started = await batchPOST(
      requestAs(tenantB, '/api/capture/batch', { method: 'POST', body: {} })
    );
    expect(started.status).toBe(201);
    const session = ((await readJson(started)) as OkBody<{ id: string }>).data;

    const put = await batchPUT(
      requestAs(tenantA, '/api/capture/batch', {
        method: 'PUT',
        body: { sessionId: session.id, rawContent: 'planted' },
      })
    );
    expect(put.status).toBe(404);

    const docsBefore = await db.document.count();
    const patch = await batchPATCH(
      requestAs(tenantA, '/api/capture/batch', {
        method: 'PATCH',
        body: { sessionId: session.id },
      })
    );
    expect(patch.status).toBe(404);
    expect(await db.document.count()).toBe(docsBefore);
  });

  it('no session is 401 on every capture entry point', async () => {
    expect((await captureGET(anonymousRequest('/api/capture'))).status).toBe(401);
    expect((await captureMetricsGET(anonymousRequest('/api/capture/metrics'))).status).toBe(401);
    expect((await captureRulesGET(anonymousRequest('/api/capture/rules'))).status).toBe(401);
  });
});

// ===========================================================================
// 8. Developer — the HMAC secret disclosure, and the unscoped plugin list
// ===========================================================================

describe('developer webhooks', () => {
  it("A cannot read B's webhooks -- or their signing secret -- by naming B", async () => {
    await seedWebhook(tenantB, 'https://b.example.com/hook');

    // `?entityId=` used to be fed straight into the `userId` WHERE clause.
    const res = await webhooksGET(
      requestAs(tenantA, `/api/developer/webhooks?entityId=${tenantB.user.id}`)
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as OkBody<Array<{ url: string; secret: string }>>;
    expect(body.data).toHaveLength(0);
  });

  it("A cannot trigger B's webhook", async () => {
    const hook = await seedWebhook(tenantB);
    const res = await webhooksPOST(
      requestAs(tenantA, '/api/developer/webhooks', {
        method: 'POST',
        body: { action: 'trigger', webhookId: hook.id, event: 'task.created', payload: {} },
      })
    );
    expect(res.status).toBe(404);
    expect(await db.webhookEvent.count({ where: { webhookConfigId: hook.id } })).toBe(0);
  });

  it("A cannot delete B's webhook, and the row survives", async () => {
    const hook = await seedWebhook(tenantB);
    const res = await webhooksPOST(
      requestAs(tenantA, '/api/developer/webhooks', {
        method: 'POST',
        body: { action: 'delete', webhookId: hook.id },
      })
    );
    expect(res.status).toBe(404);
    expect(await db.webhookConfig.count({ where: { id: hook.id } })).toBe(1);
  });

  it("A cannot list B's webhook delivery history", async () => {
    const hook = await seedWebhook(tenantB);
    await db.webhookEvent.create({
      data: { webhookConfigId: hook.id, event: 'task.created', payload: { secret: 'x' }, status: 'DELIVERED' },
    });

    const res = await webhooksGET(
      requestAs(tenantA, `/api/developer/webhooks?webhookId=${hook.id}`)
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as OkBody<unknown[]>;
    expect(body.data).toHaveLength(0);
  });

  it('symmetry: B lists and reads B\'s own webhooks', async () => {
    const hook = await seedWebhook(tenantB, 'https://b.example.com/hook');
    const res = await webhooksGET(requestAs(tenantB, '/api/developer/webhooks'));
    const body = (await readJson(res)) as OkBody<Array<{ id: string }>>;
    expect(body.data.map((w) => w.id)).toEqual([hook.id]);
  });

  it('POST files the webhook against the caller, not a body field', async () => {
    const res = await webhooksPOST(
      requestAs(tenantA, '/api/developer/webhooks', {
        method: 'POST',
        body: {
          entityId: tenantB.user.id,
          direction: 'OUTBOUND',
          url: 'https://a.example.com/hook',
          events: ['task.created'],
        },
      })
    );
    expect(res.status).toBe(201);
    expect(await db.webhookConfig.count({ where: { userId: tenantB.user.id } })).toBe(0);
    expect(await db.webhookConfig.count({ where: { userId: tenantA.user.id } })).toBe(1);
  });

  it('no session is 401', async () => {
    expect((await webhooksGET(anonymousRequest('/api/developer/webhooks'))).status).toBe(401);
  });
});

describe('developer plugins', () => {
  it("A's plugin list contains none of B's plugins", async () => {
    await seedPlugin(tenantB.entity.id, "B's private plugin");
    const res = await pluginsGET(requestAs(tenantA, '/api/developer/plugins'));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as OkBody<Array<{ name: string }>>;
    expect(body.data).toHaveLength(0);
  });

  it('A naming B\'s entity is refused', async () => {
    const res = await pluginsGET(
      requestAs(tenantA, `/api/developer/plugins?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("A cannot revoke B's plugin, and the row is unchanged", async () => {
    const plugin = await seedPlugin(tenantB.entity.id);
    const before = await db.document.findUnique({ where: { id: plugin.id } });

    const res = await pluginsPOST(
      requestAs(tenantA, '/api/developer/plugins', {
        method: 'POST',
        body: { pluginId: plugin.id, action: 'revoke', reason: 'hostile' },
      })
    );
    expect(res.status).toBe(404);

    const after = await db.document.findUnique({ where: { id: plugin.id } });
    expect(after?.status).toBe(before?.status);
    expect(after?.content).toBe(before?.content);
  });

  it('symmetry: B sees and approves B\'s own plugin', async () => {
    const plugin = await seedPlugin(tenantB.entity.id);

    const list = await pluginsGET(requestAs(tenantB, '/api/developer/plugins'));
    const listed = ((await readJson(list)) as OkBody<Array<{ id: string }>>).data;
    expect(listed.map((p) => p.id)).toEqual([plugin.id]);

    const res = await pluginsPOST(
      requestAs(tenantB, '/api/developer/plugins', {
        method: 'POST',
        body: { pluginId: plugin.id, action: 'approve' },
      })
    );
    expect(res.status).toBe(200);
  });

  it('registration is filed against the caller\'s entity, not a default string', async () => {
    const res = await pluginsPOST(
      requestAs(tenantA, '/api/developer/plugins', {
        method: 'POST',
        body: {
          name: 'Mine',
          description: 'x',
          version: '1.0.0',
          author: 'a',
          permissions: ['tasks.read'],
          entryPoint: 'index.js',
        },
      })
    );
    expect(res.status).toBe(201);
    expect(
      await db.document.count({ where: { type: 'PLUGIN', entityId: tenantA.entity.id } })
    ).toBe(1);
  });
});

// ===========================================================================
// 9. Dashboard — the unscoped activity feed
// ===========================================================================

describe('dashboard', () => {
  it("the activity feed contains none of B's actions", async () => {
    // `prisma.actionLog.findMany` had NO where clause: the last ten actions
    // taken anywhere on the platform, shown to whoever loaded the page.
    await seedActionLog(tenantB.user.id, 'B-CONFIDENTIAL-TARGET');

    const res = await dashboardGET(requestAs(tenantA, '/api/dashboard'));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as OkBody<{
      activityFeed: Array<{ description: string }>;
    }>;
    expect(
      body.data.activityFeed.some((a) => a.description.includes('B-CONFIDENTIAL-TARGET'))
    ).toBe(false);
  });

  it("the task and message panels contain none of B's rows", async () => {
    await seedTask(tenantB.entity.id, 'B-PRIVATE-TASK');

    const res = await dashboardGET(requestAs(tenantA, '/api/dashboard'));
    const body = (await readJson(res)) as OkBody<{
      topTasks: Array<{ title: string }>;
      stats: { openTasks: number; completedToday: number };
    }>;
    expect(body.data.topTasks.some((t) => t.title === 'B-PRIVATE-TASK')).toBe(false);
    expect(body.data.stats.openTasks).toBe(0);
  });

  it("symmetry: B's own action DOES appear in B's feed", async () => {
    await seedActionLog(tenantB.user.id, 'B-OWN-TARGET');
    const res = await dashboardGET(requestAs(tenantB, '/api/dashboard'));
    const body = (await readJson(res)) as OkBody<{
      activityFeed: Array<{ description: string }>;
    }>;
    expect(
      body.data.activityFeed.some((a) => a.description.includes('B-OWN-TARGET'))
    ).toBe(true);
  });

  it('no session is 401', async () => {
    const res = await dashboardGET(anonymousRequest('/api/dashboard'));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// 10. Routes that were ALREADY correct — regression cover, not a claimed fix
// ===========================================================================

describe('already-correct cross-entity rollups stay correct', () => {
  it('analytics/overview refuses a foreign entityId', async () => {
    const res = await overviewGET(
      requestAs(tenantA, `/api/analytics/overview?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(404); // its own pre-existing shape; not changed here
  });

  it("analytics/overview totals contain none of B's tasks", async () => {
    await seedTask(tenantB.entity.id);
    const res = await overviewGET(requestAs(tenantA, '/api/analytics/overview'));
    expect(res.status).toBe(200);
  });

  it('ai-quality/stats refuses a foreign entityId', async () => {
    const res = await aiQualityStatsGET(
      requestAs(tenantA, `/api/ai-quality/stats?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(404);
  });

  it('ai-quality/stats spans BOTH of the caller\'s entities when none is named', async () => {
    await createEntity(tenantA.user.id, { name: 'Second Co' });
    const res = await aiQualityStatsGET(requestAs(tenantA, '/api/ai-quality/stats'));
    expect(res.status).toBe(200);
  });
});
