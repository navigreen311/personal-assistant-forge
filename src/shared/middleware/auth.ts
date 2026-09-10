import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';
import { error } from '@/shared/utils/api-response';
import type { AuthSession, UserRole } from '@/lib/auth/types';

export async function withAuth(
  req: NextRequest,
  handler: (req: NextRequest, session: AuthSession) => Promise<Response>
): Promise<Response> {
  let token;
  try {
    token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  } catch {
    return error('AUTH_ERROR', 'Failed to verify authentication token', 401);
  }

  if (!token?.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const session: AuthSession = {
    userId: token.userId,
    email: token.email ?? '',
    name: token.name ?? '',
    role: token.role ?? 'viewer',
    activeEntityId: token.activeEntityId,
  };

  return handler(req, session);
}

export async function withRole(
  req: NextRequest,
  roles: UserRole[],
  handler: (req: NextRequest, session: AuthSession) => Promise<Response>
): Promise<Response> {
  return withAuth(req, async (innerReq, session) => {
    if (!roles.includes(session.role)) {
      return error('FORBIDDEN', 'Insufficient permissions', 403);
    }

    return handler(innerReq, session);
  });
}

export async function withEntityAccess(
  req: NextRequest,
  entityId: string,
  handler: (req: NextRequest, session: AuthSession) => Promise<Response>
): Promise<Response> {
  return withAuth(req, async (innerReq, session) => {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
    });

    if (!entity) {
      return error('NOT_FOUND', 'Entity not found', 404);
    }

    if (entity.userId !== session.userId) {
      return error('FORBIDDEN', 'You do not have access to this entity', 403);
    }

    return handler(innerReq, session);
  });
}

// ============================================================================
// === P-00 COORDINATOR — TENANCY INTERFACE ===
//
// FROZEN at P-00 merge. Ten module packages (P-04..P-14) build against this
// file independently. If you believe it is wrong: STOP and escalate. Do not
// edit it, and do not work around it.
//
// WHY THIS EXISTS
//
// The audit found 149 of 335 routes calling withAuth and then discarding the
// session as `_session`, taking entityId from the caller's own request body or
// query string. withEntityAccess was correct but imported by exactly one route.
// The result: an authenticated user of entity A can read and write entity B by
// passing B's id. Authenticated, but not authorized.
//
// withEntityAccess (above) is not enough on its own, because it requires the
// route to already hold an entityId and to remember to call it. Forgetting is
// silent. The two additions below make the correct thing the easy thing and the
// wrong thing a compile error.
// ============================================================================

/**
 * An entityId that has been proven to belong to the authenticated caller.
 *
 * This is a branded type: it is a string at runtime and costs nothing, but a
 * plain `string` is NOT assignable to it. Service functions that take a
 * VerifiedEntityId therefore cannot be called with a raw value off the request
 * body -- that is a type error, caught by `tsc --noEmit` in CI rather than by
 * review.
 *
 * The only way to obtain one is withEntityScope below, which checks ownership.
 *
 * P-04 is the reference implementation of this pattern; see
 * docs/parallel-build/tenancy-pattern.md.
 */
export type VerifiedEntityId = string & { readonly __verifiedEntity: unique symbol };

/**
 * Resolve the entity this request is acting on, prove the caller owns it, and
 * hand the handler a VerifiedEntityId.
 *
 * Resolution order:
 *   1. explicit `entityId` argument (route already parsed it, e.g. a path param)
 *   2. `?entityId=` query parameter
 *   3. `entityId` in the JSON body
 *   4. the session's activeEntityId
 *
 * Ownership is then checked against the database in every case. Where the value
 * came from does not matter -- a caller-supplied id is fine precisely because it
 * is verified before the handler ever sees it.
 *
 * P-30 / DECISION 1: ownership is necessary and NOT sufficient. Whatever the
 * resolution order lands on must ALSO be the entity the session is currently
 * acting in (`session.activeEntityId`, moved by `POST /api/auth/switch-entity`).
 * So steps 1-3 no longer choose a tenant; they only say which tenant the
 * request is ABOUT, and the session says which tenant the caller is IN. The two
 * must agree. See the block inside the function for the full reasoning.
 *
 * Returns 400 if no entity can be resolved OR the session is acting in none,
 * 404 if the entity does not exist, 403 if it belongs to someone else, and 403
 * `ENTITY_SCOPE_MISMATCH` if it is another of the caller's OWN entities.
 */
export async function withEntityScope(
  req: NextRequest,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>,
  explicitEntityId?: string
): Promise<Response> {
  return withAuth(req, async (innerReq, session) => {
    let candidate: string | undefined = explicitEntityId;

    if (!candidate) {
      candidate = innerReq.nextUrl.searchParams.get('entityId') ?? undefined;
    }

    if (!candidate && innerReq.method !== 'GET' && innerReq.method !== 'DELETE') {
      // Read the body without consuming it for the handler: clone first.
      try {
        const body = await innerReq.clone().json();
        if (body && typeof body === 'object' && typeof body.entityId === 'string') {
          candidate = body.entityId;
        }
      } catch {
        // Body absent or not JSON -- fall through to the session default.
      }
    }

    if (!candidate) {
      candidate = session.activeEntityId;
    }

    if (!candidate) {
      // P-30: was "Pass entityId, or switch to an entity first." Under
      // Decision 1 passing `entityId` no longer helps a session that is acting
      // in no entity -- see the block below -- so the advice would have been
      // wrong in the one situation that reaches it. Only the wording changed;
      // the code and the status are what tests assert and both are untouched.
      return error('ENTITY_REQUIRED', 'No entity in scope. Switch to an entity first.', 400);
    }

    const entity = await prisma.entity.findUnique({
      where: { id: candidate },
      select: { id: true, userId: true },
    });

    if (!entity) {
      return error('NOT_FOUND', 'Entity not found', 404);
    }

    if (entity.userId !== session.userId) {
      // Deliberately the same shape as a genuine 403, and deliberately not
      // distinguishable from "exists but not yours" in the message body.
      //
      // THIS CHECK RUNS FIRST AND IS UNCHANGED. Decision 1 ADDS the rule below;
      // it does not replace this one. ~138 cross-USER refusal cases across
      // eleven module suites assert exactly this status and this code, and they
      // must keep asserting it -- a caller naming a stranger's entity must not
      // be told "wrong scope", which would confirm the id exists.
      return error('FORBIDDEN', 'You do not have access to this entity', 403);
    }

    // -----------------------------------------------------------------------
    // DECISION 1 (P-30) — OWNERSHIP IS NECESSARY AND NO LONGER SUFFICIENT.
    //
    // docs/parallel-build/decision-01-entity-isolation.md, decided by the owner
    // 2026-09-10:
    //
    //   "The Green Companies architecture is built around entity separation --
    //    different compliance profiles (HIPAA on MedLink, not on CRE Forge),
    //    different disclosure rules, different contacts, different VIP lists. A
    //    request scoped to Entity A touching Entity B's records is a bug, even
    //    when the same person owns both."
    //
    // Everything above resolves WHICH ENTITY OWNS THE THING BEING ADDRESSED.
    // Until this rule existed, resolving it was the same act as being allowed
    // into it, so addressing a row by id silently moved the caller into
    // whatever entity owned that row.
    //
    // WHY THE RULE LIVES HERE AND NOT IN THE ROUTES
    //
    // `src/app/api/**` holds 49 local `with<Thing>Scope` helpers in 49 route
    // files, and all 49 pass the addressed row's OWN `entityId` into this
    // function as `explicitEntityId` (52 direct call sites plus the two inside
    // `audit-wiring.ts` that the audited helpers funnel through). P-04 wrote
    // `withTaskScope` as the reference implementation and every module copied
    // it. All 49 are corrected by this one rule, by construction, with no edit
    // to any of them: they keep resolving the owning entity, and resolving it
    // stops being permission to enter it.
    //
    // THE ABSENT-CLAIM CASE IS STRICT, DELIBERATELY.
    //
    // A session with no `activeEntityId` is acting in no entity, so it may not
    // reach into one by naming it. Falling back to ownership here would mean a
    // token that merely OMITS the claim bypasses isolation entirely -- the
    // precise shape of the worst defect the original audit found, recorded in
    // `resolveVerifiedEntityId`'s comment below: `withHIPAAGuard` "passed
    // through when the header was absent -- so a caller disabled PHI protection
    // by sending nothing at all". A rule that any caller can switch off by
    // sending less is not a rule.
    //
    // This costs nothing real: both supported sign-up paths create a default
    // `Personal` entity before the session is minted (`POST /api/auth/register`
    // and the Google `signIn` callback), and `authOptions.callbacks.jwt` sets
    // `activeEntityId` from `entities[0]` at sign-in, so every session issued by
    // this product has the claim. A session without it can only come from a User
    // row created outside those paths, and it recovers with one call to
    // `POST /api/auth/switch-entity` -- proved by
    // `tests/db/entity-switching.test.ts`, "switches a token that has no
    // activeEntityId at all". The existing `ENTITY_REQUIRED` 400 is reused
    // because it is the same condition, reached from the other direction.
    //
    // 403, NOT 404 — the open question the decision left to this package.
    //
    // The 404 argument is that the `[id]` helpers already 404 for a missing row,
    // so matching them stops a caller distinguishing "no such row" from "not in
    // this scope". That argument is about an EXISTENCE LEAK, and there is none
    // to plug here: this branch is reachable only after the ownership check
    // above has passed, i.e. only when the caller owns the entity in question
    // and therefore already knows it exists. Nothing is disclosed that the
    // caller could not read off `GET /api/entities`.
    //
    // What 404 would cost is real: the UI would be told the record vanished,
    // when in fact it is one `switch-entity` call away. So this is a distinct,
    // honest, actionable code. Note the asymmetry is safe in the direction that
    // matters -- a caller probing a STRANGER's id still gets the indistinct
    // `FORBIDDEN` above, never this one.
    // -----------------------------------------------------------------------
    if (!session.activeEntityId) {
      return error(
        'ENTITY_REQUIRED',
        'No entity in scope. Switch to an entity first.',
        400
      );
    }

    if (entity.id !== session.activeEntityId) {
      return error(
        'ENTITY_SCOPE_MISMATCH',
        'That entity is not the one you are acting in. Switch to it first.',
        403
      );
    }

    return handler(innerReq, session, entity.id as VerifiedEntityId);
  });
}

/**
 * The verified actor for an audit entry.
 *
 * Before P-00, three call sites read the audit actor from the `x-user-id`
 * REQUEST HEADER (shared/middleware/compliance.ts:261 and
 * shared/middleware/security.ts:60,208). A client sets its own headers, so the
 * actor on a tamper-evident audit record was chosen by the party being audited.
 * The hash chain was real cryptography over a forgeable input.
 *
 * Returns null when there is no valid token, so callers can record 'anonymous'
 * explicitly rather than trusting a header that says so.
 */
export async function resolveActor(
  req: NextRequest
): Promise<{ actor: string; actorId: string } | null> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.userId) return null;
    return { actor: token.email ?? token.userId, actorId: token.userId };
  } catch {
    return null;
  }
}

/**
 * Resolve the entity in scope and prove the caller owns it, or return null.
 *
 * Same resolution and ownership check as withEntityScope, but usable outside a
 * handler wrapper -- for middleware that needs to know which tenant it is acting
 * for. Returns null when nothing can be verified, so callers must decide
 * explicitly whether to fail open or closed. For anything protecting regulated
 * data, fail closed.
 *
 * Before P-00, four sites in shared/middleware/compliance.ts and one in
 * security.ts read the entity from the `x-entity-id` REQUEST HEADER. A client
 * sets its own headers, so the tenant whose compliance profile got enforced was
 * chosen by the caller. withHIPAAGuard was the worst case: omitting the header
 * entirely made it pass through, so PHI protection was disabled by sending
 * nothing at all.
 */
export async function resolveVerifiedEntityId(
  req: NextRequest
): Promise<VerifiedEntityId | null> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.userId) return null;

    const candidate =
      req.nextUrl.searchParams.get('entityId') ?? token.activeEntityId ?? undefined;
    if (!candidate) return null;

    const entity = await prisma.entity.findUnique({
      where: { id: candidate },
      select: { id: true, userId: true },
    });
    if (!entity || entity.userId !== token.userId) return null;

    // P-30 / Decision 1, the same rule `withEntityScope` applies, for the same
    // reason. This function answers "which tenant is this request acting for",
    // and its callers use the answer to pick a COMPLIANCE PROFILE and to stamp
    // an audit row. If a request naming entity B from a session acting in A is
    // going to be refused, then it is not acting for B, and enforcing B's HIPAA
    // profile or filing the row under B would both be false. Returning null is
    // the fail-closed answer every caller here is already written for:
    // `withHIPAAGuard` refuses, `withConsentCheck` refuses, the classification
    // guard keeps the STRICTER default, and the audit rows record
    // `UNRESOLVED_ENTITY` / 'unknown' rather than a tenant that was never in
    // scope.
    if (!token.activeEntityId || entity.id !== token.activeEntityId) return null;

    return entity.id as VerifiedEntityId;
  } catch {
    return null;
  }
}

// ============================================================================
// === P-00b AMENDMENT (2026-09-09) — server-side paths to a VerifiedEntityId ===
//
// Added by the coordinator after P-04, the reference implementation, reported
// that the interface as frozen had no supported way to obtain the brand outside
// an HTTP request. Every module has code that acts on an entity with no request
// in play: a worker, a cron job, a webhook pipeline, an AI job. P-04 was
// correctly forbidden from casting, so it had to invent a module-local escape
// hatch. Nine more packages would have invented nine more, with nine names.
//
// This is the amendment window described in the coordination plan: additive
// only, coordinator-signed, landed between waves.
//
// There are TWO situations here and they are NOT the same. Conflating them into
// one helper would have been worse than the cast, because it would let the
// weaker one masquerade as the stronger.
// ============================================================================

/**
 * Prove an entity belongs to a user, outside a request.
 *
 * For trusted server-side code that already knows *whose* work it is doing --
 * a scheduled job running a named user's workflow, a webhook handler that has
 * resolved an account. This performs the same database ownership check as
 * `withEntityScope`; it simply does not need a `NextRequest` to do it.
 *
 * Returns null when the entity does not exist or is not that user's, so callers
 * must handle refusal explicitly rather than receiving a throw they might catch
 * and ignore.
 */
export async function verifyEntityForUser(
  entityId: string,
  userId: string
): Promise<VerifiedEntityId | null> {
  if (!entityId || !userId) return null;

  const entity = await prisma.entity.findFirst({
    where: { id: entityId, userId },
    select: { id: true },
  });

  return entity ? (entity.id as VerifiedEntityId) : null;
}

// entityFromTrustedRecord() was drafted here and DELIBERATELY NOT SHIPPED.
//
// It would have been a named, greppable cast for server-side code that has no
// user to verify against. P-04 demonstrated a strictly better answer for that
// case and shipped it: two public entry points over one private write --
// createTask(params, userId), which proves ownership, and
// createTaskForEntityOwner(params), which takes a plain string and is only
// reachable from code holding a value off a database row. It never mints the
// brand at all, so there is no cast to misuse.
//
// Adding a weaker alternative beside a working stronger one would have meant
// nine followers reaching for whichever was easier at 5pm. The convention is
// therefore the dual entry point, named <verb><Noun>ForEntityOwner so that
// grep -rn ForEntityOwner src/ finds every trusted write in the codebase.
// See docs/parallel-build/tenancy-pattern.md.
