import {
  addDays,
  addMinutes,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  getHours,
  getDay,
  differenceInMinutes,
  areIntervalsOverlapping,
} from 'date-fns';
import { v4 as uuid } from 'uuid';
import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { CalendarEvent } from '@/shared/types';
import { EnergyService } from './energy.service';
import { BufferService } from './buffer.service';
/**
 * Calendar scheduling -- tenancy per docs/parallel-build/tenancy-pattern.md.
 *
 * ============================================================================
 * WHAT CHANGED AND WHY (P-05)
 * ============================================================================
 *
 * Before P-05 this file took the tenant from whatever the caller supplied and
 * never checked it:
 *
 *   - `getEvents(userId, range, entityId)` built its WHERE from
 *     `entityId ? [entityId] : <the user's own entities>`. The ternary is the
 *     bug: naming ANY entity id skipped the ownership list entirely, so
 *     `GET /api/calendar?entityId=<someone else's>` returned their events.
 *   - `createEvent` wrote `entityId: request.entityId` straight off the body.
 *   - `updateEvent`, `deleteEvent` and `rescheduleEvent` addressed rows by
 *     `where: { id }` alone -- no tenant in the WHERE at all -- so any
 *     authenticated caller who knew an event id could move or delete another
 *     tenant's meeting.
 *
 * Two changes close it:
 *
 *  1. Every entity-scoped entry point takes a `VerifiedEntityId`, a branded
 *     string only `withEntityScope` can produce. A raw value off a request body
 *     FAILS TO COMPILE, so the check cannot be forgotten in a route added later.
 *
 *  2. The verified id goes INTO the WHERE clause. `update`/`delete` take a
 *     unique WHERE and cannot carry a tenant, so writes go through
 *     `updateMany`/`deleteMany` with `{ id, entityId }` and `count === 0` is
 *     treated as not-found -- deliberately indistinguishable from a row that
 *     does not exist, so existence does not leak.
 */

import type {
  ScheduleRequest,
  ScheduleDraft,
  TimeRange,
  ScheduleSuggestion,
  ConflictInfo,
  CalendarViewMode,
  CalendarViewData,
  CalendarEventDisplay,
  DragDropUpdate,
  Chronotype,
} from './calendar.types';

export class SchedulingService {
  private energyService = new EnergyService();
  private bufferService = new BufferService();

  async findAvailableSlots(
    request: ScheduleRequest,
    userId: string,
    lookAheadDays = 14
  ): Promise<ScheduleSuggestion[]> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const chronotype = (user?.chronotype as Chronotype) ?? 'FLEXIBLE';
    const prefs = (user?.preferences as Record<string, unknown>) ?? {};
    const meetingFreedays = (prefs.meetingFreedays as number[]) ?? [];
    const focusHours = (prefs.focusHours as { start: string; end: string }[]) ?? [];
    const attentionBudget = (prefs.attentionBudget as number) ?? 20;

    const now = new Date();
    const searchEnd = addDays(now, lookAheadDays);

    // Get all existing events in the look-ahead window
    const existingEvents = await this.getEvents(userId, { start: now, end: searchEnd });

    const suggestions: ScheduleSuggestion[] = [];

    // Generate candidate slots: every 30-min interval, 8am-6pm, for each day
    for (let day = 0; day < lookAheadDays; day++) {
      const currentDay = addDays(startOfDay(now), day);
      const dayOfWeek = getDay(currentDay);

      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      for (let hour = 8; hour <= 17; hour++) {
        for (const minuteOffset of [0, 30]) {
          const slotStart = addMinutes(currentDay, hour * 60 + minuteOffset);
          const slotEnd = addMinutes(slotStart, request.duration);

          // Don't go past 6pm
          if (getHours(slotEnd) > 18 || (getHours(slotEnd) === 18 && slotEnd.getMinutes() > 0)) continue;

          // Skip past slots
          if (slotStart < now) continue;

          // Check preferred time ranges
          if (request.preferredTimeRanges && request.preferredTimeRanges.length > 0) {
            const inPreferred = request.preferredTimeRanges.some((range) =>
              slotStart >= range.start && slotEnd <= range.end
            );
            if (!inPreferred) continue;
          }

          // Check avoid time ranges
          if (request.avoidTimeRanges && request.avoidTimeRanges.length > 0) {
            const inAvoid = request.avoidTimeRanges.some((range) =>
              areIntervalsOverlapping(
                { start: slotStart, end: slotEnd },
                { start: range.start, end: range.end }
              )
            );
            if (inAvoid) continue;
          }

          const slot: TimeRange = { start: slotStart, end: slotEnd };
          const scored = this.scoreSlot(
            slot,
            request,
            existingEvents,
            chronotype,
            meetingFreedays,
            focusHours,
            attentionBudget,
            dayOfWeek
          );

          // Only include if score > 0 (exclude hard conflicts)
          if (scored.score > 0) {
            suggestions.push(scored);
          }
        }
      }
    }

    // Sort by score descending, take top 10
    suggestions.sort((a, b) => b.score - a.score);
    return suggestions.slice(0, 10);
  }

  /**
   * Create an event in an entity the caller has been proven to own.
   *
   * `request.entityId` is a `VerifiedEntityId`, so the only route into this
   * function is through `withEntityScope`. `userId` is re-asserted against the
   * entity's owner as defence in depth: if those two ever disagree the brand
   * was manufactured rather than earned, and a loud failure beats a silent
   * write into someone else's calendar.
   */
  async createEvent(
    request: ScheduleRequest,
    selectedSlot: TimeRange,
    userId: string
  ): Promise<CalendarEvent> {
    const entity = await prisma.entity.findUnique({
      where: { id: request.entityId },
      select: { id: true, userId: true },
    });
    if (!entity) {
      throw new Error(`Entity not found: ${request.entityId}`);
    }
    if (entity.userId !== userId) {
      // Unreachable through withEntityScope.
      throw new Error('Entity does not belong to the authenticated user');
    }

    const buffers = this.bufferService.calculateBuffers(request);

    const event = await prisma.calendarEvent.create({
      data: {
        id: uuid(),
        title: request.title,
        entityId: request.entityId,
        participantIds: request.participantIds ?? [],
        startTime: selectedSlot.start,
        endTime: selectedSlot.end,
        bufferBefore: buffers.before,
        bufferAfter: buffers.after,
        recurrence: request.recurrence,
        meetingNotes: request.notes,
      },
    });

    return this.toCalendarEvent(event);
  }

  /**
   * Update an event, scoped.
   *
   * `prisma.update` takes a unique WHERE and therefore cannot carry the tenant,
   * so this is `updateMany({ where: { id, entityId } })`. A foreign event
   * matches nothing, `count` is 0, and the caller gets the same "not found" a
   * non-existent id would produce.
   */
  async updateEvent(
    eventId: string,
    updates: Partial<ScheduleDraft>,
    entityId: VerifiedEntityId
  ): Promise<CalendarEvent> {
    const data: Record<string, unknown> = {};
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.participantIds !== undefined) data.participantIds = updates.participantIds;
    if (updates.notes !== undefined) data.meetingNotes = updates.notes;
    if (updates.recurrence !== undefined) data.recurrence = updates.recurrence;
    if (updates.bufferBefore !== undefined) data.bufferBefore = updates.bufferBefore;
    if (updates.bufferAfter !== undefined) data.bufferAfter = updates.bufferAfter;

    const { count } = await prisma.calendarEvent.updateMany({
      where: { id: eventId, entityId },
      data,
    });

    if (count === 0) {
      throw new Error(`Event not found: ${eventId}`);
    }

    const event = await prisma.calendarEvent.findFirst({
      where: { id: eventId, entityId },
    });
    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    return this.toCalendarEvent(event);
  }

  /** Delete an event, scoped. See updateEvent for why this is `deleteMany`. */
  async deleteEvent(eventId: string, entityId: VerifiedEntityId): Promise<void> {
    const { count } = await prisma.calendarEvent.deleteMany({
      where: { id: eventId, entityId },
    });

    if (count === 0) {
      throw new Error(`Event not found: ${eventId}`);
    }
  }

  /**
   * Move an event, scoped.
   *
   * The old code read the row with `findUniqueOrThrow({ where: { id } })` and
   * then wrote it with `update({ where: { id } })` -- no tenant in either --
   * so a drag-and-drop request naming another tenant's event id moved their
   * meeting. Both halves now carry `entityId`.
   */
  async rescheduleEvent(
    update: DragDropUpdate,
    entityId: VerifiedEntityId,
    userId: string
  ): Promise<{ event: CalendarEvent; conflicts: ConflictInfo[] }> {
    const { count } = await prisma.calendarEvent.updateMany({
      where: { id: update.eventId, entityId },
      data: {
        startTime: update.newStartTime,
        endTime: update.newEndTime,
      },
    });

    if (count === 0) {
      throw new Error(`Event not found: ${update.eventId}`);
    }

    const event = await prisma.calendarEvent.findFirst({
      where: { id: update.eventId, entityId },
    });
    if (!event) {
      throw new Error(`Event not found: ${update.eventId}`);
    }

    const conflicts = await this.detectConflicts(
      entityId,
      { start: update.newStartTime, end: update.newEndTime },
      userId,
      update.eventId
    );

    return { event: this.toCalendarEvent(event), conflicts };
  }

  async detectConflicts(
    entityId: VerifiedEntityId,
    timeRange: TimeRange,
    userId: string,
    excludeEventId?: string
  ): Promise<ConflictInfo[]> {
    const conflicts: ConflictInfo[] = [];

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const prefs = (user?.preferences as Record<string, unknown>) ?? {};
    const meetingFreedays = (prefs.meetingFreedays as number[]) ?? [];
    const focusHours = (prefs.focusHours as { start: string; end: string }[]) ?? [];
    const attentionBudget = (prefs.attentionBudget as number) ?? 20;
    const chronotype = (user?.chronotype as Chronotype) ?? 'FLEXIBLE';

    // Get events across all entities for this user
    const allEvents = await this.getAllUserEvents(userId, timeRange);
    const entityEvents = allEvents.filter((e) => e.entityId === entityId);
    const crossEntityEvents = allEvents.filter((e) => e.entityId !== entityId);

    // 1. TIME_OVERLAP
    for (const ev of allEvents) {
      if (excludeEventId && ev.id === excludeEventId) continue;
      if (areIntervalsOverlapping(
        { start: timeRange.start, end: timeRange.end },
        { start: ev.startTime, end: ev.endTime }
      )) {
        conflicts.push({
          type: 'TIME_OVERLAP',
          severity: 'HARD',
          existingEvent: this.toCalendarEvent(ev),
          description: `Overlaps with "${ev.title}"`,
        });
      }
    }

    // 2. BUFFER_VIOLATION
    for (const ev of entityEvents) {
      if (excludeEventId && ev.id === excludeEventId) continue;
      const bufferAfter = ev.bufferAfter ?? 0;
      const bufferBefore = ev.bufferBefore ?? 0;

      const evEndWithBuffer = addMinutes(ev.endTime, bufferAfter);
      const evStartWithBuffer = addMinutes(ev.startTime, -bufferBefore);

      if (timeRange.start < evEndWithBuffer && timeRange.start >= ev.endTime) {
        conflicts.push({
          type: 'BUFFER_VIOLATION',
          severity: 'SOFT',
          existingEvent: this.toCalendarEvent(ev),
          description: `Violates ${bufferAfter}-min buffer after "${ev.title}"`,
          resolution: `Move start to after ${evEndWithBuffer.toISOString()}`,
        });
      }

      if (timeRange.end > evStartWithBuffer && timeRange.end <= ev.startTime) {
        conflicts.push({
          type: 'BUFFER_VIOLATION',
          severity: 'SOFT',
          existingEvent: this.toCalendarEvent(ev),
          description: `Violates ${bufferBefore}-min buffer before "${ev.title}"`,
          resolution: `Move end to before ${evStartWithBuffer.toISOString()}`,
        });
      }
    }

    // 3. FOCUS_BLOCK
    for (const fh of focusHours) {
      const focusStart = this.parseTimeOfDay(fh.start, timeRange.start);
      const focusEnd = this.parseTimeOfDay(fh.end, timeRange.start);
      if (
        areIntervalsOverlapping(
          { start: timeRange.start, end: timeRange.end },
          { start: focusStart, end: focusEnd }
        )
      ) {
        conflicts.push({
          type: 'FOCUS_BLOCK',
          severity: 'SOFT',
          description: `Conflicts with focus block (${fh.start}-${fh.end})`,
          resolution: 'Schedule outside focus hours',
        });
      }
    }

    // 4. MEETING_FREE_DAY
    const dayOfWeek = getDay(timeRange.start);
    if (meetingFreedays.includes(dayOfWeek)) {
      conflicts.push({
        type: 'MEETING_FREE_DAY',
        severity: 'SOFT',
        description: `${this.dayName(dayOfWeek)} is a meeting-free day`,
        resolution: 'Choose a different day',
      });
    }

    // 5. BACK_TO_BACK
    const dayEvents = entityEvents.filter((e) => {
      if (excludeEventId && e.id === excludeEventId) return false;
      return startOfDay(e.startTime).getTime() === startOfDay(timeRange.start).getTime();
    });
    const consecutiveMeetings = this.countConsecutive(dayEvents, timeRange);
    if (consecutiveMeetings >= 3) {
      conflicts.push({
        type: 'BACK_TO_BACK',
        severity: 'SOFT',
        description: `${consecutiveMeetings} consecutive meetings (including this one)`,
        resolution: 'Add a buffer or break between meetings',
      });
    }

    // 6. ENERGY_LOW
    const hour = getHours(timeRange.start);
    const energyLevel = this.energyService.getEnergyLevel(chronotype, hour);
    if (energyLevel === 'LOW' || energyLevel === 'RECOVERY') {
      conflicts.push({
        type: 'ENERGY_LOW',
        severity: 'SOFT',
        description: `Scheduled during ${energyLevel.toLowerCase()} energy period`,
        resolution: 'Consider scheduling during peak/high energy hours',
      });
    }

    // 7. ATTENTION_BUDGET
    const dayMeetingCount = dayEvents.length + 1; // +1 for proposed event
    if (dayMeetingCount > attentionBudget) {
      conflicts.push({
        type: 'ATTENTION_BUDGET',
        severity: 'SOFT',
        description: `Exceeds daily attention budget (${attentionBudget} events)`,
        resolution: 'Reduce number of events for the day',
      });
    }

    // 8. CROSS_ENTITY
    for (const ev of crossEntityEvents) {
      if (excludeEventId && ev.id === excludeEventId) continue;
      if (areIntervalsOverlapping(
        { start: timeRange.start, end: timeRange.end },
        { start: ev.startTime, end: ev.endTime }
      )) {
        conflicts.push({
          type: 'CROSS_ENTITY',
          severity: 'HARD',
          existingEvent: this.toCalendarEvent(ev),
          description: `Conflicts with cross-entity event "${ev.title}"`,
        });
      }
    }

    return conflicts;
  }

  async suggestConflictResolutions(
    conflicts: ConflictInfo[],
    _userId: string
  ): Promise<{ conflict: ConflictInfo; resolution: string; alternativeSlots: TimeRange[] }[]> {
    return conflicts.map((conflict) => ({
      conflict,
      resolution: conflict.resolution ?? 'Reschedule to an available time',
      alternativeSlots: [],
    }));
  }

  /**
   * Read this user's events, optionally narrowed to one of their entities.
   *
   * THE LEAK THIS CLOSES: `entityId` used to be a plain `string` and the
   * ternary below replaced the ownership list with it wholesale, so naming any
   * id at all read that tenant's calendar. It is now a `VerifiedEntityId`, so
   * the only value that can reach the narrowing branch is one `withEntityScope`
   * has already proven the caller owns. The unnarrowed branch was, and remains,
   * the caller's own entities.
   */
  async getEvents(
    userId: string,
    dateRange: TimeRange,
    entityId?: VerifiedEntityId
  ): Promise<CalendarEvent[]> {
    const userEntities = await prisma.entity.findMany({
      where: { userId },
      select: { id: true },
    });
    const entityIds = entityId
      ? [entityId]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : userEntities.map((e: any) => e.id as string);

    const events = await prisma.calendarEvent.findMany({
      where: {
        entityId: { in: entityIds },
        startTime: { gte: dateRange.start },
        endTime: { lte: dateRange.end },
      },
      orderBy: { startTime: 'asc' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return events.map((e: any) => this.toCalendarEvent(e));
  }

  async getCalendarViewData(
    userId: string,
    viewMode: CalendarViewMode,
    date: Date,
    entityId?: VerifiedEntityId
  ): Promise<CalendarViewData> {
    const dateRange = this.getViewDateRange(viewMode, date);
    const events = await this.getEvents(userId, dateRange, entityId);

    // Fetch entity info for display
    const entityIds = [...new Set(events.map((e) => e.entityId))];
    const entities = await prisma.entity.findMany({
      where: { id: { in: entityIds } },
      select: { id: true, name: true, brandKit: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entityMap = new Map(entities.map((e: any) => [e.id, e] as [string, any]));

    // Fetch contact names for participants
    const allParticipantIds = [...new Set(events.flatMap((e) => e.participantIds))];
    const contacts = allParticipantIds.length > 0
      ? await prisma.contact.findMany({
          where: { id: { in: allParticipantIds } },
          select: { id: true, name: true },
        })
      : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contactMap = new Map(contacts.map((c: any) => [c.id, c.name] as [string, string]));

    // Get user prefs for focus blocks
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const prefs = (user?.preferences as Record<string, unknown>) ?? {};
    const focusHours = (prefs.focusHours as { start: string; end: string }[]) ?? [];
    const chronotype = (user?.chronotype as Chronotype) ?? 'FLEXIBLE';

    // Build focus blocks for the date range
    const focusBlocks: TimeRange[] = [];
    for (const fh of focusHours) {
      const focusStart = this.parseTimeOfDay(fh.start, date);
      const focusEnd = this.parseTimeOfDay(fh.end, date);
      focusBlocks.push({ start: focusStart, end: focusEnd });
    }

    // Build buffer blocks
    const bufferBlocks: TimeRange[] = events
      .filter((e) => e.bufferBefore || e.bufferAfter)
      .flatMap((e) => {
        const blocks: TimeRange[] = [];
        if (e.bufferBefore) {
          blocks.push({
            start: addMinutes(e.startTime, -e.bufferBefore),
            end: e.startTime,
          });
        }
        if (e.bufferAfter) {
          blocks.push({
            start: e.endTime,
            end: addMinutes(e.endTime, e.bufferAfter),
          });
        }
        return blocks;
      });

    // Build display events
    const displayEvents: CalendarEventDisplay[] = events.map((event) => {
      const entity = entityMap.get(event.entityId) as { name?: string; brandKit?: unknown } | undefined;
      const brandKit = entity?.brandKit as Record<string, unknown> | undefined;
      const isInFocusBlock = focusBlocks.some((fb) =>
        areIntervalsOverlapping(
          { start: event.startTime, end: event.endTime },
          { start: fb.start, end: fb.end }
        )
      );

      return {
        ...event,
        entityName: entity?.name ?? 'Unknown',
        entityColor: (brandKit?.primaryColor as string) ?? '#3b82f6',
        type: 'MEETING' as const,
        participantNames: event.participantIds
          .map((id: string) => contactMap.get(id) ?? id)
          .filter((n): n is string => typeof n === 'string'),
        hasConflict: false,
        hasPrepPacket: !!event.prepPacket,
        isInFocusBlock,
      };
    });

    const energyOverlay = this.energyService.getDailyEnergyMapping(chronotype);

    return {
      viewMode,
      dateRange,
      events: displayEvents,
      focusBlocks,
      bufferBlocks,
      conflicts: [],
      energyOverlay,
    };
  }

  // --- Private helpers ---

  private scoreSlot(
    slot: TimeRange,
    request: ScheduleRequest,
    existingEvents: CalendarEvent[],
    chronotype: Chronotype,
    meetingFreedays: number[],
    focusHours: { start: string; end: string }[],
    attentionBudget: number,
    dayOfWeek: number
  ): ScheduleSuggestion {
    let score = 0;
    const reasoning: string[] = [];
    const conflicts: ConflictInfo[] = [];

    // +30: No conflicts
    const overlapping = existingEvents.filter((e) =>
      areIntervalsOverlapping(
        { start: slot.start, end: slot.end },
        { start: e.startTime, end: e.endTime }
      )
    );
    if (overlapping.length === 0) {
      score += 30;
      reasoning.push('No time conflicts');
    } else {
      // Hard conflict — skip this slot entirely
      for (const ev of overlapping) {
        conflicts.push({
          type: 'TIME_OVERLAP',
          severity: 'HARD',
          existingEvent: ev,
          description: `Overlaps with "${ev.title}"`,
        });
      }
      return {
        slot,
        score: 0,
        reasoning: ['Has hard time conflicts'],
        conflicts,
        buffers: { before: 0, after: 0 },
        energyLevel: this.energyService.getEnergyLevel(chronotype, getHours(slot.start)),
        contextSwitchCost: 0,
      };
    }

    // +20: Energy match
    const hour = getHours(slot.start);
    const energyLevel = this.energyService.getEnergyLevel(chronotype, hour);
    const isHighPriority = request.priority === 'HIGH' || request.priority === 'CRITICAL';
    if (energyLevel === 'PEAK' || energyLevel === 'HIGH') {
      score += 20;
      reasoning.push(`${energyLevel} energy period`);
    } else if (energyLevel === 'MODERATE') {
      score += 10;
      reasoning.push('Moderate energy period');
    } else {
      if (isHighPriority) {
        score -= 15;
        reasoning.push('Low energy for high-priority event');
        conflicts.push({
          type: 'ENERGY_LOW',
          severity: 'SOFT',
          description: `Scheduled during ${energyLevel.toLowerCase()} energy`,
        });
      }
    }

    // +15: Buffer compliance
    const prevEvent = this.findAdjacentEvent(existingEvents, slot.start, 'before');
    const nextEvent = this.findAdjacentEvent(existingEvents, slot.end, 'after');
    const buffers = this.bufferService.calculateBuffers(request, prevEvent ?? undefined, nextEvent ?? undefined);

    const gapBefore = prevEvent ? differenceInMinutes(slot.start, prevEvent.endTime) : 999;
    const gapAfter = nextEvent ? differenceInMinutes(nextEvent.startTime, slot.end) : 999;

    if (gapBefore >= buffers.before && gapAfter >= buffers.after) {
      score += 15;
      reasoning.push('Adequate buffers');
    } else {
      if (gapBefore < buffers.before) {
        conflicts.push({
          type: 'BUFFER_VIOLATION',
          severity: 'SOFT',
          description: `Only ${gapBefore}min gap before (need ${buffers.before}min)`,
        });
      }
    }

    // +15: Preferred time range match
    if (request.preferredTimeRanges && request.preferredTimeRanges.length > 0) {
      const inPreferred = request.preferredTimeRanges.some((range) =>
        slot.start >= range.start && slot.end <= range.end
      );
      if (inPreferred) {
        score += 15;
        reasoning.push('Within preferred time range');
      }
    } else {
      score += 15; // No preference = always a match
    }

    // +10: Low context-switch cost
    const contextCost = prevEvent
      ? this.energyService.calculateContextSwitchCost(prevEvent, { ...prevEvent, ...{ entityId: request.entityId, startTime: slot.start, endTime: slot.end } }, gapBefore)
      : { score: 0, factors: [] };
    if (contextCost.score <= 3) {
      score += 10;
      reasoning.push('Low context-switch cost');
    }

    // +5: Not back-to-back
    const sameDayEvents = existingEvents.filter(
      (e) => startOfDay(e.startTime).getTime() === startOfDay(slot.start).getTime()
    );
    const consecutive = this.countConsecutive(
      sameDayEvents.map((e) => ({ ...e, startTime: e.startTime, endTime: e.endTime, id: e.id })),
      slot
    );
    if (consecutive < 3) {
      score += 5;
      reasoning.push('Not in a back-to-back chain');
    } else {
      score -= 10;
      reasoning.push('Back-to-back with 3+ meetings');
      conflicts.push({
        type: 'BACK_TO_BACK',
        severity: 'SOFT',
        description: `${consecutive} consecutive meetings`,
      });
    }

    // +5: Meeting-free day
    if (!meetingFreedays.includes(dayOfWeek)) {
      score += 5;
      reasoning.push('Not a meeting-free day');
    } else {
      score -= 20;
      reasoning.push('Meeting-free day violated');
      conflicts.push({
        type: 'MEETING_FREE_DAY',
        severity: 'SOFT',
        description: `${this.dayName(dayOfWeek)} is meeting-free`,
      });
    }

    // Check focus block
    for (const fh of focusHours) {
      const focusStart = this.parseTimeOfDay(fh.start, slot.start);
      const focusEnd = this.parseTimeOfDay(fh.end, slot.start);
      if (areIntervalsOverlapping(
        { start: slot.start, end: slot.end },
        { start: focusStart, end: focusEnd }
      )) {
        score -= 30;
        reasoning.push('During focus block');
        conflicts.push({
          type: 'FOCUS_BLOCK',
          severity: 'SOFT',
          description: `Conflicts with focus block ${fh.start}-${fh.end}`,
        });
        break;
      }
    }

    // Check attention budget
    if (sameDayEvents.length + 1 > attentionBudget) {
      score -= 10;
      reasoning.push('Exceeds attention budget');
      conflicts.push({
        type: 'ATTENTION_BUDGET',
        severity: 'SOFT',
        description: `${sameDayEvents.length + 1} events exceeds budget of ${attentionBudget}`,
      });
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    return {
      slot,
      score,
      reasoning,
      conflicts,
      buffers,
      energyLevel,
      contextSwitchCost: contextCost.score,
    };
  }

  private findAdjacentEvent(
    events: CalendarEvent[],
    referenceTime: Date,
    direction: 'before' | 'after'
  ): CalendarEvent | null {
    if (direction === 'before') {
      const before = events
        .filter((e) => e.endTime <= referenceTime)
        .sort((a, b) => b.endTime.getTime() - a.endTime.getTime());
      return before[0] ?? null;
    } else {
      const after = events
        .filter((e) => e.startTime >= referenceTime)
        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      return after[0] ?? null;
    }
  }

  private countConsecutive(
    dayEvents: { startTime: Date; endTime: Date; id: string }[],
    slot: TimeRange
  ): number {
    const allEvents = [
      ...dayEvents.map((e) => ({ start: e.startTime, end: e.endTime })),
      { start: slot.start, end: slot.end },
    ].sort((a, b) => a.start.getTime() - b.start.getTime());

    let maxConsecutive = 1;
    let current = 1;

    for (let i = 1; i < allEvents.length; i++) {
      const gap = differenceInMinutes(allEvents[i].start, allEvents[i - 1].end);
      if (gap <= 15) {
        current++;
        maxConsecutive = Math.max(maxConsecutive, current);
      } else {
        current = 1;
      }
    }

    return maxConsecutive;
  }

  private async getAllUserEvents(
    userId: string,
    timeRange: TimeRange
  ): Promise<Array<{
    id: string;
    title: string;
    entityId: string;
    participantIds: string[];
    startTime: Date;
    endTime: Date;
    bufferBefore: number | null;
    bufferAfter: number | null;
    prepPacket: unknown;
    meetingNotes: string | null;
    recurrence: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>> {
    const userEntities = await prisma.entity.findMany({
      where: { userId },
      select: { id: true },
    });

    return prisma.calendarEvent.findMany({
      where: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        entityId: { in: userEntities.map((e: any) => e.id as string) },
        OR: [
          { startTime: { gte: timeRange.start, lte: timeRange.end } },
          { endTime: { gte: timeRange.start, lte: timeRange.end } },
          {
            startTime: { lte: timeRange.start },
            endTime: { gte: timeRange.end },
          },
        ],
      },
      orderBy: { startTime: 'asc' },
    });
  }

  private getViewDateRange(viewMode: CalendarViewMode, date: Date): TimeRange {
    switch (viewMode) {
      case 'day':
        return { start: startOfDay(date), end: endOfDay(date) };
      case 'week':
        return { start: startOfWeek(date, { weekStartsOn: 1 }), end: endOfWeek(date, { weekStartsOn: 1 }) };
      case 'month':
        return { start: startOfMonth(date), end: endOfMonth(date) };
    }
  }

  parseTimeOfDay(timeStr: string, referenceDate: Date): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const d = startOfDay(referenceDate);
    return addMinutes(d, hours * 60 + (minutes ?? 0));
  }

  private dayName(day: number): string {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
  }

  private toCalendarEvent(raw: {
    id: string;
    title: string;
    entityId: string;
    participantIds: string[];
    startTime: Date;
    endTime: Date;
    bufferBefore: number | null;
    bufferAfter: number | null;
    prepPacket: unknown;
    meetingNotes: string | null;
    recurrence: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): CalendarEvent {
    return {
      id: raw.id,
      title: raw.title,
      entityId: raw.entityId,
      participantIds: raw.participantIds,
      startTime: raw.startTime,
      endTime: raw.endTime,
      bufferBefore: raw.bufferBefore ?? undefined,
      bufferAfter: raw.bufferAfter ?? undefined,
      prepPacket: raw.prepPacket as CalendarEvent['prepPacket'],
      meetingNotes: raw.meetingNotes ?? undefined,
      recurrence: raw.recurrence ?? undefined,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}
