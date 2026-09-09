// ============================================================================
// P-10 / T-002 — THE OTHER HALF OF THE AUDIT LOG: WIRING IT INTO THE REQUEST PATH
// ============================================================================
//
// WHY THIS FILE EXISTS AT ALL
//
// P-00 correction C3: `auditService.logAuditEntry` had exactly four callers,
// all four inside `src/shared/middleware/{security,compliance}.ts`, and those
// middlewares (`withAuditLog`, `withHIPAAGuard`, `withConsentVerification`,
// `withDataClassification`, `withRateLimit`) were imported by no route. So the
// system had a SHA-256 hash chain, a tamper verifier, a CSV compliance export
// — and not one record, ever, under any code path.
//
// Persisting the array to Postgres alone would have shipped an empty table.
// An empty audit table is worse than no audit table, because "no rows" is
// indistinguishable from "nothing happened", and an operator or an auditor
// reading it concludes the second. The absent log at least announces itself.
//
// WHY THE WIRING IS HERE AND NOT IN src/shared/middleware/security.ts
//
// `src/shared/**` is frozen for the parallel build and P-10 may not edit it.
// That constraint turned out to be the better answer anyway:
//
//   * `withAuditLog` there is typed `NextApiHandler`, whose handlers return
//     `NextResponse`. Every route in this package returns `Promise<Response>`
//     via `withAuth` / `withEntityScope`, so composing the two is a type error.
//     Fixing that would have meant editing the frozen file.
//   * More importantly, `withAuditLog` wraps a handler from the OUTSIDE and so
//     must re-derive the tenant with `resolveVerifiedEntityId`, a second token
//     decode and a second database round trip. The helpers below wrap
//     `withEntityScope` from the INSIDE, so they record the exact
//     `VerifiedEntityId` the handler acted on. Those cannot disagree.
//
// `withAuditLog` is left untouched and still available to packages whose routes
// are shaped for it. Nothing here modifies frozen code; it only imports it.
//
// WHAT GETS RECORDED, AND WHAT DELIBERATELY DOES NOT
//
// THE ACTOR IS THE VERIFIED SESSION, NEVER A HEADER. Before P-00, three sites
// read the audit actor from `x-user-id`, so the party being audited chose the
// name on the record; the hash chain was real cryptography over a forgeable
// input. Here the actor is `session.email ?? session.userId` taken from the
// token `withAuth` already verified. When no session was established, the
// actor is the literal `'anonymous'` — recorded explicitly rather than
// inferred from a missing header.
//
// REFUSALS ARE AUDITED. The wrapper sits OUTSIDE the auth and scope checks, so
// 401s and cross-tenant 403s produce rows. A cross-tenant 403 is the single
// most valuable line in a security audit log, and a wrapper placed inside the
// checks would never see one.
//
// A REFUSED REQUEST IS NOT FILED UNDER THE ENTITY IT ASKED FOR. When no entity
// was verified, `entityId` is the sentinel `UNRESOLVED_ENTITY` and the value
// the caller asked for is kept in `details.attemptedEntityId`. Writing the
// attempted id into the `entityId` column would let an attacker inject rows
// into another tenant's hash chain simply by naming it — turning the audit log
// into a write primitive against the tenant it is supposed to protect.
//
// ============================================================================

import type { NextRequest } from 'next/server';
import {
  resolveActor,
  resolveVerifiedEntityId,
  withAuth,
  withEntityScope,
  type VerifiedEntityId,
} from '@/shared/middleware/auth';
import { error } from '@/shared/utils/api-response';
import type { AuthSession, UserRole } from '@/lib/auth/types';
import type { DataClassification } from '@/modules/security/types';
import { auditService } from '@/modules/security/services/audit-service';

/**
 * The `entityId` written when a request never established a verified tenant —
 * an anonymous caller, or one refused at the scope check.
 *
 * A sentinel rather than the requested id, and rather than null, for two
 * reasons: the column is NOT NULL, and filing the row under the tenant the
 * caller merely *named* would attach it to that tenant's hash chain.
 */
export const UNRESOLVED_ENTITY = 'unresolved';

export interface AuditOptions {
  /** Logical resource, e.g. 'crisis' or 'admin.sso'. Indexed with resourceId. */
  resource: string;
  /** Defaults to INTERNAL. Raise it for anything touching regulated data. */
  sensitivityLevel?: DataClassification;
  /**
   * Identifies the specific record acted on, when the route knows it (a path
   * param, say). 'N/A' when the request is not about one record.
   */
  resourceId?: string;
}

/** What the wrapped handler managed to establish before responding. */
interface Established {
  session?: AuthSession;
  entityId?: VerifiedEntityId;
  resourceId?: string;
}

function clientIp(req: NextRequest): string | undefined {
  return (
    req.headers.get('x-forwarded-for') ??
    req.headers.get('x-real-ip') ??
    undefined
  );
}

/**
 * Best-effort read of the entity the caller ASKED for, for the details bag.
 *
 * Never becomes the row's `entityId`. Query string only: reading the body here
 * would consume a stream the handler has already read.
 */
function attemptedEntityId(req: NextRequest): string | undefined {
  return req.nextUrl.searchParams.get('entityId') ?? undefined;
}

/**
 * Run `inner`, then write one audit row describing what happened.
 *
 * The row is written after the response is produced so it can carry the real
 * status code — including the refusals, which is the point.
 *
 * Audit failure never fails the request: a request that succeeded should not
 * be reported as an error because the record of it could not be stored. It is
 * logged loudly instead, so an audit outage is visible rather than silent.
 */
async function recordAround(
  request: NextRequest,
  options: AuditOptions,
  inner: (established: Established) => Promise<Response>,
): Promise<Response> {
  const established: Established = {};
  const startedAt = Date.now();

  const response = await inner(established);

  try {
    // Prefer what the handler proved. Fall back to an independent resolve for
    // routes that refused before a handler ever ran.
    const session = established.session;
    const who = session
      ? { actor: session.email || session.userId, actorId: session.userId }
      : await resolveActor(request);

    const entityId =
      established.entityId ?? (await resolveVerifiedEntityId(request)) ?? UNRESOLVED_ENTITY;

    const requested = attemptedEntityId(request);
    const url = new URL(request.url);

    await auditService.logAuditEntry({
      actor: who?.actor ?? 'anonymous',
      actorId: who?.actorId,
      action: `${request.method} ${url.pathname}`,
      resource: options.resource,
      resourceId: established.resourceId ?? options.resourceId ?? 'N/A',
      entityId,
      ipAddress: clientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
      requestMethod: request.method,
      requestPath: url.pathname,
      statusCode: response.status,
      sensitivityLevel: options.sensitivityLevel ?? 'INTERNAL',
      details: {
        durationMs: Date.now() - startedAt,
        query: Object.fromEntries(url.searchParams.entries()),
        // Only meaningful when it differs from what was verified; keeping it
        // unconditionally is what makes a refused cross-tenant attempt legible.
        ...(requested && requested !== entityId ? { attemptedEntityId: requested } : {}),
        ...(entityId === UNRESOLVED_ENTITY ? { entityUnresolved: true } : {}),
      },
    });
  } catch (err) {
    console.error('[audit] failed to record request', {
      path: new URL(request.url).pathname,
      method: request.method,
      err,
    });
  }

  return response;
}

/**
 * `withEntityScope`, audited.
 *
 * The verified entity is captured from inside the handler, so the row names the
 * tenant the request actually acted on rather than one re-derived afterwards.
 */
export async function withAuditedEntityScope(
  request: NextRequest,
  options: AuditOptions,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId,
  ) => Promise<Response>,
  explicitEntityId?: string,
): Promise<Response> {
  return recordAround(request, options, async (established) =>
    withEntityScope(
      request,
      async (req, session, entityId) => {
        established.session = session;
        established.entityId = entityId;
        return handler(req, session, entityId);
      },
      explicitEntityId,
    ),
  );
}

/**
 * `withAuth`, audited — for routes whose scope is the USER, not an entity.
 *
 * The dead-man switch is the example: `DeadManSwitch.userId` is unique and there
 * is no entity column, so the session's own userId is the whole authorization.
 * The row still carries a verified entity when the session has an active one.
 */
export async function withAuditedAuth(
  request: NextRequest,
  options: AuditOptions,
  handler: (req: NextRequest, session: AuthSession) => Promise<Response>,
): Promise<Response> {
  return recordAround(request, options, async (established) =>
    withAuth(request, async (req, session) => {
      established.session = session;
      return handler(req, session);
    }),
  );
}

/**
 * Role check, THEN entity scope, audited.
 *
 * `withRole` alone is not a tenancy check. It proves the caller holds a role;
 * roles in this system are global (`AuthSession.role`), so an admin of tenant A
 * passes `withRole(['admin'])` while asking about tenant B. Every admin route
 * in this package was authorising the ACTION and not the TENANT. Composing the
 * two closes it, and the ordering matters: a non-admin is refused before any
 * entity lookup runs.
 */
export async function withAuditedRoleEntityScope(
  request: NextRequest,
  roles: UserRole[],
  options: AuditOptions,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId,
  ) => Promise<Response>,
  explicitEntityId?: string,
): Promise<Response> {
  return recordAround(request, options, async (established) =>
    withAuth(request, async (authedReq, session) => {
      established.session = session;
      if (!roles.includes(session.role)) {
        return error('FORBIDDEN', 'Insufficient permissions', 403);
      }
      return withEntityScope(
        authedReq,
        async (req, scopedSession, entityId) => {
          established.entityId = entityId;
          return handler(req, scopedSession, entityId);
        },
        explicitEntityId,
      );
    }),
  );
}

/**
 * Role check with no entity scope, audited.
 *
 * For genuinely cross-tenant administrative operations — the throttle counters
 * in `engines/trust-safety` are keyed by userId with no entity anywhere in the
 * model. Kept as a SEPARATE, explicitly named helper so that "this route is
 * deliberately not entity-scoped" is a visible decision in the route file and
 * not something a reader has to infer from an absence.
 */
export async function withAuditedRole(
  request: NextRequest,
  roles: UserRole[],
  options: AuditOptions,
  handler: (req: NextRequest, session: AuthSession) => Promise<Response>,
): Promise<Response> {
  return recordAround(request, options, async (established) =>
    withAuth(request, async (req, session) => {
      established.session = session;
      if (!roles.includes(session.role)) {
        return error('FORBIDDEN', 'Insufficient permissions', 403);
      }
      return handler(req, session);
    }),
  );
}
