import {
  CalendarEvent, PrepPacket
} from '@/shared/types';

// --- Scheduling Types ---

export interface ScheduleRequest {
  title: string;
  entityId: string;
  participantIds?: string[];
  duration: number;
  preferredTimeRanges?: TimeRange[];
  avoidTimeRanges?: TimeRange[];
  bufferBefore?: number;
  bufferAfter?: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type: EventType;
  location?: string;
  notes?: string;
  recurrence?: string;
  requiresPrep?: boolean;
  prepTimeMinutes?: number;
}

export type EventType =
  | 'MEETING'
  | 'CALL'
  | 'FOCUS_BLOCK'
  | 'TRAVEL'
  | 'BREAK'
  | 'PREP'
  | 'DEBRIEF'
  | 'PERSONAL'
  | 'DEADLINE'
  | 'REMINDER';

export interface TimeRange {
  start: Date;
  end: Date;
  timezone?: string;
}

export interface ScheduleSuggestion {
  slot: TimeRange;
  score: number;
  reasoning: string[];
  conflicts: ConflictInfo[];
  buffers: {
    before: number;
    after: number;
  };
  energyLevel: EnergyLevel;
  contextSwitchCost: number;
}

export interface ConflictInfo {
  type: ConflictType;
  severity: 'SOFT' | 'HARD';
  existingEvent?: CalendarEvent;
  description: string;
  resolution?: string;
}

export type ConflictType =
  | 'TIME_OVERLAP'
  | 'BUFFER_VIOLATION'
  | 'FOCUS_BLOCK'
  | 'MEETING_FREE_DAY'
  | 'TRAVEL_TIME'
  | 'BACK_TO_BACK'
  | 'ENERGY_LOW'
  | 'ATTENTION_BUDGET'
  | 'CROSS_ENTITY'
  | 'PARTICIPANT_UNAVAILABLE';

// --- Natural Language Scheduling ---

export interface NaturalLanguageScheduleInput {
  text: string;
  entityId: string;
  userId: string;
}

export interface ParsedScheduleIntent {
  title: string;
  participantNames: string[];
  timeHints: TimeHint[];
  duration?: number;
  type: EventType;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  location?: string;
  confidence: number;
}

export interface TimeHint {
  type: 'RELATIVE' | 'ABSOLUTE' | 'PREFERENCE';
  value: string;
  resolvedRange?: TimeRange;
}

// --- Buffer Intelligence ---

export interface BufferConfig {
  defaultBefore: number;
  defaultAfter: number;
  travelTimeRules: TravelTimeRule[];
  prepTimeRules: PrepTimeRule[];
  decompressionRules: DecompressionRule[];
}

export interface TravelTimeRule {
  fromLocationType: string;
  toLocationType: string;
  estimatedMinutes: number;
}

export interface PrepTimeRule {
  eventType: EventType;
  participantCount: number;
  prepMinutes: number;
}

export interface DecompressionRule {
  afterEventType: EventType;
  durationThreshold: number;
  decompressionMinutes: number;
}

// --- Buffer Context & Settings ---

export interface BufferContext {
  previousEvent?: CalendarEvent & { location?: string; type?: EventType };
  nextEvent?: CalendarEvent & { location?: string; type?: EventType };
  userSettings?: BufferSettings;
}

export interface BufferTime {
  before: number;
  after: number;
  breakdown: {
    travel: { before: number; after: number };
    contextSwitch: { before: number; after: number };
    recovery: number;
    prep: number;
  };
}

export interface BufferBlock {
  eventId: string;
  type: 'before' | 'after';
  bufferType: 'travel' | 'context_switch' | 'recovery' | 'prep' | 'default';
  start: Date;
  end: Date;
  durationMinutes: number;
}

export interface BufferConflict {
  bufferBlock: BufferBlock;
  conflictingEvent: CalendarEvent;
  overlapMinutes: number;
  resolution: string;
}

export interface BufferSettings {
  defaultBeforeMinutes: number;
  defaultAfterMinutes: number;
  travelBufferEnabled: boolean;
  contextSwitchBufferEnabled: boolean;
  recoveryBufferEnabled: boolean;
  prepBufferEnabled: boolean;
  maxBufferMinutes: number;
  minBufferMinutes: number;
  travelBufferMultiplier: number;
  contextSwitchMinutes: { low: number; medium: number; high: number };
  recoveryThresholds: {
    durationMinutes: number;
    participantCount: number;
    recoveryMinutes: number;
  }[];
  prepMinutesByPriority: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
  };
}

export interface BufferOptimizationConstraints {
  maxTotalBufferMinutes: number;
  minimumBufferMinutes: number;
  preservePrepBuffers: boolean;
  preserveTravelBuffers: boolean;
  compressionRatio: number;
}

export type CalendarEventWithBuffers = CalendarEvent & {
  bufferBlocks: BufferBlock[];
  location?: string;
  type?: EventType;
};

// --- Energy Management ---

export type Chronotype = 'EARLY_BIRD' | 'NIGHT_OWL' | 'FLEXIBLE';
export type EnergyLevel = 'PEAK' | 'HIGH' | 'MODERATE' | 'LOW' | 'RECOVERY';

export interface EnergyProfile {
  chronotype: Chronotype;
  peakHours: TimeRange[];
  highHours: TimeRange[];
  moderateHours: TimeRange[];
  lowHours: TimeRange[];
  recoveryHours: TimeRange[];
}

export interface EnergyMapping {
  hour: number;
  energyLevel: EnergyLevel;
  suitableFor: EventType[];
}

export interface ContextSwitchScore {
  score: number;
  factors: string[];
}

// --- Schedule Analytics ---

export interface ScheduleAnalytics {
  period: TimeRange;
  userId: string;
  entityId?: string;
  timeAllocation: {
    meetings: number;
    focusBlocks: number;
    travel: number;
    breaks: number;
    prep: number;
    unscheduled: number;
  };
  meetingMetrics: {
    totalMeetings: number;
    avgDuration: number;
    backToBackCount: number;
    meetingFreedays: number;
    busiestDay: string;
    avgMeetingsPerDay: number;
  };
  energyMetrics: {
    peakHoursUtilized: number;
    lowEnergyMeetings: number;
    contextSwitches: number;
    avgContextSwitchCost: number;
  };
  suggestions: ScheduleOptimization[];
}

export interface ScheduleOptimization {
  type: 'MOVE_MEETING' | 'ADD_BUFFER' | 'PROTECT_FOCUS' | 'REDUCE_BACK_TO_BACK' | 'BATCH_SIMILAR' | 'FREE_UP_DAY';
  description: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  eventId?: string;
  suggestedChange?: string;
}

// --- Prep Packet ---

export interface PrepPacketRequest {
  eventId: string;
  entityId: string;
  depth: 'BRIEF' | 'STANDARD' | 'DETAILED';
}

export interface GeneratedPrepPacket extends PrepPacket {
  eventId: string;
  generatedAt: Date;
  suggestions: string[];
  riskFlags: string[];
}

// --- Post-Meeting Capture ---

export interface PostMeetingCapture {
  eventId: string;
  entityId: string;
  notes: string;
  actionItems: ActionItemFromMeeting[];
  decisions: string[];
  followUpDate?: Date;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  keyTakeaways: string[];
}

export interface ActionItemFromMeeting {
  title: string;
  assigneeId?: string;
  dueDate?: Date;
  priority: 'P0' | 'P1' | 'P2';
  description?: string;
}

// --- Calendar View Types ---

export type CalendarViewMode = 'day' | 'week' | 'month';

export interface CalendarViewData {
  viewMode: CalendarViewMode;
  dateRange: TimeRange;
  events: CalendarEventDisplay[];
  focusBlocks: TimeRange[];
  bufferBlocks: TimeRange[];
  conflicts: ConflictInfo[];
  energyOverlay?: EnergyMapping[];
}

export interface CalendarEventDisplay extends CalendarEvent {
  entityName: string;
  entityColor: string;
  type: EventType;
  participantNames: string[];
  hasConflict: boolean;
  hasPrepPacket: boolean;
  isInFocusBlock: boolean;
}

export interface DragDropUpdate {
  eventId: string;
  newStartTime: Date;
  newEndTime: Date;
}
