import { v4 as uuidv4 } from 'uuid';
import { connectionManager, type SSEMessage } from './sse';

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export type RealtimeEventType =
  // Task events
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'task.status_changed'
  | 'task.assigned'
  // Message events
  | 'message.received'
  | 'message.sent'
  | 'message.read'
  // Calendar events
  | 'calendar.reminder'
  | 'calendar.event_starting'
  | 'calendar.event_created'
  | 'calendar.event_updated'
  // Workflow events
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'workflow.step_completed'
  // Alert events
  | 'alert.triggered'
  | 'alert.resolved'
  // System events
  | 'system.notification'
  | 'system.maintenance';

// ---------------------------------------------------------------------------
// Event Payload Types
// ---------------------------------------------------------------------------

export interface RealtimeEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: RealtimeEventType;
  entityId: string;
  userId?: string;
  payload: TPayload;
  timestamp: Date;
  source: string;
}

export interface TaskEventPayload {
  taskId: string;
  title: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  previousStatus?: string;
}

export interface MessageEventPayload {
  messageId: string;
  threadId?: string;
  from: string;
  subject?: string;
  channel: string;
  triageScore?: number;
}

export interface CalendarEventPayload {
  eventId: string;
  title: string;
  startTime: string;
  endTime?: string;
  minutesUntil?: number;
  location?: string;
}

export interface WorkflowEventPayload {
  workflowId: string;
  workflowName: string;
  stepIndex?: number;
  stepName?: string;
  error?: string;
}

export interface AlertEventPayload {
  alertId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  actionUrl?: string;
}

// ---------------------------------------------------------------------------
// Event Creation
// ---------------------------------------------------------------------------

export function createEvent<TPayload>(params: {
  type: RealtimeEventType;
  entityId: string;
  userId?: string;
  payload: TPayload;
  source: string;
}): RealtimeEvent<TPayload> {
  return {
    id: uuidv4(),
    type: params.type,
    entityId: params.entityId,
    userId: params.userId,
    payload: params.payload,
    timestamp: new Date(),
    source: params.source,
  };
}

// ---------------------------------------------------------------------------
// Event History Buffer (circular, in-memory)
// ---------------------------------------------------------------------------

const MAX_HISTORY_PER_ENTITY = 100;
const eventHistory = new Map<string, RealtimeEvent[]>();

function storeEvent(event: RealtimeEvent): void {
  let buffer = eventHistory.get(event.entityId);
  if (!buffer) {
    buffer = [];
    eventHistory.set(event.entityId, buffer);
  }
  buffer.push(event);
  // Circular: drop oldest when exceeding max
  if (buffer.length > MAX_HISTORY_PER_ENTITY) {
    buffer.splice(0, buffer.length - MAX_HISTORY_PER_ENTITY);
  }
}

export function getRecentEvents(entityId: string, limit?: number): RealtimeEvent[] {
  const buffer = eventHistory.get(entityId) ?? [];
  if (limit && limit < buffer.length) {
    return buffer.slice(-limit);
  }
  return [...buffer];
}

// ---------------------------------------------------------------------------
// Pub/Sub Listeners
// ---------------------------------------------------------------------------

export type EventListener = (event: RealtimeEvent) => void | Promise<void>;

const listeners = new Map<string, Set<EventListener>>();

export function addEventListener(
  type: RealtimeEventType | '*',
  listener: EventListener,
): () => void {
  let set = listeners.get(type);
  if (!set) {
    set = new Set();
    listeners.set(type, set);
  }
  set.add(listener);

  // Return cleanup function
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(type);
  };
}

export function removeAllListeners(): void {
  listeners.clear();
}

async function notifyListeners(event: RealtimeEvent): Promise<void> {
  // Specific-type listeners
  const typeListeners = listeners.get(event.type);
  if (typeListeners) {
    for (const fn of typeListeners) {
      try {
        await fn(event);
      } catch {
        // Listener errors should not break emission
      }
    }
  }

  // Wildcard listeners
  const wildcardListeners = listeners.get('*');
  if (wildcardListeners) {
    for (const fn of wildcardListeners) {
      try {
        await fn(event);
      } catch {
        // Listener errors should not break emission
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Event Emission
// ---------------------------------------------------------------------------

function eventToSSEMessage(event: RealtimeEvent): SSEMessage {
  return {
    id: event.id,
    event: event.type,
    data: JSON.stringify({
      id: event.id,
      type: event.type,
      entityId: event.entityId,
      userId: event.userId,
      payload: event.payload,
      timestamp: event.timestamp.toISOString(),
      source: event.source,
    }),
  };
}

export async function emitEvent(event: RealtimeEvent): Promise<number> {
  // Store in history buffer
  storeEvent(event);

  // Notify server-side listeners
  await notifyListeners(event);

  const message = eventToSSEMessage(event);
  let sent = connectionManager.broadcastToEntity(event.entityId, message);

  // Also send to specific user if targeted
  if (event.userId) {
    sent += connectionManager.broadcastToUser(event.userId, message);
  }

  return sent;
}

export async function emitToUser(
  userId: string,
  event: RealtimeEvent,
): Promise<number> {
  storeEvent(event);
  await notifyListeners(event);

  const message = eventToSSEMessage(event);
  return connectionManager.broadcastToUser(userId, message);
}

export async function emitToEntity(
  entityId: string,
  event: RealtimeEvent,
): Promise<number> {
  storeEvent(event);
  await notifyListeners(event);

  const message = eventToSSEMessage(event);
  return connectionManager.broadcastToEntity(entityId, message);
}

// ---------------------------------------------------------------------------
// Testing Helpers
// ---------------------------------------------------------------------------

/** Clear event history — for testing only. */
export function clearEventHistory(): void {
  eventHistory.clear();
}
