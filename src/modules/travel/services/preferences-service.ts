import { addMonths, isBefore } from 'date-fns';
import { prisma } from '@/lib/db';
import type { TravelPreferences, TravelDocument } from '../types';

const defaultPreferences: Omit<TravelPreferences, 'userId'> = {
  airlines: [],
  hotels: [],
  dietary: [],
  budgetPerDayUsd: 200,
  preferredAirports: [],
  travelDocuments: [],
};

export async function getPreferences(userId: string): Promise<TravelPreferences> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return { userId, ...defaultPreferences };
  }

  const prefs = user.preferences as Record<string, unknown> | null;
  const travel = prefs?.travel as Record<string, unknown> | undefined;

  if (!travel) {
    return { userId, ...defaultPreferences };
  }

  return {
    userId,
    airlines: (travel.airlines as TravelPreferences['airlines']) ?? [],
    hotels: (travel.hotels as TravelPreferences['hotels']) ?? [],
    dietary: (travel.dietary as string[]) ?? [],
    budgetPerDayUsd: (travel.budgetPerDayUsd as number) ?? 200,
    preferredAirports: (travel.preferredAirports as string[]) ?? [],
    travelDocuments: (travel.travelDocuments as TravelDocument[]) ?? [],
  };
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

  // Read existing user preferences, merge travel-specific updates
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const existingPrefs = (user?.preferences as Record<string, unknown>) ?? {};

  await prisma.user.update({
    where: { id: userId },
    data: {
      preferences: {
        ...existingPrefs,
        travel: {
          airlines: updated.airlines,
          hotels: updated.hotels,
          dietary: updated.dietary,
          budgetPerDayUsd: updated.budgetPerDayUsd,
          preferredAirports: updated.preferredAirports,
          travelDocuments: updated.travelDocuments,
        },
      },
    },
  });

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
