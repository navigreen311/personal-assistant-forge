// In-memory store for calendar events used by the mock
const calendarEventStore = new Map<string, any>();

const mockPrisma = {
  entity: {
    findFirst: jest.fn().mockResolvedValue({ id: 'entity-test' }),
  },
  calendarEvent: {
    create: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
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

  mockPrisma.entity.findFirst.mockResolvedValue({ id: 'entity-test' });

  mockPrisma.calendarEvent.create.mockImplementation(async ({ data }: any) => {
    const event = {
      id: data.id,
      title: data.title,
      entityId: data.entityId,
      startTime: data.startTime,
      endTime: data.endTime,
      prepPacket: data.prepPacket,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    calendarEventStore.set(event.id, event);
    return event;
  });

  mockPrisma.calendarEvent.findMany.mockImplementation(async ({ where }: any) => {
    const results: any[] = [];
    for (const [, event] of calendarEventStore) {
      if (where?.prepPacket?.path && where?.prepPacket?.equals) {
        const path = where.prepPacket.path;
        const equals = where.prepPacket.equals;
        const meta = event.prepPacket as Record<string, unknown>;
        if (meta && meta[path[0]] === equals) {
          results.push(event);
        }
      }
    }
    return results.sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  });

  mockPrisma.calendarEvent.delete.mockImplementation(async ({ where }: any) => {
    const event = calendarEventStore.get(where.id);
    calendarEventStore.delete(where.id);
    return event;
  });

  mockPrisma.calendarEvent.update.mockImplementation(async ({ where, data }: any) => {
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
    const itinerary = await createItinerary('user-itin-1', 'Test Trip', legs);
    expect(itinerary.totalCostEstimate).toBe(500);
  });

  it('should order legs correctly', async () => {
    const legs = [
      { ...baseLeg, order: 3, costUsd: 100 },
      { ...baseLeg, order: 1, costUsd: 200 },
      { ...baseLeg, order: 2, costUsd: 300 },
    ];
    const itinerary = await createItinerary('user-itin-2', 'Order Test', legs);
    expect(itinerary.legs[0].order).toBe(1);
    expect(itinerary.legs[1].order).toBe(2);
    expect(itinerary.legs[2].order).toBe(3);
  });

  it('should handle single-leg trips', async () => {
    const legs = [{ ...baseLeg, costUsd: 500 }];
    const itinerary = await createItinerary('user-itin-3', 'Single Leg', legs);
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
    const itinerary = await createItinerary('user-itin-4', 'Multi Leg', legs);
    expect(itinerary.legs).toHaveLength(4);
    expect(itinerary.totalCostEstimate).toBe(950);
  });
});

describe('addLeg / removeLeg', () => {
  it('should reorder legs after addition', async () => {
    const itinerary = await createItinerary('user-leg-1', 'Add Test', [{ ...baseLeg, costUsd: 300 }]);
    const updated = await addLeg(itinerary.id, { ...baseLeg, order: 2, costUsd: 200, type: 'HOTEL' });
    expect(updated.legs).toHaveLength(2);
    expect(updated.legs[0].order).toBe(1);
    expect(updated.legs[1].order).toBe(2);
  });

  it('should reorder legs after removal', async () => {
    const itinerary = await createItinerary('user-leg-2', 'Remove Test', [
      { ...baseLeg, costUsd: 300 },
      { ...baseLeg, order: 2, costUsd: 200, type: 'HOTEL' },
      { ...baseLeg, order: 3, costUsd: 100, type: 'CAR_RENTAL' },
    ]);
    const secondLegId = itinerary.legs[1].id;
    const updated = await removeLeg(itinerary.id, secondLegId);
    expect(updated.legs).toHaveLength(2);
    expect(updated.legs[0].order).toBe(1);
    expect(updated.legs[1].order).toBe(2);
  });

  it('should recalculate total cost', async () => {
    const itinerary = await createItinerary('user-leg-3', 'Cost Test', [{ ...baseLeg, costUsd: 300 }]);
    const afterAdd = await addLeg(itinerary.id, { ...baseLeg, order: 2, costUsd: 200, type: 'HOTEL' });
    expect(afterAdd.totalCostEstimate).toBe(500);

    const afterRemove = await removeLeg(itinerary.id, afterAdd.legs[1].id);
    expect(afterRemove.totalCostEstimate).toBe(300);
  });
});
