import type { MockedDelegates } from '../../support/prisma-mock';

/**
 * P-35: this fake's delegate names, method names and `mockImplementation` args
 * were all unconstrained -- `const mockPrisma = { calendarEvent: {...} }` with
 * `({ data }: any)` throughout. `MockedDelegates` binds the names to the real
 * client (tests/support/prisma-mock.ts) and the types below name the columns
 * this fake actually reads, so the mock now states the interface it is
 * standing in for. The row types are deliberately local and partial: the
 * service reads six columns of `CalendarEvent` and the fake stores exactly
 * those, which is what it stored before.
 */

/** The CalendarEvent columns this fake stores and returns. */
interface EventRow {
  id: string;
  title: string;
  entityId: string;
  startTime: Date;
  endTime: Date;
  prepPacket: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/** The columns the service supplies on create/update. */
type EventInput = Partial<Omit<EventRow, 'createdAt' | 'updatedAt'>>;

/** The `where` shapes the service builds, including the JSON-path filter. */
interface EventWhere {
  id?: string;
  entityId?: string;
  prepPacket?: { path?: string[]; equals?: unknown };
}

// In-memory store for calendar events used by the mock
const calendarEventStore = new Map<string, EventRow>();

const mockPrisma: MockedDelegates<'entity' | 'calendarEvent'> = {
  entity: {
    findFirst: jest.fn().mockResolvedValue({ id: 'entity-test' }),
  },
  calendarEvent: {
    create: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
  generateJSON: jest.fn(),
  chat: jest.fn(),
  streamText: jest.fn(),
}));

import { createItinerary, addLeg, removeLeg, calculateTotalCost } from '@/modules/travel/services/itinerary-service';
import type { ItineraryLeg, Itinerary } from '@/modules/travel/types';

import { verifiedEntityIdForTest } from '../../helpers/factories';

/**
 * The entity that owns the rows under test -- deliberately NOT a user id.
 *
 * These services used to take a parameter named `userId` and write it straight
 * into the `entityId` column. The scope is now a `VerifiedEntityId`, which a
 * plain string is not assignable to, so a call site handing a service an
 * unverified value no longer compiles.
 */
const entity = (n: string) => verifiedEntityIdForTest(`entity-${n}`);

/** One scope for the whole file: every itinerary here belongs to the same entity. */
const SCOPE = entity('1');


const baseLeg: Omit<ItineraryLeg, 'id'> = {
  order: 1,
  type: 'FLIGHT',
  departureLocation: 'DFW',
  arrivalLocation: 'LAX',
  departureTime: new Date('2026-04-01T08:00:00'),
  arrivalTime: new Date('2026-04-01T10:00:00'),
  timezone: 'America/Chicago',
  costUsd: 300,
  status: 'BOOKED',
};

beforeEach(() => {
  calendarEventStore.clear();
  jest.clearAllMocks();

  mockPrisma.entity.findFirst!.mockResolvedValue({ id: 'entity-test' });

  mockPrisma.calendarEvent.create!.mockImplementation(async ({ data }: { data: EventInput }) => {
    const event: EventRow = {
      id: data.id ?? '',
      title: data.title ?? '',
      entityId: data.entityId ?? '',
      startTime: data.startTime ?? new Date(0),
      endTime: data.endTime ?? new Date(0),
      prepPacket: data.prepPacket,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    calendarEventStore.set(event.id, event);
    return event;
  });

  mockPrisma.calendarEvent.findMany!.mockImplementation(async ({ where }: { where?: EventWhere }) => {
    const results: EventRow[] = [];
    for (const [, event] of calendarEventStore) {
      // The service now carries the entity in the WHERE; honour it here, or the
      // mock would answer questions the real client would refuse.
      if (where?.entityId && event.entityId !== where.entityId) continue;
      if (where?.prepPacket?.path && where?.prepPacket?.equals !== undefined) {
        const path = where.prepPacket.path;
        const equals = where.prepPacket.equals;
        const meta = event.prepPacket as Record<string, unknown>;
        if (meta && meta[path[0]] === equals) {
          results.push(event);
        }
      }
    }
    return results.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  });

  mockPrisma.calendarEvent.delete!.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const event = calendarEventStore.get(where.id);
    calendarEventStore.delete(where.id);
    return event;
  });

  mockPrisma.calendarEvent.deleteMany!.mockImplementation(async ({ where }: { where: EventWhere & { id: string } }) => {
    const event = calendarEventStore.get(where.id);
    if (!event || (where.entityId && event.entityId !== where.entityId)) return { count: 0 };
    calendarEventStore.delete(where.id);
    return { count: 1 };
  });

  mockPrisma.calendarEvent.updateMany!.mockImplementation(async ({ where, data }: { where: EventWhere & { id: string }; data: EventInput }) => {
    const existing = calendarEventStore.get(where.id);
    if (!existing || (where.entityId && existing.entityId !== where.entityId)) {
      return { count: 0 };
    }
    const updated = { ...existing, ...data, updatedAt: new Date() };
    if (data.prepPacket) updated.prepPacket = data.prepPacket;
    calendarEventStore.set(where.id, updated);
    return { count: 1 };
  });

  mockPrisma.calendarEvent.update!.mockImplementation(async ({ where, data }: { where: { id: string }; data: EventInput }) => {
    const existing = calendarEventStore.get(where.id);
    if (!existing) throw new Error(`Event ${where.id} not found`);
    const updated = { ...existing, ...data, updatedAt: new Date() };
    if (data.prepPacket) {
      updated.prepPacket = data.prepPacket;
    }
    calendarEventStore.set(where.id, updated);
    return updated;
  });
});

describe('createItinerary', () => {
  it('should calculate total cost from legs', async () => {
    const legs = [
      { ...baseLeg, costUsd: 300 },
      { ...baseLeg, order: 2, type: 'HOTEL' as const, departureLocation: 'LAX', arrivalLocation: 'LAX Hotel', costUsd: 200 },
    ];
    const itinerary = await createItinerary(SCOPE, 'user-itin-1', 'Test Trip', legs);
    expect(itinerary.totalCostEstimate).toBe(500);
  });

  it('should order legs correctly', async () => {
    const legs = [
      { ...baseLeg, order: 3, costUsd: 100 },
      { ...baseLeg, order: 1, costUsd: 200 },
      { ...baseLeg, order: 2, costUsd: 300 },
    ];
    const itinerary = await createItinerary(SCOPE, 'user-itin-2', 'Order Test', legs);
    expect(itinerary.legs[0].order).toBe(1);
    expect(itinerary.legs[1].order).toBe(2);
    expect(itinerary.legs[2].order).toBe(3);
  });

  it('should handle single-leg trips', async () => {
    const legs = [{ ...baseLeg, costUsd: 500 }];
    const itinerary = await createItinerary(SCOPE, 'user-itin-3', 'Single Leg', legs);
    expect(itinerary.legs).toHaveLength(1);
    expect(itinerary.totalCostEstimate).toBe(500);
  });

  it('should handle multi-leg trips', async () => {
    const legs = [
      { ...baseLeg, costUsd: 300 },
      { ...baseLeg, order: 2, type: 'HOTEL' as const, costUsd: 200 },
      { ...baseLeg, order: 3, type: 'CAR_RENTAL' as const, costUsd: 100 },
      { ...baseLeg, order: 4, type: 'FLIGHT' as const, costUsd: 350 },
    ];
    const itinerary = await createItinerary(SCOPE, 'user-itin-4', 'Multi Leg', legs);
    expect(itinerary.legs).toHaveLength(4);
    expect(itinerary.totalCostEstimate).toBe(950);
  });
});

describe('addLeg / removeLeg', () => {
  it('should reorder legs after addition', async () => {
    const itinerary = await createItinerary(SCOPE, 'user-leg-1', 'Add Test', [{ ...baseLeg, costUsd: 300 }]);
    const updated = await addLeg(SCOPE, itinerary.id, { ...baseLeg, order: 2, costUsd: 200, type: 'HOTEL' });
    expect(updated.legs).toHaveLength(2);
    expect(updated.legs[0].order).toBe(1);
    expect(updated.legs[1].order).toBe(2);
  });

  it('should reorder legs after removal', async () => {
    const itinerary = await createItinerary(SCOPE, 'user-leg-2', 'Remove Test', [
      { ...baseLeg, costUsd: 300 },
      { ...baseLeg, order: 2, costUsd: 200, type: 'HOTEL' },
      { ...baseLeg, order: 3, costUsd: 100, type: 'CAR_RENTAL' },
    ]);
    const secondLegId = itinerary.legs[1].id;
    const updated = await removeLeg(SCOPE, itinerary.id, secondLegId);
    expect(updated.legs).toHaveLength(2);
    expect(updated.legs[0].order).toBe(1);
    expect(updated.legs[1].order).toBe(2);
  });

  it('should recalculate total cost', async () => {
    const itinerary = await createItinerary(SCOPE, 'user-leg-3', 'Cost Test', [{ ...baseLeg, costUsd: 300 }]);
    const afterAdd = await addLeg(SCOPE, itinerary.id, { ...baseLeg, order: 2, costUsd: 200, type: 'HOTEL' });
    expect(afterAdd.totalCostEstimate).toBe(500);

    const afterRemove = await removeLeg(SCOPE, itinerary.id, afterAdd.legs[1].id);
    expect(afterRemove.totalCostEstimate).toBe(300);
  });
});
