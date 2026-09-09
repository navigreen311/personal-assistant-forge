import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';

/**
 * Trips, stored on `Document` with `type = 'TRIP'`.
 *
 * `GET /api/travel/trips` used to read `(prisma as any).trip`,
 * `(prisma as any).loyaltyAccount` and `trip.itineraryItems`. None of those
 * models are in the schema, so every query threw, a `safeQuery` wrapper caught
 * the TypeError, and the trips page was served `{ upcoming: 0, active: 0,
 * thisYear: 0, loyaltyBalance: 0, trips: [] }` on every request. The page has
 * never shown a trip.
 *
 * `POST` was worse. Its create was wrapped in a `try/catch` whose catch returned
 * **201 Created** with a freshly minted `crypto.randomUUID()` and the caller's
 * own input echoed back. The trip wizard reported success, the user saw their
 * trip appear, and nothing had been written. It was reachable on every request,
 * because the delegate it called does not exist.
 *
 * The schema is frozen, so this uses the `Document` shadow-table convention that
 * the household module already uses for warranties, vehicles and the shopping
 * list. Every field the API returns now comes from a row that was really
 * written, and a failed write is reported as a failure.
 */

const DOCUMENT_TYPE = 'TRIP';

export interface TripContent {
  name: string;
  destination: string;
  origin: string;
  startDate: string;
  endDate: string;
  type: string;
  budget: number;
  spent: number;
}

export interface Trip extends Omit<TripContent, 'startDate' | 'endDate'> {
  id: string;
  entityId: string;
  startDate: Date;
  endDate: Date;
  status: 'upcoming' | 'active' | 'past';
  createdAt: Date;
}

export function deriveTripStatus(startDate: Date, endDate: Date, now = new Date()): Trip['status'] {
  if (now < startDate) return 'upcoming';
  if (now <= endDate) return 'active';
  return 'past';
}

function docToTrip(doc: { id: string; entityId: string; content: string | null; createdAt: Date }): Trip {
  const data = (doc.content ? JSON.parse(doc.content) : {}) as Partial<TripContent>;
  const startDate = data.startDate ? new Date(data.startDate) : new Date(0);
  const endDate = data.endDate ? new Date(data.endDate) : startDate;
  return {
    id: doc.id,
    entityId: doc.entityId,
    name: data.name ?? '',
    destination: data.destination ?? '',
    origin: data.origin ?? '',
    startDate,
    endDate,
    type: data.type ?? '',
    budget: data.budget ?? 0,
    spent: data.spent ?? 0,
    status: deriveTripStatus(startDate, endDate),
    createdAt: doc.createdAt,
  };
}

export type TripDraft = {
  name: string;
  destination: string;
  origin: string;
  startDate: string;
  endDate: string;
  type: string;
  budget: number;
};

export async function createTrip(entityId: VerifiedEntityId, draft: TripDraft): Promise<Trip> {
  const content: TripContent = { ...draft, spent: 0 };
  const created = await prisma.document.create({
    data: {
      title: draft.name,
      entityId,
      type: DOCUMENT_TYPE,
      status: 'ACTIVE',
      content: JSON.stringify(content),
    },
  });
  return docToTrip(created);
}

export async function listTrips(
  entityId: VerifiedEntityId,
  status: 'upcoming' | 'active' | 'past' | 'all' = 'all'
): Promise<Trip[]> {
  const docs = await prisma.document.findMany({
    where: { entityId, type: DOCUMENT_TYPE, deletedAt: null },
  });

  const trips = docs.map(docToTrip).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  if (status === 'all') return trips;
  return trips.filter((t) => t.status === status);
}
