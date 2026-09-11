import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';

// P-36 (ESC-3, migration window 01) — the suppression lists were a Set and two
// arrays, one pair per channel:
//
//   email/workflows.ts:53  const suppressedEmails    = new Set<string>();
//   email/workflows.ts:54  const unsubscribeRecords: UnsubscribeRecord[] = [];
//   sms/workflows.ts:30    const optOutRecords: SmsOptOutRecord[] = [];
//   sms/workflows.ts:31    const optOutIndex         = new Set<string>();
//
// They are one table because they are one question — "may we contact this
// address?" — asked of two channels, and because the answer must survive both
// a restart and the deletion of whatever contact record happened to exist when
// it was given.
//
// THE HONEST FRAMING, because P-33 corrected the card that produced this and
// the correction is the useful part: neither workflows module has a single
// production importer. No route sends email or SMS through them. So nothing has
// ever been suppressed, because nothing has ever been sent — this is a latent
// compliance defect, not a live CAN-SPAM/TCPA exposure. It is fixed now because
// these are the modules a send feature will be built on, and a suppression list
// is far cheaper to make durable before that than after.
//
// WHY NOT `Contact.preferences` OR `ContactCallPreference.doNotCall`: both are
// keyed to a Contact row. A suppression list has to work for an address with no
// Contact at all (a batch recipient, a hard bounce) and has to SURVIVE that
// contact's deletion — putting it on Contact means deleting a contact silently
// re-enables sending to someone who unsubscribed, which is precisely the
// failure the law is about. `ConsentReceipt` is an AI-action receipt
// (`actionId` / `impacted[]` / `reversible`) with no entity scope and no unique
// key.
//
// A FINDING ABOUT THE AUTHORIZED CONSTRAINT, recorded where it bites:
// `@@unique([channel, address, entityId, scope])` does NOT constrain the
// platform-wide rows, because `entityId` is nullable and Postgres indexes NULLs
// as DISTINCT — `CREATE UNIQUE INDEX` in the migration carries no
// `NULLS NOT DISTINCT`, and Prisma cannot emit one. It is a real constraint for
// every entity-scoped row. `recordOptOut` therefore guards the platform-wide
// case with a read and lets the index reject the entity-scoped case, and says
// so at the branch. Duplicate rows here would be harmless (suppression is an
// existence question, unlike webhook idempotency, where a duplicate means the
// handler runs twice) but a table that looks constrained and is not is the sort
// of thing the next audit should not have to rediscover.

export type OptOutChannel = 'email' | 'sms';

/** Where an opt-out came from. Free text in the column; these are the values
 *  this codebase writes. */
export type OptOutSource = 'unsubscribe' | 'hard_bounce' | 'opt_out_keyword';

export interface OptOutRecord {
  entityId: string | null;
  channel: string;
  address: string;
  scope: string;
  reason: string | null;
  source: string;
  optedOutAt: Date;
}

/**
 * The database refused the write because a unique index already holds this row.
 *
 * Written as a CODE check with an `instanceof` fast path rather than
 * `instanceof` alone, mirroring `errorCodeOf` in
 * lib/observability/prisma-instrumentation.ts. `instanceof` compares class
 * identity, and class identity is per module instance: a `jest.resetModules()`
 * restart -- the very thing tests/db/migration-window-01.test.ts uses to prove
 * this table survives one -- hands the re-imported module a NEW
 * `@prisma/client` while the client itself is the `globalThis` singleton
 * created under the old one. The error is then a `PrismaClientKnownRequestError`
 * that fails `instanceof PrismaClientKnownRequestError`, the P2002 branch is
 * skipped, and a duplicate webhook delivery becomes an unhandled 500 instead of
 * an `ignored`. Found by that test, which is the argument for writing it.
 */
function prismaErrorCode(err: unknown): string | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code;
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return prismaErrorCode(err) === 'P2002';
}

/**
 * Record that an address must not be contacted.
 *
 * Idempotent: recording the same opt-out twice leaves one row and never throws.
 */
export async function recordOptOut(params: {
  channel: OptOutChannel;
  address: string;
  entityId?: string | null;
  scope?: string;
  source: OptOutSource;
  reason?: string;
}): Promise<void> {
  const entityId = params.entityId ?? null;
  const scope = params.scope ?? 'all';

  if (entityId === null) {
    // The unique index cannot see this one (NULLS DISTINCT), so the read is the
    // guard. See the note at the top of this file.
    const existing = await prisma.communicationOptOut.findFirst({
      where: { channel: params.channel, address: params.address, entityId: null, scope },
      select: { id: true },
    });
    if (existing) return;
  }

  try {
    await prisma.communicationOptOut.create({
      data: {
        channel: params.channel,
        address: params.address,
        entityId,
        scope,
        source: params.source,
        reason: params.reason ?? null,
      },
    });
  } catch (err) {
    // The index already holds this opt-out. That is the desired end state.
    if (!isUniqueViolation(err)) throw err;
  }
}

/** Undo an opt-out (an opt-in). Returns how many rows were removed. */
export async function removeOptOut(params: {
  channel: OptOutChannel;
  address: string;
  entityId?: string | null;
  scope?: string;
}): Promise<number> {
  const where: Prisma.CommunicationOptOutWhereInput = {
    channel: params.channel,
    address: params.address,
    entityId: params.entityId ?? null,
  };
  if (params.scope !== undefined) where.scope = params.scope;

  const removed = await prisma.communicationOptOut.deleteMany({ where });
  return removed.count;
}

/**
 * Is this address opted out?
 *
 * `scopes` is the set of scopes that would block the send: `['all']` for an
 * unconditional check, `['all', 'marketing']` when sending a marketing message.
 */
export async function hasOptedOut(params: {
  channel: OptOutChannel;
  address: string;
  entityId?: string | null;
  scopes?: string[];
  source?: OptOutSource;
}): Promise<boolean> {
  const where: Prisma.CommunicationOptOutWhereInput = {
    channel: params.channel,
    address: params.address,
    entityId: params.entityId ?? null,
    scope: { in: params.scopes ?? ['all'] },
  };
  if (params.source !== undefined) where.source = params.source;

  const hit = await prisma.communicationOptOut.findFirst({ where, select: { id: true } });
  return hit !== null;
}

/** Every opt-out matching a filter, oldest first. */
export async function listOptOuts(params: {
  channel: OptOutChannel;
  entityId?: string | null;
  source?: OptOutSource;
}): Promise<OptOutRecord[]> {
  const where: Prisma.CommunicationOptOutWhereInput = { channel: params.channel };
  if (params.entityId !== undefined) where.entityId = params.entityId;
  if (params.source !== undefined) where.source = params.source;

  const rows = await prisma.communicationOptOut.findMany({
    where,
    orderBy: { optedOutAt: 'asc' },
  });

  return rows.map((row) => ({
    entityId: row.entityId,
    channel: row.channel,
    address: row.address,
    scope: row.scope,
    reason: row.reason,
    source: row.source,
    optedOutAt: row.optedOutAt,
  }));
}

/** Exposed for testing. A restart does NOT do this — that is the point. */
export async function _resetOptOuts(): Promise<void> {
  await prisma.communicationOptOut.deleteMany();
}
