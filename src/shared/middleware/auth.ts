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
 * Returns 400 if no entity can be resolved, 404 if it does not exist, 403 if it
 * belongs to someone else.
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
      return error(
        'ENTITY_REQUIRED',
        'No entity in scope. Pass entityId, or switch to an entity first.',
        400
      );
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
      return error('FORBIDDEN', 'You do not have access to this entity', 403);
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

    return entity.id as VerifiedEntityId;
  } catch {
    return null;
  }
}
