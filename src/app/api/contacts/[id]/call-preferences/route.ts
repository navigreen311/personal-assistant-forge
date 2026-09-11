// ============================================================================
// GET / PUT /api/contacts/[id]/call-preferences
// v3 spec, Addition 3.3: do-not-call, preferred channel, contact quiet hours.
// ============================================================================
//
// P-16, deliverable 9. `ContactCallPreference` is a real table with a
// `doNotCall` column and, before this route, NOTHING IN THE REPOSITORY WROTE A
// ROW TO IT. `dnc-checker.ts` read it and had no caller of its own, so the
// column existed, could not be set, and could not have stopped a call if it
// had been.
//
// This is deliberately not part of `PUT /api/contacts/[id]`. A contact's
// do-not-call status is a compliance fact, not a profile field: it wants its
// own request, its own audit trail in the access log, and a shape where
// "update this contact's phone number" cannot accidentally clear it because a
// client sent a partial object.
//
// Scoped through the contact's own entity via `withEntityScope`, so the rule is
// Decision 1's and not a second one invented here: knowing that a contact is on
// another tenant's DNC list is itself a disclosure.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession, UserRole } from '@/lib/auth/types';
import { dncChecker } from '@/modules/shadow/compliance/dnc-checker';

type RouteContext = { params: Promise<{ id: string }> };

const WRITE_ROLES: UserRole[] = ['owner', 'admin', 'member'];

/** `HH:MM`, 24-hour. */
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * MIGRATION WINDOW 02 — the write boundary for `quietHoursTimezone`.
 *
 * Validated against `Intl` rather than a regex or a hard-coded list: the IANA
 * database is what `dnc-checker` evaluates the window with, so the only useful
 * question is whether THAT can read the string. A regex would accept
 * `Europe/Atlantis`, which would store fine and then be unreadable at the one
 * moment it matters -- and an unreadable zone on the read side means a refused
 * call (see `dnc-checker`'s header), so a typo here would silently stop every
 * call to a contact. Caught at the write instead, where a person can fix it.
 */
function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const UpdateSchema = z.object({
  doNotCall: z.boolean().optional(),
  preferredChannel: z.enum(['phone', 'email', 'sms']).optional(),
  quietHoursStart: z.string().regex(TIME).nullable().optional(),
  quietHoursEnd: z.string().regex(TIME).nullable().optional(),
  quietHoursTimezone: z
    .string()
    .refine(isIanaTimezone, { message: 'Not a known IANA timezone, e.g. "Asia/Tokyo"' })
    .nullable()
    .optional(),
  maxCallsPerWeek: z.number().int().min(0).max(50).optional(),
});

async function withContactScope(
  request: NextRequest,
  contactId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Contact not found: ${contactId}`, 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return withContactScope(request, id, async (_req, _session, entityId) => {
    try {
      const preference = await prisma.contactCallPreference.findUnique({
        where: { contactId: id },
      });

      // The live answer, not just the stored row: whether this contact may be
      // called RIGHT NOW is what the caller actually wants, and computing it
      // here means the settings screen and the call planner cannot disagree.
      const check = await dncChecker.canCall(id, entityId);

      return success({
        contactId: id,
        doNotCall: preference?.doNotCall ?? false,
        preferredChannel: preference?.preferredChannel ?? 'phone',
        quietHoursStart: preference?.quietHoursStart ?? null,
        quietHoursEnd: preference?.quietHoursEnd ?? null,
        quietHoursTimezone: preference?.quietHoursTimezone ?? null,
        maxCallsPerWeek: preference?.maxCallsPerWeek ?? 3,
        lastCalledAt: preference?.lastCalledAt?.toISOString() ?? null,
        callableNow: check.allowed,
        blockedReason: check.reason,
        callsThisWeek: check.callsThisWeek,
      });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to read call preferences',
        500
      );
    }
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return withContactScope(request, id, async (req, session, _entityId) => {
    if (!WRITE_ROLES.includes(session.role)) {
      return error('FORBIDDEN', 'Insufficient permissions', 403);
    }

    try {
      const body = await req.json();
      const parsed = UpdateSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const data = parsed.data;

      // Quiet hours are a pair. One half set and the other null is a window
      // `isInQuietHours` reads as "no quiet hours at all", which would silently
      // discard the half the user did set.
      const startGiven = data.quietHoursStart !== undefined;
      const endGiven = data.quietHoursEnd !== undefined;
      if (startGiven !== endGiven) {
        return error(
          'VALIDATION_ERROR',
          'quietHoursStart and quietHoursEnd must be set together',
          400
        );
      }

      const preference = await prisma.contactCallPreference.upsert({
        where: { contactId: id },
        create: {
          contactId: id,
          doNotCall: data.doNotCall ?? false,
          preferredChannel: data.preferredChannel ?? 'phone',
          quietHoursStart: data.quietHoursStart ?? null,
          quietHoursEnd: data.quietHoursEnd ?? null,
          quietHoursTimezone: data.quietHoursTimezone ?? null,
          maxCallsPerWeek: data.maxCallsPerWeek ?? 3,
        },
        update: {
          ...(data.doNotCall !== undefined ? { doNotCall: data.doNotCall } : {}),
          ...(data.preferredChannel !== undefined
            ? { preferredChannel: data.preferredChannel }
            : {}),
          ...(startGiven ? { quietHoursStart: data.quietHoursStart ?? null } : {}),
          ...(endGiven ? { quietHoursEnd: data.quietHoursEnd ?? null } : {}),
          // Independently settable from the pair above: a contact who moves
          // keeps the same 21:00-08:00 window in a new zone, and a client that
          // sends only the zone must not have to re-send the hours.
          ...(data.quietHoursTimezone !== undefined
            ? { quietHoursTimezone: data.quietHoursTimezone }
            : {}),
          ...(data.maxCallsPerWeek !== undefined
            ? { maxCallsPerWeek: data.maxCallsPerWeek }
            : {}),
        },
      });

      return success({
        contactId: preference.contactId,
        doNotCall: preference.doNotCall,
        preferredChannel: preference.preferredChannel,
        quietHoursStart: preference.quietHoursStart,
        quietHoursEnd: preference.quietHoursEnd,
        quietHoursTimezone: preference.quietHoursTimezone,
        maxCallsPerWeek: preference.maxCallsPerWeek,
      });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to update call preferences',
        500
      );
    }
  });
}
