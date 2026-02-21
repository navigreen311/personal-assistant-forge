import {
  addMinutes,
  differenceInMinutes,
  areIntervalsOverlapping,
} from 'date-fns';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { CalendarEvent, UserPreferences } from '@/shared/types';
import type {
  BufferBlock,
  BufferConfig,
  BufferConflict,
  BufferContext,
  BufferOptimizationConstraints,
  BufferSettings,
  BufferTime,
  CalendarEventWithBuffers,
  EventType,
  ScheduleRequest,
} from './calendar.types';

export class BufferService {
  calculateBuffers(
    event: ScheduleRequest,
    prevEvent?: CalendarEvent,
    nextEvent?: CalendarEvent,
    _userPrefs?: UserPreferences
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

  // ---------------------------------------------------------------------------
  // New methods
  // ---------------------------------------------------------------------------

  /**
   * Calculate the required buffer time before and after an event, with a full
   * breakdown by buffer category (travel, context switch, recovery, prep).
   *
   * - Travel buffer: based on location distance between adjacent events
   * - Context switch buffer: 5-15 min based on topic/entity difference
   * - Recovery buffer: after intense meetings (duration + participant count)
   * - Prep buffer: before important meetings (based on priority)
   */
  getBufferTime(eventType: EventType, context: BufferContext): BufferTime {
    const settings = context.userSettings ?? this.getDefaultBufferSettings();

    const breakdown = {
      travel: { before: 0, after: 0 },
      contextSwitch: { before: 0, after: 0 },
      recovery: 0,
      prep: 0,
    };

    // --- Travel buffer ---
    if (settings.travelBufferEnabled) {
      if (context.previousEvent) {
        const rawTravel = this.estimateTravelTime(
          context.previousEvent.location,
          context.nextEvent?.location
        );
        breakdown.travel.before = Math.round(rawTravel * settings.travelBufferMultiplier);
      }
      if (context.nextEvent) {
        const rawTravel = this.estimateTravelTime(
          context.previousEvent?.location,
          context.nextEvent.location
        );
        breakdown.travel.after = Math.round(rawTravel * settings.travelBufferMultiplier);
      }
    }

    // --- Context switch buffer ---
    if (settings.contextSwitchBufferEnabled) {
      if (context.previousEvent) {
        const cost = this.calculateContextSwitchMinutes(
          context.previousEvent,
          eventType,
          settings
        );
        breakdown.contextSwitch.before = cost;
      }
      if (context.nextEvent) {
        const cost = this.calculateContextSwitchMinutes(
          { ...context.nextEvent, type: context.nextEvent.type ?? 'MEETING' },
          eventType,
          settings
        );
        breakdown.contextSwitch.after = cost;
      }
    }

    // --- Recovery buffer (after intense meetings) ---
    if (settings.recoveryBufferEnabled && context.previousEvent) {
      const prevDuration = differenceInMinutes(
        context.previousEvent.endTime,
        context.previousEvent.startTime
      );
      const prevParticipants = context.previousEvent.participantIds?.length ?? 0;
      breakdown.recovery = this.calculateRecoveryMinutes(
        prevDuration,
        prevParticipants,
        settings
      );
    }

    // --- Prep buffer (before important meetings) ---
    if (settings.prepBufferEnabled) {
      const priority = this.inferPriorityFromType(eventType);
      breakdown.prep = settings.prepMinutesByPriority[priority] ?? 0;
    }

    // Aggregate: take the max of all "before" contributors, max of "after"
    const beforeRaw = Math.max(
      breakdown.travel.before,
      breakdown.contextSwitch.before,
      breakdown.recovery,
      breakdown.prep,
      settings.defaultBeforeMinutes
    );

    const afterRaw = Math.max(
      breakdown.travel.after,
      breakdown.contextSwitch.after,
      settings.defaultAfterMinutes
    );

    // Clamp to min/max
    const before = Math.min(
      Math.max(beforeRaw, settings.minBufferMinutes),
      settings.maxBufferMinutes
    );
    const after = Math.min(
      Math.max(afterRaw, settings.minBufferMinutes),
      settings.maxBufferMinutes
    );

    return { before, after, breakdown };
  }

  /**
   * Add buffer blocks to a list of calendar events. Returns a new array of
   * events augmented with bufferBlocks -- virtual time ranges that represent
   * the before/after buffer for each event.
   */
  applyBuffers(events: CalendarEvent[]): CalendarEventWithBuffers[] {
    const sorted = [...events].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    );

    return sorted.map((event, index) => {
      const bufferBlocks: BufferBlock[] = [];
      const prevEvent = index > 0 ? sorted[index - 1] : undefined;
      const nextEvent = index < sorted.length - 1 ? sorted[index + 1] : undefined;

      const bufferBefore = event.bufferBefore ?? 0;
      const bufferAfter = event.bufferAfter ?? 0;

      if (bufferBefore > 0) {
        const bufferType = this.classifyBufferType('before', event, prevEvent, nextEvent);
        bufferBlocks.push({
          eventId: event.id,
          type: 'before',
          bufferType,
          start: addMinutes(event.startTime, -bufferBefore),
          end: event.startTime,
          durationMinutes: bufferBefore,
        });
      }

      if (bufferAfter > 0) {
        const bufferType = this.classifyBufferType('after', event, prevEvent, nextEvent);
        bufferBlocks.push({
          eventId: event.id,
          type: 'after',
          bufferType,
          start: event.endTime,
          end: addMinutes(event.endTime, bufferAfter),
          durationMinutes: bufferAfter,
        });
      }

      return { ...event, bufferBlocks };
    });
  }

  /**
   * Detect conflicts where buffer blocks overlap with other events or their
   * buffer blocks. Returns a list of conflicts with suggested resolutions.
   */
  detectBufferConflicts(events: CalendarEvent[]): BufferConflict[] {
    const withBuffers = this.applyBuffers(events);
    const conflicts: BufferConflict[] = [];

    for (const eventWithBuffers of withBuffers) {
      for (const bufferBlock of eventWithBuffers.bufferBlocks) {
        for (const otherEvent of withBuffers) {
          if (otherEvent.id === eventWithBuffers.id) continue;

          // Check buffer block vs other event actual time
          if (
            areIntervalsOverlapping(
              { start: bufferBlock.start, end: bufferBlock.end },
              { start: otherEvent.startTime, end: otherEvent.endTime }
            )
          ) {
            const overlapStart = new Date(
              Math.max(bufferBlock.start.getTime(), otherEvent.startTime.getTime())
            );
            const overlapEnd = new Date(
              Math.min(bufferBlock.end.getTime(), otherEvent.endTime.getTime())
            );
            const overlapMinutes = differenceInMinutes(overlapEnd, overlapStart);

            conflicts.push({
              bufferBlock,
              conflictingEvent: otherEvent,
              overlapMinutes,
              resolution: this.suggestBufferConflictResolution(
                bufferBlock, otherEvent, overlapMinutes
              ),
            });
          }

          // Check buffer block vs other event buffer blocks
          for (const otherBuffer of otherEvent.bufferBlocks) {
            if (
              areIntervalsOverlapping(
                { start: bufferBlock.start, end: bufferBlock.end },
                { start: otherBuffer.start, end: otherBuffer.end }
              )
            ) {
              const overlapStart = new Date(
                Math.max(bufferBlock.start.getTime(), otherBuffer.start.getTime())
              );
              const overlapEnd = new Date(
                Math.min(bufferBlock.end.getTime(), otherBuffer.end.getTime())
              );
              const overlapMinutes = differenceInMinutes(overlapEnd, overlapStart);

              // Only report each buffer-to-buffer overlap once
              if (eventWithBuffers.id < otherEvent.id) {
                conflicts.push({
                  bufferBlock,
                  conflictingEvent: otherEvent,
                  overlapMinutes,
                  resolution: 'Merge overlapping ' + bufferBlock.bufferType + ' buffer (' + bufferBlock.durationMinutes + 'min) with ' + otherBuffer.bufferType + ' buffer (' + otherBuffer.durationMinutes + 'min) -- shared ' + overlapMinutes + 'min can be collapsed',
                });
              }
            }
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Compress/optimize buffers when the calendar is tight. Applies a
   * compression ratio to reduce buffer durations while respecting minimum
   * thresholds and optionally preserving travel/prep buffers.
   */
  optimizeBuffers(
    events: CalendarEvent[],
    constraints: BufferOptimizationConstraints
  ): CalendarEventWithBuffers[] {
    const withBuffers = this.applyBuffers(events);

    const totalBufferMinutes = withBuffers.reduce((sum, ev) => {
      return sum + ev.bufferBlocks.reduce((s, b) => s + b.durationMinutes, 0);
    }, 0);

    // If within budget, no optimization needed
    if (totalBufferMinutes <= constraints.maxTotalBufferMinutes) {
      return withBuffers;
    }

    let remainingReduction = totalBufferMinutes - constraints.maxTotalBufferMinutes;

    // Sort buffer blocks by compressibility priority
    const compressibleBlocks = withBuffers
      .flatMap((ev) =>
        ev.bufferBlocks.map((block) => ({ event: ev, block }))
      )
      .filter((item) => {
        if (constraints.preservePrepBuffers && item.block.bufferType === 'prep') return false;
        if (constraints.preserveTravelBuffers && item.block.bufferType === 'travel') return false;
        return true;
      })
      .sort((a, b) => {
        const priority = this.getBufferCompressibilityPriority(a.block.bufferType)
          - this.getBufferCompressibilityPriority(b.block.bufferType);
        if (priority !== 0) return priority;
        return b.block.durationMinutes - a.block.durationMinutes;
      });

    const compressionMap = new Map<string, number>();

    for (const item of compressibleBlocks) {
      if (remainingReduction <= 0) break;

      const currentDuration = item.block.durationMinutes;
      const compressedDuration = Math.max(
        constraints.minimumBufferMinutes,
        Math.round(currentDuration * constraints.compressionRatio)
      );
      const reduction = currentDuration - compressedDuration;

      if (reduction > 0) {
        const actualReduction = Math.min(reduction, remainingReduction);
        const newDuration = currentDuration - actualReduction;
        const key = item.event.id + '-' + item.block.type;
        compressionMap.set(key, Math.max(newDuration, constraints.minimumBufferMinutes));
        remainingReduction -= actualReduction;
      }
    }

    return withBuffers.map((ev) => {
      const newBufferBlocks = ev.bufferBlocks.map((block) => {
        const key = ev.id + '-' + block.type;
        const newDuration = compressionMap.get(key);
        if (newDuration === undefined) return block;

        if (block.type === 'before') {
          return {
            ...block,
            durationMinutes: newDuration,
            start: addMinutes(block.end, -newDuration),
          };
        } else {
          return {
            ...block,
            durationMinutes: newDuration,
            end: addMinutes(block.start, newDuration),
          };
        }
      });

      const beforeBlock = newBufferBlocks.find((b) => b.type === 'before');
      const afterBlock = newBufferBlocks.find((b) => b.type === 'after');

      return {
        ...ev,
        bufferBefore: beforeBlock?.durationMinutes ?? ev.bufferBefore,
        bufferAfter: afterBlock?.durationMinutes ?? ev.bufferAfter,
        bufferBlocks: newBufferBlocks,
      };
    });
  }

  /**
   * Retrieve buffer settings for a user from their preferences JSON.
   * Falls back to sensible defaults if no settings are stored.
   */
  async getBufferSettings(userId: string): Promise<BufferSettings> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return this.getDefaultBufferSettings();
    }

    const prefs = (user.preferences as Record<string, unknown>) ?? {};
    const stored = prefs.bufferSettings as Partial<BufferSettings> | undefined;

    if (!stored) {
      return this.getDefaultBufferSettings();
    }

    return { ...this.getDefaultBufferSettings(), ...stored };
  }

  /**
   * Save buffer settings for a user into their preferences JSON.
   * Merges with existing preferences to avoid overwriting other fields.
   */
  async updateBufferSettings(
    userId: string,
    settings: Partial<BufferSettings>
  ): Promise<BufferSettings> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found: ' + userId);
    }

    const existingPrefs = (user.preferences as Record<string, unknown>) ?? {};
    const existingBufferSettings = (existingPrefs.bufferSettings as Partial<BufferSettings>) ?? {};

    const merged: BufferSettings = {
      ...this.getDefaultBufferSettings(),
      ...existingBufferSettings,
      ...settings,
    };

    await prisma.user.update({
      where: { id: userId },
      data: {
        preferences: JSON.parse(JSON.stringify({
          ...existingPrefs,
          bufferSettings: merged,
        })) as Prisma.InputJsonValue,
      },
    });

    return merged;
  }

  /**
   * Return sensible default buffer settings.
   */
  getDefaultBufferSettings(): BufferSettings {
    return {
      defaultBeforeMinutes: 5,
      defaultAfterMinutes: 5,
      travelBufferEnabled: true,
      contextSwitchBufferEnabled: true,
      recoveryBufferEnabled: true,
      prepBufferEnabled: true,
      maxBufferMinutes: 60,
      minBufferMinutes: 0,
      travelBufferMultiplier: 1.0,
      contextSwitchMinutes: {
        low: 5,
        medium: 10,
        high: 15,
      },
      recoveryThresholds: [
        { durationMinutes: 60, participantCount: 5, recoveryMinutes: 5 },
        { durationMinutes: 90, participantCount: 3, recoveryMinutes: 10 },
        { durationMinutes: 120, participantCount: 1, recoveryMinutes: 15 },
      ],
      prepMinutesByPriority: {
        LOW: 0,
        MEDIUM: 5,
        HIGH: 10,
        CRITICAL: 15,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers (existing)
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Private helpers (new)
  // ---------------------------------------------------------------------------

  /**
   * Calculate context switch minutes based on how different two events are.
   * Same type = low, related types = medium, very different = high.
   */
  private calculateContextSwitchMinutes(
    adjacentEvent: CalendarEvent & { type?: EventType },
    currentEventType: EventType,
    settings: BufferSettings
  ): number {
    let differenceScore = 0;
    const adjacentType = adjacentEvent.type ?? 'MEETING';

    if (adjacentType === currentEventType) {
      differenceScore = 0;
    } else if (this.areRelatedTypes(adjacentType, currentEventType)) {
      differenceScore = 1;
    } else {
      differenceScore = 2;
    }

    if (differenceScore === 0) return settings.contextSwitchMinutes.low;
    if (differenceScore === 1) return settings.contextSwitchMinutes.medium;
    return settings.contextSwitchMinutes.high;
  }

  /**
   * Check if two event types are considered "related" (medium context switch).
   */
  private areRelatedTypes(typeA: EventType, typeB: EventType): boolean {
    const groups: EventType[][] = [
      ['MEETING', 'CALL', 'DEBRIEF'],
      ['FOCUS_BLOCK', 'PREP', 'DEADLINE'],
      ['BREAK', 'PERSONAL', 'TRAVEL'],
    ];
    return groups.some(
      (group) => group.includes(typeA) && group.includes(typeB)
    );
  }

  /**
   * Calculate recovery minutes after an intense meeting, based on duration
   * and participant count thresholds in the user settings.
   */
  private calculateRecoveryMinutes(
    durationMinutes: number,
    participantCount: number,
    settings: BufferSettings
  ): number {
    let recovery = 0;

    // Check thresholds from highest to lowest so the most generous match wins
    const sorted = [...settings.recoveryThresholds].sort(
      (a, b) => b.recoveryMinutes - a.recoveryMinutes
    );

    for (const threshold of sorted) {
      if (
        durationMinutes >= threshold.durationMinutes &&
        participantCount >= threshold.participantCount
      ) {
        recovery = threshold.recoveryMinutes;
        break;
      }
    }

    return recovery;
  }

  /**
   * Infer a priority level from an event type (used when no explicit priority
   * is available).
   */
  private inferPriorityFromType(
    eventType: EventType
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    switch (eventType) {
      case 'MEETING': return 'MEDIUM';
      case 'CALL': return 'LOW';
      case 'FOCUS_BLOCK': return 'MEDIUM';
      case 'DEADLINE': return 'HIGH';
      default: return 'LOW';
    }
  }

  /**
   * Classify what "kind" of buffer a block represents. Used when building
   * buffer blocks from events that only have a numeric bufferBefore/After.
   */
  private classifyBufferType(
    position: 'before' | 'after',
    event: CalendarEvent,
    prevEvent?: CalendarEvent,
    nextEvent?: CalendarEvent
  ): BufferBlock['bufferType'] {
    if (position === 'before') {
      if (prevEvent) {
        const prevLocation = (prevEvent as CalendarEvent & { location?: string }).location;
        const currLocation = (event as CalendarEvent & { location?: string }).location;
        if (prevLocation && currLocation && prevLocation !== currLocation) {
          return 'travel';
        }
      }
      if (event.prepPacket) {
        return 'prep';
      }
      return 'default';
    }

    // "after" buffers
    if (nextEvent) {
      const currLocation = (event as CalendarEvent & { location?: string }).location;
      const nextLocation = (nextEvent as CalendarEvent & { location?: string }).location;
      if (currLocation && nextLocation && currLocation !== nextLocation) {
        return 'travel';
      }
    }

    const duration = differenceInMinutes(event.endTime, event.startTime);
    if (duration >= 90) {
      return 'recovery';
    }

    return 'default';
  }

  /**
   * Suggest a resolution for a buffer conflict.
   */
  private suggestBufferConflictResolution(
    bufferBlock: BufferBlock,
    conflictingEvent: CalendarEvent,
    overlapMinutes: number
  ): string {
    if (bufferBlock.bufferType === 'travel') {
      return 'Travel buffer for "' + bufferBlock.eventId + '" overlaps with "' + conflictingEvent.title + '" by ' + overlapMinutes + 'min -- consider rescheduling to allow travel time';
    }
    if (bufferBlock.bufferType === 'prep') {
      return 'Prep buffer overlaps with "' + conflictingEvent.title + '" by ' + overlapMinutes + 'min -- prepare earlier or shorten prep';
    }
    if (bufferBlock.bufferType === 'recovery') {
      return 'Recovery buffer after meeting overlaps with "' + conflictingEvent.title + '" by ' + overlapMinutes + 'min -- reduce recovery or add gap';
    }
    return 'Buffer (' + bufferBlock.durationMinutes + 'min ' + bufferBlock.type + ') overlaps with "' + conflictingEvent.title + '" by ' + overlapMinutes + 'min -- compress buffer or reschedule';
  }

  /**
   * Return a numeric priority for buffer compression ordering.
   * Lower number = compress first (least important to preserve).
   */
  private getBufferCompressibilityPriority(
    bufferType: BufferBlock['bufferType']
  ): number {
    switch (bufferType) {
      case 'default': return 0;
      case 'context_switch': return 1;
      case 'recovery': return 2;
      case 'prep': return 3;
      case 'travel': return 4;
      default: return 0;
    }
  }
}
