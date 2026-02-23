// ============================================================================
// Shadow Voice Agent — Do Not Call (DNC) Checker
// Enforces DNC list, quiet hours, and per-contact call frequency limits.
// Prevents illegal or unwanted outbound calls.
// ============================================================================

import { prisma } from '@/lib/db';

// --- Types ---

export interface DNCCheckResult {
  allowed: boolean;
  reason?: string;
  nextAvailable?: Date;
}

// --- Constants ---

/** Default maximum calls per contact per week */
const DEFAULT_MAX_CALLS_PER_WEEK = 3;

/** Quiet hours: no calls before 8 AM or after 9 PM in contact's local time */
const QUIET_HOURS_START = 21; // 9 PM
const QUIET_HOURS_END = 8; // 8 AM

// --- DNC Checker ---

export class DNCChecker {
  /**
   * Check whether a contact can be called right now.
   * Enforces:
   * 1. DNC flag on the contact record
   * 2. Quiet hours (no calls 9 PM - 8 AM)
   * 3. Weekly call frequency limit (default: 3 per week)
   */
  async canCall(contactId: string): Promise<DNCCheckResult> {
    // 1. Check DNC flag
    const contact = await prisma.shadowDNCEntry.findUnique({
      where: { contactId },
    });

    if (contact?.doNotCall) {
      return {
        allowed: false,
        reason: 'Contact is on the Do Not Call list',
      };
    }

    // 2. Check quiet hours
    const now = new Date();
    const currentHour = now.getHours();

    if (currentHour >= QUIET_HOURS_START || currentHour < QUIET_HOURS_END) {
      // Calculate next available time
      const nextAvailable = new Date(now);
      if (currentHour >= QUIET_HOURS_START) {
        // After 9 PM — next available is 8 AM tomorrow
        nextAvailable.setDate(nextAvailable.getDate() + 1);
      }
      nextAvailable.setHours(QUIET_HOURS_END, 0, 0, 0);

      return {
        allowed: false,
        reason: `Quiet hours in effect (${QUIET_HOURS_START}:00 - ${QUIET_HOURS_END}:00). Calls are not permitted during this time.`,
        nextAvailable,
      };
    }

    // 3. Check weekly call frequency
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of this week (Sunday)
    weekStart.setHours(0, 0, 0, 0);

    const callsThisWeek = await prisma.shadowCallAttempt.count({
      where: {
        contactId,
        attemptedAt: { gte: weekStart },
      },
    });

    const maxCallsPerWeek = contact?.maxCallsPerWeek ?? DEFAULT_MAX_CALLS_PER_WEEK;

    if (callsThisWeek >= maxCallsPerWeek) {
      // Next available is start of next week
      const nextWeek = new Date(weekStart);
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(QUIET_HOURS_END, 0, 0, 0);

      return {
        allowed: false,
        reason: `Weekly call limit reached (${callsThisWeek}/${maxCallsPerWeek}). Maximum ${maxCallsPerWeek} calls per contact per week.`,
        nextAvailable: nextWeek,
      };
    }

    return { allowed: true };
  }

  /**
   * Record a call attempt for a contact.
   * This increments the weekly counter used by canCall().
   */
  async recordCallAttempt(contactId: string): Promise<void> {
    await prisma.shadowCallAttempt.create({
      data: {
        contactId,
        attemptedAt: new Date(),
      },
    });
  }

  /**
   * Reset weekly call counts by deleting all call attempt records older than 7 days.
   * Should be called by a scheduled cron job (e.g., weekly on Sunday midnight).
   *
   * @returns The number of records deleted.
   */
  async resetWeeklyCounts(): Promise<number> {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const result = await prisma.shadowCallAttempt.deleteMany({
      where: {
        attemptedAt: { lt: oneWeekAgo },
      },
    });

    return result.count;
  }
}

// Singleton export
export const dncChecker = new DNCChecker();
