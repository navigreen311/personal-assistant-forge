import { BufferService } from '../../../src/modules/calendar/buffer.service';
import type {
  BufferContext,
  BufferOptimizationConstraints,
  BufferSettings,
  ScheduleRequest,
} from '../../../src/modules/calendar/calendar.types';
import type { CalendarEvent } from '../../../src/shared/types/index';

// Mock prisma using the path alias the module actually imports
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

describe('BufferService', () => {
  let service: BufferService;

  beforeEach(() => {
    service = new BufferService();
    jest.clearAllMocks();
  });

  const makeRequest = (overrides: Partial<ScheduleRequest> = {}): ScheduleRequest => ({
    title: 'Test Meeting',
    entityId: 'entity-1',
    duration: 60,
    priority: 'MEDIUM',
    type: 'MEETING',
    ...overrides,
  });

  const makeEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id: 'event-1',
    title: 'Test Event',
    entityId: 'entity-1',
    participantIds: [],
    startTime: new Date('2026-02-15T10:00:00'),
    endTime: new Date('2026-02-15T11:00:00'),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  // ==========================================================================
  // Existing method tests (preserved)
  // ==========================================================================

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
      expect(buffers.before).toBeGreaterThanOrEqual(0);
    });

    it('should add prep time for large meetings', () => {
      const request = makeRequest({
        requiresPrep: true,
        participantIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'],
      });
      const buffers = service.calculateBuffers(request);
      expect(buffers.before).toBeGreaterThanOrEqual(30);
    });

    it('should add decompression after long meetings', () => {
      const decompression = service.calculateDecompressionTime('MEETING', 120, 5);
      expect(decompression).toBe(15);
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

  // ==========================================================================
  // New method tests
  // ==========================================================================

  describe('getBufferTime', () => {
    it('should return default buffers with no context', () => {
      const result = service.getBufferTime('MEETING', {});
      expect(result.before).toBeGreaterThanOrEqual(5);
      expect(result.after).toBeGreaterThanOrEqual(5);
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.travel).toBeDefined();
      expect(result.breakdown.contextSwitch).toBeDefined();
      expect(typeof result.breakdown.recovery).toBe('number');
      expect(typeof result.breakdown.prep).toBe('number');
    });

    it('should add travel buffer when previous event has a different location', () => {
      const prevEvent = {
        ...makeEvent({ id: 'prev' }),
        location: 'Houston, TX',
        type: 'MEETING' as const,
      };
      const nextEvent = {
        ...makeEvent({ id: 'next' }),
        location: 'Dallas, TX',
        type: 'MEETING' as const,
      };
      const context: BufferContext = { previousEvent: prevEvent, nextEvent };
      const result = service.getBufferTime('MEETING', context);
      expect(result.before).toBeGreaterThanOrEqual(5);
    });

    it('should add context switch buffer when event types differ', () => {
      const prevEvent = {
        ...makeEvent({ id: 'prev' }),
        type: 'FOCUS_BLOCK' as const,
      };
      const context: BufferContext = { previousEvent: prevEvent };
      const result = service.getBufferTime('CALL', context);
      expect(result.breakdown.contextSwitch.before).toBeGreaterThanOrEqual(5);
    });

    it('should add recovery buffer after intense meetings', () => {
      const prevEvent = {
        ...makeEvent({
          id: 'prev',
          startTime: new Date('2026-02-15T08:00:00'),
          endTime: new Date('2026-02-15T10:00:00'),
          participantIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
        }),
        type: 'MEETING' as const,
      };
      const context: BufferContext = { previousEvent: prevEvent };
      const result = service.getBufferTime('MEETING', context);
      expect(result.breakdown.recovery).toBeGreaterThan(0);
    });

    it('should add prep buffer for high-priority event types', () => {
      const result = service.getBufferTime('DEADLINE', {});
      expect(result.breakdown.prep).toBeGreaterThan(0);
    });

    it('should respect user settings overrides', () => {
      const settings: BufferSettings = {
        ...service.getDefaultBufferSettings(),
        defaultBeforeMinutes: 15,
        defaultAfterMinutes: 10,
        prepBufferEnabled: false,
        recoveryBufferEnabled: false,
      };
      const context: BufferContext = { userSettings: settings };
      const result = service.getBufferTime('MEETING', context);
      expect(result.before).toBeGreaterThanOrEqual(15);
      expect(result.after).toBeGreaterThanOrEqual(10);
      expect(result.breakdown.recovery).toBe(0);
      expect(result.breakdown.prep).toBe(0);
    });

    it('should clamp buffers to maxBufferMinutes', () => {
      const settings: BufferSettings = {
        ...service.getDefaultBufferSettings(),
        maxBufferMinutes: 10,
      };
      const prevEvent = {
        ...makeEvent({
          id: 'prev',
          startTime: new Date('2026-02-15T08:00:00'),
          endTime: new Date('2026-02-15T10:00:00'),
          participantIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
        }),
        location: 'Houston, TX',
        type: 'MEETING' as const,
      };
      const nextEvent = {
        ...makeEvent({ id: 'next' }),
        location: 'Dallas, TX',
        type: 'MEETING' as const,
      };
      const context: BufferContext = {
        previousEvent: prevEvent,
        nextEvent,
        userSettings: settings,
      };
      const result = service.getBufferTime('MEETING', context);
      expect(result.before).toBeLessThanOrEqual(10);
      expect(result.after).toBeLessThanOrEqual(10);
    });

    it('should return low context switch for same event type', () => {
      const prevEvent = {
        ...makeEvent({ id: 'prev' }),
        type: 'MEETING' as const,
      };
      const context: BufferContext = { previousEvent: prevEvent };
      const result = service.getBufferTime('MEETING', context);
      expect(result.breakdown.contextSwitch.before).toBe(5);
    });
  });

  describe('applyBuffers', () => {
    it('should add buffer blocks to events', () => {
      const events = [
        makeEvent({
          id: 'e1',
          bufferBefore: 10,
          bufferAfter: 5,
          startTime: new Date('2026-02-15T10:00:00'),
          endTime: new Date('2026-02-15T11:00:00'),
        }),
      ];
      const result = service.applyBuffers(events);
      expect(result).toHaveLength(1);
      expect(result[0].bufferBlocks).toHaveLength(2);

      const beforeBlock = result[0].bufferBlocks.find((b) => b.type === 'before');
      const afterBlock = result[0].bufferBlocks.find((b) => b.type === 'after');

      expect(beforeBlock).toBeDefined();
      expect(beforeBlock!.durationMinutes).toBe(10);
      expect(beforeBlock!.end).toEqual(new Date('2026-02-15T10:00:00'));

      expect(afterBlock).toBeDefined();
      expect(afterBlock!.durationMinutes).toBe(5);
      expect(afterBlock!.start).toEqual(new Date('2026-02-15T11:00:00'));
    });

    it('should return empty buffer blocks for events with no buffers', () => {
      const events = [makeEvent({ bufferBefore: undefined, bufferAfter: undefined })];
      const result = service.applyBuffers(events);
      expect(result[0].bufferBlocks).toHaveLength(0);
    });

    it('should sort events chronologically', () => {
      const events = [
        makeEvent({
          id: 'e2',
          startTime: new Date('2026-02-15T14:00:00'),
          endTime: new Date('2026-02-15T15:00:00'),
          bufferBefore: 5,
        }),
        makeEvent({
          id: 'e1',
          startTime: new Date('2026-02-15T10:00:00'),
          endTime: new Date('2026-02-15T11:00:00'),
          bufferBefore: 5,
        }),
      ];
      const result = service.applyBuffers(events);
      expect(result[0].id).toBe('e1');
      expect(result[1].id).toBe('e2');
    });

    it('should handle multiple events with buffers', () => {
      const events = [
        makeEvent({
          id: 'e1',
          bufferBefore: 5,
          bufferAfter: 10,
          startTime: new Date('2026-02-15T10:00:00'),
          endTime: new Date('2026-02-15T11:00:00'),
        }),
        makeEvent({
          id: 'e2',
          bufferBefore: 15,
          bufferAfter: 5,
          startTime: new Date('2026-02-15T14:00:00'),
          endTime: new Date('2026-02-15T15:00:00'),
        }),
      ];
      const result = service.applyBuffers(events);
      expect(result).toHaveLength(2);
      expect(result[0].bufferBlocks).toHaveLength(2);
      expect(result[1].bufferBlocks).toHaveLength(2);
    });
  });

  describe('detectBufferConflicts', () => {
    it('should detect when a buffer overlaps with another event', () => {
      const events = [
        makeEvent({
          id: 'e1',
          bufferAfter: 30,
          startTime: new Date('2026-02-15T10:00:00'),
          endTime: new Date('2026-02-15T11:00:00'),
        }),
        makeEvent({
          id: 'e2',
          startTime: new Date('2026-02-15T11:10:00'),
          endTime: new Date('2026-02-15T12:00:00'),
        }),
      ];
      const conflicts = service.detectBufferConflicts(events);
      expect(conflicts.length).toBeGreaterThan(0);
      const eventConflict = conflicts.find((c) => c.conflictingEvent.id === 'e2');
      expect(eventConflict).toBeDefined();
      expect(eventConflict!.overlapMinutes).toBe(20);
    });

    it('should return no conflicts when buffers do not overlap', () => {
      const events = [
        makeEvent({
          id: 'e1',
          bufferAfter: 5,
          startTime: new Date('2026-02-15T10:00:00'),
          endTime: new Date('2026-02-15T11:00:00'),
        }),
        makeEvent({
          id: 'e2',
          bufferBefore: 5,
          startTime: new Date('2026-02-15T14:00:00'),
          endTime: new Date('2026-02-15T15:00:00'),
        }),
      ];
      const conflicts = service.detectBufferConflicts(events);
      expect(conflicts).toHaveLength(0);
    });

    it('should detect buffer-to-buffer overlaps', () => {
      const events = [
        makeEvent({
          id: 'e1',
          bufferAfter: 20,
          startTime: new Date('2026-02-15T10:00:00'),
          endTime: new Date('2026-02-15T11:00:00'),
        }),
        makeEvent({
          id: 'e2',
          bufferBefore: 20,
          startTime: new Date('2026-02-15T11:10:00'),
          endTime: new Date('2026-02-15T12:00:00'),
        }),
      ];
      const conflicts = service.detectBufferConflicts(events);
      expect(conflicts.length).toBeGreaterThan(0);
    });

    it('should provide resolution suggestions', () => {
      const events = [
        makeEvent({
          id: 'e1',
          bufferAfter: 30,
          startTime: new Date('2026-02-15T10:00:00'),
          endTime: new Date('2026-02-15T11:00:00'),
        }),
        makeEvent({
          id: 'e2',
          title: 'Next Meeting',
          startTime: new Date('2026-02-15T11:15:00'),
          endTime: new Date('2026-02-15T12:00:00'),
        }),
      ];
      const conflicts = service.detectBufferConflicts(events);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].resolution).toBeTruthy();
      expect(typeof conflicts[0].resolution).toBe('string');
    });
  });

  describe('optimizeBuffers', () => {
    const defaultConstraints: BufferOptimizationConstraints = {
      maxTotalBufferMinutes: 30,
      minimumBufferMinutes: 2,
      preservePrepBuffers: false,
      preserveTravelBuffers: false,
      compressionRatio: 0.5,
    };

    it('should not modify events when total buffers are within budget', () => {
      const events = [
        makeEvent({
          id: 'e1',
          bufferBefore: 5,
          bufferAfter: 5,
          startTime: new Date('2026-02-15T10:00:00'),
          endTime: new Date('2026-02-15T11:00:00'),
        }),
      ];
      const result = service.optimizeBuffers(events, {
        ...defaultConstraints,
        maxTotalBufferMinutes: 100,
      });
      expect(result[0].bufferBefore).toBe(5);
      expect(result[0].bufferAfter).toBe(5);
    });

    it('should compress buffers when total exceeds budget', () => {
      const events = [
        makeEvent({
          id: 'e1',
          bufferBefore: 20,
          bufferAfter: 20,
          startTime: new Date('2026-02-15T10:00:00'),
          endTime: new Date('2026-02-15T11:00:00'),
        }),
        makeEvent({
          id: 'e2',
          bufferBefore: 20,
          bufferAfter: 20,
          startTime: new Date('2026-02-15T14:00:00'),
          endTime: new Date('2026-02-15T15:00:00'),
        }),
      ];
      const result = service.optimizeBuffers(events, defaultConstraints);
      const totalAfter = result.reduce((sum, ev) => {
        return sum + ev.bufferBlocks.reduce((s, b) => s + b.durationMinutes, 0);
      }, 0);
      expect(totalAfter).toBeLessThan(80);
    });

    it('should respect minimumBufferMinutes constraint', () => {
      const events = [
        makeEvent({
          id: 'e1',
          bufferBefore: 20,
          bufferAfter: 20,
          startTime: new Date('2026-02-15T10:00:00'),
          endTime: new Date('2026-02-15T11:00:00'),
        }),
      ];
      const result = service.optimizeBuffers(events, {
        ...defaultConstraints,
        maxTotalBufferMinutes: 5,
        minimumBufferMinutes: 5,
      });
      for (const ev of result) {
        for (const block of ev.bufferBlocks) {
          expect(block.durationMinutes).toBeGreaterThanOrEqual(5);
        }
      }
    });

    it('should preserve travel buffers when flag is set', () => {
      const events = [
        makeEvent({
          id: 'e1',
          bufferBefore: 30,
          bufferAfter: 30,
          startTime: new Date('2026-02-15T10:00:00'),
          endTime: new Date('2026-02-15T11:00:00'),
        }),
      ];
      const result = service.optimizeBuffers(events, {
        ...defaultConstraints,
        preserveTravelBuffers: true,
        maxTotalBufferMinutes: 10,
      });
      expect(result).toHaveLength(1);
    });

    it('should preserve prep buffers when flag is set', () => {
      const events = [
        makeEvent({
          id: 'e1',
          bufferBefore: 20,
          bufferAfter: 20,
          startTime: new Date('2026-02-15T10:00:00'),
          endTime: new Date('2026-02-15T11:00:00'),
          prepPacket: {
            attendeeProfiles: [],
            lastInteractions: [],
            openItems: [],
            agenda: [],
            talkingPoints: [],
            documents: [],
          },
        }),
      ];
      const result = service.optimizeBuffers(events, {
        ...defaultConstraints,
        preservePrepBuffers: true,
        maxTotalBufferMinutes: 10,
      });
      expect(result).toHaveLength(1);
      const beforeBlock = result[0].bufferBlocks.find((b) => b.type === 'before');
      expect(beforeBlock).toBeDefined();
    });
  });

  describe('getBufferSettings', () => {
    it('should return default settings when user has no stored preferences', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        preferences: {},
      });
      const settings = await service.getBufferSettings('user-1');
      expect(settings.defaultBeforeMinutes).toBe(5);
      expect(settings.defaultAfterMinutes).toBe(5);
      expect(settings.travelBufferEnabled).toBe(true);
      expect(settings.contextSwitchBufferEnabled).toBe(true);
      expect(settings.recoveryBufferEnabled).toBe(true);
      expect(settings.prepBufferEnabled).toBe(true);
    });

    it('should return default settings when user is not found', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const settings = await service.getBufferSettings('nonexistent');
      expect(settings.defaultBeforeMinutes).toBe(5);
      expect(settings.maxBufferMinutes).toBe(60);
    });

    it('should merge stored settings with defaults', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        preferences: {
          bufferSettings: {
            defaultBeforeMinutes: 10,
            travelBufferEnabled: false,
          },
        },
      });
      const settings = await service.getBufferSettings('user-1');
      expect(settings.defaultBeforeMinutes).toBe(10);
      expect(settings.travelBufferEnabled).toBe(false);
      expect(settings.defaultAfterMinutes).toBe(5);
      expect(settings.contextSwitchBufferEnabled).toBe(true);
    });
  });

  describe('updateBufferSettings', () => {
    it('should save settings and return merged result', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        preferences: { existingPref: 'keep' },
      });
      (mockedPrisma.user.update as jest.Mock).mockResolvedValue({});

      const result = await service.updateBufferSettings('user-1', {
        defaultBeforeMinutes: 15,
      });

      expect(result.defaultBeforeMinutes).toBe(15);
      expect(result.defaultAfterMinutes).toBe(5);

      expect(mockedPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          preferences: expect.objectContaining({
            existingPref: 'keep',
            bufferSettings: expect.objectContaining({
              defaultBeforeMinutes: 15,
            }),
          }),
        },
      });
    });

    it('should throw when user is not found', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.updateBufferSettings('nonexistent', { defaultBeforeMinutes: 10 })
      ).rejects.toThrow('User not found: nonexistent');
    });

    it('should merge with existing buffer settings', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        preferences: {
          bufferSettings: {
            defaultBeforeMinutes: 10,
            travelBufferEnabled: false,
          },
        },
      });
      (mockedPrisma.user.update as jest.Mock).mockResolvedValue({});

      const result = await service.updateBufferSettings('user-1', {
        recoveryBufferEnabled: false,
      });

      expect(result.defaultBeforeMinutes).toBe(10);
      expect(result.travelBufferEnabled).toBe(false);
      expect(result.recoveryBufferEnabled).toBe(false);
      expect(result.contextSwitchBufferEnabled).toBe(true);
    });
  });

  describe('getDefaultBufferSettings', () => {
    it('should return complete default settings', () => {
      const settings = service.getDefaultBufferSettings();
      expect(settings.defaultBeforeMinutes).toBe(5);
      expect(settings.defaultAfterMinutes).toBe(5);
      expect(settings.travelBufferEnabled).toBe(true);
      expect(settings.contextSwitchBufferEnabled).toBe(true);
      expect(settings.recoveryBufferEnabled).toBe(true);
      expect(settings.prepBufferEnabled).toBe(true);
      expect(settings.maxBufferMinutes).toBe(60);
      expect(settings.minBufferMinutes).toBe(0);
      expect(settings.travelBufferMultiplier).toBe(1.0);
      expect(settings.contextSwitchMinutes).toEqual({
        low: 5,
        medium: 10,
        high: 15,
      });
      expect(settings.recoveryThresholds).toHaveLength(3);
      expect(settings.prepMinutesByPriority).toEqual({
        LOW: 0,
        MEDIUM: 5,
        HIGH: 10,
        CRITICAL: 15,
      });
    });
  });
});
