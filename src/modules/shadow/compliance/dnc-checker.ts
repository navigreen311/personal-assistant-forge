// ============================================================================
// Shadow Voice Agent — Do Not Call (DNC) + contact quiet hours
// v3 spec, Addition 3.3. Checked before EVERY outbound call to a third party.
// ============================================================================
//
// P-16, deliverable 9. THIS FILE HAD NO CALLER. `ContactCallPreference` rows
// could be written by nothing and read by nothing, so `doNotCall` was a column
// that existed and could not stop a call.
//
// Three things changed, and they are the difference between a checker and a
// checker that is worth wiring:
//
//  1. IT IS ENTITY-SCOPED. `canCall` took a bare `contactId` and queried on it
//     with no tenancy filter at all. Wiring that into the call path would have
//     let one tenant learn whether another tenant's contact is on a do-not-call
//     list, and how often they have been called this week -- Decision 1 says
//     `record.entityId` must equal the scoped entity id, and ownership is not
//     sufficient because the rule holds between two entities of the same user.
//     The parameter is now the branded `VerifiedEntityId`, so a caller that has
//     not been through `withEntityScope` or `verifyEntityForUser` cannot call
//     this function at all and the failure is `tsc`, not review.
//
//  2. IT READS THE CONTACT'S OWN QUIET HOURS. `ContactCallPreference` has
//     `quietHoursStart` and `quietHoursEnd` columns, and this file ignored both
//     in favour of a hard-coded 21:00-08:00. A contact whose preference said
//     "not before 10" was called at 08:01, and the settings row said otherwise.
//
//  3. IT ANSWERS THE QUESTION THE SPEC ASKS. Addition 3.3 is not "may I call" —
//     it is "may I call, and if not, what should I do instead": `preferredChannel`
//     is returned so a blocked call becomes an email rather than nothing.
//
// ----------------------------------------------------------------------------
// ONE HONEST GAP
// ----------------------------------------------------------------------------
//
// The spec's `quiet_hours_timezone` column does not exist on
// `ContactCallPreference` and the schema is frozen, so quiet hours are
// evaluated in a timezone the CALLER supplies -- in practice the user's, which
// is the best available answer and is not the contact's. It is a parameter
// rather than a silent `new Date().getHours()` so that the assumption is
// visible at every call site. It is NOT stuffed into an unrelated `Json`
// column; if per-contact timezones are wanted, that is a column and an
// escalation.

import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';

// --- Types ---

export interface DNCCheckResult {
  allowed: boolean;
  reason?: string;
  nextAvailable?: Date;
  /**
   * What to do instead when `allowed` is false, and the contact's stated
   * preference when it is true. Addition 3.3: "Is contact on DNC list? -> use
   * email instead".
   */
  preferredChannel: string;
  /** Calls already placed to this contact in the current week. */
  callsThisWeek: number;
  maxCallsPerWeek: number;
}

export interface DNCCheckOptions {
  /** Clock, injected so a quiet-hours test is not a test of when it ran. */
  now?: Date;
  /**
   * IANA timezone the contact's quiet hours are evaluated in. See the header:
   * the schema has no per-contact timezone, so the caller supplies one.
   */
  timezone?: string;
}

// --- Constants ---

/** Used when the contact has no `ContactCallPreference` row at all. */
const DEFAULT_MAX_CALLS_PER_WEEK = 3;

/**
 * Quiet hours for a contact with a preference row that leaves them null.
 * The spec's own example: no calls before 8 AM or after 9 PM.
 */
const DEFAULT_QUIET_START = '21:00';
const DEFAULT_QUIET_END = '08:00';

// --- Time helpers ---

function minutesOf(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function localMinutes(now: Date, timezone: string | undefined): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    ...(timezone ? { timeZone: timezone } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return minutesOf(formatter.format(now)) ?? 0;
}

/**
 * Quiet hours normally span midnight (21:00 -> 08:00), so the comparison is
 * "outside the allowed window", not "between two numbers".
 */
export function isInQuietHours(currentMinutes: number, start: string, end: string): boolean {
  const from = minutesOf(start);
  const to = minutesOf(end);
  if (from === null || to === null) return false;
  if (from === to) return false;
  if (from < to) return currentMinutes >= from && currentMinutes < to;
  return currentMinutes >= from || currentMinutes < to;
}

/** The next instant outside quiet hours, in the supplied timezone. */
function nextAvailableAfterQuietHours(
  now: Date,
  currentMinutes: number,
  end: string
): Date {
  const to = minutesOf(end) ?? 0;
  const minutesUntil = to > currentMinutes ? to - currentMinutes : 24 * 60 - currentMinutes + to;
  return new Date(now.getTime() + minutesUntil * 60 * 1000);
}

// --- DNC Checker ---

export class DNCChecker {
  /**
   * May this contact be called right now?
   *
   * Enforces, in order: the contact is in scope, the DNC flag, the contact's
   * quiet hours, and the weekly frequency limit.
   */
  async canCall(
    contactId: string,
    entityId: VerifiedEntityId,
    options: DNCCheckOptions = {}
  ): Promise<DNCCheckResult> {
    const now = options.now ?? new Date();

    // 0. Scope. A contact outside the active entity is refused in the same way
    //    as one that does not exist -- the two must be indistinguishable.
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, entityId, deletedAt: null },
      select: { id: true },
    });

    if (!contact) {
      return {
        allowed: false,
        reason: 'Contact is not in the active entity',
        preferredChannel: 'none',
        callsThisWeek: 0,
        maxCallsPerWeek: DEFAULT_MAX_CALLS_PER_WEEK,
      };
    }

    const preference = await prisma.contactCallPreference.findUnique({
      where: { contactId },
    });

    const preferredChannel = preference?.preferredChannel ?? 'phone';
    const maxCallsPerWeek = preference?.maxCallsPerWeek ?? DEFAULT_MAX_CALLS_PER_WEEK;

    // 1. DNC flag. Addition 3.3: fall back to email rather than to silence.
    if (preference?.doNotCall) {
      return {
        allowed: false,
        reason: 'Contact is on the Do Not Call list',
        preferredChannel: preferredChannel === 'phone' ? 'email' : preferredChannel,
        callsThisWeek: 0,
        maxCallsPerWeek,
      };
    }

    // 2. The contact's own quiet hours.
    const currentMinutes = localMinutes(now, options.timezone);
    const quietStart = preference?.quietHoursStart ?? DEFAULT_QUIET_START;
    const quietEnd = preference?.quietHoursEnd ?? DEFAULT_QUIET_END;

    if (isInQuietHours(currentMinutes, quietStart, quietEnd)) {
      return {
        allowed: false,
        reason: `Contact quiet hours in effect (${quietStart} - ${quietEnd})`,
        nextAvailable: nextAvailableAfterQuietHours(now, currentMinutes, quietEnd),
        preferredChannel,
        callsThisWeek: await this.countCallsThisWeek(contactId, now),
        maxCallsPerWeek,
      };
    }

    // 3. Weekly frequency. Counted from the durable `ShadowCallAttempt` rows
    //    rather than the `callsThisWeek` counter column beside them, for the
    //    reason Decision 2 gives: a counter has to be reset by something, and
    //    whatever resets it is a second thing that can be wrong. The column is
    //    left alone; nothing reads it.
    const callsThisWeek = await this.countCallsThisWeek(contactId, now);

    if (callsThisWeek >= maxCallsPerWeek) {
      const weekStart = startOfWeek(now);
      const nextWeek = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      return {
        allowed: false,
        reason: `Weekly call limit reached (${callsThisWeek}/${maxCallsPerWeek})`,
        nextAvailable: nextWeek,
        preferredChannel: preferredChannel === 'phone' ? 'email' : preferredChannel,
        callsThisWeek,
        maxCallsPerWeek,
      };
    }

    return { allowed: true, preferredChannel, callsThisWeek, maxCallsPerWeek };
  }

  /**
   * Record a call attempt. This is what `canCall`'s weekly limit counts.
   */
  async recordCallAttempt(contactId: string, when: Date = new Date()): Promise<void> {
    await prisma.shadowCallAttempt.create({
      data: { contactId, attemptedAt: when },
    });
  }

  /** Calls placed to this contact since the start of the current week. */
  async countCallsThisWeek(contactId: string, now: Date = new Date()): Promise<number> {
    return prisma.shadowCallAttempt.count({
      where: { contactId, attemptedAt: { gte: startOfWeek(now) } },
    });
  }

  /**
   * Drop call attempts older than a week.
   *
   * NOT a counter reset -- there is no counter. This is retention: the rows are
   * only consulted for the current week, so keeping them forever grows a table
   * nothing reads. Safe to skip entirely; the limit stays correct either way.
   */
  async pruneOldCallAttempts(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const result = await prisma.shadowCallAttempt.deleteMany({
      where: { attemptedAt: { lt: cutoff } },
    });
    return result.count;
  }
}

/** Sunday 00:00 local to the server, matching the previous behaviour. */
function startOfWeek(now: Date): Date {
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

// Singleton export
export const dncChecker = new DNCChecker();
