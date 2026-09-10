/**
 * P-36 — a fake Prisma delegate that is a TABLE, not a stub.
 *
 * ============================================================================
 * WHY THIS EXISTS, AND WHAT IT IS EXPLICITLY NOT
 * ============================================================================
 *
 * Migration window 01 moved four in-memory stores into Postgres. The unit tests
 * over those modules already performed round trips — record an opt-out then ask
 * whether the address is suppressed; add a version then read the version list —
 * and those round trips are the part worth keeping. `jest.fn()` stubs would
 * replace them with assertions about a stub's return value, which is how a test
 * comes to encode the defect rather than catch it.
 *
 * So this is a small in-memory table with the query semantics the code under
 * test actually uses. P-33 wrote one of these by hand inside each mock factory;
 * this is the same idea, extracted, because four files needed it in one package.
 *
 * **A Map inside a mock factory proves LOGIC. It cannot prove PERSISTENCE,
 * because a Map inside a mock factory is precisely the thing that was wrong.**
 * Persistence is proved against real Postgres across a `jest.resetModules()`
 * restart in `tests/db/migration-window-01.test.ts`. Nothing here is evidence
 * that anything survives anything.
 *
 * One behaviour IS faithful on purpose: a unique constraint whose tuple
 * contains a NULL does not conflict, because Postgres indexes NULLs as DISTINCT
 * and `CommunicationOptOut` has a nullable `entityId` in its unique key. A fake
 * that enforced uniqueness there would disagree with the database it stands in
 * for, in the direction that hides a bug.
 */

import { Prisma } from '@prisma/client';

export type Row = Record<string, unknown>;

export interface RelationSpec {
  /** The table holding the related rows. */
  table: () => FakeTable;
  /** The column on the related row pointing back at this one. */
  foreignKey: string;
  /** Delete related rows when the parent goes (ON DELETE CASCADE). */
  cascade?: boolean;
}

export interface TableOptions {
  /** Named unique inputs, Prisma-style: `{ provider_eventId: ['provider', 'eventId'] }`. */
  uniques?: Record<string, string[]>;
  /** Column defaults applied on create, evaluated per row. */
  defaults?: () => Row;
  /** Columns behaving like `@updatedAt`. */
  touch?: string[];
  /** Relation fields usable in `include` and nested `create`. */
  relations?: Record<string, RelationSpec>;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `fake_${idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

function isPlainObject(value: unknown): value is Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function uniqueViolation(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'fake-table',
    meta: { target },
  });
}

function matchValue(actual: unknown, cond: unknown): boolean {
  if (cond === null) return actual === null || actual === undefined;
  if (cond instanceof Date) return actual instanceof Date && actual.getTime() === cond.getTime();

  if (isPlainObject(cond)) {
    if ('in' in cond) return (cond.in as unknown[]).some((v) => matchValue(actual, v));
    if ('notIn' in cond) return !(cond.notIn as unknown[]).some((v) => matchValue(actual, v));
    if ('lte' in cond) {
      return (
        actual instanceof Date && cond.lte instanceof Date && actual.getTime() <= cond.lte.getTime()
      );
    }
    if ('lt' in cond) {
      return (
        actual instanceof Date && cond.lt instanceof Date && actual.getTime() < cond.lt.getTime()
      );
    }
    if ('not' in cond) return !matchValue(actual, cond.not);
    if ('hasSome' in cond) {
      return Array.isArray(actual) && (cond.hasSome as unknown[]).some((v) => actual.includes(v));
    }
    if ('contains' in cond) {
      if (typeof actual !== 'string') return false;
      const needle = String(cond.contains);
      return cond.mode === 'insensitive'
        ? actual.toLowerCase().includes(needle.toLowerCase())
        : actual.includes(needle);
    }
    throw new Error(`fake table: unsupported filter ${JSON.stringify(cond)}`);
  }

  return actual === cond;
}

function matchWhere(row: Row, where?: Row): boolean {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;
    if (key === 'OR') {
      if (!(value as Row[]).some((clause) => matchWhere(row, clause))) return false;
      continue;
    }
    if (key === 'AND') {
      if (!(value as Row[]).every((clause) => matchWhere(row, clause))) return false;
      continue;
    }
    if (!matchValue(row[key], value)) return false;
  }
  return true;
}

function applyData(row: Row, data: Row, relations: Record<string, RelationSpec>): Row {
  const next = { ...row };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || key in relations) continue;
    if (isPlainObject(value) && 'increment' in value) {
      next[key] = Number(next[key] ?? 0) + Number(value.increment);
      continue;
    }
    if (isPlainObject(value) && 'set' in value) {
      next[key] = value.set;
      continue;
    }
    next[key] = value;
  }
  return next;
}

function project(row: Row, select?: Row): Row {
  if (!select) return row;
  const out: Row = {};
  for (const [key, wanted] of Object.entries(select)) {
    if (wanted) out[key] = row[key];
  }
  return out;
}

export class FakeTable {
  private rows: Row[] = [];
  private readonly options: TableOptions;

  constructor(options: TableOptions = {}) {
    this.options = options;
  }

  /** Direct access for a test that wants to assert on stored state. */
  all(): Row[] {
    return this.rows.map((row) => ({ ...row }));
  }

  clear(): void {
    this.rows = [];
  }

  private relations(): Record<string, RelationSpec> {
    return this.options.relations ?? {};
  }

  /**
   * Postgres semantics: a unique tuple containing NULL never conflicts.
   * `CommunicationOptOut`'s unique key includes a nullable `entityId`, and the
   * production code depends on knowing that.
   */
  private assertUnique(candidate: Row, ignoreRow?: Row): void {
    const uniques = { id: ['id'], ...(this.options.uniques ?? {}) };
    for (const columns of Object.values(uniques)) {
      if (columns.some((col) => candidate[col] === null || candidate[col] === undefined)) continue;
      const clash = this.rows.some(
        (row) => row !== ignoreRow && columns.every((col) => row[col] === candidate[col])
      );
      if (clash) throw uniqueViolation(columns);
    }
  }

  private hydrate(row: Row, include?: Row): Row {
    const out = { ...row };
    if (!include) return out;
    for (const [field, spec] of Object.entries(this.relations())) {
      const wanted = include[field];
      if (!wanted) continue;
      const orderBy = isPlainObject(wanted) ? (wanted.orderBy as Row | undefined) : undefined;
      let related = spec
        .table()
        .all()
        .filter((child) => child[spec.foreignKey] === row.id);
      related = sortRows(related, orderBy);
      out[field] = related;
    }
    return out;
  }

  async create(args: { data: Row; include?: Row; select?: Row }): Promise<Row> {
    const relations = this.relations();
    const row: Row = {
      id: nextId(),
      ...(this.options.defaults?.() ?? {}),
      createdAt: new Date(),
    };
    for (const column of this.options.touch ?? []) row[column] = new Date();

    const built = applyData(row, args.data, relations);
    this.assertUnique(built);
    this.rows.push(built);

    for (const [field, spec] of Object.entries(relations)) {
      const nested = args.data[field];
      if (!isPlainObject(nested)) continue;
      const toCreate = nested.create;
      const list = Array.isArray(toCreate) ? toCreate : toCreate ? [toCreate] : [];
      for (const child of list) {
        await spec.table().create({ data: { ...(child as Row), [spec.foreignKey]: built.id } });
      }
    }

    return project(this.hydrate(built, args.include), args.select);
  }

  async findUnique(args: { where: Row; include?: Row; select?: Row }): Promise<Row | null> {
    return this.findFirst(args);
  }

  async findFirst(args: { where?: Row; include?: Row; select?: Row }): Promise<Row | null> {
    const where = flattenCompoundWhere(args.where, this.options.uniques);
    const hit = this.rows.find((row) => matchWhere(row, where));
    return hit ? project(this.hydrate(hit, args.include), args.select) : null;
  }

  async findMany(args: {
    where?: Row;
    include?: Row;
    select?: Row;
    orderBy?: Row;
    skip?: number;
    take?: number;
  } = {}): Promise<Row[]> {
    const where = flattenCompoundWhere(args.where, this.options.uniques);
    let hits = this.rows.filter((row) => matchWhere(row, where));
    hits = sortRows(hits, args.orderBy);
    if (args.skip) hits = hits.slice(args.skip);
    if (args.take !== undefined) hits = hits.slice(0, args.take);
    return hits.map((row) => project(this.hydrate(row, args.include), args.select));
  }

  async count(args: { where?: Row } = {}): Promise<number> {
    const where = flattenCompoundWhere(args.where, this.options.uniques);
    return this.rows.filter((row) => matchWhere(row, where)).length;
  }

  async update(args: { where: Row; data: Row; include?: Row; select?: Row }): Promise<Row> {
    const where = flattenCompoundWhere(args.where, this.options.uniques);
    const index = this.rows.findIndex((row) => matchWhere(row, where));
    if (index === -1) {
      throw new Prisma.PrismaClientKnownRequestError('Record to update not found', {
        code: 'P2025',
        clientVersion: 'fake-table',
      });
    }
    const updated = applyData(this.rows[index], args.data, this.relations());
    for (const column of this.options.touch ?? []) updated[column] = new Date();
    this.assertUnique(updated, this.rows[index]);
    this.rows[index] = updated;
    return project(this.hydrate(updated, args.include), args.select);
  }

  async updateMany(args: { where?: Row; data: Row }): Promise<{ count: number }> {
    const where = flattenCompoundWhere(args.where, this.options.uniques);
    let count = 0;
    this.rows = this.rows.map((row) => {
      if (!matchWhere(row, where)) return row;
      count += 1;
      const updated = applyData(row, args.data, this.relations());
      for (const column of this.options.touch ?? []) updated[column] = new Date();
      return updated;
    });
    return { count };
  }

  async upsert(args: { where: Row; create: Row; update: Row; include?: Row }): Promise<Row> {
    const where = flattenCompoundWhere(args.where, this.options.uniques);
    const existing = this.rows.find((row) => matchWhere(row, where));
    if (existing) return this.update({ where: args.where, data: args.update, include: args.include });
    return this.create({ data: { ...where, ...args.create }, include: args.include });
  }

  async deleteMany(args: { where?: Row } = {}): Promise<{ count: number }> {
    const where = flattenCompoundWhere(args.where, this.options.uniques);
    const doomed = this.rows.filter((row) => matchWhere(row, where));
    this.rows = this.rows.filter((row) => !matchWhere(row, where));

    for (const spec of Object.values(this.relations())) {
      if (!spec.cascade) continue;
      for (const parent of doomed) {
        await spec.table().deleteMany({ where: { [spec.foreignKey]: parent.id } });
      }
    }

    return { count: doomed.length };
  }
}

function sortRows(rows: Row[], orderBy?: Row): Row[] {
  if (!orderBy) return rows;
  const [field, direction] = Object.entries(orderBy)[0] ?? [];
  if (!field) return rows;
  const sign = direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    const an = av instanceof Date ? av.getTime() : Number(av);
    const bn = bv instanceof Date ? bv.getTime() : Number(bv);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * sign;
    return String(av).localeCompare(String(bv)) * sign;
  });
}

/**
 * Prisma addresses a compound unique through a named object
 * (`{ provider_eventId: { provider, eventId } }`). Flatten it to plain column
 * equality so one matcher handles both forms.
 */
function flattenCompoundWhere(where?: Row, uniques?: Record<string, string[]>): Row | undefined {
  if (!where || !uniques) return where;
  const out: Row = {};
  for (const [key, value] of Object.entries(where)) {
    if (key in uniques && isPlainObject(value)) {
      Object.assign(out, value);
      continue;
    }
    out[key] = value;
  }
  return out;
}
