import { EnergyService } from '../../../src/modules/calendar/energy.service';
import type { CalendarEvent } from '../../../src/shared/types';

describe('EnergyService', () => {
  let service: EnergyService;

  beforeEach(() => {
    service = new EnergyService();
  });

  describe('getEnergyLevel', () => {
    it('should return PEAK at 8am for EARLY_BIRD', () => {
      expect(service.getEnergyLevel('EARLY_BIRD', 8)).toBe('PEAK');
    });

    it('should return LOW at 8am for NIGHT_OWL', () => {
      expect(service.getEnergyLevel('NIGHT_OWL', 8)).toBe('LOW');
    });

    it('should return HIGH at 10am for FLEXIBLE', () => {
      expect(service.getEnergyLevel('FLEXIBLE', 10)).toBe('HIGH');
    });

    it('should return PEAK at 20:00 for NIGHT_OWL', () => {
      expect(service.getEnergyLevel('NIGHT_OWL', 20)).toBe('PEAK');
    });

    it('should return LOW at 15:00 for EARLY_BIRD', () => {
      expect(service.getEnergyLevel('EARLY_BIRD', 15)).toBe('LOW');
    });

    it('should return MODERATE at 13:00 for EARLY_BIRD', () => {
      expect(service.getEnergyLevel('EARLY_BIRD', 13)).toBe('MODERATE');
    });

    it('should return RECOVERY at 17:00 for EARLY_BIRD', () => {
      expect(service.getEnergyLevel('EARLY_BIRD', 17)).toBe('RECOVERY');
    });

    it('should return HIGH at 15:00 for NIGHT_OWL', () => {
      expect(service.getEnergyLevel('NIGHT_OWL', 15)).toBe('HIGH');
    });
  });

  describe('getRecommendedEventTypes', () => {
    it('should recommend FOCUS_BLOCK for PEAK energy', () => {
      const types = service.getRecommendedEventTypes('PEAK');
      expect(types).toContain('FOCUS_BLOCK');
      expect(types).toContain('MEETING');
    });

    it('should recommend MEETING for HIGH energy', () => {
      const types = service.getRecommendedEventTypes('HIGH');
      expect(types).toContain('MEETING');
      expect(types).toContain('CALL');
    });

    it('should recommend BREAK for LOW energy', () => {
      const types = service.getRecommendedEventTypes('LOW');
      expect(types).toContain('BREAK');
    });

    it('should recommend PREP for RECOVERY energy', () => {
      const types = service.getRecommendedEventTypes('RECOVERY');
      expect(types).toContain('PREP');
    });
  });

  describe('calculateContextSwitchCost', () => {
    const makeEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
      id: 'event-1',
      title: 'Test Meeting',
      entityId: 'entity-1',
      participantIds: ['contact-1'],
      startTime: new Date('2026-02-15T09:00:00'),
      endTime: new Date('2026-02-15T10:00:00'),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

    it('should add +3 for different entity', () => {
      const prev = makeEvent({ entityId: 'entity-1', participantIds: [] });
      const next = makeEvent({ entityId: 'entity-2', id: 'event-2', participantIds: [] });
      const result = service.calculateContextSwitchCost(prev, next, 30);
      expect(result.factors).toContainEqual(expect.stringContaining('Different entity'));
      expect(result.score).toBeGreaterThanOrEqual(3);
    });

    it('should add +2 for different event type', () => {
      const prev = makeEvent({ title: 'Team Call' });
      const next = makeEvent({ title: 'Focus Block', id: 'event-2' });
      const result = service.calculateContextSwitchCost(prev, next, 30);
      expect(result.factors).toContainEqual(expect.stringContaining('Different event type'));
    });

    it('should add +2 for gap < 10 minutes', () => {
      const prev = makeEvent();
      const next = makeEvent({ id: 'event-2' });
      const result = service.calculateContextSwitchCost(prev, next, 5);
      expect(result.factors).toContainEqual(expect.stringContaining('Gap < 10'));
    });

    it('should subtract -1 for gap > 60 minutes', () => {
      const prev = makeEvent();
      const next = makeEvent({ id: 'event-2' });
      const result = service.calculateContextSwitchCost(prev, next, 90);
      expect(result.factors).toContainEqual(expect.stringContaining('Gap > 60'));
    });

    it('should subtract -2 for same participants', () => {
      const prev = makeEvent({ participantIds: ['c1', 'c2'] });
      const next = makeEvent({ participantIds: ['c2', 'c3'], id: 'event-2' });
      const result = service.calculateContextSwitchCost(prev, next, 30);
      expect(result.factors).toContainEqual(expect.stringContaining('Shared participants'));
    });

    it('should return 0 for no previous event', () => {
      const next = makeEvent();
      const result = service.calculateContextSwitchCost(null, next, 0);
      expect(result.score).toBe(0);
    });

    it('should cap at 0-10 range', () => {
      // Max out all factors
      const prev = makeEvent({ entityId: 'a', participantIds: [] });
      const next = makeEvent({ entityId: 'b', id: 'event-2', title: 'Focus Deep Work', participantIds: [] });
      const result = service.calculateContextSwitchCost(prev, next, 5);
      expect(result.score).toBeLessThanOrEqual(10);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getDailyEnergyMapping', () => {
    it('should return 24 entries for EARLY_BIRD', () => {
      const mapping = service.getDailyEnergyMapping('EARLY_BIRD');
      expect(mapping).toHaveLength(24);
    });

    it('should map each hour to correct energy level', () => {
      const mapping = service.getDailyEnergyMapping('EARLY_BIRD');
      const hour8 = mapping.find((m) => m.hour === 8);
      expect(hour8?.energyLevel).toBe('PEAK');
    });

    it('should include suitable event types for each level', () => {
      const mapping = service.getDailyEnergyMapping('FLEXIBLE');
      const hour10 = mapping.find((m) => m.hour === 10);
      expect(hour10?.suitableFor.length).toBeGreaterThan(0);
    });

    it('should return 24 entries for NIGHT_OWL', () => {
      const mapping = service.getDailyEnergyMapping('NIGHT_OWL');
      expect(mapping).toHaveLength(24);
      const hour20 = mapping.find((m) => m.hour === 20);
      expect(hour20?.energyLevel).toBe('PEAK');
    });
  });

  describe('getEnergyProfile', () => {
    it('should return profile with all energy levels for EARLY_BIRD', () => {
      const profile = service.getEnergyProfile('EARLY_BIRD');
      expect(profile.chronotype).toBe('EARLY_BIRD');
      expect(profile.peakHours.length).toBeGreaterThan(0);
      expect(profile.highHours.length).toBeGreaterThan(0);
      expect(profile.moderateHours.length).toBeGreaterThan(0);
      expect(profile.lowHours.length).toBeGreaterThan(0);
      expect(profile.recoveryHours.length).toBeGreaterThan(0);
    });
  });
});
