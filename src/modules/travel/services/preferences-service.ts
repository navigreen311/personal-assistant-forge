import { v4 as uuidv4 } from 'uuid';
import { addMonths, isBefore } from 'date-fns';
import type { TravelPreferences, TravelDocument } from '../types';

// In-memory store (placeholder for database)
const preferencesStore = new Map<string, TravelPreferences>();

export async function getPreferences(userId: string): Promise<TravelPreferences> {
  const existing = preferencesStore.get(userId);
  if (existing) return existing;

  const defaults: TravelPreferences = {
    userId,
    airlines: [],
    hotels: [],
    dietary: [],
    budgetPerDayUsd: 200,
    preferredAirports: [],
    travelDocuments: [],
  };
  preferencesStore.set(userId, defaults);
  return defaults;
}

export async function updatePreferences(
  userId: string,
  updates: Partial<TravelPreferences>
): Promise<TravelPreferences> {
  const current = await getPreferences(userId);

  // Learn from patterns - if user always picks same seat, reinforce it
  if (updates.airlines) {
    const seatPrefs = updates.airlines.map(a => a.seatPreference).filter(Boolean);
    if (seatPrefs.length > 0) {
      const mostCommon = seatPrefs.sort((a, b) =>
        seatPrefs.filter(v => v === b).length - seatPrefs.filter(v => v === a).length
      )[0];
      updates.airlines = updates.airlines.map(a => ({
        ...a,
        seatPreference: a.seatPreference || mostCommon,
      }));
    }
  }

  const updated: TravelPreferences = { ...current, ...updates, userId };

  // Recalculate isExpiringSoon for all documents
  if (updated.travelDocuments) {
    const sixMonthsFromNow = addMonths(new Date(), 6);
    updated.travelDocuments = updated.travelDocuments.map(doc => ({
      ...doc,
      isExpiringSoon: isBefore(new Date(doc.expirationDate), sixMonthsFromNow),
    }));
  }

  preferencesStore.set(userId, updated);
  return updated;
}

export async function checkDocumentExpiry(userId: string): Promise<TravelDocument[]> {
  const prefs = await getPreferences(userId);
  const sixMonthsFromNow = addMonths(new Date(), 6);

  return prefs.travelDocuments
    .map(doc => ({
      ...doc,
      isExpiringSoon: isBefore(new Date(doc.expirationDate), sixMonthsFromNow),
    }))
    .filter(doc => doc.isExpiringSoon);
}
