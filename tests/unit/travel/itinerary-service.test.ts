jest.mock('uuid', () => ({
  v4: () => 'test-uuid-' + Math.random().toString(36).substring(7),
}));

const mockCalendarEventCreate = jest.fn();
const mockCalendarEventFindMany = jest.fn();
const mockCalendarEventUpdate = jest.fn();
const mockCalendarEventDelete = jest.fn();
const mockEntityFindFirst = jest.fn();

jest.mock('../../../src/lib/db', () => ({
  prisma: {
    calendarEvent: {
      create: (...args: unknown[]) => mockCalendarEventCreate(...args),
      findMany: (...args: unknown[]) => mockCalendarEventFindMany(...args),
      update: (...args: unknown[]) => mockCalendarEventUpdate(...args),
      delete: (...args: unknown[]) => mockCalendarEventDelete(...args),
    },
    entity: {
      findFirst: (...args: unknown[]) => mockEntityFindFirst(...args),
    },
  },
}));

const mockGenerateJSON = jest.fn();
jest.mock('../../../src/lib/ai', () => ({
  generateJSON: (...args: unknown[]) => mockGenerateJSON(...args),
}));

import {
  createItinerary,
  getItinerary,
  listItineraries,
  optimizeItinerary,
  calculateTotalCost,
} from '../../../src/modules/travel/services/itinerary-service';
import type { Itinerary, ItineraryLeg } from '../../../src/modules/travel/types';

const makeCalendarEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'ce-1',
  title: 'Trip — FLIGHT: DFW → NRT',
  entityId: 'entity-1',
  startTime: new Date('2026-03-15T08:00:00Z'),
  endTime: new Date('2026-03-16T14:00:00Z'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  prepPacket: {
    itineraryId: 'itin-1',
    itineraryName: 'Tokyo Trip',
    itineraryStatus: 'DRAFT',
    userId: 'user-1',
    legId: 'leg-1',
    legOrder: 1,
    legType: 'FLIGHT',
    departureLocation: 'DFW',
    arrivalLocation: 'NRT',
    timezone: 'America/Chicago',
    provider: 'AA',
    costUsd: 1200,
    status: 'BOOKED',
  },
  ...overrides,
});

describe('createItinerary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEntityFindFirst.mockResolvedValue({ id: 'entity-1' });
    mockCalendarEventCreate.mockResolvedValue({});
  });

  it('should create CalendarEvent records for each leg', async () => {
    const legs = [
      {
        order: 1, type: 'FLIGHT' as const, departureLocation: 'DFW', arrivalLocation: 'NRT',
        departureTime: new Date('2026-03-15T08:00:00Z'), arrivalTime: new Date('2026-03-16T14:00:00Z'),
        timezone: 'America/Chicago', costUsd: 1200, status: 'BOOKED' as const,
      },
      {
        order: 2, type: 'HOTEL' as const, departureLocation: 'NRT', arrivalLocation: 'Hotel',
        departureTime: new Date('2026-03-16T15:00:00Z'), arrivalTime: new Date('2026-03-20T11:00:00Z'),
        timezone: 'Asia/Tokyo', costUsd: 800, status: 'BOOKED' as const,
      },
    ];

    await createItinerary('user-1', 'Tokyo Trip', legs);

    expect(mockCalendarEventCreate).toHaveBeenCalledTimes(2);
  });

  it('should store itinerary metadata in CalendarEvent', async () => {
    const legs = [
      {
        order: 1, type: 'FLIGHT' as const, departureLocation: 'DFW', arrivalLocation: 'NRT',
        departureTime: new Date('2026-03-15T08:00:00Z'), arrivalTime: new Date('2026-03-16T14:00:00Z'),
        timezone: 'America/Chicago', costUsd: 1200, status: 'BOOKED' as const,
      },
    ];

    await createItinerary('user-1', 'Tokyo Trip', legs);

    expect(mockCalendarEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityId: 'entity-1',
          prepPacket: expect.objectContaining({
            itineraryName: 'Tokyo Trip',
            userId: 'user-1',
            legType: 'FLIGHT',
            departureLocation: 'DFW',
            arrivalLocation: 'NRT',
          }),
        }),
      })
    );
  });

  it('should return a valid Itinerary object', async () => {
    const legs = [
      {
        order: 1, type: 'FLIGHT' as const, departureLocation: 'DFW', arrivalLocation: 'NRT',
        departureTime: new Date('2026-03-15T08:00:00Z'), arrivalTime: new Date('2026-03-16T14:00:00Z'),
        timezone: 'America/Chicago', costUsd: 1200, status: 'BOOKED' as const,
      },
    ];

    const result = await createItinerary('user-1', 'Tokyo Trip', legs);

    expect(result.userId).toBe('user-1');
    expect(result.name).toBe('Tokyo Trip');
    expect(result.status).toBe('DRAFT');
    expect(result.legs).toHaveLength(1);
    expect(result.totalCostEstimate).toBe(1200);
    expect(result.currency).toBe('USD');
  });
});

describe('getItinerary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reconstruct Itinerary from CalendarEvent records', async () => {
    mockCalendarEventFindMany.mockResolvedValue([makeCalendarEvent()]);

    const result = await getItinerary('itin-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('itin-1');
    expect(result!.name).toBe('Tokyo Trip');
    expect(result!.legs).toHaveLength(1);
    expect(result!.legs[0].departureLocation).toBe('DFW');
    expect(result!.legs[0].arrivalLocation).toBe('NRT');
  });

  it('should return null when itinerary not found', async () => {
    mockCalendarEventFindMany.mockResolvedValue([]);

    const result = await getItinerary('nonexistent');

    expect(result).toBeNull();
  });
});

describe('listItineraries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should group CalendarEvents by itineraryId', async () => {
    mockCalendarEventFindMany.mockResolvedValue([
      makeCalendarEvent({ id: 'ce-1' }),
      makeCalendarEvent({
        id: 'ce-2',
        prepPacket: {
          ...makeCalendarEvent().prepPacket,
          itineraryId: 'itin-2',
          itineraryName: 'Paris Trip',
          legId: 'leg-2',
        },
      }),
    ]);

    const result = await listItineraries('user-1');

    expect(result).toHaveLength(2);
  });

  it('should filter by status when provided', async () => {
    mockCalendarEventFindMany.mockResolvedValue([
      makeCalendarEvent({
        prepPacket: { ...makeCalendarEvent().prepPacket, itineraryStatus: 'CONFIRMED' },
      }),
    ]);

    const result = await listItineraries('user-1', 'DRAFT');

    expect(result).toHaveLength(0);
  });
});

describe('optimizeItinerary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call generateJSON with leg summaries', async () => {
    mockGenerateJSON.mockResolvedValue({
      suggestions: ['Consider a direct flight'],
      optimizedOrder: [1],
    });

    const itinerary: Itinerary = {
      id: 'itin-1',
      userId: 'user-1',
      name: 'Test Trip',
      status: 'DRAFT',
      legs: [{
        id: 'leg-1', order: 1, type: 'FLIGHT',
        departureLocation: 'DFW', arrivalLocation: 'NRT',
        departureTime: new Date(), arrivalTime: new Date(),
        timezone: 'America/Chicago', costUsd: 1200, status: 'BOOKED',
      }],
      totalCostEstimate: 1200,
      currency: 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await optimizeItinerary(itinerary);

    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    expect(result.suggestions).toContain('Consider a direct flight');
  });

  it('should return suggestions on AI success', async () => {
    mockGenerateJSON.mockResolvedValue({
      suggestions: ['Book earlier for savings', 'Consider layovers'],
    });

    const itinerary: Itinerary = {
      id: 'itin-1', userId: 'user-1', name: 'Test', status: 'DRAFT',
      legs: [], totalCostEstimate: 0, currency: 'USD',
      createdAt: new Date(), updatedAt: new Date(),
    };

    const result = await optimizeItinerary(itinerary);

    expect(result.suggestions).toHaveLength(2);
  });

  it('should return fallback message on AI failure', async () => {
    mockGenerateJSON.mockRejectedValue(new Error('AI error'));

    const itinerary: Itinerary = {
      id: 'itin-1', userId: 'user-1', name: 'Test', status: 'DRAFT',
      legs: [], totalCostEstimate: 0, currency: 'USD',
      createdAt: new Date(), updatedAt: new Date(),
    };

    const result = await optimizeItinerary(itinerary);

    expect(result.suggestions[0]).toContain('Unable to generate AI optimization suggestions');
  });
});

describe('calculateTotalCost', () => {
  it('should sum all leg costs', () => {
    const itinerary: Itinerary = {
      id: 'itin-1', userId: 'user-1', name: 'Test', status: 'DRAFT',
      legs: [
        { id: '1', order: 1, type: 'FLIGHT', departureLocation: 'A', arrivalLocation: 'B', departureTime: new Date(), arrivalTime: new Date(), timezone: 'UTC', costUsd: 500, status: 'BOOKED' },
        { id: '2', order: 2, type: 'HOTEL', departureLocation: 'B', arrivalLocation: 'Hotel', departureTime: new Date(), arrivalTime: new Date(), timezone: 'UTC', costUsd: 300, status: 'BOOKED' },
      ],
      totalCostEstimate: 0, currency: 'USD',
      createdAt: new Date(), updatedAt: new Date(),
    };

    expect(calculateTotalCost(itinerary)).toBe(800);
  });
});
