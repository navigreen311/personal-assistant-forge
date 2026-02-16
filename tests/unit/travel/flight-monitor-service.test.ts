jest.mock('uuid', () => ({
  v4: () => 'test-uuid-' + Math.random().toString(36).substring(7),
}));

const mockNotificationCreate = jest.fn();
const mockNotificationFindMany = jest.fn();
const mockCalendarEventFindMany = jest.fn();

jest.mock('../../../src/lib/db', () => ({
  prisma: {
    notification: {
      create: (...args: unknown[]) => mockNotificationCreate(...args),
      findMany: (...args: unknown[]) => mockNotificationFindMany(...args),
    },
    calendarEvent: {
      findMany: (...args: unknown[]) => mockCalendarEventFindMany(...args),
    },
    entity: {
      findFirst: jest.fn().mockResolvedValue({ id: 'entity-1' }),
    },
  },
}));

const mockGenerateText = jest.fn();
jest.mock('../../../src/lib/ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

// Mock itinerary-service
const mockGetItinerary = jest.fn();
const mockListItineraries = jest.fn();
jest.mock('../../../src/modules/travel/services/itinerary-service', () => ({
  getItinerary: (...args: unknown[]) => mockGetItinerary(...args),
  listItineraries: (...args: unknown[]) => mockListItineraries(...args),
}));

import { checkFlightStatus, getActiveAlerts, generateDisruptionResponse } from '../../../src/modules/travel/services/flight-monitor-service';
import type { FlightAlert, Itinerary, ItineraryLeg } from '../../../src/modules/travel/types';

const makeLeg = (overrides: Partial<ItineraryLeg> = {}): ItineraryLeg => ({
  id: 'leg-1',
  order: 1,
  type: 'FLIGHT',
  departureLocation: 'DFW',
  arrivalLocation: 'NRT',
  departureTime: new Date('2026-03-15T08:00:00Z'),
  arrivalTime: new Date('2026-03-16T14:00:00Z'),
  timezone: 'America/Chicago',
  provider: 'American Airlines',
  costUsd: 1200,
  status: 'BOOKED',
  ...overrides,
});

const makeItinerary = (overrides: Partial<Itinerary> = {}): Itinerary => ({
  id: 'itin-1',
  userId: 'user-1',
  name: 'Tokyo Trip',
  status: 'CONFIRMED',
  legs: [makeLeg()],
  totalCostEstimate: 1200,
  currency: 'USD',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('checkFlightStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty alerts when no itinerary found', async () => {
    mockGetItinerary.mockResolvedValue(null);

    const alerts = await checkFlightStatus('nonexistent');
    expect(alerts).toEqual([]);
  });

  it('should create Notification records for delayed flights from CalendarEvent metadata', async () => {
    const itinerary = makeItinerary();
    mockGetItinerary.mockResolvedValue(itinerary);
    mockCalendarEventFindMany.mockResolvedValue([
      {
        id: 'ce-1',
        prepPacket: { itineraryId: 'itin-1', legId: 'leg-1', flightStatus: 'DELAYED', delayMinutes: 45 },
      },
    ]);
    mockNotificationCreate.mockResolvedValue({});

    const alerts = await checkFlightStatus('itin-1');

    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertType).toBe('DELAY');
    expect(alerts[0].severity).toBe('INFO');
    expect(alerts[0].message).toContain('delayed by 45 minutes');
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'flight_alert',
          userId: 'user-1',
        }),
      })
    );
  });

  it('should create Notification records for cancelled flights from CalendarEvent metadata', async () => {
    const itinerary = makeItinerary();
    mockGetItinerary.mockResolvedValue(itinerary);
    mockCalendarEventFindMany.mockResolvedValue([
      {
        id: 'ce-1',
        prepPacket: { itineraryId: 'itin-1', legId: 'leg-1', flightStatus: 'CANCELLED' },
      },
    ]);
    mockNotificationCreate.mockResolvedValue({});

    const alerts = await checkFlightStatus('itin-1');

    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertType).toBe('CANCELLATION');
    expect(alerts[0].severity).toBe('CRITICAL');
    expect(alerts[0].message).toContain('cancelled');
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: 'urgent',
          type: 'flight_alert',
        }),
      })
    );
  });

  it('should not create alerts for on-time flights', async () => {
    const itinerary = makeItinerary();
    mockGetItinerary.mockResolvedValue(itinerary);
    mockCalendarEventFindMany.mockResolvedValue([
      {
        id: 'ce-1',
        prepPacket: { itineraryId: 'itin-1', legId: 'leg-1', flightStatus: 'ON_TIME' },
      },
    ]);

    const alerts = await checkFlightStatus('itin-1');

    expect(alerts).toHaveLength(0);
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });
});

describe('getActiveAlerts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should query Notification model with type flight_alert', async () => {
    mockNotificationFindMany.mockResolvedValue([]);

    await getActiveAlerts('user-1');

    expect(mockNotificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', type: 'flight_alert' },
      })
    );
  });

  it('should deserialize metadata into FlightAlert objects', async () => {
    mockNotificationFindMany.mockResolvedValue([
      {
        id: 'notif-1',
        body: 'Flight delayed',
        createdAt: new Date('2026-03-15T10:00:00Z'),
        metadata: {
          itineraryId: 'itin-1',
          legId: 'leg-1',
          alertType: 'DELAY',
          severity: 'WARNING',
          originalValue: '08:00',
          newValue: '09:30',
          timestamp: '2026-03-15T10:00:00.000Z',
        },
      },
    ]);

    const alerts = await getActiveAlerts('user-1');

    expect(alerts).toHaveLength(1);
    expect(alerts[0].itineraryId).toBe('itin-1');
    expect(alerts[0].legId).toBe('leg-1');
    expect(alerts[0].alertType).toBe('DELAY');
    expect(alerts[0].severity).toBe('WARNING');
    expect(alerts[0].message).toBe('Flight delayed');
  });

  it('should return empty array when no alerts exist', async () => {
    mockNotificationFindMany.mockResolvedValue([]);

    const alerts = await getActiveAlerts('user-1');
    expect(alerts).toEqual([]);
  });
});

describe('generateDisruptionResponse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call generateText for recommendation explanation', async () => {
    mockGenerateText.mockResolvedValue('The cheaper option saves money while having a reasonable departure time.');

    const alert: FlightAlert = {
      itineraryId: 'itin-1',
      legId: 'leg-1',
      alertType: 'CANCELLATION',
      severity: 'CRITICAL',
      message: 'Flight cancelled',
      timestamp: new Date(),
    };
    const itinerary = makeItinerary();

    const response = await generateDisruptionResponse(alert, itinerary);

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(response.reason).toBe('The cheaper option saves money while having a reasonable departure time.');
  });

  it('should return alternatives with cost comparison', async () => {
    mockGenerateText.mockResolvedValue('Best option.');

    const alert: FlightAlert = {
      itineraryId: 'itin-1',
      legId: 'leg-1',
      alertType: 'DELAY',
      severity: 'WARNING',
      message: 'Flight delayed',
      timestamp: new Date(),
    };
    const itinerary = makeItinerary();

    const response = await generateDisruptionResponse(alert, itinerary);

    expect(response.alternatives).toHaveLength(2);
    expect(response.recommendation).toBe(response.alternatives[1]);
    expect(response.originalLeg.id).toBe('leg-1');
    expect(response.additionalCost).toBeLessThan(0); // Cheaper option
  });

  it('should fallback to default reason on AI failure', async () => {
    mockGenerateText.mockRejectedValue(new Error('AI unavailable'));

    const alert: FlightAlert = {
      itineraryId: 'itin-1',
      legId: 'leg-1',
      alertType: 'DELAY',
      severity: 'WARNING',
      message: 'Flight delayed',
      timestamp: new Date(),
    };
    const itinerary = makeItinerary();

    const response = await generateDisruptionResponse(alert, itinerary);

    expect(response.reason).toBe('Recommended based on lower cost and reasonable timing');
  });
});
