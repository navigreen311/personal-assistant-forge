import type { CalendarEvent } from '@/shared/types';
import type {
  Chronotype,
  EnergyLevel,
  EnergyProfile,
  EnergyMapping,
  EventType,
  ContextSwitchScore,
  TimeRange,
} from './calendar.types';

const ENERGY_PROFILES: Record<Chronotype, { start: number; end: number; level: EnergyLevel }[]> = {
  EARLY_BIRD: [
    { start: 0, end: 6, level: 'LOW' },
    { start: 6, end: 10, level: 'PEAK' },
    { start: 10, end: 12, level: 'HIGH' },
    { start: 12, end: 14, level: 'MODERATE' },
    { start: 14, end: 16, level: 'LOW' },
    { start: 16, end: 18, level: 'RECOVERY' },
    { start: 18, end: 24, level: 'LOW' },
  ],
  NIGHT_OWL: [
    { start: 0, end: 6, level: 'LOW' },
    { start: 6, end: 9, level: 'LOW' },
    { start: 9, end: 11, level: 'RECOVERY' },
    { start: 11, end: 14, level: 'MODERATE' },
    { start: 14, end: 18, level: 'HIGH' },
    { start: 18, end: 23, level: 'PEAK' },
    { start: 23, end: 24, level: 'MODERATE' },
  ],
  FLEXIBLE: [
    { start: 0, end: 6, level: 'LOW' },
    { start: 6, end: 9, level: 'MODERATE' },
    { start: 9, end: 12, level: 'HIGH' },
    { start: 12, end: 14, level: 'MODERATE' },
    { start: 14, end: 17, level: 'HIGH' },
    { start: 17, end: 20, level: 'MODERATE' },
    { start: 20, end: 23, level: 'LOW' },
    { start: 23, end: 24, level: 'LOW' },
  ],
};

const ENERGY_EVENT_TYPES: Record<EnergyLevel, EventType[]> = {
  PEAK: ['FOCUS_BLOCK', 'MEETING'],
  HIGH: ['MEETING', 'CALL', 'FOCUS_BLOCK'],
  MODERATE: ['CALL', 'BREAK', 'MEETING', 'PERSONAL'],
  LOW: ['BREAK', 'PERSONAL', 'TRAVEL'],
  RECOVERY: ['PREP', 'MEETING', 'DEBRIEF', 'PERSONAL'],
};

export class EnergyService {
  getEnergyProfile(chronotype: Chronotype): EnergyProfile {
    const bands = ENERGY_PROFILES[chronotype];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const toRange = (start: number, end: number): TimeRange => ({
      start: new Date(today.getTime() + start * 60 * 60 * 1000),
      end: new Date(today.getTime() + end * 60 * 60 * 1000),
    });

    const collect = (level: EnergyLevel): TimeRange[] =>
      bands.filter((b) => b.level === level).map((b) => toRange(b.start, b.end));

    return {
      chronotype,
      peakHours: collect('PEAK'),
      highHours: collect('HIGH'),
      moderateHours: collect('MODERATE'),
      lowHours: collect('LOW'),
      recoveryHours: collect('RECOVERY'),
    };
  }

  getEnergyLevel(chronotype: Chronotype, hour: number): EnergyLevel {
    const bands = ENERGY_PROFILES[chronotype];
    for (const band of bands) {
      if (hour >= band.start && hour < band.end) {
        return band.level;
      }
    }
    return 'LOW';
  }

  getRecommendedEventTypes(energyLevel: EnergyLevel): EventType[] {
    return ENERGY_EVENT_TYPES[energyLevel] ?? [];
  }

  calculateContextSwitchCost(
    prevEvent: CalendarEvent | null,
    nextEvent: CalendarEvent,
    gapMinutes: number
  ): ContextSwitchScore {
    if (!prevEvent) {
      return { score: 0, factors: ['No previous event'] };
    }

    let score = 0;
    const factors: string[] = [];

    // Different entity
    if (prevEvent.entityId !== nextEvent.entityId) {
      score += 3;
      factors.push('Different entity context (+3)');
    }

    // Different event type — we infer type from title keywords as a heuristic
    const prevType = this.inferTypeFromTitle(prevEvent.title);
    const nextType = this.inferTypeFromTitle(nextEvent.title);
    if (prevType !== nextType) {
      score += 2;
      factors.push('Different event type (+2)');
    }

    // Gap too short
    if (gapMinutes < 10) {
      score += 2;
      factors.push('Gap < 10 minutes (+2)');
    }

    // Gap long enough
    if (gapMinutes > 60) {
      score -= 1;
      factors.push('Gap > 60 minutes (-1)');
    }

    // Same participants
    const sharedParticipants = prevEvent.participantIds.filter((id) =>
      nextEvent.participantIds.includes(id)
    );
    if (sharedParticipants.length > 0) {
      score -= 2;
      factors.push('Shared participants (-2)');
    }

    // Clamp to 0-10
    score = Math.max(0, Math.min(10, score));

    return { score, factors };
  }

  getDailyEnergyMapping(chronotype: Chronotype): EnergyMapping[] {
    const mappings: EnergyMapping[] = [];
    for (let hour = 0; hour < 24; hour++) {
      const energyLevel = this.getEnergyLevel(chronotype, hour);
      mappings.push({
        hour,
        energyLevel,
        suitableFor: this.getRecommendedEventTypes(energyLevel),
      });
    }
    return mappings;
  }

  private inferTypeFromTitle(title: string): EventType {
    const lower = title.toLowerCase();
    if (/\b(call|phone)\b/.test(lower)) return 'CALL';
    if (/\b(focus|deep work|heads down)\b/.test(lower)) return 'FOCUS_BLOCK';
    if (/\b(travel|drive|commute)\b/.test(lower)) return 'TRAVEL';
    if (/\b(lunch|break|walk)\b/.test(lower)) return 'BREAK';
    if (/\b(prep|prepare)\b/.test(lower)) return 'PREP';
    if (/\b(debrief)\b/.test(lower)) return 'DEBRIEF';
    if (/\b(deadline|due)\b/.test(lower)) return 'DEADLINE';
    return 'MEETING';
  }
}
