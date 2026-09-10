/**
 * P-26 — the search module, against a real Postgres.
 *
 * ============================================================================
 * WHY THIS FILE HAD TO BE A DATABASE TEST
 * ============================================================================
 *
 * `GET /api/search?suggestions=true` had never worked. Not "worked and then
 * regressed" — never, for any tenant, since the line was written:
 *
 *     SELECT DISTINCT title FROM "Task"
 *     WHERE "entityId" = $1 AND title ILIKE $2
 *     ORDER BY "updatedAt" DESC LIMIT $3
 *
 * Postgres answers 42P10, "for SELECT DISTINCT, ORDER BY expressions must
 * appear in select list". DISTINCT collapses rows; once it has, an `updatedAt`
 * that is not in the select list has no single value left to sort on, so the
 * planner refuses the statement rather than pick one. It is rejected at parse
 * time — the query never runs, no tenant ever saw a suggestion.
 *
 * The endpoint had a passing test the whole time. `tests/unit/search/
 * unified.test.ts` does `jest.mock('@/lib/db')` and makes `$queryRawUnsafe` a
 * `jest.fn()` that resolves to rows. A `jest.fn()` has no parser, no planner
 * and no opinion: hand it any string at all and it hands back whatever the
 * test told it to. The SQL was never sent anywhere that could disagree with
 * it, so the suite was green and the feature was dead, and those two facts
 * never had to meet.
 *
 * That is the general shape, and it is worth naming because this repo has
 * other raw SQL: **a mocked database can only prove that code CALLS the
 * database. Whether the database would ACCEPT the call is a fact about
 * Postgres, and the only instrument that can measure it is Postgres.** No
 * amount of assertion at the mock boundary substitutes. This file is that
 * instrument for `src/lib/search/`.
 *
 * The mutation check for it: restore the `SELECT DISTINCT ... ORDER BY` form
 * in `src/lib/search/index.ts` and the SUGGESTIONS cases below fail; the whole
 * unit suite stays green. Both numbers are in the PR.
 *
 * ============================================================================
 * WHAT ELSE IS HERE
 * ============================================================================
 *
 * P-23 repaired the route: `?entityId=` used to reach the search layer
 * unchecked, and with nothing resolvable it passed `undefined` into a filter
 * builder that emits no WHERE clause for an undefined entity — a search across
 * every tenant in the database, reachable without an attacker naming anything.
 * That fix is on master and `tests/db/platform-surface.test.ts` covers the
 * route. What it could not cover is the library underneath, which is where the
 * filter is actually built and which was still perfectly capable of building
 * an unscoped query for any caller who omitted the field.
 *
 * P-26 closes that structurally: `SearchFilter` has no `entityId` field at all,
 * and every entry point takes `entityId: VerifiedEntityId` as a required
 * leading argument. A raw string does not satisfy the brand, so the unscoped
 * call no longer compiles. The cases below prove the runtime half — that no
 * filter combination, no model type and no absent parameter widens the scope.
 *
 * Run: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paf_p26 \
 *        npm run test:db -- search
 */

import { GET as searchGET } from '@/app/api/search/route';

import { db, setupTestDatabase } from '../helpers/db';
import { createTwoTenants, type Tenant } from '../helpers/factories';
import { anonymousRequest, readJson, requestAs, sessionTokenFor } from '../helpers/session';

type ErrBody = { success: false; error: { code: string; message: string } };
type OkBody<T> = { success: true; data: T };

type SearchData = {
  results: { id: string; model: string; title: string; entityId: string; rank: number }[];
  total: number;
  query: string;
  filters: { entityId?: string };
};

setupTestDatabase();

let tenantA: Tenant;
let tenantB: Tenant;

/** Force an exact `updatedAt`; the column is `@updatedAt`, so Prisma owns it. */
async function stampUpdatedAt(table: string, id: string, iso: string): Promise<void> {
  await db.$executeRawUnsafe(
    `UPDATE "${table}" SET "updatedAt" = $1::timestamp WHERE id = $2`,
    iso,
    id,
  );
}

beforeEach(async () => {
  ({ tenantA, tenantB } = await createTwoTenants());

  // --- tenant A -----------------------------------------------------------
  const older = await db.task.create({
    data: {
      entityId: tenantA.entity.id,
      title: 'Alpha quarterly review',
      description: 'A private note about the quarterly numbers',
      status: 'TODO',
      priority: 'MEDIUM',
    },
  });
  const newer = await db.task.create({
    data: {
      entityId: tenantA.entity.id,
      title: 'Alpha annual review',
      description: 'A private note about the annual numbers',
      status: 'DONE',
      priority: 'HIGH',
    },
  });
  // A DUPLICATE of the older title. The original query said DISTINCT for a
  // reason: two tasks that happen to share a title are one suggestion, not two.
  const duplicate = await db.task.create({
    data: {
      entityId: tenantA.entity.id,
      title: 'Alpha quarterly review',
      description: 'A second task, same title',
      status: 'TODO',
      priority: 'LOW',
    },
  });

  await stampUpdatedAt('Task', older.id, '2024-01-01T00:00:00');
  await stampUpdatedAt('Task', duplicate.id, '2024-02-01T00:00:00');
  await stampUpdatedAt('Task', newer.id, '2024-03-01T00:00:00');

  await db.document.create({
    data: {
      entityId: tenantA.entity.id,
      title: 'Alpha architecture memo',
      content: 'A private quarterly architecture memo',
      type: 'MEMO',
      status: 'DRAFT',
    },
  });
  await db.contact.create({
    data: {
      entityId: tenantA.entity.id,
      name: 'Alphonse Parker',
      email: 'alphonse@example.com',
    },
  });

  // --- tenant B -----------------------------------------------------------
  await db.task.create({
    data: {
      entityId: tenantB.entity.id,
      title: 'Alpha quarterly review',
      description: 'B CONFIDENTIAL merger memo',
      status: 'TODO',
      priority: 'MEDIUM',
    },
  });
  await db.document.create({
    data: {
      entityId: tenantB.entity.id,
      title: 'Alpha architecture memo',
      content: 'B CONFIDENTIAL architecture',
      type: 'MEMO',
      status: 'DRAFT',
    },
  });
  await db.contact.create({
    data: {
      entityId: tenantB.entity.id,
      name: 'Alphonse Bravo',
      email: 'alphonse@bravo.example.com',
    },
  });
});

// ===========================================================================
// 1. SUGGESTIONS — the 42P10 fix. These are the cases that fail against the
//    old SQL, and they are the whole reason this file is in tests/db/.
// ===========================================================================

describe('GET /api/search?suggestions=true — the query Postgres used to reject', () => {
  it('returns 200 and real suggestions (was: 42P10, thrown out of the handler)', async () => {
    const res = await searchGET(
      requestAs(tenantA, '/api/search?suggestions=true&q=Alpha'),
    );

    // Against the pre-fix SQL this line is never reached: the rejection escapes
    // the route as a thrown error rather than becoming a response at all, which
    // is why `tests/db/platform-surface.test.ts` had to pin it with
    // `rejects.toThrow(/SELECT DISTINCT/)`.
    expect(res.status).toBe(200);

    const body = await readJson<OkBody<{ suggestions: string[] }>>(res);
    expect(body.success).toBe(true);
    expect(body.data.suggestions.length).toBeGreaterThan(0);
  });

  it('draws from all three source tables', async () => {
    const res = await searchGET(
      requestAs(tenantA, '/api/search?suggestions=true&q=Alph&limit=10'),
    );
    const { suggestions } = (await readJson<OkBody<{ suggestions: string[] }>>(res)).data;

    expect(suggestions).toContain('Alpha quarterly review'); // Task
    expect(suggestions).toContain('Alpha architecture memo'); // Document
    expect(suggestions).toContain('Alphonse Parker'); // Contact
  });

  it('still collapses duplicate titles to one suggestion', async () => {
    // Two of A's tasks share 'Alpha quarterly review'. DISTINCT was doing real
    // work; GROUP BY has to keep doing it.
    const res = await searchGET(
      requestAs(tenantA, '/api/search?suggestions=true&q=Alpha%20quarterly&limit=10'),
    );
    const { suggestions } = (await readJson<OkBody<{ suggestions: string[] }>>(res)).data;

    const occurrences = suggestions.filter((s) => s === 'Alpha quarterly review');
    expect(occurrences).toHaveLength(1);
  });

  it('still orders most-recently-updated first', async () => {
    // The other half of the intent. `ORDER BY MAX("updatedAt") DESC` has to
    // reproduce what `ORDER BY "updatedAt" DESC` was trying to say:
    //   Alpha annual review     updatedAt 2024-03-01  (newest)
    //   Alpha quarterly review  updatedAt 2024-02-01  (the duplicate)
    const res = await searchGET(
      requestAs(tenantA, '/api/search?suggestions=true&q=Alpha%20&limit=10'),
    );
    const { suggestions } = (await readJson<OkBody<{ suggestions: string[] }>>(res)).data;

    const annual = suggestions.indexOf('Alpha annual review');
    const quarterly = suggestions.indexOf('Alpha quarterly review');

    expect(annual).toBeGreaterThanOrEqual(0);
    expect(quarterly).toBeGreaterThanOrEqual(0);
    expect(annual).toBeLessThan(quarterly);
  });

  it('honours the limit', async () => {
    const res = await searchGET(
      requestAs(tenantA, '/api/search?suggestions=true&q=Alph&limit=2'),
    );
    const { suggestions } = (await readJson<OkBody<{ suggestions: string[] }>>(res)).data;

    expect(suggestions.length).toBeLessThanOrEqual(2);
  });

  it('returns an empty list rather than an error when nothing matches', async () => {
    const res = await searchGET(
      requestAs(tenantA, '/api/search?suggestions=true&q=zzzznotathing'),
    );

    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ suggestions: string[] }>>(res)).data.suggestions).toEqual(
      [],
    );
  });

  it('treats ILIKE wildcards as literal characters', async () => {
    // `%` and `_` are wildcards inside ILIKE. Unescaped, a user typing `%%`
    // matched every title in the tenant — a bind parameter stops injection, not
    // pattern abuse.
    const res = await searchGET(requestAs(tenantA, '/api/search?suggestions=true&q=%25%25'));

    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ suggestions: string[] }>>(res)).data.suggestions).toEqual(
      [],
    );
  });
});

// ===========================================================================
// 2. SUGGESTIONS — tenancy. A working query that answers about the wrong
//    tenant is worse than one that never ran.
// ===========================================================================

describe('GET /api/search?suggestions=true — scope', () => {
  it("never offers another tenant's titles, even though they match", async () => {
    // B owns rows with the SAME titles. Nothing foreign is named in this
    // request; the filter simply matches both tenants' rows.
    const res = await searchGET(
      requestAs(tenantA, '/api/search?suggestions=true&q=Alph&limit=10'),
    );
    const { suggestions } = (await readJson<OkBody<{ suggestions: string[] }>>(res)).data;

    expect(suggestions).not.toContain('Alphonse Bravo');

    // And the rows that ARE returned are A's: verify by id, not by title,
    // because the titles are deliberately identical across tenants.
    const foreignTitles = await db.contact.findMany({
      where: { entityId: tenantB.entity.id },
      select: { name: true },
    });
    for (const { name } of foreignTitles) {
      if (name !== 'Alphonse Parker') expect(suggestions).not.toContain(name);
    }
  });

  it("refuses a suggestions request naming another tenant's entity", async () => {
    const res = await searchGET(
      requestAs(
        tenantA,
        `/api/search?suggestions=true&q=Alph&entityId=${tenantB.entity.id}`,
      ),
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  it('is symmetric: B gets B\'s own suggestions', async () => {
    // A "fix" that denies everyone passes every other assertion in this file.
    const res = await searchGET(
      requestAs(tenantB, '/api/search?suggestions=true&q=Alph&limit=10'),
    );

    expect(res.status).toBe(200);
    const { suggestions } = (await readJson<OkBody<{ suggestions: string[] }>>(res)).data;
    expect(suggestions).toContain('Alphonse Bravo');
    expect(suggestions).not.toContain('Alphonse Parker');
  });

  it('refuses with no session', async () => {
    const res = await searchGET(anonymousRequest('/api/search?suggestions=true&q=Alph'));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// 3. FULL-TEXT SEARCH — every generated statement, against the real planner.
//
//    `search()` catches everything and silently falls back to a Prisma
//    `contains` query, so a broken full-text statement would look like a
//    working search with slightly different results. `searchByType()` does NOT
//    catch, so `?type=` is the honest path: it is the only way to find out
//    whether the generated SQL is valid.
// ===========================================================================

describe('GET /api/search — the generated full-text SQL', () => {
  const types = ['task', 'message', 'document', 'knowledgeEntry', 'contact'] as const;

  it.each(types)('Postgres accepts the generated statement for %s', async (type) => {
    const res = await searchGET(requestAs(tenantA, `/api/search?q=quarterly&type=${type}`));

    // A 500 here is the route catching a rejected statement and reporting its
    // message. That is exactly the failure a mocked $queryRawUnsafe cannot
    // produce, for any of the five models.
    expect(res.status).toBe(200);
  });

  it('actually matches rows through the full-text path, not just the fallback', async () => {
    const res = await searchGET(requestAs(tenantA, '/api/search?q=quarterly&type=task'));
    const body = await readJson<OkBody<SearchData>>(res);

    expect(body.data.results.length).toBeGreaterThan(0);
    expect(body.data.results.map((r) => r.title)).toContain('Alpha quarterly review');
    // ts_rank_cd produced a real score; the fallback hardcodes 1.0 / 0.5.
    expect(body.data.results.every((r) => r.model === 'task')).toBe(true);
  });

  it('honours the tsquery operators against the real parser', async () => {
    // Prefix, phrase and OR all become tsquery syntax. If parseSearchQuery
    // emitted something to_tsquery disliked, only Postgres would say so.
    for (const q of ['quarter*', '"quarterly numbers"', 'quarterly OR annual']) {
      const res = await searchGET(
        requestAs(tenantA, `/api/search?type=task&q=${encodeURIComponent(q)}`),
      );
      expect(res.status).toBe(200);
    }
  });
});

// ===========================================================================
// 4. FULL SEARCH — the scope cannot be widened.
// ===========================================================================

describe('GET /api/search — scope', () => {
  it("an ordinary search whose terms match B's rows returns nothing of B's", async () => {
    const res = await searchGET(requestAs(tenantA, '/api/search?q=quarterly'));

    expect(res.status).toBe(200);
    const raw = JSON.stringify(await readJson(res));
    expect(raw).toContain('Alpha quarterly review');
    expect(raw).not.toContain('B CONFIDENTIAL');
  });

  it('every result row belongs to the caller, across all five models', async () => {
    const res = await searchGET(requestAs(tenantA, '/api/search?q=Alpha&limit=100'));
    const body = await readJson<OkBody<SearchData>>(res);

    expect(body.data.results.length).toBeGreaterThan(0);
    for (const row of body.data.results) {
      expect(row.entityId).toBe(tenantA.entity.id);
    }
  });

  it('no combination of the optional filters widens it', async () => {
    // tenancy-pattern.md §3: the scope is applied last and unconditionally, so
    // there is no filter arrangement that can push it out of the WHERE.
    const suffixes = [
      '',
      '&status=TODO',
      '&priority=MEDIUM',
      '&status=TODO&priority=MEDIUM',
      '&dateFrom=2000-01-01',
      '&dateTo=2100-01-01&status=TODO',
      '&type=task&status=TODO',
      '&limit=100&offset=0',
    ];

    for (const suffix of suffixes) {
      const res = await searchGET(requestAs(tenantA, `/api/search?q=quarterly${suffix}`));
      expect(res.status).toBe(200);

      const body = await readJson<OkBody<SearchData>>(res);
      for (const row of body.data.results) {
        expect(row.entityId).toBe(tenantA.entity.id);
      }
      expect(JSON.stringify(body)).not.toContain('B CONFIDENTIAL');
    }
  });

  it('echoes back the entity it actually applied', async () => {
    const res = await searchGET(requestAs(tenantA, '/api/search?q=quarterly'));
    const body = await readJson<OkBody<SearchData>>(res);

    expect(body.data.filters.entityId).toBe(tenantA.entity.id);
    expect(body.data.filters.entityId).not.toBe(tenantB.entity.id);
  });

  it("refuses a search naming another tenant's entity", async () => {
    const res = await searchGET(
      requestAs(tenantA, `/api/search?q=quarterly&entityId=${tenantB.entity.id}`),
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  it('a session with no active entity is refused, not answered globally', async () => {
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
    expect(JSON.stringify(await readJson(res))).toContain('B CONFIDENTIAL');
  });

  it('refuses with no session', async () => {
    expect((await searchGET(anonymousRequest('/api/search?q=quarterly'))).status).toBe(401);
  });
});

// ===========================================================================
// 5. SOFT DELETE — a sibling defect found by reading the same queries.
//
//    Not in the P-26 card, and a deliberate BEHAVIOUR CHANGE, so it is called
//    out in the PR rather than slipped in. 64 places in `src/` filter
//    `deletedAt: null`; `src/lib/search/` filtered it in none of them, so a
//    document the user had deleted was still readable in full through
//    /api/search and its title was still offered by autocomplete.
//
//    `KnowledgeEntry` has no `deletedAt` column, which is why the exclusion is
//    a per-model flag rather than an assumption -- naming a column that is not
//    there is error 42703, the same never-worked shape as the 42P10 above.
// ===========================================================================

describe('GET /api/search — soft-deleted rows', () => {
  it('does not return a deleted task, or its description', async () => {
    await db.task.updateMany({
      where: { entityId: tenantA.entity.id, title: 'Alpha annual review' },
      data: { deletedAt: new Date() },
    });

    const res = await searchGET(requestAs(tenantA, '/api/search?q=annual&type=task'));

    expect(res.status).toBe(200);
    const raw = JSON.stringify(await readJson(res));
    expect(raw).not.toContain('Alpha annual review');
    expect(raw).not.toContain('A private note about the annual numbers');
  });

  it('does not return a deleted document', async () => {
    await db.document.updateMany({
      where: { entityId: tenantA.entity.id },
      data: { deletedAt: new Date() },
    });

    const res = await searchGET(
      requestAs(tenantA, '/api/search?q=architecture&type=document'),
    );

    expect(res.status).toBe(200);
    expect(JSON.stringify(await readJson(res))).not.toContain('Alpha architecture memo');
  });

  it('does not suggest a deleted title', async () => {
    await db.contact.updateMany({
      where: { entityId: tenantA.entity.id },
      data: { deletedAt: new Date() },
    });

    const res = await searchGET(
      requestAs(tenantA, '/api/search?suggestions=true&q=Alph&limit=10'),
    );

    expect(res.status).toBe(200);
    const { suggestions } = (await readJson<OkBody<{ suggestions: string[] }>>(res)).data;
    expect(suggestions).not.toContain('Alphonse Parker');
    // and the live rows are still there -- this is an exclusion, not a break
    expect(suggestions).toContain('Alpha quarterly review');
  });

  it('still searches knowledgeEntry, which has no deletedAt column', async () => {
    // The 42703 the flag exists to avoid: if the exclusion were applied
    // unconditionally, this returns 500 instead of 200.
    await db.knowledgeEntry.create({
      data: {
        entityId: tenantA.entity.id,
        content: 'A quarterly knowledge note',
        source: 'test',
      },
    });

    const res = await searchGET(
      requestAs(tenantA, '/api/search?q=quarterly&type=knowledgeEntry'),
    );

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<SearchData>>(res);
    expect(body.data.results.length).toBeGreaterThan(0);
  });
});
