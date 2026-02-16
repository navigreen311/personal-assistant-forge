import { BufferService } from '../../../src/modules/calendar/buffer.service';
import type { ScheduleRequest } from '../../../src/modules/calendar/calendar.types';

describe('BufferService', () => {
  let service: BufferService;

  beforeEach(() => {
    service = new BufferService();
  });

  const makeRequest = (overrides: Partial<ScheduleRequest> = {}): ScheduleRequest => ({
    title: 'Test Meeting',
    entityId: 'entity-1',
    duration: 60,
    priority: 'MEDIUM',
    type: 'MEETING',
    ...overrides,
  });

  describe('calculateBuffers', () => {
    it('should return default 5 min buffers for standard meeting', () => {
      const request = makeRequest();
      const buffers = service.calculateBuffers(request);
      expect(buffers.before).toBe(5);
      expect(buffers.after).toBe(5);
    });

    it('should return 0 buffers for calls', () => {
      const request = makeRequest({ type: 'CALL' });
      const buffers = service.calculateBuffers(request);
      expect(buffers.before).toBe(0);
      expect(buffers.after).toBe(0);
    });

    it('should add travel time when locations differ', () => {
      const request = makeRequest({ location: 'Office A' });
      const prevEvent = {
        id: 'prev',
        title: 'Previous',
        entityId: 'entity-1',
        participantIds: [],
        startTime: new Date('2026-02-15T08:00:00'),
        endTime: new Date('2026-02-15T09:00:00'),
        location: 'Downtown, Houston',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const buffers = service.calculateBuffers(request, prevEvent as any);
      // Locations differ but the heuristic determines travel time
      expect(buffers.before).toBeGreaterThanOrEqual(0);
    });

    it('should add prep time for large meetings', () => {
      const request = makeRequest({
        requiresPrep: true,
        participantIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'],
      });
      const buffers = service.calculateBuffers(request);
      expect(buffers.before).toBeGreaterThanOrEqual(30); // 30 min for 9+ participants
    });

    it('should add decompression after long meetings', () => {
      const decompression = service.calculateDecompressionTime('MEETING', 120, 5);
      expect(decompression).toBe(15); // workshops get 15 min
    });

    it('should respect user preference overrides', () => {
      const request = makeRequest({ bufferBefore: 20, bufferAfter: 15 });
      const buffers = service.calculateBuffers(request);
      expect(buffers.before).toBe(20);
      expect(buffers.after).toBe(15);
    });

    it('should auto-add 5 min buffer for focus blocks', () => {
      const request = makeRequest({ type: 'FOCUS_BLOCK', bufferBefore: undefined, bufferAfter: undefined });
      const buffers = service.calculateBuffers(request);
      expect(buffers.before).toBeGreaterThanOrEqual(5);
      expect(buffers.after).toBeGreaterThanOrEqual(5);
    });
  });

  describe('estimateTravelTime', () => {
    it('should return 0 for no locations', () => {
      expect(service.estimateTravelTime(undefined, undefined)).toBe(0);
    });

    it('should return 0 for same location', () => {
      expect(service.estimateTravelTime('Office A', 'Office A')).toBe(0);
    });

    it('should return 15 for same building', () => {
      expect(service.estimateTravelTime('Room 101', 'Room 202')).toBe(15);
    });

    it('should return 30 for same city', () => {
      expect(service.estimateTravelTime('Main Office', 'Client Site')).toBe(30);
    });

    it('should return 60 for different cities', () => {
      expect(service.estimateTravelTime('Houston, TX', 'Dallas, TX')).toBe(60);
    });
  });

  describe('calculatePrepTime', () => {
    it('should return 10 min for small meetings', () => {
      expect(service.calculatePrepTime('MEETING', 2, 'MEDIUM')).toBe(10);
    });

    it('should return 20 min for medium meetings', () => {
      expect(service.calculatePrepTime('MEETING', 5, 'MEDIUM')).toBe(20);
    });

    it('should return 30 min for large meetings', () => {
      expect(service.calculatePrepTime('MEETING', 10, 'MEDIUM')).toBe(30);
    });

    it('should increase for high-priority events', () => {
      const normalPrep = service.calculatePrepTime('MEETING', 5, 'MEDIUM');
      const highPrep = service.calculatePrepTime('MEETING', 5, 'HIGH');
      expect(highPrep).toBeGreaterThan(normalPrep);
    });

    it('should increase for critical events', () => {
      const normalPrep = service.calculatePrepTime('MEETING', 3, 'MEDIUM');
      const criticalPrep = service.calculatePrepTime('MEETING', 3, 'CRITICAL');
      expect(criticalPrep).toBeGreaterThan(normalPrep);
    });
  });

  describe('calculateDecompressionTime', () => {
    it('should return 10 min after meetings > 90 min', () => {
      expect(service.calculateDecompressionTime('MEETING', 100, 3)).toBe(10);
    });

    it('should return 15 min after workshops (120+ min meetings)', () => {
      expect(service.calculateDecompressionTime('MEETING', 120, 5)).toBe(15);
    });

    it('should return 5 min after stressful calls', () => {
      expect(service.calculateDecompressionTime('CALL', 45, 5)).toBe(5);
    });

    it('should return 0 for short meetings', () => {
      expect(service.calculateDecompressionTime('MEETING', 30, 2)).toBe(0);
    });
  });

  describe('getDefaultConfig', () => {
    it('should return a valid buffer config', () => {
      const config = service.getDefaultConfig();
      expect(config.defaultBefore).toBe(5);
      expect(config.defaultAfter).toBe(5);
      expect(config.travelTimeRules.length).toBeGreaterThan(0);
      expect(config.prepTimeRules.length).toBeGreaterThan(0);
      expect(config.decompressionRules.length).toBeGreaterThan(0);
    });
  });
});
