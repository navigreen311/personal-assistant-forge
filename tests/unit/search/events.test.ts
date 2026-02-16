import {
  createEvent,
  emitEvent,
  getRecentEvents,
  addEventListener,
  removeAllListeners,
  clearEventHistory,
  type RealtimeEvent,
  type RealtimeEventType,
} from '@/lib/realtime/events';
import { connectionManager } from '@/lib/realtime/sse';

// Mock the connection manager methods
jest.mock('@/lib/realtime/sse', () => {
  const actual = jest.requireActual('@/lib/realtime/sse');
  return {
    ...actual,
    connectionManager: {
      broadcastToEntity: jest.fn().mockReturnValue(0),
      broadcastToUser: jest.fn().mockReturnValue(0),
    },
  };
});

describe('Realtime Events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearEventHistory();
    removeAllListeners();
  });

  // ---------------------------------------------------------------------------
  // createEvent
  // ---------------------------------------------------------------------------

  describe('createEvent', () => {
    it('should create event with unique ID', () => {
      const event1 = createEvent({
        type: 'task.created',
        entityId: 'e1',
        payload: { taskId: 't1', title: 'Test' },
        source: 'test',
      });
      const event2 = createEvent({
        type: 'task.created',
        entityId: 'e1',
        payload: { taskId: 't2', title: 'Test 2' },
        source: 'test',
      });

      expect(event1.id).toBeTruthy();
      expect(event2.id).toBeTruthy();
      expect(event1.id).not.toBe(event2.id);
    });

    it('should include timestamp', () => {
      const before = new Date();
      const event = createEvent({
        type: 'task.updated',
        entityId: 'e1',
        payload: {},
        source: 'test',
      });
      const after = new Date();

      expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should include all provided fields', () => {
      const event = createEvent({
        type: 'message.received',
        entityId: 'entity-abc',
        userId: 'user-xyz',
        payload: { messageId: 'm1', from: 'sender', channel: 'EMAIL' },
        source: 'inbox',
      });

      expect(event.type).toBe('message.received');
      expect(event.entityId).toBe('entity-abc');
      expect(event.userId).toBe('user-xyz');
      expect(event.payload).toEqual({
        messageId: 'm1',
        from: 'sender',
        channel: 'EMAIL',
      });
      expect(event.source).toBe('inbox');
    });
  });

  // ---------------------------------------------------------------------------
  // emitEvent
  // ---------------------------------------------------------------------------

  describe('emitEvent', () => {
    it('should broadcast to entity clients', async () => {
      const event = createEvent({
        type: 'task.created',
        entityId: 'e1',
        payload: { taskId: 't1', title: 'New Task' },
        source: 'test',
      });

      await emitEvent(event);

      expect(connectionManager.broadcastToEntity).toHaveBeenCalledWith(
        'e1',
        expect.objectContaining({
          id: event.id,
          event: 'task.created',
        }),
      );
    });

    it('should also send to user if userId specified', async () => {
      const event = createEvent({
        type: 'task.assigned',
        entityId: 'e1',
        userId: 'u1',
        payload: { taskId: 't1', title: 'Assigned Task' },
        source: 'test',
      });

      await emitEvent(event);

      expect(connectionManager.broadcastToEntity).toHaveBeenCalled();
      expect(connectionManager.broadcastToUser).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ id: event.id }),
      );
    });

    it('should store event in history buffer', async () => {
      const event = createEvent({
        type: 'task.created',
        entityId: 'e1',
        payload: { taskId: 't1', title: 'Test' },
        source: 'test',
      });

      await emitEvent(event);

      const history = getRecentEvents('e1');
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(event.id);
    });
  });

  // ---------------------------------------------------------------------------
  // getRecentEvents
  // ---------------------------------------------------------------------------

  describe('getRecentEvents', () => {
    it('should return recent events for entity', async () => {
      const event1 = createEvent({
        type: 'task.created',
        entityId: 'e1',
        payload: {},
        source: 'test',
      });
      const event2 = createEvent({
        type: 'task.updated',
        entityId: 'e1',
        payload: {},
        source: 'test',
      });

      await emitEvent(event1);
      await emitEvent(event2);

      const events = getRecentEvents('e1');
      expect(events).toHaveLength(2);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await emitEvent(
          createEvent({
            type: 'task.created',
            entityId: 'e1',
            payload: {},
            source: 'test',
          }),
        );
      }

      const events = getRecentEvents('e1', 5);
      expect(events).toHaveLength(5);
    });

    it('should return events in chronological order', async () => {
      const event1 = createEvent({
        type: 'task.created',
        entityId: 'e1',
        payload: {},
        source: 'test',
      });
      const event2 = createEvent({
        type: 'task.updated',
        entityId: 'e1',
        payload: {},
        source: 'test',
      });

      await emitEvent(event1);
      await emitEvent(event2);

      const events = getRecentEvents('e1');
      expect(events[0].id).toBe(event1.id);
      expect(events[1].id).toBe(event2.id);
    });

    it('should return empty array for unknown entity', () => {
      const events = getRecentEvents('nonexistent');
      expect(events).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // addEventListener / removeAllListeners
  // ---------------------------------------------------------------------------

  describe('addEventListener / removeAllListeners', () => {
    it('should call listener when matching event is emitted', async () => {
      const listener = jest.fn();
      addEventListener('task.created', listener);

      const event = createEvent({
        type: 'task.created',
        entityId: 'e1',
        payload: { taskId: 't1', title: 'Test' },
        source: 'test',
      });

      await emitEvent(event);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'task.created' }),
      );
    });

    it('should not call listener for non-matching event types', async () => {
      const listener = jest.fn();
      addEventListener('task.created', listener);

      const event = createEvent({
        type: 'task.deleted',
        entityId: 'e1',
        payload: {},
        source: 'test',
      });

      await emitEvent(event);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should support wildcard listener', async () => {
      const listener = jest.fn();
      addEventListener('*', listener);

      await emitEvent(
        createEvent({
          type: 'task.created',
          entityId: 'e1',
          payload: {},
          source: 'test',
        }),
      );
      await emitEvent(
        createEvent({
          type: 'message.received',
          entityId: 'e1',
          payload: {},
          source: 'test',
        }),
      );

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('should unsubscribe when cleanup function is called', async () => {
      const listener = jest.fn();
      const unsubscribe = addEventListener('task.created', listener);

      await emitEvent(
        createEvent({
          type: 'task.created',
          entityId: 'e1',
          payload: {},
          source: 'test',
        }),
      );
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      await emitEvent(
        createEvent({
          type: 'task.created',
          entityId: 'e1',
          payload: {},
          source: 'test',
        }),
      );
      expect(listener).toHaveBeenCalledTimes(1); // not called again
    });

    it('should remove all listeners on removeAllListeners', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      addEventListener('task.created', listener1);
      addEventListener('*', listener2);

      removeAllListeners();

      await emitEvent(
        createEvent({
          type: 'task.created',
          entityId: 'e1',
          payload: {},
          source: 'test',
        }),
      );

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });
});
