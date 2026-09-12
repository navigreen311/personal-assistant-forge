// ============================================================================
// Shadow voice sessions — THE OWNER-SCOPED STORE
// ============================================================================
//
// P-41. THE ONE SEAM. Every `prisma.shadowVoiceSession` query that addresses a
// row BY ID lives in this file, and nothing in this file can address a row
// without the owning user, because `userId` is a private field of the object
// that owns the query and is merged into the `where` by the method, not by the
// caller.
//
// ----------------------------------------------------------------------------
// WHY THIS EXISTS
// ----------------------------------------------------------------------------
//
// `interfaces/session-manager.ts` held 13 `shadowVoiceSession` queries keyed on
// a bare `{ id: sessionId }` — 7 `findUnique`, 5 `update`, 1 `delete` — and
// every public method took the session id as a plain string with no user
// anywhere in the signature. P-34 recorded 12 and flagged this file as "the
// largest remaining surface and the one worth a package"; the thirteenth is the
// `delete` inside `deleteSession`, which its by-id sweep did not separate from
// the `findUnique` above it. Either way the shape was the same:
//
//     getSession(sessionId)  ->  findUnique({ where: { id: sessionId } })
//
// A session id is a cuid a client sends in a path segment or a JSON body. So
// the row crossed the tenancy boundary and the CALLERS compensated afterwards:
// eleven route files all contained a hand-written
//
//     if (voiceSession.userId !== session.userId) return 403
//
// That is a check in the caller instead of in the accessor — the exact pattern
// P-30 replaced for 49 route helpers — and two callers had already forgotten
// it. `interfaces/web-chat.ts` called `endSession(sessionId)` and
// `touchSession(sessionId)` on a caller-supplied id with no ownership check at
// all, so a `{ type: 'end_session', sessionId: <someone else's> }` payload
// ended a stranger's session, and a `ping` moved a stranger's
// `lastActivityAt`. Neither is reachable from a route today
// (`webChatHandler` is on P-38's `KNOWN_DEAD` list), which is the only reason
// they were not live cross-tenant writes.
//
// ----------------------------------------------------------------------------
// IT IS THE SAME RULE AS THE ROUTES AND THE TOOLS, ON THE AXIS THAT APPLIES
// ----------------------------------------------------------------------------
//
// This is NOT a third notion of scope. P-30 put entity isolation inside
// `withEntityScope`; P-34 put it inside `ShadowEntityScope` for the agent's
// tools. Both scope on `entityId`, and P-34's escalation records why that is
// the wrong instrument here:
//
//   > Almost every Shadow-owned table is USER-scoped, not entity-scoped.
//
// `ShadowVoiceSession` carries `userId` and a NULLABLE `activeEntityId`; only
// `ShadowConsentReceipt` and `ShadowRetentionConfig` in this module carry
// `entityId`. A session is owned by a person and moves between that person's
// entities during its life, so the owner is the only filter that is always
// correct. `VerifiedEntityId` is deliberately not used: there is no entity to
// verify on a session with `activeEntityId: null`, and minting the brand for a
// row that has no entity would weaken the brand for everybody who does.
//
// ----------------------------------------------------------------------------
// WHAT A CROSS-TENANT LOOKUP LOOKS LIKE FROM OUTSIDE
// ----------------------------------------------------------------------------
//
// Exactly like a session that does not exist. `findById` returns `null` and
// every mutating method throws the pre-existing `Session <id> not found`.
//
// That is P-34's reasoning applied here: a distinguishable "that exists but is
// not yours" makes every endpoint holding a session id an existence oracle for
// cuids. And — the part that matters more than the wording — there is NO BRANCH
// that could accidentally carry a distinction. The scoping and the refusal are
// the same act: `findFirst({ id, userId })` returns null, and null is the only
// failure a caller can observe. A future edit cannot make the two cases diverge
// without deleting the query.
//
// The mutating methods ALSO carry `userId` in their own `where`, even though
// each is reached only after `findById` has proved ownership. The read and the
// write are separate statements against a live database, and "resolve an id,
// then trust it" is the defect this package exists to close. `userId` is a
// legal member of `ShadowVoiceSessionWhereUniqueInput` under Prisma's
// extended-where-unique, so an `update` whose filter misses raises P2025 — the
// same error as a missing row, which is the same refusal.
//
// ----------------------------------------------------------------------------
// HOW A NEW LOOKUP IS CORRECT BY DEFAULT
// ----------------------------------------------------------------------------
//
//   1. `session-manager.ts` no longer imports `@/lib/db`. It cannot:
//      `eslint.config.mjs` forbids that import in that file by path, and
//      `npx eslint` gates CI. A new session read has to come here.
//   2. Every method here closes over `this.#userId`. There is no method that
//      takes a user id as an argument, so there is nothing to pass wrong, and
//      no call site can transpose two strings.
//   3. `#ownedRow` is the only `where` in the file that names `id`. Adding a
//      method means using it; writing a bare `{ id }` filter instead means
//      writing the one thing the file does not otherwise contain.
//
// The single exception is named `updateStaleSessionsAcrossAllUsers`, below, and
// it is deliberately verbose so that an unscoped sweep can never be mistaken
// for an accessor.
// ============================================================================

import type { Prisma, ShadowVoiceSession } from '@prisma/client';
import { prisma } from '@/lib/db';
import { RECEIPT_CONTENT_SCRUB } from '../compliance/receipt-retention';
import type { ChannelHistoryEntry } from './types';

// ---------------------------------------------------------------------------
// The field set a caller may write
// ---------------------------------------------------------------------------

/**
 * The columns `SessionManager` is allowed to update.
 *
 * Narrower than `Prisma.ShadowVoiceSessionUpdateInput` on purpose: `userId` is
 * not in it, so no caller can move a session between owners, and
 * `channelHistory` is a typed array rather than `Json`, so the one untyped
 * column in this model is converted in exactly one place.
 */
export interface SessionUpdate {
  status?: string;
  currentChannel?: string;
  channelHistory?: ChannelHistoryEntry[];
  lastActivityAt?: Date;
  endedAt?: Date | null;
  totalDurationSeconds?: number;
  messageCount?: number;
  currentPage?: string | null;
  currentWorkflowId?: string | null;
  currentWorkflowStep?: number | null;
  fullTranscript?: string | null;
  aiSummary?: string | null;
}

/** The columns a caller may set when starting a session. `userId` is ours. */
export interface SessionCreate {
  status: string;
  currentChannel: string;
  channelHistory: ChannelHistoryEntry[];
  activeEntityId: string | null;
  currentPage: string | null;
  startedAt: Date;
  lastActivityAt: Date;
  messageCount: number;
  totalDurationSeconds: number;
}

/**
 * `ChannelHistoryEntry[]` as a Prisma JSON input.
 *
 * Built field by field rather than cast. The old code wrote
 * `history as unknown as Parameters<typeof prisma...>['channelHistory']` at
 * five separate call sites; a double cast on the way into the database is how a
 * shape drifts from the reader that validates it (`readChannelHistory`).
 */
function channelHistoryToJson(history: ChannelHistoryEntry[]): Prisma.InputJsonValue {
  return history.map((entry) => {
    const out: Record<string, string> = {
      channel: entry.channel,
      enteredAt: entry.enteredAt,
    };
    if (entry.exitedAt !== undefined) {
      out.exitedAt = entry.exitedAt;
    }
    return out;
  });
}

function toPrismaUpdate(update: SessionUpdate): Prisma.ShadowVoiceSessionUpdateInput {
  const { channelHistory, ...rest } = update;
  if (channelHistory === undefined) {
    return rest;
  }
  return { ...rest, channelHistory: channelHistoryToJson(channelHistory) };
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/**
 * Every `ShadowVoiceSession` query one user is allowed to make.
 *
 * Obtain one with `ownedSessions(userId)`. The user id is private and is merged
 * into every `where`; there is no method that accepts one.
 */
export class OwnedSessionStore {
  readonly #userId: string;

  constructor(userId: string) {
    if (typeof userId !== 'string' || userId.length === 0) {
      // Fail loudly rather than build `where: { userId: undefined }`, which
      // Prisma treats as "no filter" and which would silently restore exactly
      // the cross-tenant read this file exists to prevent.
      throw new Error('OwnedSessionStore requires a non-empty userId');
    }
    this.#userId = userId;
  }

  /** Exposed so a caller can log or compare the owner; not usable as a filter. */
  get userId(): string {
    return this.#userId;
  }

  /**
   * The only `where` in this file that names `id`.
   *
   * Returns a `WhereUniqueInput`, so it is accepted by `findUnique`, `update`
   * and `delete` alike and there is never a reason to hand-write one.
   */
  #ownedRow(sessionId: string): Prisma.ShadowVoiceSessionWhereUniqueInput {
    return { id: sessionId, userId: this.#userId };
  }

  /** This user's sessions, and nothing else, as a reusable filter. */
  #ownedRows(extra?: Prisma.ShadowVoiceSessionWhereInput): Prisma.ShadowVoiceSessionWhereInput {
    return { ...extra, userId: this.#userId };
  }

  /**
   * One session of this user's, or null.
   *
   * `findFirst`, not `findUnique`: null must mean the same thing for "no such
   * row" and "not yours", and a `findUnique` that threw on an unmatched
   * extended filter would make those two observably different.
   */
  async findById(sessionId: string): Promise<ShadowVoiceSession | null> {
    return prisma.shadowVoiceSession.findFirst({ where: this.#ownedRow(sessionId) });
  }

  /** This user's most recent active session, or null. */
  async findActive(): Promise<ShadowVoiceSession | null> {
    return prisma.shadowVoiceSession.findFirst({
      where: this.#ownedRows({ status: 'active' }),
      orderBy: { startedAt: 'desc' },
    });
  }

  /** A new session, owned by this user. `userId` comes from the scope. */
  async create(data: SessionCreate): Promise<ShadowVoiceSession> {
    const { channelHistory, ...rest } = data;
    return prisma.shadowVoiceSession.create({
      data: {
        ...rest,
        channelHistory: channelHistoryToJson(channelHistory),
        userId: this.#userId,
      },
    });
  }

  /**
   * Update one session of this user's.
   *
   * Raises P2025 when the id is not this user's — the same error Prisma raises
   * for a row that does not exist.
   */
  async updateById(sessionId: string, update: SessionUpdate): Promise<ShadowVoiceSession> {
    return prisma.shadowVoiceSession.update({
      where: this.#ownedRow(sessionId),
      data: toPrismaUpdate(update),
    });
  }

  /**
   * End every OTHER active session of this user's.
   *
   * The one-active-session-per-user rule. Scoped to this user for the obvious
   * reason: an `updateMany` on `status: 'active'` without it would end the
   * whole platform's sessions.
   */
  async endOtherActiveSessions(exceptSessionId: string, endedAt: Date): Promise<number> {
    const result = await prisma.shadowVoiceSession.updateMany({
      where: this.#ownedRows({ status: 'active', id: { not: exceptSessionId } }),
      data: { status: 'ended', endedAt },
    });
    return result.count;
  }

  /** A page of this user's sessions, with the matching total. */
  async page(args: {
    status?: string;
    skip: number;
    take: number;
  }): Promise<{ sessions: ShadowVoiceSession[]; total: number }> {
    const where = this.#ownedRows(args.status ? { status: args.status } : undefined);

    const [sessions, total] = await Promise.all([
      prisma.shadowVoiceSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: args.skip,
        take: args.take,
      }),
      prisma.shadowVoiceSession.count({ where }),
    ]);

    return { sessions, total };
  }

  /**
   * Delete one session of this user's: its transcript, its outcome and the
   * session row. THE SINGLE IMPLEMENTATION — every route that deletes one
   * Shadow session reaches this method, because the ruling P-44 implements is
   * about the three of them agreeing.
   *
   * The children are keyed on `sessionId` and carry no `userId` of their own,
   * so the cascade is only safe behind the owner check this method performs
   * first. Keeping the order inside one method is the point: a caller that had
   * to delete the children itself could delete another tenant's transcript and
   * then be refused on the session.
   *
   * WHAT GOES, AND WHAT SURVIVES. P-44, and this is the whole of the ruling:
   *
   *   ShadowMessage         DELETED. The transcript. "A deleted session means
   *                         deleted" — no soft-delete, no tombstone, no copy
   *                         under another label.
   *   ShadowSessionOutcome  DELETED. Derived from the transcript.
   *   ShadowVoiceSession    DELETED, owner in the where clause.
   *
   *   ShadowConsentReceipt  RETAINED, content scrubbed, detached by the FK.
   *                         This line used to be
   *                         `prisma.shadowConsentReceipt.deleteMany({ where: {
   *                         sessionId } })` — the identical line P-17 removed
   *                         from `gdpr-export.ts` and `retention.ts`'s session
   *                         sweep, left live here, reachable from
   *                         `DELETE /api/shadow/conversations/[id]`. A consent
   *                         receipt is the record that a human authorised an
   *                         action; v3 Addition 9.3 requires it survive a
   *                         user-requested deletion with only its content
   *                         scrubbed, and GDPR Article 17(3)(b) is what permits
   *                         that. It keeps `userId` (P-40's column), so the
   *                         surviving row still names the person who authorised
   *                         the action rather than nobody.
   *   ShadowAuthEvent       RETAINED, detached by the FK. Also a `deleteMany`
   *                         here until P-44: it is the record of whether a
   *                         step-up challenge passed or failed, it holds no free
   *                         text to scrub, it has its own `userId`, and
   *                         `retention.ts` already ages it out on the same
   *                         regulatory clock as a receipt. `gdpr-export` has
   *                         retained it since P-17 and said so in its header;
   *                         this path was the one that still destroyed it.
   *
   * Neither survivor needs its `sessionId` nulled by hand: both FKs are
   * `ON DELETE SET NULL` in the baseline migration, so the `delete` below
   * detaches them.
   */
  async deleteById(sessionId: string): Promise<void> {
    const owned = await this.findById(sessionId);
    if (!owned) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // ONE TRANSACTION, and the order in it is load-bearing.
    //
    // The scrub is keyed on `sessionId`, which the FK nulls the instant the last
    // statement runs, so it has to be first — and it has to be in the same
    // transaction, or a failure between the scrub and the delete leaves a
    // session alive with its receipts' reasoning already erased. The interactive
    // route (`DELETE /api/shadow/sessions/[id]`) was the only one of the three
    // that wrapped this, and collapsing the three onto one implementation must
    // not be how that atomicity gets lost.
    //
    // `delete` with the owner in its `where` raises P2025 if the filter misses,
    // which rolls the whole transaction back — the same refusal as the
    // `findById` above, arrived at a second time against a live database rather
    // than trusted from a previous statement.
    await prisma.$transaction([
      prisma.shadowConsentReceipt.updateMany({
        where: { sessionId },
        data: RECEIPT_CONTENT_SCRUB,
      }),
      prisma.shadowMessage.deleteMany({ where: { sessionId } }),
      prisma.shadowSessionOutcome.deleteMany({ where: { sessionId } }),
      prisma.shadowVoiceSession.delete({ where: this.#ownedRow(sessionId) }),
    ]);
  }
}

/** The one way to obtain a store. */
export function ownedSessions(userId: string): OwnedSessionStore {
  return new OwnedSessionStore(userId);
}

// ---------------------------------------------------------------------------
// The one deliberately unscoped sweep
// ---------------------------------------------------------------------------

/**
 * Move every idle session on the platform, for every user, to a new status.
 *
 * The name says "AcrossAllUsers" because that is what it does and because an
 * unscoped `updateMany` on this table must never be reachable through something
 * that reads like an accessor. It is a maintenance sweep — the same shape as
 * `shadow-retention`'s nightly job — and it addresses no row by id, so it
 * cannot be aimed at a chosen tenant.
 *
 * It has NO caller in `src/` today (`cleanupStaleSessions` is exercised only by
 * `tests/unit/shadow/session-manager.test.ts`), which is recorded here rather
 * than fixed: giving a dormant sweep a scheduler is the change P-17's header
 * warns is the one that converts a latent bug into nightly data loss.
 */
export async function updateStaleSessionsAcrossAllUsers(args: {
  fromStatuses: string[];
  idleBefore: Date;
  idleAtOrAfter?: Date;
  status: string;
  endedAt?: Date;
}): Promise<number> {
  const lastActivityAt: Prisma.DateTimeFilter = { lt: args.idleBefore };
  if (args.idleAtOrAfter) {
    lastActivityAt.gte = args.idleAtOrAfter;
  }

  const result = await prisma.shadowVoiceSession.updateMany({
    where: {
      status: args.fromStatuses.length === 1 ? args.fromStatuses[0] : { in: args.fromStatuses },
      lastActivityAt,
    },
    data: args.endedAt ? { status: args.status, endedAt: args.endedAt } : { status: args.status },
  });

  return result.count;
}
