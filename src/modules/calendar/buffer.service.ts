import type { CalendarEvent, UserPreferences } from '@/shared/types';
import type {
  BufferConfig,
  EventType,
  ScheduleRequest,
} from './calendar.types';

export class BufferService {
  calculateBuffers(
    event: ScheduleRequest,
    prevEvent?: CalendarEvent,
    nextEvent?: CalendarEvent,
    userPrefs?: UserPreferences
  ): { before: number; after: number } {
    // Start with explicit overrides from the request
    let before = event.bufferBefore ?? this.getDefaultBufferBefore(event.type);
    let after = event.bufferAfter ?? this.getDefaultBufferAfter(event.type);

    // Add travel time if locations differ
    if (prevEvent) {
      const travelBefore = this.estimateTravelTime(
        (prevEvent as CalendarEvent & { location?: string }).location,
        event.location
      );
      before = Math.max(before, travelBefore);
    }

    if (nextEvent) {
      const travelAfter = this.estimateTravelTime(
        event.location,
        (nextEvent as CalendarEvent & { location?: string }).location
      );
      after = Math.max(after, travelAfter);
    }

    // Add prep time if needed
    if (event.requiresPrep) {
      const prepTime = event.prepTimeMinutes ??
        this.calculatePrepTime(event.type, event.participantIds?.length ?? 0, event.priority);
      before = Math.max(before, prepTime);
    }

    // Focus blocks get automatic 5-min buffer on each side
    if (event.type === 'FOCUS_BLOCK') {
      before = Math.max(before, 5);
      after = Math.max(after, 5);
    }

    return { before, after };
  }

  estimateTravelTime(fromLocation?: string, toLocation?: string): number {
    if (!fromLocation || !toLocation) return 0;
    if (fromLocation === toLocation) return 0;

    const from = fromLocation.toLowerCase();
    const to = toLocation.toLowerCase();

    // Same building heuristic
    if (this.isSameBuilding(from, to)) return 15;

    // Different city heuristic
    if (this.isDifferentCity(from, to)) return 60;

    // Default: same city
    return 30;
  }

  calculatePrepTime(
    eventType: EventType,
    participantCount: number,
    priority: string
  ): number {
    let base = 0;

    if (participantCount <= 3) base = 10;
    else if (participantCount <= 8) base = 20;
    else base = 30;

    // High-priority events get extra prep time
    if (priority === 'HIGH' || priority === 'CRITICAL') {
      base = Math.ceil(base * 1.5);
    }

    return base;
  }

  calculateDecompressionTime(
    eventType: EventType,
    duration: number,
    participantCount: number
  ): number {
    // Workshop: 15 min decompression
    if (eventType === 'MEETING' && duration >= 120) return 15;

    // Long meetings (>90 min): 10 min
    if (eventType === 'MEETING' && duration > 90) return 10;

    // Stressful calls: 5 min
    if (eventType === 'CALL' && (participantCount > 3 || duration > 30)) return 5;

    return 0;
  }

  getDefaultConfig(): BufferConfig {
    return {
      defaultBefore: 5,
      defaultAfter: 5,
      travelTimeRules: [
        { fromLocationType: 'office', toLocationType: 'office', estimatedMinutes: 15 },
        { fromLocationType: 'office', toLocationType: 'client_site', estimatedMinutes: 30 },
        { fromLocationType: 'home', toLocationType: 'office', estimatedMinutes: 30 },
        { fromLocationType: 'office', toLocationType: 'remote', estimatedMinutes: 60 },
      ],
      prepTimeRules: [
        { eventType: 'MEETING', participantCount: 3, prepMinutes: 10 },
        { eventType: 'MEETING', participantCount: 8, prepMinutes: 20 },
        { eventType: 'MEETING', participantCount: 99, prepMinutes: 30 },
      ],
      decompressionRules: [
        { afterEventType: 'MEETING', durationThreshold: 90, decompressionMinutes: 10 },
        { afterEventType: 'MEETING', durationThreshold: 120, decompressionMinutes: 15 },
        { afterEventType: 'CALL', durationThreshold: 30, decompressionMinutes: 5 },
      ],
    };
  }

  private getDefaultBufferBefore(type: EventType): number {
    switch (type) {
      case 'MEETING': return 5;
      case 'CALL': return 0;
      case 'FOCUS_BLOCK': return 5;
      default: return 0;
    }
  }

  private getDefaultBufferAfter(type: EventType): number {
    switch (type) {
      case 'MEETING': return 5;
      case 'CALL': return 0;
      case 'FOCUS_BLOCK': return 5;
      default: return 0;
    }
  }

  private isSameBuilding(from: string, to: string): boolean {
    // Simple heuristic: locations mentioning same building/floor/room
    const buildingPatterns = ['room', 'floor', 'suite', 'building'];
    const fromHasBuilding = buildingPatterns.some((p) => from.includes(p));
    const toHasBuilding = buildingPatterns.some((p) => to.includes(p));
    return fromHasBuilding && toHasBuilding;
  }

  private isDifferentCity(from: string, to: string): boolean {
    // Heuristic: if both contain comma (city, state format) and cities differ
    const fromParts = from.split(',').map((s) => s.trim());
    const toParts = to.split(',').map((s) => s.trim());
    if (fromParts.length >= 2 && toParts.length >= 2) {
      return fromParts[0] !== toParts[0];
    }
    return false;
  }
}
