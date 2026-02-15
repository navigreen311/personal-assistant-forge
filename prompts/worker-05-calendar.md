# Worker 05: Smart Calendar & Time Engine (M2)

## Branch: ai-feature/w05-calendar

Create and check out the branch `ai-feature/w05-calendar` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/calendar/` (all files -- services, components, types)
- `src/app/api/calendar/` (all files -- API routes)
- `src/app/(dashboard)/calendar/` (all files -- UI pages)
- `tests/unit/calendar/` (all files)

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`prisma/schema.prisma`** -- The CalendarEvent model: id, title, entityId, participantIds (String[]), startTime (DateTime), endTime (DateTime), bufferBefore (Int?), bufferAfter (Int?), prepPacket (Json?), meetingNotes, recurrence, createdAt, updatedAt. Related to Entity. Indexed on entityId and startTime. Also note the Contact model (for participant info), Task model (for action item creation), and User model (timezone, chronotype, preferences including focusHours and meetingFreedays).
2. **`src/shared/types/index.ts`** -- The `CalendarEvent`, `PrepPacket`, `User`, `UserPreferences`, `Contact`, `Task`, `TaskStatus`, `ApiResponse` types. Pay special attention to `PrepPacket` (attendeeProfiles, lastInteractions, openItems, agenda, talkingPoints, documents) and `UserPreferences` (focusHours, meetingFreedays, attentionBudget).
3. **`src/shared/utils/api-response.ts`** -- Use `success()`, `error()`, `paginated()` for all API responses.
4. **`src/lib/db/index.ts`** -- Import `prisma` from here for database operations.
5. **`package.json`** -- Available: `date-fns` (date/time operations -- USE THIS for all date math, formatting, timezone operations), `zod` (validation), `uuid` (ID generation).

### Dependencies on Other Workers

- **Auth (Worker 02)**: API routes need authenticated sessions. Create a local `getCurrentUserId()` stub. Accept userId as parameter in services.
- **Entities (Worker 03)**: Calendar events are scoped to entities. Accept entityId as parameter. Do not import from Worker 03.
- **Database (Worker 01)**: Use Prisma client directly. Implement any pagination helpers locally if needed.

## Requirements

### 1. Calendar Types (`src/modules/calendar/calendar.types.ts`)

```typescript
// src/modules/calendar/calendar.types.ts

import {
  CalendarEvent, PrepPacket, User, UserPreferences, Contact
} from '@/shared/types';

// --- Scheduling Types ---

export interface ScheduleRequest {
  title: string;
  entityId: string;
  participantIds?: string[];          // contact IDs
  duration: number;                    // minutes
  preferredTimeRanges?: TimeRange[];   // when the user prefers
  avoidTimeRanges?: TimeRange[];       // when NOT to schedule
  bufferBefore?: number;               // minutes
  bufferAfter?: number;                // minutes
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type: EventType;
  location?: string;
  notes?: string;
  recurrence?: string;                 // RRULE string
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
  score: number;                       // 0-100, higher is better
  reasoning: string[];                 // why this slot was chosen
  conflicts: ConflictInfo[];           // any soft conflicts
  buffers: {
    before: number;                    // actual buffer before (minutes)
    after: number;                     // actual buffer after (minutes)
  };
  energyLevel: EnergyLevel;           // predicted energy at this time
  contextSwitchCost: number;           // 0-10, how disruptive this slot is
}

export interface ConflictInfo {
  type: ConflictType;
  severity: 'SOFT' | 'HARD';          // SOFT = can be overridden, HARD = cannot
  existingEvent?: CalendarEvent;
  description: string;
  resolution?: string;
}

export type ConflictType =
  | 'TIME_OVERLAP'                     // direct time conflict
  | 'BUFFER_VIOLATION'                 // not enough buffer between events
  | 'FOCUS_BLOCK'                      // conflicts with protected focus time
  | 'MEETING_FREE_DAY'                // violates meeting-free day preference
  | 'TRAVEL_TIME'                      // insufficient travel time between locations
  | 'BACK_TO_BACK'                     // too many consecutive meetings
  | 'ENERGY_LOW'                       // scheduled during low energy period
  | 'ATTENTION_BUDGET'                 // exceeds daily interruption limit
  | 'CROSS_ENTITY'                     // conflicts with event in another entity
  | 'PARTICIPANT_UNAVAILABLE';         // a participant has a conflict

// --- Natural Language Scheduling ---

export interface NaturalLanguageScheduleInput {
  text: string;                        // e.g., "Set up a call with Dr. Martinez next week, prefer mornings"
  entityId: string;
  userId: string;
}

export interface ParsedScheduleIntent {
  title: string;
  participantNames: string[];          // extracted names
  timeHints: TimeHint[];               // parsed time references
  duration?: number;                   // inferred duration in minutes
  type: EventType;                     // inferred event type
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  location?: string;
  confidence: number;                  // 0-1
}

export interface TimeHint {
  type: 'RELATIVE' | 'ABSOLUTE' | 'PREFERENCE';
  value: string;                       // "next week", "Tuesday at 2pm", "prefer mornings"
  resolvedRange?: TimeRange;           // parsed into actual date range
}

// --- Buffer Intelligence ---

export interface BufferConfig {
  defaultBefore: number;               // minutes
  defaultAfter: number;                // minutes
  travelTimeRules: TravelTimeRule[];
  prepTimeRules: PrepTimeRule[];
  decompressionRules: DecompressionRule[];
}

export interface TravelTimeRule {
  fromLocationType: string;            // e.g., "office", "home", "client_site"
  toLocationType: string;
  estimatedMinutes: number;
}

export interface PrepTimeRule {
  eventType: EventType;
  participantCount: number;            // threshold
  prepMinutes: number;
}

export interface DecompressionRule {
  afterEventType: EventType;
  durationThreshold: number;           // event must be longer than this (minutes)
  decompressionMinutes: number;
}

// --- Energy Management ---

export type Chronotype = 'EARLY_BIRD' | 'NIGHT_OWL' | 'FLEXIBLE';
export type EnergyLevel = 'PEAK' | 'HIGH' | 'MODERATE' | 'LOW' | 'RECOVERY';

export interface EnergyProfile {
  chronotype: Chronotype;
  peakHours: TimeRange[];              // highest energy/focus periods
  highHours: TimeRange[];
  moderateHours: TimeRange[];
  lowHours: TimeRange[];
  recoveryHours: TimeRange[];          // post-lunch, end of day
}

export interface EnergyMapping {
  hour: number;                        // 0-23
  energyLevel: EnergyLevel;
  suitableFor: EventType[];            // what event types work at this energy level
}

export interface ContextSwitchScore {
  score: number;                       // 0-10 (0 = no cost, 10 = very disruptive)
  factors: string[];                   // what contributes to the cost
}

// --- Schedule Analytics ---

export interface ScheduleAnalytics {
  period: TimeRange;
  userId: string;
  entityId?: string;                   // null for cross-entity
  timeAllocation: {
    meetings: number;                  // hours
    focusBlocks: number;
    travel: number;
    breaks: number;
    prep: number;
    unscheduled: number;               // free time
  };
  meetingMetrics: {
    totalMeetings: number;
    avgDuration: number;               // minutes
    backToBackCount: number;
    meetingFreedays: number;           // days with zero meetings
    busiestDay: string;               // day of week
    avgMeetingsPerDay: number;
  };
  energyMetrics: {
    peakHoursUtilized: number;         // % of peak hours used for high-value work
    lowEnergyMeetings: number;         // meetings scheduled during low energy
    contextSwitches: number;           // total context switches
    avgContextSwitchCost: number;
  };
  suggestions: ScheduleOptimization[];
}

export interface ScheduleOptimization {
  type: 'MOVE_MEETING' | 'ADD_BUFFER' | 'PROTECT_FOCUS' | 'REDUCE_BACK_TO_BACK' | 'BATCH_SIMILAR' | 'FREE_UP_DAY';
  description: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  eventId?: string;                    // the event to move/change
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
  suggestions: string[];               // suggested talking points or questions
  riskFlags: string[];                  // potential issues to be aware of
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
  assigneeId?: string;                 // contact or user ID
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
  entityColor: string;                 // from brandKit.primaryColor
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
```

### 2. Scheduling Service (`src/modules/calendar/scheduling.service.ts`)

The core smart scheduling engine:

```typescript
// src/modules/calendar/scheduling.service.ts

export class SchedulingService {
  // Find optimal time slots for a new event
  async findAvailableSlots(
    request: ScheduleRequest,
    userId: string,
    lookAheadDays?: number              // default 14
  ): Promise<ScheduleSuggestion[]>;

  // Create an event with intelligent buffer insertion
  async createEvent(
    request: ScheduleRequest,
    selectedSlot: TimeRange,
    userId: string
  ): Promise<CalendarEvent>;

  // Update an event (with conflict re-check)
  async updateEvent(
    eventId: string,
    updates: Partial<ScheduleRequest>,
    userId: string
  ): Promise<CalendarEvent>;

  // Delete an event
  async deleteEvent(eventId: string, userId: string): Promise<void>;

  // Drag-and-drop reschedule
  async rescheduleEvent(update: DragDropUpdate, userId: string): Promise<{
    event: CalendarEvent;
    conflicts: ConflictInfo[];
  }>;

  // Detect all conflicts for an event
  async detectConflicts(
    entityId: string,
    timeRange: TimeRange,
    userId: string,
    excludeEventId?: string
  ): Promise<ConflictInfo[]>;

  // Resolve conflicts with priority-based suggestions
  async suggestConflictResolutions(
    conflicts: ConflictInfo[],
    userId: string
  ): Promise<{ conflict: ConflictInfo; resolution: string; alternativeSlots: TimeRange[] }[]>;

  // Get user's existing events for a date range
  async getEvents(
    userId: string,
    dateRange: TimeRange,
    entityId?: string
  ): Promise<CalendarEvent[]>;

  // Get calendar view data
  async getCalendarViewData(
    userId: string,
    viewMode: CalendarViewMode,
    date: Date,
    entityId?: string
  ): Promise<CalendarViewData>;
}
```

**Slot Scoring Algorithm:**

When finding available slots, score each candidate 0-100 based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| No conflicts | +30 | No overlapping events |
| Energy match | +20 | High energy for important meetings, low energy OK for routine |
| Buffer compliance | +15 | Adequate buffers before/after |
| Preferred time match | +15 | Falls within user's preferred time ranges |
| Low context-switch | +10 | Similar event types adjacent (batching) |
| Not back-to-back | +5 | At least one break in nearby events |
| Meeting-free day respect | +5 | Does not violate meeting-free day |

Deductions:
- Soft conflict: -20
- During focus block: -30
- Low energy time for important event: -15
- Back-to-back with 3+ existing meetings: -10
- Exceeds attention budget: -10

### 3. Natural Language Parser (`src/modules/calendar/nlp.service.ts`)

Parse natural language scheduling requests:

```typescript
// src/modules/calendar/nlp.service.ts

export class NLPSchedulingService {
  // Parse natural language into structured schedule intent
  async parseScheduleRequest(input: NaturalLanguageScheduleInput): Promise<ParsedScheduleIntent>;

  // Resolve participant names to contact IDs
  async resolveParticipants(
    names: string[],
    entityId: string
  ): Promise<{ name: string; contactId?: string; resolved: boolean }[]>;

  // Resolve time hints to actual date ranges
  resolveTimeHints(hints: TimeHint[], referenceDate: Date, timezone: string): TimeRange[];

  // Extract event type from text
  private inferEventType(text: string): EventType;

  // Extract duration from text
  private inferDuration(text: string, eventType: EventType): number;

  // Extract priority from text
  private inferPriority(text: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
```

**Natural Language Parsing Rules:**

Implement rule-based parsing (no LLM required) for these patterns:

**Time references:**
- "today" -> today's date
- "tomorrow" -> tomorrow's date
- "next week" -> Mon-Fri of next week
- "next Tuesday" -> the coming Tuesday
- "in 3 days" -> current date + 3
- "this afternoon" -> today 12:00-17:00
- "morning" / "prefer mornings" -> 08:00-12:00
- "afternoon" / "prefer afternoons" -> 12:00-17:00
- "evening" -> 17:00-20:00
- "end of week" -> Friday
- "end of month" -> last business day of current month
- Specific times: "at 2pm", "at 14:00", "2:30 PM"

**Duration inference:**
- "quick call" -> 15 minutes
- "call" -> 30 minutes
- "meeting" -> 60 minutes
- "lunch" -> 60 minutes
- "workshop" -> 120 minutes
- "30 min", "1 hour", "2 hours" -> explicit duration
- Default: 30 minutes

**Event type inference:**
- "call", "phone" -> CALL
- "meeting", "meet", "sync" -> MEETING
- "focus", "deep work", "heads down" -> FOCUS_BLOCK
- "travel", "drive", "commute" -> TRAVEL
- "lunch", "break", "walk" -> BREAK
- "prep", "prepare" -> PREP
- "deadline", "due" -> DEADLINE
- Default: MEETING

**Participant extraction:**
- Detect "with [Name]", "and [Name]" patterns
- Handle "Dr.", "Mr.", "Mrs.", "Ms." prefixes
- Match against existing contacts in the entity

### 4. Buffer Intelligence Service (`src/modules/calendar/buffer.service.ts`)

```typescript
// src/modules/calendar/buffer.service.ts

export class BufferService {
  // Calculate optimal buffers for an event
  calculateBuffers(
    event: ScheduleRequest,
    prevEvent?: CalendarEvent,
    nextEvent?: CalendarEvent,
    userPrefs?: UserPreferences
  ): { before: number; after: number };

  // Calculate travel time between events
  estimateTravelTime(
    fromLocation?: string,
    toLocation?: string
  ): number;

  // Calculate prep time based on event characteristics
  calculatePrepTime(
    eventType: EventType,
    participantCount: number,
    priority: string
  ): number;

  // Calculate decompression time after intense meetings
  calculateDecompressionTime(
    eventType: EventType,
    duration: number,
    participantCount: number
  ): number;

  // Get default buffer configuration
  getDefaultConfig(): BufferConfig;
}
```

**Buffer Rules:**
- Default buffer before: 5 minutes (meeting), 0 (call), 15 (client meeting)
- Default buffer after: 5 minutes (meeting), 0 (call), 10 (client meeting)
- Travel time: 15 min (same building), 30 min (same city), 60 min (different city)
- Prep time: 10 min (1-3 participants), 20 min (4-8 participants), 30 min (9+ participants)
- Decompression: 10 min after meetings >90 min, 15 min after workshops, 5 min after stressful calls
- Focus block: auto-add 5 min buffer on each side

### 5. Energy Service (`src/modules/calendar/energy.service.ts`)

```typescript
// src/modules/calendar/energy.service.ts

export class EnergyService {
  // Get energy profile for a user
  getEnergyProfile(chronotype: Chronotype): EnergyProfile;

  // Get energy level at a specific hour
  getEnergyLevel(chronotype: Chronotype, hour: number): EnergyLevel;

  // Get recommended event types for an energy level
  getRecommendedEventTypes(energyLevel: EnergyLevel): EventType[];

  // Calculate context-switch cost between two events
  calculateContextSwitchCost(
    prevEvent: CalendarEvent | null,
    nextEvent: CalendarEvent,
    gapMinutes: number
  ): ContextSwitchScore;

  // Get full energy mapping for a day
  getDailyEnergyMapping(chronotype: Chronotype): EnergyMapping[];
}
```

**Energy Profiles by Chronotype:**

EARLY_BIRD:
- PEAK: 6:00-10:00 (suited for: FOCUS_BLOCK, MEETING with high priority)
- HIGH: 10:00-12:00 (suited for: MEETING, CALL)
- MODERATE: 12:00-14:00 (suited for: CALL, BREAK, routine MEETING)
- LOW: 14:00-16:00 (suited for: BREAK, routine tasks, ADMIN)
- RECOVERY: 16:00-18:00 (suited for: PREP, light MEETING, DEBRIEF)

NIGHT_OWL:
- LOW: 6:00-9:00 (suited for: BREAK, light admin)
- RECOVERY: 9:00-11:00 (suited for: routine MEETING, CALL)
- MODERATE: 11:00-14:00 (suited for: MEETING, CALL)
- HIGH: 14:00-18:00 (suited for: MEETING, CALL, collaborative work)
- PEAK: 18:00-23:00 (suited for: FOCUS_BLOCK, deep work, important MEETING)

FLEXIBLE:
- MODERATE: 6:00-9:00
- HIGH: 9:00-12:00
- MODERATE: 12:00-14:00
- HIGH: 14:00-17:00
- MODERATE: 17:00-20:00
- LOW: 20:00-23:00

**Context-Switch Cost Factors:**
- Different entity: +3 (switching business contexts)
- Different event type: +2 (meeting to focus block is costly)
- Gap < 10 minutes: +2 (not enough transition time)
- Gap > 60 minutes: -1 (plenty of transition time)
- Same participants: -2 (continuity benefit)
- Sequential topic: -1 (related content reduces switching)

### 6. Prep Packet Service (`src/modules/calendar/prep.service.ts`)

```typescript
// src/modules/calendar/prep.service.ts

export class PrepPacketService {
  // Generate a prep packet for an upcoming event
  async generatePrepPacket(request: PrepPacketRequest): Promise<GeneratedPrepPacket>;

  // Get attendee profiles from contact records
  private async getAttendeeProfiles(participantIds: string[], entityId: string): Promise<string[]>;

  // Get last interactions with attendees
  private async getLastInteractions(participantIds: string[], entityId: string): Promise<string[]>;

  // Get open action items with attendees
  private async getOpenItems(participantIds: string[], entityId: string): Promise<string[]>;

  // Generate suggested agenda items
  private generateAgendaItems(
    event: CalendarEvent,
    openItems: string[],
    lastInteractions: string[]
  ): string[];

  // Generate talking points
  private generateTalkingPoints(
    event: CalendarEvent,
    attendeeProfiles: string[],
    openItems: string[]
  ): string[];
}
```

### 7. Post-Meeting Service (`src/modules/calendar/post-meeting.service.ts`)

```typescript
// src/modules/calendar/post-meeting.service.ts

export class PostMeetingService {
  // Capture post-meeting notes and action items
  async capturePostMeeting(capture: PostMeetingCapture): Promise<{
    event: CalendarEvent;
    tasksCreated: string[];           // task IDs
    followUpScheduled?: string;       // event ID
  }>;

  // Convert action items to tasks
  private async createTasksFromActionItems(
    actionItems: ActionItemFromMeeting[],
    entityId: string,
    eventId: string
  ): Promise<string[]>;

  // Schedule follow-up event if needed
  private async scheduleFollowUp(
    eventId: string,
    followUpDate: Date,
    entityId: string,
    participantIds: string[]
  ): Promise<string>;
}
```

### 8. Analytics Service (`src/modules/calendar/analytics.service.ts`)

```typescript
// src/modules/calendar/analytics.service.ts

export class CalendarAnalyticsService {
  // Get schedule analytics for a time period
  async getAnalytics(
    userId: string,
    period: TimeRange,
    entityId?: string
  ): Promise<ScheduleAnalytics>;

  // Calculate time allocation breakdown
  private calculateTimeAllocation(events: CalendarEvent[], period: TimeRange): ScheduleAnalytics['timeAllocation'];

  // Calculate meeting metrics
  private calculateMeetingMetrics(events: CalendarEvent[], period: TimeRange): ScheduleAnalytics['meetingMetrics'];

  // Calculate energy utilization metrics
  private calculateEnergyMetrics(
    events: CalendarEvent[],
    chronotype: Chronotype
  ): ScheduleAnalytics['energyMetrics'];

  // Generate optimization suggestions
  private generateSuggestions(
    events: CalendarEvent[],
    metrics: ScheduleAnalytics
  ): ScheduleOptimization[];
}
```

### 9. Validation Schemas (`src/modules/calendar/calendar.validation.ts`)

```typescript
// src/modules/calendar/calendar.validation.ts

export const scheduleRequestSchema = z.object({
  title: z.string().min(1).max(200),
  entityId: z.string().min(1),
  participantIds: z.array(z.string()).optional(),
  duration: z.number().int().positive().max(480),   // max 8 hours
  preferredTimeRanges: z.array(z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
    timezone: z.string().optional(),
  })).optional(),
  avoidTimeRanges: z.array(z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  })).optional(),
  bufferBefore: z.number().int().min(0).max(120).optional(),
  bufferAfter: z.number().int().min(0).max(120).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  type: z.enum(['MEETING', 'CALL', 'FOCUS_BLOCK', 'TRAVEL', 'BREAK', 'PREP', 'DEBRIEF', 'PERSONAL', 'DEADLINE', 'REMINDER']),
  location: z.string().optional(),
  notes: z.string().optional(),
  recurrence: z.string().optional(),
  requiresPrep: z.boolean().optional(),
  prepTimeMinutes: z.number().int().positive().optional(),
});

export const naturalLanguageSchema = z.object({
  text: z.string().min(3).max(500),
  entityId: z.string().min(1),
});

export const calendarViewSchema = z.object({
  viewMode: z.enum(['day', 'week', 'month']),
  date: z.coerce.date(),
  entityId: z.string().optional(),
});

export const dragDropSchema = z.object({
  eventId: z.string().min(1),
  newStartTime: z.coerce.date(),
  newEndTime: z.coerce.date(),
});

export const prepPacketSchema = z.object({
  eventId: z.string().min(1),
  entityId: z.string().min(1),
  depth: z.enum(['BRIEF', 'STANDARD', 'DETAILED']).optional().default('STANDARD'),
});

export const postMeetingSchema = z.object({
  eventId: z.string().min(1),
  entityId: z.string().min(1),
  notes: z.string().min(1),
  actionItems: z.array(z.object({
    title: z.string().min(1),
    assigneeId: z.string().optional(),
    dueDate: z.coerce.date().optional(),
    priority: z.enum(['P0', 'P1', 'P2']),
    description: z.string().optional(),
  })),
  decisions: z.array(z.string()).optional().default([]),
  followUpDate: z.coerce.date().optional(),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']),
  keyTakeaways: z.array(z.string()).optional().default([]),
});

export const analyticsSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  entityId: z.string().optional(),
});

export const conflictCheckSchema = z.object({
  entityId: z.string().min(1),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  excludeEventId: z.string().optional(),
});
```

### 10. API Routes (`src/app/api/calendar/`)

#### `src/app/api/calendar/route.ts`
```
GET  /api/calendar              -- Get calendar view data
                                   Query: viewMode, date, entityId
                                   Response: ApiResponse<CalendarViewData>
POST /api/calendar              -- Create event (structured input)
                                   Body: ScheduleRequest + selectedSlot
                                   Response: ApiResponse<CalendarEvent>
```

#### `src/app/api/calendar/[eventId]/route.ts`
```
GET    /api/calendar/:id        -- Get event details
PATCH  /api/calendar/:id        -- Update event
DELETE /api/calendar/:id        -- Delete event
```

#### `src/app/api/calendar/schedule/route.ts`
```
POST /api/calendar/schedule     -- Find available slots (returns suggestions)
                                   Body: ScheduleRequest
                                   Response: ApiResponse<ScheduleSuggestion[]>
```

#### `src/app/api/calendar/schedule/natural/route.ts`
```
POST /api/calendar/schedule/natural  -- Natural language scheduling
                                       Body: { text, entityId }
                                       Response: ApiResponse<{
                                         parsed: ParsedScheduleIntent,
                                         suggestions: ScheduleSuggestion[]
                                       }>
```

#### `src/app/api/calendar/[eventId]/reschedule/route.ts`
```
POST /api/calendar/:id/reschedule   -- Drag-and-drop reschedule
                                       Body: DragDropUpdate
                                       Response: ApiResponse<{ event, conflicts }>
```

#### `src/app/api/calendar/conflicts/route.ts`
```
POST /api/calendar/conflicts    -- Check for conflicts in a time range
                                   Body: { entityId, startTime, endTime, excludeEventId? }
                                   Response: ApiResponse<ConflictInfo[]>
```

#### `src/app/api/calendar/[eventId]/prep-packet/route.ts`
```
GET  /api/calendar/:id/prep-packet    -- Get or generate prep packet
POST /api/calendar/:id/prep-packet    -- Generate prep packet with depth option
                                         Body: PrepPacketRequest
                                         Response: ApiResponse<GeneratedPrepPacket>
```

#### `src/app/api/calendar/[eventId]/post-meeting/route.ts`
```
POST /api/calendar/:id/post-meeting   -- Capture post-meeting notes and actions
                                         Body: PostMeetingCapture
                                         Response: ApiResponse<{ event, tasksCreated, followUpScheduled? }>
```

#### `src/app/api/calendar/analytics/route.ts`
```
GET /api/calendar/analytics     -- Get schedule analytics
                                   Query: startDate, endDate, entityId?
                                   Response: ApiResponse<ScheduleAnalytics>
```

#### `src/app/api/calendar/optimize/route.ts`
```
POST /api/calendar/optimize     -- Get optimization suggestions for current schedule
                                   Body: { startDate, endDate, entityId? }
                                   Response: ApiResponse<ScheduleOptimization[]>
```

All routes must use api-response helpers and return proper HTTP status codes.

### 11. UI Components (`src/modules/calendar/components/`)

#### CalendarView (`src/modules/calendar/components/CalendarView.tsx`)
- Three view modes: Day, Week, Month (toggle buttons in header)
- Day view: hourly time slots (6am-11pm), events as colored blocks
- Week view: 7-column grid with hourly rows, events spanning their time range
- Month view: traditional month grid with event dots/summaries
- Color-coded by entity (from brandKit.primaryColor)
- Focus blocks shown with diagonal stripe pattern
- Buffer blocks shown with dotted border
- Conflict indicators (red border or warning icon)
- Energy level overlay option (color gradient background on time slots)
- Current time indicator (red line)
- Click empty slot to create new event
- Click event to view details
- Use `'use client'` directive

#### EventCard (`src/modules/calendar/components/EventCard.tsx`)
- Compact card for calendar grid display
- Title, time range, entity color accent
- Participant avatars (placeholder circles with initials)
- Event type icon
- Prep packet indicator (document icon if available)
- Conflict warning icon if conflicting
- Drag handle for drag-and-drop

#### EventDetailPanel (`src/modules/calendar/components/EventDetailPanel.tsx`)
- Slide-out panel showing full event details
- Title, date/time, duration
- Participants list with contact info
- Entity context (name, color)
- Buffers display (before/after with reasons)
- Prep packet section (generate button, or display if exists)
- Meeting notes section (editable after meeting)
- Action items section (post-meeting)
- Edit/Delete buttons
- Reschedule button with smart suggestions

#### ScheduleWizard (`src/modules/calendar/components/ScheduleWizard.tsx`)
- Multi-step scheduling flow:
  1. Natural language input OR structured form
  2. Review parsed intent (if NLP) / confirm details
  3. View suggested time slots (scored, with conflict info)
  4. Select slot and confirm
- Each suggestion shows: time, score bar, reasoning chips, energy indicator, conflict warnings
- "Schedule" button to confirm

#### ConflictResolver (`src/modules/calendar/components/ConflictResolver.tsx`)
- Modal/panel showing conflicts for a proposed event
- Each conflict: type icon, severity badge, description, existing event info
- Resolution suggestions with one-click apply
- Alternative time slot suggestions
- "Force Schedule" option for soft conflicts (with warning)

#### EnergyOverlay (`src/modules/calendar/components/EnergyOverlay.tsx`)
- Toggleable overlay on calendar view
- Color gradient showing energy levels through the day
- Legend: Peak (green), High (light green), Moderate (yellow), Low (orange), Recovery (light blue)
- Adapts to user's chronotype

#### PrepPacketView (`src/modules/calendar/components/PrepPacketView.tsx`)
- Display prep packet for an event
- Sections: Attendee Profiles, Last Interactions, Open Items, Agenda, Talking Points, Documents
- Collapsible sections
- "Regenerate" button
- Print/export option

#### PostMeetingForm (`src/modules/calendar/components/PostMeetingForm.tsx`)
- Form for capturing post-meeting data
- Rich text notes area
- Dynamic action items list (add/remove)
  - Each: title, assignee dropdown, due date picker, priority selector
- Decisions list
- Key takeaways list
- Sentiment selector (positive/neutral/negative with icons)
- Follow-up date picker
- "Save & Create Tasks" button

#### AnalyticsDashboard (`src/modules/calendar/components/AnalyticsDashboard.tsx`)
- Time allocation pie chart (use CSS or simple div-based visualization, no external chart library)
- Meeting metrics cards (total meetings, avg duration, back-to-back count)
- Energy utilization bar
- Busiest day of week indicator
- Optimization suggestions list with impact badges
- Date range selector

### 12. UI Pages (`src/app/(dashboard)/calendar/`)

#### Calendar Main Page (`src/app/(dashboard)/calendar/page.tsx`)
- CalendarView component (full width)
- Header with view mode toggle, date navigation (prev/next/today), entity filter
- "Schedule Event" button opening ScheduleWizard
- "Analytics" link
- Sidebar toggle for event details

#### Event Detail Page (`src/app/(dashboard)/calendar/[eventId]/page.tsx`)
- EventDetailPanel as full page (for direct linking)
- Back button to calendar
- Prep packet section
- Post-meeting section (visible after event end time)

#### Schedule Page (`src/app/(dashboard)/calendar/schedule/page.tsx`)
- ScheduleWizard as full page experience
- Natural language input prominently featured at top

#### Analytics Page (`src/app/(dashboard)/calendar/analytics/page.tsx`)
- AnalyticsDashboard component
- Date range selector
- Entity filter
- Full-width layout

### 13. Module Barrel Export (`src/modules/calendar/index.ts`)

```typescript
export { SchedulingService } from './scheduling.service';
export { NLPSchedulingService } from './nlp.service';
export { BufferService } from './buffer.service';
export { EnergyService } from './energy.service';
export { PrepPacketService } from './prep.service';
export { PostMeetingService } from './post-meeting.service';
export { CalendarAnalyticsService } from './analytics.service';
export * from './calendar.types';
export * from './calendar.validation';
```

## Acceptance Criteria

1. Smart scheduling finds available slots and scores them 0-100 based on the documented algorithm.
2. Natural language parser correctly handles at least 10 common scheduling phrases (test each pattern listed above).
3. Buffer intelligence calculates appropriate travel, prep, and decompression time.
4. Energy profiles are correctly mapped for all 3 chronotypes (EARLY_BIRD, NIGHT_OWL, FLEXIBLE).
5. Context-switch cost scoring considers entity changes, event type changes, and gap time.
6. Conflict detection identifies all 10 conflict types.
7. Prep packet generation pulls attendee info, last interactions, and open items from the database.
8. Post-meeting capture creates tasks and optionally schedules follow-up events.
9. Schedule analytics correctly calculates time allocation, meeting metrics, and energy metrics.
10. Calendar view renders day/week/month modes with entity color-coding.
11. All Zod validation schemas reject invalid input with descriptive errors.
12. All API routes return `ApiResponse<T>` format with proper status codes.
13. All TypeScript files compile without errors.
14. All unit tests pass.
15. No files created or modified outside owned paths.

## Implementation Steps

1. **Read context files**: Read `prisma/schema.prisma`, `src/shared/types/index.ts`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`, `package.json`.
2. **Create branch**: `git checkout -b ai-feature/w05-calendar`
3. **Create `src/modules/calendar/calendar.types.ts`**: All scheduling, buffer, energy, analytics types.
4. **Create `src/modules/calendar/calendar.validation.ts`**: Zod schemas.
5. **Create `src/modules/calendar/energy.service.ts`**: Chronotype profiles and context-switch scoring.
6. **Create `src/modules/calendar/buffer.service.ts`**: Buffer calculation rules.
7. **Create `src/modules/calendar/nlp.service.ts`**: Natural language parsing with rule-based approach.
8. **Create `src/modules/calendar/scheduling.service.ts`**: Core scheduling engine with slot scoring.
9. **Create `src/modules/calendar/prep.service.ts`**: Prep packet generation.
10. **Create `src/modules/calendar/post-meeting.service.ts`**: Post-meeting capture and task creation.
11. **Create `src/modules/calendar/analytics.service.ts`**: Schedule analytics and optimization.
12. **Create API routes**: All 10+ route files in `src/app/api/calendar/`.
13. **Create UI components**: CalendarView, EventCard, EventDetailPanel, ScheduleWizard, ConflictResolver, EnergyOverlay, PrepPacketView, PostMeetingForm, AnalyticsDashboard in `src/modules/calendar/components/`.
14. **Create UI pages**: Main calendar, event detail, schedule, analytics in `src/app/(dashboard)/calendar/`.
15. **Create `src/modules/calendar/index.ts`**: Barrel export.
16. **Create tests** in `tests/unit/calendar/`.
17. **Type-check**: `npx tsc --noEmit`.
18. **Run tests**: `npx jest tests/unit/calendar/`.
19. **Commit** with conventional commits.

## Tests

Create test files in `tests/unit/calendar/`:

### `tests/unit/calendar/scheduling.service.test.ts`
```typescript
describe('SchedulingService', () => {
  describe('findAvailableSlots', () => {
    it('should return slots sorted by score descending');
    it('should exclude times with hard conflicts');
    it('should include times with soft conflicts but lower score');
    it('should respect preferred time ranges');
    it('should respect avoid time ranges');
    it('should apply buffer requirements');
    it('should not suggest slots on meeting-free days');
    it('should consider energy levels in scoring');
    it('should limit results to lookAheadDays');
  });

  describe('detectConflicts', () => {
    it('should detect TIME_OVERLAP with existing events');
    it('should detect BUFFER_VIOLATION when events too close');
    it('should detect FOCUS_BLOCK conflict');
    it('should detect MEETING_FREE_DAY violation');
    it('should detect BACK_TO_BACK with 3+ consecutive meetings');
    it('should detect ATTENTION_BUDGET exceeded');
    it('should detect CROSS_ENTITY conflicts');
    it('should return empty for conflict-free slot');
  });

  describe('rescheduleEvent', () => {
    it('should update event times');
    it('should detect new conflicts at new time');
    it('should update buffers for new position');
  });

  describe('getCalendarViewData', () => {
    it('should return day view data');
    it('should return week view data');
    it('should return month view data');
    it('should include focus blocks');
    it('should include buffer blocks');
    it('should include conflicts');
  });
});
```

### `tests/unit/calendar/nlp.service.test.ts`
```typescript
describe('NLPSchedulingService', () => {
  describe('parseScheduleRequest', () => {
    it('should parse "Set up a call with Dr. Martinez next week, prefer mornings"');
    it('should parse "Schedule a 30-minute meeting with Bobby tomorrow at 2pm"');
    it('should parse "Block 2 hours for focus time on Friday morning"');
    it('should parse "Quick call with Jennifer this afternoon"');
    it('should parse "Workshop with the team next Wednesday, 2 hours"');
    it('should parse "Lunch meeting with Carlos on Thursday"');
    it('should parse "URGENT: meeting with legal team today"');
    it('should handle ambiguous input with lower confidence');
  });

  describe('resolveTimeHints', () => {
    it('should resolve "today" to current date');
    it('should resolve "tomorrow" to next day');
    it('should resolve "next week" to Mon-Fri of next week');
    it('should resolve "next Tuesday" to coming Tuesday');
    it('should resolve "in 3 days" to date + 3');
    it('should resolve "morning" to 08:00-12:00');
    it('should resolve "afternoon" to 12:00-17:00');
    it('should resolve "at 2pm" to specific time');
  });

  describe('inferEventType', () => {
    it('should infer CALL for "call" or "phone"');
    it('should infer MEETING for "meeting" or "sync"');
    it('should infer FOCUS_BLOCK for "focus time" or "deep work"');
    it('should infer BREAK for "lunch" or "walk"');
    it('should default to MEETING for ambiguous input');
  });

  describe('inferDuration', () => {
    it('should infer 15 min for "quick call"');
    it('should infer 30 min for "call"');
    it('should infer 60 min for "meeting"');
    it('should infer 120 min for "workshop"');
    it('should parse explicit "30 min" or "1 hour"');
  });
});
```

### `tests/unit/calendar/energy.service.test.ts`
```typescript
describe('EnergyService', () => {
  describe('getEnergyLevel', () => {
    it('should return PEAK at 8am for EARLY_BIRD');
    it('should return LOW at 8am for NIGHT_OWL');
    it('should return HIGH at 10am for FLEXIBLE');
    it('should return PEAK at 20:00 for NIGHT_OWL');
    it('should return LOW at 15:00 for EARLY_BIRD');
  });

  describe('getRecommendedEventTypes', () => {
    it('should recommend FOCUS_BLOCK for PEAK energy');
    it('should recommend MEETING for HIGH energy');
    it('should recommend BREAK for LOW energy');
  });

  describe('calculateContextSwitchCost', () => {
    it('should add +3 for different entity');
    it('should add +2 for different event type');
    it('should add +2 for gap < 10 minutes');
    it('should subtract -1 for gap > 60 minutes');
    it('should subtract -2 for same participants');
    it('should return 0 for no previous event');
    it('should cap at 0-10 range');
  });

  describe('getDailyEnergyMapping', () => {
    it('should return 24 entries for EARLY_BIRD');
    it('should map each hour to correct energy level');
    it('should include suitable event types for each level');
  });
});
```

### `tests/unit/calendar/buffer.service.test.ts`
```typescript
describe('BufferService', () => {
  describe('calculateBuffers', () => {
    it('should return default 5 min buffers for standard meeting');
    it('should add travel time when locations differ');
    it('should add prep time for large meetings');
    it('should add decompression after long meetings');
    it('should respect user preference overrides');
  });

  describe('estimateTravelTime', () => {
    it('should return 0 for no locations');
    it('should return 15 for same building');
    it('should return 30 for same city');
    it('should return 60 for different cities');
  });

  describe('calculatePrepTime', () => {
    it('should return 10 min for small meetings');
    it('should return 20 min for medium meetings');
    it('should return 30 min for large meetings');
    it('should increase for high-priority events');
  });
});
```

### `tests/unit/calendar/calendar.validation.test.ts`
```typescript
describe('scheduleRequestSchema', () => {
  it('should accept valid schedule request');
  it('should reject missing title');
  it('should reject duration > 480 minutes');
  it('should reject invalid priority');
  it('should reject invalid event type');
  it('should accept without optional fields');
});

describe('naturalLanguageSchema', () => {
  it('should accept valid text input');
  it('should reject text shorter than 3 chars');
  it('should reject text longer than 500 chars');
});

describe('postMeetingSchema', () => {
  it('should accept valid post-meeting capture');
  it('should reject missing notes');
  it('should reject invalid sentiment');
  it('should accept empty action items array');
  it('should validate action item priority values');
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(calendar): add calendar types, validation schemas, and energy service`
   - Files: `calendar.types.ts`, `calendar.validation.ts`, `energy.service.ts`
2. `feat(calendar): add buffer intelligence and natural language scheduling parser`
   - Files: `buffer.service.ts`, `nlp.service.ts`
3. `feat(calendar): add smart scheduling service with slot scoring and conflict detection`
   - Files: `scheduling.service.ts`
4. `feat(calendar): add prep packet generation and post-meeting capture services`
   - Files: `prep.service.ts`, `post-meeting.service.ts`
5. `feat(calendar): add schedule analytics service with optimization suggestions`
   - Files: `analytics.service.ts`, `index.ts`
6. `feat(calendar): add calendar API routes for scheduling, conflicts, prep, analytics`
   - Files: All files in `src/app/api/calendar/`
7. `feat(calendar): add calendar UI components (view, wizard, conflict resolver, analytics)`
   - Files: All files in `src/modules/calendar/components/`
8. `feat(calendar): add calendar UI pages (main view, event detail, schedule, analytics)`
   - Files: All files in `src/app/(dashboard)/calendar/`
9. `test(calendar): add unit tests for scheduling, NLP, energy, buffers, and validation`
   - Files: All files in `tests/unit/calendar/`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
