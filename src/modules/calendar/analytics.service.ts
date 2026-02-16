import {
  differenceInMinutes,
  differenceInHours,
  getDay,
  startOfDay,
  eachDayOfInterval,
  getHours,
} from 'date-fns';
import { prisma } from '@/lib/db';
import type { CalendarEvent } from '@/shared/types';
import { EnergyService } from './energy.service';
import type {
  Chronotype,
  ScheduleAnalytics,
  ScheduleOptimization,
  TimeRange,
} from './calendar.types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export class CalendarAnalyticsService {
  private energyService = new EnergyService();

  async getAnalytics(
    userId: string,
    period: TimeRange,
    entityId?: string
  ): Promise<ScheduleAnalytics> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const chronotype = (user?.chronotype as Chronotype) ?? 'FLEXIBLE';

    const userEntities = await prisma.entity.findMany({
      where: { userId },
      select: { id: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entityIds = entityId ? [entityId] : userEntities.map((e: any) => e.id as string);

    const rawEvents = await prisma.calendarEvent.findMany({
      where: {
        entityId: { in: entityIds },
        startTime: { gte: period.start },
        endTime: { lte: period.end },
      },
      orderBy: { startTime: 'asc' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events: CalendarEvent[] = rawEvents.map((e: any) => ({
      id: e.id,
      title: e.title,
      entityId: e.entityId,
      participantIds: e.participantIds,
      startTime: e.startTime,
      endTime: e.endTime,
      bufferBefore: e.bufferBefore ?? undefined,
      bufferAfter: e.bufferAfter ?? undefined,
      prepPacket: e.prepPacket as CalendarEvent['prepPacket'],
      meetingNotes: e.meetingNotes ?? undefined,
      recurrence: e.recurrence ?? undefined,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));

    const timeAllocation = this.calculateTimeAllocation(events, period);
    const meetingMetrics = this.calculateMeetingMetrics(events, period);
    const energyMetrics = this.calculateEnergyMetrics(events, chronotype);

    const analytics: ScheduleAnalytics = {
      period,
      userId,
      entityId,
      timeAllocation,
      meetingMetrics,
      energyMetrics,
      suggestions: [],
    };

    analytics.suggestions = this.generateSuggestions(events, analytics);

    return analytics;
  }

  private calculateTimeAllocation(
    events: CalendarEvent[],
    period: TimeRange
  ): ScheduleAnalytics['timeAllocation'] {
    let meetings = 0;
    let focusBlocks = 0;
    let travel = 0;
    let breaks = 0;
    let prep = 0;

    for (const event of events) {
      const durationHours = differenceInMinutes(event.endTime, event.startTime) / 60;
      const title = event.title.toLowerCase();

      if (/\b(focus|deep work|heads down)\b/.test(title)) {
        focusBlocks += durationHours;
      } else if (/\b(travel|drive|commute)\b/.test(title)) {
        travel += durationHours;
      } else if (/\b(lunch|break|walk)\b/.test(title)) {
        breaks += durationHours;
      } else if (/\b(prep|prepare)\b/.test(title)) {
        prep += durationHours;
      } else {
        meetings += durationHours;
      }
    }

    const totalScheduled = meetings + focusBlocks + travel + breaks + prep;
    const totalPeriodHours = differenceInHours(period.end, period.start);
    // Approximate business hours (8 per working day)
    const days = eachDayOfInterval({ start: period.start, end: period.end });
    const workingDays = days.filter((d) => {
      const dow = getDay(d);
      return dow !== 0 && dow !== 6;
    }).length;
    const availableHours = workingDays * 8;
    const unscheduled = Math.max(0, availableHours - totalScheduled);

    return {
      meetings: Math.round(meetings * 10) / 10,
      focusBlocks: Math.round(focusBlocks * 10) / 10,
      travel: Math.round(travel * 10) / 10,
      breaks: Math.round(breaks * 10) / 10,
      prep: Math.round(prep * 10) / 10,
      unscheduled: Math.round(unscheduled * 10) / 10,
    };
  }

  private calculateMeetingMetrics(
    events: CalendarEvent[],
    period: TimeRange
  ): ScheduleAnalytics['meetingMetrics'] {
    // Filter to meeting-type events
    const meetings = events.filter((e) => {
      const title = e.title.toLowerCase();
      return !/\b(focus|deep work|travel|break|lunch|prep)\b/.test(title);
    });

    const totalMeetings = meetings.length;
    const totalDuration = meetings.reduce(
      (sum, m) => sum + differenceInMinutes(m.endTime, m.startTime),
      0
    );
    const avgDuration = totalMeetings > 0 ? Math.round(totalDuration / totalMeetings) : 0;

    // Back-to-back count
    let backToBackCount = 0;
    const sorted = [...meetings].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const gap = differenceInMinutes(sorted[i].startTime, sorted[i - 1].endTime);
      if (gap <= 10) backToBackCount++;
    }

    // Days with meetings
    const days = eachDayOfInterval({ start: period.start, end: period.end });
    const workingDays = days.filter((d) => {
      const dow = getDay(d);
      return dow !== 0 && dow !== 6;
    });

    const daysWithMeetings = new Set(
      meetings.map((m) => startOfDay(m.startTime).getTime())
    );
    const meetingFreedays = workingDays.length - daysWithMeetings.size;

    // Busiest day
    const dayCount: Record<number, number> = {};
    for (const m of meetings) {
      const dow = getDay(m.startTime);
      dayCount[dow] = (dayCount[dow] ?? 0) + 1;
    }
    let busiestDay = 'Monday';
    let busiestCount = 0;
    for (const [day, count] of Object.entries(dayCount)) {
      if (count > busiestCount) {
        busiestCount = count;
        busiestDay = DAY_NAMES[parseInt(day, 10)];
      }
    }

    const avgMeetingsPerDay = workingDays.length > 0
      ? Math.round((totalMeetings / workingDays.length) * 10) / 10
      : 0;

    return {
      totalMeetings,
      avgDuration,
      backToBackCount,
      meetingFreedays,
      busiestDay,
      avgMeetingsPerDay,
    };
  }

  private calculateEnergyMetrics(
    events: CalendarEvent[],
    chronotype: Chronotype
  ): ScheduleAnalytics['energyMetrics'] {
    let peakHoursTotal = 0;
    let peakHoursHighValue = 0;
    let lowEnergyMeetings = 0;
    let contextSwitches = 0;
    let totalContextSwitchCost = 0;

    const sorted = [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    for (let i = 0; i < sorted.length; i++) {
      const event = sorted[i];
      const hour = getHours(event.startTime);
      const energy = this.energyService.getEnergyLevel(chronotype, hour);
      const durationHours = differenceInMinutes(event.endTime, event.startTime) / 60;

      if (energy === 'PEAK') {
        peakHoursTotal += durationHours;
        const title = event.title.toLowerCase();
        if (/\b(focus|deep work|meeting)\b/.test(title)) {
          peakHoursHighValue += durationHours;
        }
      }

      if (energy === 'LOW' || energy === 'RECOVERY') {
        const title = event.title.toLowerCase();
        if (!/\b(break|lunch|walk)\b/.test(title)) {
          lowEnergyMeetings++;
        }
      }

      // Context switches
      if (i > 0) {
        const prevEvent = sorted[i - 1];
        const gap = differenceInMinutes(event.startTime, prevEvent.endTime);
        if (gap < 60) {
          contextSwitches++;
          const cost = this.energyService.calculateContextSwitchCost(prevEvent, event, gap);
          totalContextSwitchCost += cost.score;
        }
      }
    }

    const peakHoursUtilized = peakHoursTotal > 0
      ? Math.round((peakHoursHighValue / peakHoursTotal) * 100)
      : 0;

    const avgContextSwitchCost = contextSwitches > 0
      ? Math.round((totalContextSwitchCost / contextSwitches) * 10) / 10
      : 0;

    return {
      peakHoursUtilized,
      lowEnergyMeetings,
      contextSwitches,
      avgContextSwitchCost,
    };
  }

  private generateSuggestions(
    events: CalendarEvent[],
    metrics: ScheduleAnalytics
  ): ScheduleOptimization[] {
    const suggestions: ScheduleOptimization[] = [];

    // Back-to-back reduction
    if (metrics.meetingMetrics.backToBackCount > 2) {
      suggestions.push({
        type: 'REDUCE_BACK_TO_BACK',
        description: `${metrics.meetingMetrics.backToBackCount} back-to-back meetings detected. Add buffers between meetings.`,
        impact: 'HIGH',
      });
    }

    // Low energy meetings
    if (metrics.energyMetrics.lowEnergyMeetings > 2) {
      suggestions.push({
        type: 'MOVE_MEETING',
        description: `${metrics.energyMetrics.lowEnergyMeetings} meetings during low energy periods. Move to higher energy times.`,
        impact: 'MEDIUM',
      });
    }

    // Peak hours underutilized
    if (metrics.energyMetrics.peakHoursUtilized < 50) {
      suggestions.push({
        type: 'PROTECT_FOCUS',
        description: `Only ${metrics.energyMetrics.peakHoursUtilized}% of peak hours used for high-value work. Protect peak hours for focus time.`,
        impact: 'HIGH',
      });
    }

    // No meeting-free days
    if (metrics.meetingMetrics.meetingFreedays === 0) {
      suggestions.push({
        type: 'FREE_UP_DAY',
        description: 'No meeting-free days this period. Consider blocking one day per week.',
        impact: 'MEDIUM',
      });
    }

    // High context switching
    if (metrics.energyMetrics.avgContextSwitchCost > 5) {
      suggestions.push({
        type: 'BATCH_SIMILAR',
        description: `High context-switch cost (avg ${metrics.energyMetrics.avgContextSwitchCost}). Batch similar meetings together.`,
        impact: 'MEDIUM',
      });
    }

    // Missing buffers
    const eventsWithoutBuffers = events.filter(
      (e) => !e.bufferBefore && !e.bufferAfter
    );
    if (eventsWithoutBuffers.length > events.length * 0.5) {
      suggestions.push({
        type: 'ADD_BUFFER',
        description: `${eventsWithoutBuffers.length} events have no buffers. Add transition time between meetings.`,
        impact: 'LOW',
      });
    }

    return suggestions;
  }
}
