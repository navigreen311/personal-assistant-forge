import { z } from 'zod';

export const scheduleRequestSchema = z.object({
  title: z.string().min(1).max(200),
  entityId: z.string().min(1),
  participantIds: z.array(z.string()).optional(),
  duration: z.number().int().positive().max(480),
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
