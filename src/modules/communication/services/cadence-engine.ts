// ============================================================================
// Cadence Engine Service
// Manages follow-up cadence schedules for contacts.
// ============================================================================

import { prisma } from '@/lib/db';
import { addDays, addWeeks, addMonths, isBefore } from 'date-fns';
import type { CadenceFrequency, FollowUpCadence } from '@/modules/communication/types';

const FREQUENCY_DAYS: Record<CadenceFrequency, number> = {
  DAILY: 1,
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
  QUARTERLY: 90,
};

function computeNextDue(lastTouch: Date | null, frequency: CadenceFrequency): Date {
  const base = lastTouch ?? new Date();
  switch (frequency) {
    case 'DAILY': return addDays(base, 1);
    case 'WEEKLY': return addWeeks(base, 1);
    case 'BIWEEKLY': return addWeeks(base, 2);
    case 'MONTHLY': return addMonths(base, 1);
    case 'QUARTERLY': return addMonths(base, 3);
    default: return addWeeks(base, 1);
  }
}

function parseCadencePreferences(preferences: unknown): { frequency?: CadenceFrequency; escalationAfterMisses?: number } {
  const prefs = (preferences as Record<string, unknown>) ?? {};
  return {
    frequency: prefs.cadenceFrequency as CadenceFrequency | undefined,
    escalationAfterMisses: (prefs.escalationAfterMisses as number) ?? 3,
  };
}

/**
 * Set the follow-up cadence for a contact.
 */
export async function setCadence(
  contactId: string,
  frequency: string
): Promise<FollowUpCadence> {
  const validFrequencies: CadenceFrequency[] = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY'];
  const cadenceFrequency = frequency.toUpperCase() as CadenceFrequency;

  if (!validFrequencies.includes(cadenceFrequency)) {
    throw new Error(`Invalid frequency: ${frequency}. Must be one of: ${validFrequencies.join(', ')}`);
  }

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error(`Contact not found: ${contactId}`);

  const existingPrefs = (contact.preferences as Record<string, unknown>) ?? {};
  const updatedPrefs = {
    ...existingPrefs,
    cadenceFrequency,
    escalationAfterMisses: (existingPrefs.escalationAfterMisses as number) ?? 3,
  };

  await prisma.contact.update({
    where: { id: contactId },
    data: { preferences: updatedPrefs },
  });

  const nextDue = computeNextDue(contact.lastTouch, cadenceFrequency);

  return {
    contactId,
    frequency: cadenceFrequency,
    nextDue,
    escalationAfterMisses: (updatedPrefs.escalationAfterMisses as number),
    isOverdue: isBefore(nextDue, new Date()),
  };
}

/**
 * Get all overdue follow-ups for an entity.
 */
export async function getOverdueFollowUps(entityId: string): Promise<FollowUpCadence[]> {
  const contacts = await prisma.contact.findMany({
    where: { entityId },
  });

  const now = new Date();
  const overdue: FollowUpCadence[] = [];

  for (const contact of contacts) {
    const { frequency, escalationAfterMisses } = parseCadencePreferences(contact.preferences);
    if (!frequency) continue;

    const nextDue = computeNextDue(contact.lastTouch, frequency);

    if (isBefore(nextDue, now)) {
      overdue.push({
        contactId: contact.id,
        frequency,
        nextDue,
        escalationAfterMisses: escalationAfterMisses ?? 3,
        isOverdue: true,
      });
    }
  }

  return overdue;
}

/**
 * Escalate a follow-up after missed cadence windows.
 * Updates the contact's preferences to flag for human review.
 */
export async function escalateFollowUp(contactId: string): Promise<void> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error(`Contact not found: ${contactId}`);

  const existingPrefs = (contact.preferences as Record<string, unknown>) ?? {};
  const updatedPrefs = {
    ...existingPrefs,
    escalated: true,
    escalatedAt: new Date().toISOString(),
    escalationReason: 'Missed follow-up cadence — requires human review',
  };

  await prisma.contact.update({
    where: { id: contactId },
    data: { preferences: updatedPrefs },
  });
}

/**
 * Get upcoming follow-ups within the next N days for an entity.
 */
export async function getNextFollowUps(
  entityId: string,
  days: number
): Promise<FollowUpCadence[]> {
  const contacts = await prisma.contact.findMany({
    where: { entityId },
  });

  const now = new Date();
  const horizon = addDays(now, days);
  const results: FollowUpCadence[] = [];

  for (const contact of contacts) {
    const { frequency, escalationAfterMisses } = parseCadencePreferences(contact.preferences);
    if (!frequency) continue;

    const nextDue = computeNextDue(contact.lastTouch, frequency);

    if (isBefore(nextDue, horizon)) {
      results.push({
        contactId: contact.id,
        frequency,
        nextDue,
        escalationAfterMisses: escalationAfterMisses ?? 3,
        isOverdue: isBefore(nextDue, now),
      });
    }
  }

  // Sort by nextDue ascending
  results.sort((a, b) => a.nextDue.getTime() - b.nextDue.getTime());

  return results;
}
