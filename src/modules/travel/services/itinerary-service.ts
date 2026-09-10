import { v4 as uuidv4 } from 'uuid';
import { generateJSON } from '@/lib/ai';
import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { Itinerary, ItineraryLeg } from '../types';

/**
 * An itinerary is not a table. It is a set of `CalendarEvent` rows that share an
 * `itineraryId` inside their `prepPacket` JSON. `CalendarEvent` has an indexed
 * `entityId`, so that column -- not the JSON -- is the tenancy scope, and every
 * query below carries it.
 *
 * Before this change, every function here took only an `itineraryId`.
 * `getItinerary`, `updateLeg`, `addLeg` and `removeLeg` had no scope at all, and
 * the `[id]` routes above them discarded the session as `_session`. Any
 * authenticated user who knew (or guessed) an itinerary id could read another
 * tenant's travel plans -- flight numbers, hotels, confirmation numbers -- edit
 * them, or delete the underlying calendar events.
 */

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

/** Convert a CalendarEvent record (with prepPacket metadata) into an ItineraryLeg */
function eventToLeg(event: {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  prepPacket: unknown;
}): ItineraryLeg {
  const meta = event.prepPacket as Record<string, unknown> | null;
  return {
    id: (meta?.legId as string) ?? event.id,
    order: (meta?.legOrder as number) ?? 0,
    type: (meta?.legType as ItineraryLeg['type']) ?? 'FLIGHT',
    departureLocation: (meta?.departureLocation as string) ?? '',
    arrivalLocation: (meta?.arrivalLocation as string) ?? '',
    departureTime: event.startTime,
    arrivalTime: event.endTime,
    timezone: (meta?.timezone as string) ?? 'UTC',
    confirmationNumber: meta?.confirmationNumber as string | undefined,
    provider: meta?.provider as string | undefined,
    costUsd: (meta?.costUsd as number) ?? 0,
    status: (meta?.status as ItineraryLeg['status']) ?? 'PENDING',
    notes: meta?.notes as string | undefined,
  };
}

/** Reconstruct an Itinerary from a set of CalendarEvent records sharing the same itineraryId */
function eventsToItinerary(
  events: { id: string; title: string; entityId: string; startTime: Date; endTime: Date; prepPacket: unknown; createdAt: Date; updatedAt: Date }[]
): Itinerary | null {
  if (events.length === 0) return null;

  const first = events[0];
  const meta = first.prepPacket as Record<string, unknown> | null;

  const legs = events
    .map(eventToLeg)
    .sort((a, b) => a.order - b.order);

  return {
    id: (meta?.itineraryId as string) ?? first.id,
    userId: (meta?.userId as string) ?? '',
    name: (meta?.itineraryName as string) ?? first.title,
    status: (meta?.itineraryStatus as Itinerary['status']) ?? 'DRAFT',
    legs,
    totalCostEstimate: legs.reduce((sum, leg) => sum + leg.costUsd, 0),
    currency: 'USD',
    notes: meta?.itineraryNotes as string | undefined,
    createdAt: first.createdAt,
    updatedAt: events.reduce((latest, e) => (e.updatedAt > latest ? e.updatedAt : latest), first.updatedAt),
  };
}

export async function createItinerary(
  entityId: VerifiedEntityId,
  userId: string,
  name: string,
  legs: Omit<ItineraryLeg, 'id'>[]
): Promise<Itinerary> {
  const itineraryId = uuidv4();
  const now = new Date();

  // The entity arrives verified. This used to be
  // `prisma.entity.findFirst({ where: { userId } })` with `?? userId` as the
  // fallback, which wrote CalendarEvent rows whose entityId was a User id --
  // a foreign key to nothing -- whenever the user had no entity yet.

  const orderedLegs: ItineraryLeg[] = legs.map((leg, index) => ({
    ...leg,
    id: uuidv4(),
    order: index + 1,
  }));

  // Create a CalendarEvent for each leg
  for (const leg of orderedLegs) {
    await prisma.calendarEvent.create({
      data: {
        id: uuidv4(),
        title: `${name} — ${leg.type}: ${leg.departureLocation} → ${leg.arrivalLocation}`,
        entityId,
        startTime: new Date(leg.departureTime),
        endTime: new Date(leg.arrivalTime),
        prepPacket: {
          itineraryId,
          itineraryName: name,
          itineraryStatus: 'DRAFT',
          userId,
          legId: leg.id,
          legOrder: leg.order,
          legType: leg.type,
          departureLocation: leg.departureLocation,
          arrivalLocation: leg.arrivalLocation,
          timezone: leg.timezone,
          confirmationNumber: leg.confirmationNumber,
          provider: leg.provider,
          costUsd: leg.costUsd,
          status: leg.status,
          notes: leg.notes,
        },
      },
    });
  }

  return {
    id: itineraryId,
    userId,
    name,
    status: 'DRAFT',
    legs: orderedLegs,
    totalCostEstimate: orderedLegs.reduce((sum, leg) => sum + leg.costUsd, 0),
    currency: 'USD',
    createdAt: now,
    updatedAt: now,
  };
}

export async function getItinerary(
  entityId: VerifiedEntityId,
  itineraryId: string
): Promise<Itinerary | null> {
  const events = await prisma.calendarEvent.findMany({
    where: {
      entityId,
      prepPacket: {
        path: ['itineraryId'],
        equals: itineraryId,
      },
    },
    orderBy: { startTime: 'asc' },
  });

  return eventsToItinerary(events);
}

/**
 * Every itinerary belonging to ONE entity.
 *
 * Deliberately single-entity (tenancy pattern section 5b). It used to match on
 * `prepPacket.userId`, which spanned whatever entities that user's itineraries
 * happened to sit on; it now scopes to the entity in scope. Travel plans in this
 * product belong to an entity -- a business trip is the business's, a holiday is
 * the personal entity's -- so a single-entity list is what the feature means. A
 * caller who wants another entity's itineraries passes `?entityId=`, which is
 * verified before it reaches here.
 */
export async function listItineraries(
  entityId: VerifiedEntityId,
  status?: string
): Promise<Itinerary[]> {
  const events = await prisma.calendarEvent.findMany({
    where: { entityId },
    orderBy: { startTime: 'asc' },
  });

  // Group events by itineraryId
  const groups = new Map<string, typeof events>();
  for (const event of events) {
    const meta = event.prepPacket as Record<string, unknown> | null;
    const itinId = meta?.itineraryId as string | undefined;
    if (!itinId) continue;

    const group = groups.get(itinId) ?? [];
    group.push(event);
    groups.set(itinId, group);
  }

  const itineraries: Itinerary[] = [];
  for (const group of groups.values()) {
    const itin = eventsToItinerary(group);
    if (!itin) continue;
    if (status && itin.status !== status) continue;
    itineraries.push(itin);
  }

  return itineraries;
}

export async function updateLeg(
  entityId: VerifiedEntityId,
  itineraryId: string,
  legId: string,
  updates: Partial<ItineraryLeg>
): Promise<Itinerary> {
  // Find the CalendarEvent for this leg
  const events = await prisma.calendarEvent.findMany({
    where: {
      entityId,
      prepPacket: {
        path: ['itineraryId'],
        equals: itineraryId,
      },
    },
  });

  const targetEvent = events.find((e: { prepPacket: unknown }) => {
    const meta = e.prepPacket as Record<string, unknown> | null;
    return meta?.legId === legId;
  });

  if (!targetEvent) throw new Error(`Itinerary ${itineraryId} or leg ${legId} not found`);

  const existingMeta = targetEvent.prepPacket as Record<string, unknown>;

  // updateMany, not update: update takes a unique WHERE and cannot carry the entity.
  await prisma.calendarEvent.updateMany({
    where: { id: targetEvent.id, entityId },
    data: {
      startTime: updates.departureTime ? new Date(updates.departureTime) : undefined,
      endTime: updates.arrivalTime ? new Date(updates.arrivalTime) : undefined,
      title: updates.departureLocation || updates.arrivalLocation
        ? `${existingMeta.itineraryName} — ${updates.type ?? existingMeta.legType}: ${updates.departureLocation ?? existingMeta.departureLocation} → ${updates.arrivalLocation ?? existingMeta.arrivalLocation}`
        : undefined,
      prepPacket: {
        ...existingMeta,
        ...(updates.type && { legType: updates.type }),
        ...(updates.departureLocation && { departureLocation: updates.departureLocation }),
        ...(updates.arrivalLocation && { arrivalLocation: updates.arrivalLocation }),
        ...(updates.timezone && { timezone: updates.timezone }),
        ...(updates.confirmationNumber !== undefined && { confirmationNumber: updates.confirmationNumber }),
        ...(updates.provider !== undefined && { provider: updates.provider }),
        ...(updates.costUsd !== undefined && { costUsd: updates.costUsd }),
        ...(updates.status && { status: updates.status }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
      },
    },
  });

  const itinerary = await getItinerary(entityId, itineraryId);
  if (!itinerary) throw new Error(`Itinerary ${itineraryId} not found after update`);
  return itinerary;
}

export async function addLeg(
  entityId: VerifiedEntityId,
  itineraryId: string,
  leg: Omit<ItineraryLeg, 'id'>
): Promise<Itinerary> {
  const events = await prisma.calendarEvent.findMany({
    where: {
      entityId,
      prepPacket: {
        path: ['itineraryId'],
        equals: itineraryId,
      },
    },
  });

  if (events.length === 0) throw new Error(`Itinerary ${itineraryId} not found`);

  const firstMeta = events[0].prepPacket as Record<string, unknown>;
  const itineraryName = firstMeta.itineraryName as string;
  const userId = firstMeta.userId as string;
  const newLegId = uuidv4();
  const newOrder = events.length + 1;

  await prisma.calendarEvent.create({
    data: {
      id: uuidv4(),
      title: `${itineraryName} — ${leg.type}: ${leg.departureLocation} → ${leg.arrivalLocation}`,
      entityId,
      startTime: new Date(leg.departureTime),
      endTime: new Date(leg.arrivalTime),
      prepPacket: {
        itineraryId,
        itineraryName,
        itineraryStatus: (firstMeta.itineraryStatus as string) ?? 'DRAFT',
        userId,
        legId: newLegId,
        legOrder: newOrder,
        legType: leg.type,
        departureLocation: leg.departureLocation,
        arrivalLocation: leg.arrivalLocation,
        timezone: leg.timezone,
        confirmationNumber: leg.confirmationNumber,
        provider: leg.provider,
        costUsd: leg.costUsd,
        status: leg.status,
        notes: leg.notes,
      },
    },
  });

  const itinerary = await getItinerary(entityId, itineraryId);
  if (!itinerary) throw new Error(`Itinerary ${itineraryId} not found after add`);
  return itinerary;
}

export async function removeLeg(
  entityId: VerifiedEntityId,
  itineraryId: string,
  legId: string
): Promise<Itinerary> {
  const events = await prisma.calendarEvent.findMany({
    where: {
      entityId,
      prepPacket: {
        path: ['itineraryId'],
        equals: itineraryId,
      },
    },
  });

  const targetEvent = events.find((e: { id: string; prepPacket: unknown }) => {
    const meta = e.prepPacket as Record<string, unknown> | null;
    return meta?.legId === legId;
  });

  if (!targetEvent) throw new Error(`Itinerary ${itineraryId} or leg ${legId} not found`);

  // deleteMany, not delete: delete takes a unique WHERE and cannot carry the entity.
  await prisma.calendarEvent.deleteMany({ where: { id: targetEvent.id, entityId } });

  // Re-order remaining legs
  const remaining = events.filter((e: { id: string }) => e.id !== targetEvent.id);
  remaining.sort((a: { prepPacket: unknown }, b: { prepPacket: unknown }) => {
    const metaA = a.prepPacket as Record<string, unknown>;
    const metaB = b.prepPacket as Record<string, unknown>;
    return ((metaA.legOrder as number) ?? 0) - ((metaB.legOrder as number) ?? 0);
  });

  for (let i = 0; i < remaining.length; i++) {
    const existingMeta = remaining[i].prepPacket as Record<string, unknown>;
    await prisma.calendarEvent.updateMany({
      where: { id: remaining[i].id, entityId },
      data: {
        prepPacket: { ...existingMeta, legOrder: i + 1 },
      },
    });
  }

  const itinerary = await getItinerary(entityId, itineraryId);
  if (!itinerary) throw new Error(`Itinerary ${itineraryId} not found after remove`);
  return itinerary;
}
