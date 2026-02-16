import { v4 as uuidv4 } from 'uuid';
import { generateJSON } from '@/lib/ai';
import type { Itinerary, ItineraryLeg } from '../types';

const itineraryStore = new Map<string, Itinerary>();

export function calculateTotalCost(itinerary: Itinerary): number {
  return itinerary.legs.reduce((sum, leg) => sum + leg.costUsd, 0);
}

export async function optimizeItinerary(
  itinerary: Itinerary
): Promise<{ suggestions: string[]; optimizedOrder?: number[] }> {
  try {
    const legSummaries = itinerary.legs.map(leg => ({
      order: leg.order,
      type: leg.type,
      from: leg.departureLocation,
      to: leg.arrivalLocation,
      depart: leg.departureTime,
      arrive: leg.arrivalTime,
      cost: leg.costUsd,
    }));

    const result = await generateJSON<{ suggestions: string[]; optimizedOrder?: number[] }>(
      `Analyze this travel itinerary and suggest optimizations for routing, timing, and cost.

Itinerary: "${itinerary.name}"
Legs: ${JSON.stringify(legSummaries, null, 2)}

Return a JSON object with:
- "suggestions": array of specific improvement suggestions (e.g. reordering legs, adjusting timing, cost savings)
- "optimizedOrder": optional array of leg order numbers in the suggested optimized sequence`,
      {
        temperature: 0.7,
        system: 'You are a travel planning assistant. Provide practical, actionable suggestions to optimize travel itineraries for cost, time, and convenience.',
      }
    );

    return result;
  } catch {
    return { suggestions: ['Unable to generate AI optimization suggestions. Review itinerary manually.'] };
  }
}

export async function createItinerary(
  userId: string,
  name: string,
  legs: Omit<ItineraryLeg, 'id'>[]
): Promise<Itinerary> {
  const now = new Date();
  const orderedLegs: ItineraryLeg[] = legs.map((leg, index) => ({
    ...leg,
    id: uuidv4(),
    order: index + 1,
  }));

  const itinerary: Itinerary = {
    id: uuidv4(),
    userId,
    name,
    status: 'DRAFT',
    legs: orderedLegs,
    totalCostEstimate: orderedLegs.reduce((sum, leg) => sum + leg.costUsd, 0),
    currency: 'USD',
    createdAt: now,
    updatedAt: now,
  };

  itineraryStore.set(itinerary.id, itinerary);
  return itinerary;
}

export async function getItinerary(itineraryId: string): Promise<Itinerary | null> {
  return itineraryStore.get(itineraryId) ?? null;
}

export async function listItineraries(userId: string, status?: string): Promise<Itinerary[]> {
  const all = Array.from(itineraryStore.values()).filter(i => i.userId === userId);
  if (status) return all.filter(i => i.status === status);
  return all;
}

export async function updateLeg(
  itineraryId: string,
  legId: string,
  updates: Partial<ItineraryLeg>
): Promise<Itinerary> {
  const itinerary = itineraryStore.get(itineraryId);
  if (!itinerary) throw new Error(`Itinerary ${itineraryId} not found`);

  itinerary.legs = itinerary.legs.map(leg =>
    leg.id === legId ? { ...leg, ...updates, id: leg.id } : leg
  );
  itinerary.totalCostEstimate = calculateTotalCost(itinerary);
  itinerary.updatedAt = new Date();

  itineraryStore.set(itineraryId, itinerary);
  return itinerary;
}

export async function addLeg(
  itineraryId: string,
  leg: Omit<ItineraryLeg, 'id'>
): Promise<Itinerary> {
  const itinerary = itineraryStore.get(itineraryId);
  if (!itinerary) throw new Error(`Itinerary ${itineraryId} not found`);

  const newLeg: ItineraryLeg = { ...leg, id: uuidv4() };
  itinerary.legs.push(newLeg);

  // Reorder legs
  itinerary.legs = itinerary.legs.map((l, index) => ({ ...l, order: index + 1 }));
  itinerary.totalCostEstimate = calculateTotalCost(itinerary);
  itinerary.updatedAt = new Date();

  itineraryStore.set(itineraryId, itinerary);
  return itinerary;
}

export async function removeLeg(
  itineraryId: string,
  legId: string
): Promise<Itinerary> {
  const itinerary = itineraryStore.get(itineraryId);
  if (!itinerary) throw new Error(`Itinerary ${itineraryId} not found`);

  itinerary.legs = itinerary.legs
    .filter(leg => leg.id !== legId)
    .map((leg, index) => ({ ...leg, order: index + 1 }));
  itinerary.totalCostEstimate = calculateTotalCost(itinerary);
  itinerary.updatedAt = new Date();

  itineraryStore.set(itineraryId, itinerary);
  return itinerary;
}
