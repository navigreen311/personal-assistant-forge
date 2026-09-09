/**
 * P-01 — Real-database test harness: connection and per-test isolation.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * The audit found 186 of 320 test files calling `jest.mock('@/lib/db')` and
 * zero tests touching a real database. A suite that stubs Prisma cannot observe
 * a missing tenant check, an unstarted worker, or an audit log that is never
 * written -- which is every BLOCKER in the audit. It is also exactly how
 * `shadow/compliance` came to call four Prisma delegates that were never in the
 * schema, with 5,268 tests passing the whole time.
 *
 * Everything in `tests/db/` runs against a real Postgres. This file is the
 * connection and the isolation.
 *
 * ============================================================================
 * WHICH CLIENT
 * ============================================================================
 *
 * `db` is re-exported from `@/lib/db` deliberately -- it is the SAME singleton
 * the product code imports. A route handler under test calls
 * `prisma.entity.findUnique` through that module; if the harness held a second,
 * separate client, a test could set up a row the handler's client had not
 * committed yet, or vice versa. Sharing the instance removes the whole class of
 * question, and it means a test observes precisely what the route observes.
 *
 * ============================================================================
 * ISOLATION: TRUNCATION, NOT TRANSACTION ROLLBACK
 * ============================================================================
 *
 * Two isolation strategies were available. This harness truncates.
 *
 * Transaction rollback (open a transaction in `beforeEach`, roll it back in
 * `afterEach`) is faster and is the usual first choice. It does not work here,
 * and the reason matters: Prisma's interactive transaction hands you a *new*
 * client (`tx`) scoped to that transaction. The code under test does not use
 * it. `src/shared/middleware/auth.ts` and every service import the singleton
 * from `@/lib/db` directly, so a handler invoked inside a test's transaction
 * would run on a different connection, outside it -- unable to see the test's
 * fixtures, and leaving its own writes behind when the test rolled back.
 * Making it work would mean injecting the client into product code, which is a
 * change under `src/`, which P-01 may not make. So: truncation.
 *
 * `resetDatabase()` issues a single `TRUNCATE ... RESTART IDENTITY CASCADE`
 * over every table in the `public` schema except `_prisma_migrations`. One
 * statement, all tables, foreign keys handled by CASCADE, ~5 ms on a local
 * Postgres. It is called before each test by `setupTestDatabase()`.
 *
 * The cost of truncation is that it is global: it destroys rows belonging to
 * any other test running at the same time. `npm run test:db` therefore MUST
 * keep `--runInBand` (it is set in the `test:db` script). Do not parallelise
 * this suite without replacing the isolation strategy first.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   import { db, setupTestDatabase } from '../helpers/db';
 *
 *   setupTestDatabase();   // beforeAll connect + reset, beforeEach reset,
 *                          // afterAll disconnect. Call once, at describe top level.
 *
 *   it('...', async () => {
 *     const rows = await db.task.findMany();
 *   });
 *
 * Requires `DATABASE_URL` and applied migrations. There is no `.env` in this
 * repository and this harness does not create one -- pass it inline:
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paf_dbtest \
 *     npm run test:db
 *
 * CI already supplies it (`.github/workflows/ci.yml`, the `db-test` job).
 */

import { prisma } from '@/lib/db';

/**
 * The shared Prisma client. Identical instance to the one product code uses.
 *
 * Exported as `db` rather than `prisma` so a test file can hold both this and a
 * route's own import without shadowing, and so `jest.mock('@/lib/db')` -- which
 * 186 unit tests do -- reads as obviously wrong in a `tests/db/` file.
 */
export const db = prisma;

/** Re-exported under its product name for tests that prefer it. */
export { prisma };

/**
 * Fail loudly and early if the suite was started without a database.
 *
 * Without this, the first Prisma call fails somewhere deep in a test with a
 * connection error that reads like a product bug. This says the real thing.
 */
export function assertDatabaseConfigured(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. tests/db/ runs against a real Postgres.\n' +
        'There is no .env in this repository -- pass it inline, e.g.\n' +
        '  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paf_dbtest npm run test:db\n' +
        'and apply migrations first with `npx prisma migrate deploy`.'
    );
  }
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error(`DATABASE_URL does not look like a Postgres URL: ${url}`);
  }
}

/**
 * Prove the connection is real before any test asserts anything on it.
 *
 * A `SELECT 1` that returns 1 is the weakest useful evidence that this suite is
 * not silently running against a mock, which is the failure mode the whole
 * package exists to close.
 */
export async function connectDatabase(): Promise<void> {
  assertDatabaseConfigured();
  await db.$connect();
  const rows = await db.$queryRaw<Array<{ one: number }>>`SELECT 1 as one`;
  if (rows[0]?.one !== 1) {
    throw new Error('Database connection did not answer SELECT 1 -- is this a mock?');
  }
}

export async function closeDatabase(): Promise<void> {
  await db.$disconnect();
}

/** Cached table list -- `pg_tables` does not change during a run. */
let truncatableTables: string[] | null = null;

/**
 * Every table in the `public` schema except Prisma's own migration ledger.
 *
 * Read from the database rather than hard-coded from the schema file, so a
 * model added later is truncated without anyone remembering to update a list.
 * `_prisma_migrations` is excluded because truncating it would convince
 * `prisma migrate` the database is empty.
 */
export async function listTruncatableTables(): Promise<string[]> {
  if (truncatableTables) return truncatableTables;

  const rows = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `;

  truncatableTables = rows.map((r) => r.tablename);
  return truncatableTables;
}

/**
 * Empty every application table.
 *
 * One statement so it is atomic and so foreign keys never need ordering:
 * `TRUNCATE a, b, c RESTART IDENTITY CASCADE`. Identifiers are quoted -- Prisma
 * table names are PascalCase and unquoted Postgres would fold them.
 *
 * Safe to call when the database is already empty.
 */
export async function resetDatabase(): Promise<void> {
  const tables = await listTruncatableTables();
  if (tables.length === 0) {
    throw new Error(
      'No tables found in the public schema. Run `npx prisma migrate deploy` ' +
        'against DATABASE_URL before running tests/db/.'
    );
  }

  const quoted = tables.map((t) => `"public"."${t.replace(/"/g, '""')}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}

/**
 * The one call a `tests/db/` file needs.
 *
 * Registers, in order:
 *   beforeAll  -- assert configuration, connect, prove the connection, reset
 *   beforeEach -- reset, so no test can see another test's rows
 *   afterAll   -- disconnect, so Jest exits instead of hanging on an open pool
 *
 * Put it at the top level of the file (not inside a `describe`) unless you want
 * the reset to apply only to that block.
 */
export function setupTestDatabase(): void {
  beforeAll(async () => {
    await connectDatabase();
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });
}
