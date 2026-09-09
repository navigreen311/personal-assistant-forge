import { z } from 'zod';

/**
 * Calendar request validation.
 *
 * ============================================================================
 * WHY `entityId` IS OPTIONAL EVERYWHERE BELOW
 * ============================================================================
 *
 * It used to be `z.string().min(1)` -- required -- which made the CLIENT name
 * its own tenant on every request. That habit is what produced the bug this
 * package closes: 149 routes read the tenant off the wire and trusted it.
 *
 * The field stays in the schemas because clients still send it and rejecting
 * it would break them, but it is no longer the source of truth. Every route
 * now runs inside `withEntityScope`, which resolves the entity (from the query
 * string, the body, or the session's active entity), PROVES the caller owns
 * it, and hands the handler a `VerifiedEntityId` that overwrites whatever the
 * body said. A caller that omits `entityId` gets its own active entity; a
 * caller that names someone else's gets a 403 before the handler runs.
 *
 * See docs/parallel-build/tenancy-pattern.md section 1.
 */

export const scheduleRequestSchema = z.object({
  title: z.string().min(1).max(200),
  entityId: z.string().min(1).optional(),
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
  entityId: z.string().min(1).optional(),
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
  entityId: z.string().min(1).optional(),
  depth: z.enum(['BRIEF', 'STANDARD', 'DETAILED']).optional().default('STANDARD'),
});

export const postMeetingSchema = z.object({
  eventId: z.string().min(1),
  entityId: z.string().min(1).optional(),
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
  entityId: z.string().min(1).optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  excludeEventId: z.string().optional(),
});

/**
 * The updatable fields of an existing event.
 *
 * `PATCH`/`PUT /api/calendar/[eventId]` previously handed the raw parsed body
 * straight to `updateEvent`, so the request shape was whatever the caller sent
 * and `tsc` had nothing to check. There is deliberately no `entityId` here:
 * an event cannot be moved between tenants by an update, and the scope for the
 * write comes from the row's own entity via the route's `withEventScope`.
 */
export const eventUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  participantIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
  recurrence: z.string().optional(),
  bufferBefore: z.number().int().min(0).max(120).optional(),
  bufferAfter: z.number().int().min(0).max(120).optional(),
});
