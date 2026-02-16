import {
  addDays,
  nextMonday,
  nextTuesday,
  nextWednesday,
  nextThursday,
  nextFriday,
  nextSaturday,
  nextSunday,
  setHours,
  setMinutes,
  startOfDay,
  endOfMonth,
  getDay,
  subDays,
  isBefore,
} from 'date-fns';
import { prisma } from '@/lib/db';
import type {
  NaturalLanguageScheduleInput,
  ParsedScheduleIntent,
  TimeHint,
  TimeRange,
  EventType,
} from './calendar.types';

const DAY_RESOLVERS: Record<string, (date: Date) => Date> = {
  monday: nextMonday,
  tuesday: nextTuesday,
  wednesday: nextWednesday,
  thursday: nextThursday,
  friday: nextFriday,
  saturday: nextSaturday,
  sunday: nextSunday,
};

export class NLPSchedulingService {
  async parseScheduleRequest(
    input: NaturalLanguageScheduleInput
  ): Promise<ParsedScheduleIntent> {
    const text = input.text;
    const lower = text.toLowerCase();

    const type = this.inferEventType(lower);
    const duration = this.inferDuration(lower, type);
    const priority = this.inferPriority(lower);
    const participantNames = this.extractParticipants(text);
    const timeHints = this.extractTimeHints(lower);
    const location = this.extractLocation(text);
    const title = this.buildTitle(text, type, participantNames);

    // Calculate confidence based on how many fields we could infer
    let confidence = 0.5;
    if (timeHints.length > 0) confidence += 0.2;
    if (participantNames.length > 0) confidence += 0.1;
    if (type !== 'MEETING') confidence += 0.1; // explicit type detected
    if (/\d+\s*(min|hour|hr)/i.test(lower)) confidence += 0.1; // explicit duration

    return {
      title,
      participantNames,
      timeHints,
      duration,
      type,
      priority,
      location,
      confidence: Math.min(1, confidence),
    };
  }

  async resolveParticipants(
    names: string[],
    entityId: string
  ): Promise<{ name: string; contactId?: string; resolved: boolean }[]> {
    if (names.length === 0) return [];

    const contacts = await prisma.contact.findMany({
      where: { entityId },
      select: { id: true, name: true },
    });

    return names.map((name) => {
      const lowerName = name.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = contacts.find(
        (c: any) => c.name.toLowerCase() === lowerName ||
          c.name.toLowerCase().includes(lowerName) ||
          lowerName.includes(c.name.toLowerCase())
      );
      return {
        name,
        contactId: match?.id,
        resolved: !!match,
      };
    });
  }

  resolveTimeHints(
    hints: TimeHint[],
    referenceDate: Date,
    _timezone: string
  ): TimeRange[] {
    return hints
      .map((hint) => this.resolveHint(hint, referenceDate))
      .filter((r): r is TimeRange => r !== null);
  }

  inferEventType(text: string): EventType {
    const lower = text.toLowerCase();
    if (/\b(call|phone)\b/.test(lower)) return 'CALL';
    if (/\b(focus\s*(time|block)?|deep\s*work|heads\s*down)\b/.test(lower)) return 'FOCUS_BLOCK';
    if (/\b(travel|drive|commute)\b/.test(lower)) return 'TRAVEL';
    if (/\b(lunch|break|walk)\b/.test(lower)) return 'BREAK';
    if (/\b(prep|prepare)\b/.test(lower)) return 'PREP';
    if (/\b(debrief)\b/.test(lower)) return 'DEBRIEF';
    if (/\b(deadline|due)\b/.test(lower)) return 'DEADLINE';
    if (/\b(reminder)\b/.test(lower)) return 'REMINDER';
    if (/\b(meeting|meet|sync)\b/.test(lower)) return 'MEETING';
    return 'MEETING';
  }

  inferDuration(text: string, eventType: EventType): number {
    const lower = text.toLowerCase();

    // Explicit duration patterns
    const hourMatch = lower.match(/(\d+)\s*hours?/);
    if (hourMatch) return parseInt(hourMatch[1], 10) * 60;

    const minMatch = lower.match(/(\d+)[\s-]*(?:min|minutes?)/);
    if (minMatch) return parseInt(minMatch[1], 10);

    // Quick prefix
    if (/\bquick\b/.test(lower)) {
      if (eventType === 'CALL') return 15;
      return 15;
    }

    // Workshop
    if (/\bworkshop\b/.test(lower)) return 120;

    // Lunch
    if (/\blunch\b/.test(lower)) return 60;

    // By event type defaults
    switch (eventType) {
      case 'CALL': return 30;
      case 'MEETING': return 60;
      case 'FOCUS_BLOCK': return 60;
      case 'BREAK': return 30;
      case 'PREP': return 30;
      default: return 30;
    }
  }

  inferPriority(text: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const lower = text.toLowerCase();
    if (/\b(urgent|asap|critical|emergency)\b/.test(lower)) return 'CRITICAL';
    if (/\b(important|high\s*priority)\b/.test(lower)) return 'HIGH';
    if (/\b(low\s*priority|whenever|no\s*rush)\b/.test(lower)) return 'LOW';
    return 'MEDIUM';
  }

  private extractParticipants(text: string): string[] {
    const names: string[] = [];

    // Pattern: "with [Name]" or "with [Name] and [Name]"
    const withPattern = /\bwith\s+((?:(?:Dr|Mr|Mrs|Ms|Prof)\.\s*)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+and\s+(?:(?:Dr|Mr|Mrs|Ms|Prof)\.\s*)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)*)/g;
    let match: RegExpExecArray | null;

    while ((match = withPattern.exec(text)) !== null) {
      const nameGroup = match[1];
      // Split on " and "
      const parts = nameGroup.split(/\s+and\s+/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed && trimmed !== 'the' && trimmed !== 'team') {
          names.push(trimmed);
        }
      }
    }

    return names;
  }

  private extractTimeHints(text: string): TimeHint[] {
    const hints: TimeHint[] = [];
    const lower = text.toLowerCase();

    // "today"
    if (/\btoday\b/.test(lower)) {
      hints.push({ type: 'RELATIVE', value: 'today' });
    }

    // "tomorrow"
    if (/\btomorrow\b/.test(lower)) {
      hints.push({ type: 'RELATIVE', value: 'tomorrow' });
    }

    // "next week"
    if (/\bnext\s+week\b/.test(lower)) {
      hints.push({ type: 'RELATIVE', value: 'next week' });
    }

    // "next [day]"
    const nextDayMatch = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if (nextDayMatch) {
      hints.push({ type: 'RELATIVE', value: `next ${nextDayMatch[1]}` });
    }

    // "on [day]" or just "[day]" without "next"
    if (!nextDayMatch) {
      const onDayMatch = lower.match(/\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
      if (onDayMatch) {
        hints.push({ type: 'RELATIVE', value: `next ${onDayMatch[1]}` });
      }
    }

    // "in N days"
    const inDaysMatch = lower.match(/\bin\s+(\d+)\s+days?\b/);
    if (inDaysMatch) {
      hints.push({ type: 'RELATIVE', value: `in ${inDaysMatch[1]} days` });
    }

    // "this afternoon"
    if (/\bthis\s+afternoon\b/.test(lower)) {
      hints.push({ type: 'RELATIVE', value: 'this afternoon' });
    }

    // "end of week"
    if (/\bend\s+of\s+week\b/.test(lower)) {
      hints.push({ type: 'RELATIVE', value: 'end of week' });
    }

    // "end of month"
    if (/\bend\s+of\s+month\b/.test(lower)) {
      hints.push({ type: 'RELATIVE', value: 'end of month' });
    }

    // Time preferences: "morning(s)", "afternoon(s)", "evening"
    if (/\bprefer\s+mornings?\b/.test(lower) || (/\bmorning\b/.test(lower) && !hints.some(h => h.value.includes('morning')))) {
      hints.push({ type: 'PREFERENCE', value: 'morning' });
    }
    if (/\bprefer\s+afternoons?\b/.test(lower) || (/\bafternoon\b/.test(lower) && !hints.some(h => h.value.includes('afternoon')))) {
      if (!hints.some(h => h.value === 'this afternoon')) {
        hints.push({ type: 'PREFERENCE', value: 'afternoon' });
      }
    }
    if (/\bevening\b/.test(lower)) {
      hints.push({ type: 'PREFERENCE', value: 'evening' });
    }

    // Specific time: "at 2pm", "at 14:00", "2:30 PM"
    const atTimeMatch = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
    if (atTimeMatch) {
      const raw = atTimeMatch[0].replace(/^at\s+/, '');
      hints.push({ type: 'ABSOLUTE', value: raw });
    }

    return hints;
  }

  private resolveHint(hint: TimeHint, ref: Date): TimeRange | null {
    const today = startOfDay(ref);

    switch (hint.type) {
      case 'RELATIVE': {
        if (hint.value === 'today') {
          return { start: setHours(today, 8), end: setHours(today, 18) };
        }
        if (hint.value === 'tomorrow') {
          const tmr = addDays(today, 1);
          return { start: setHours(tmr, 8), end: setHours(tmr, 18) };
        }
        if (hint.value === 'next week') {
          const mon = nextMonday(today);
          const fri = addDays(mon, 4);
          return { start: setHours(mon, 8), end: setHours(fri, 18) };
        }
        if (hint.value === 'this afternoon') {
          return { start: setHours(today, 12), end: setHours(today, 17) };
        }
        if (hint.value === 'end of week') {
          const dayOfWeek = getDay(today);
          const daysToFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 5 + (7 - dayOfWeek);
          const fri = addDays(today, daysToFriday);
          return { start: setHours(fri, 8), end: setHours(fri, 18) };
        }
        if (hint.value === 'end of month') {
          let lastDay = endOfMonth(today);
          // Find last business day
          while (getDay(lastDay) === 0 || getDay(lastDay) === 6) {
            lastDay = subDays(lastDay, 1);
          }
          return { start: setHours(startOfDay(lastDay), 8), end: setHours(startOfDay(lastDay), 18) };
        }

        // "in N days"
        const inDaysMatch = hint.value.match(/^in\s+(\d+)\s+days?$/);
        if (inDaysMatch) {
          const d = addDays(today, parseInt(inDaysMatch[1], 10));
          return { start: setHours(d, 8), end: setHours(d, 18) };
        }

        // "next [day]"
        const dayMatch = hint.value.match(/^next\s+(\w+)$/);
        if (dayMatch) {
          const resolver = DAY_RESOLVERS[dayMatch[1]];
          if (resolver) {
            const d = resolver(today);
            return { start: setHours(d, 8), end: setHours(d, 18) };
          }
        }
        return null;
      }

      case 'PREFERENCE': {
        if (hint.value === 'morning') {
          return { start: setHours(today, 8), end: setHours(today, 12) };
        }
        if (hint.value === 'afternoon') {
          return { start: setHours(today, 12), end: setHours(today, 17) };
        }
        if (hint.value === 'evening') {
          return { start: setHours(today, 17), end: setHours(today, 20) };
        }
        return null;
      }

      case 'ABSOLUTE': {
        // Parse "2pm", "14:00", "2:30 PM"
        const parsed = this.parseTimeString(hint.value);
        if (parsed) {
          let d = setHours(setMinutes(today, parsed.minutes), parsed.hours);
          if (isBefore(d, ref)) d = addDays(d, 1);
          return { start: d, end: new Date(d.getTime() + 30 * 60 * 1000) };
        }
        return null;
      }

      default:
        return null;
    }
  }

  private parseTimeString(s: string): { hours: number; minutes: number } | null {
    // "2pm", "2:30 PM", "14:00"
    const match12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (match12) {
      let hours = parseInt(match12[1], 10);
      const minutes = match12[2] ? parseInt(match12[2], 10) : 0;
      const ampm = match12[3].toLowerCase();
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      return { hours, minutes };
    }

    const match24 = s.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
      return {
        hours: parseInt(match24[1], 10),
        minutes: parseInt(match24[2], 10),
      };
    }

    return null;
  }

  private extractLocation(text: string): string | undefined {
    const match = text.match(/\b(?:at|in|@)\s+((?:the\s+)?[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/);
    // Avoid matching time-related words
    if (match && !/^(the\s+)?(morning|afternoon|evening|night|office|end)/i.test(match[1])) {
      return match[1];
    }
    return undefined;
  }

  private buildTitle(
    text: string,
    type: EventType,
    participants: string[]
  ): string {
    // If short enough, use original text as title
    if (text.length <= 60) return text;

    // Build a title from inferred parts
    const typeLabel = type.charAt(0) + type.slice(1).toLowerCase().replace('_', ' ');
    if (participants.length > 0) {
      return `${typeLabel} with ${participants.join(', ')}`;
    }
    return text.substring(0, 60);
  }
}
