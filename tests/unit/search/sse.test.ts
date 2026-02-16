import {
  encodeSSEMessage,
  ConnectionManager,
  type SSEClient,
  type SSEMessage,
} from '@/lib/realtime/sse';

// ---------------------------------------------------------------------------
// encodeSSEMessage
// ---------------------------------------------------------------------------

describe('Server-Sent Events', () => {
  describe('encodeSSEMessage', () => {
    it('should encode message with all fields', () => {
      const encoded = encodeSSEMessage({
        id: 'evt-1',
        event: 'task.created',
        data: '{"hello":"world"}',
        retry: 3000,
      });

      expect(encoded).toContain('id: evt-1');
      expect(encoded).toContain('event: task.created');
      expect(encoded).toContain('data: {"hello":"world"}');
      expect(encoded).toContain('retry: 3000');
      expect(encoded.endsWith('\n\n')).toBe(true);
    });

    it('should encode message with data only', () => {
      const encoded = encodeSSEMessage({ data: 'simple' });

      expect(encoded).toBe('data: simple\n\n');
      expect(encoded).not.toContain('id:');
      expect(encoded).not.toContain('event:');
    });

    it('should handle multi-line data', () => {
      const encoded = encodeSSEMessage({
        data: 'line1\nline2\nline3',
      });

      expect(encoded).toContain('data: line1\n');
      expect(encoded).toContain('data: line2\n');
      expect(encoded).toContain('data: line3\n');
    });

    it('should include retry field when specified', () => {
      const encoded = encodeSSEMessage({ data: 'test', retry: 5000 });
      expect(encoded).toContain('retry: 5000');
    });

    it('should terminate with double newline', () => {
      const encoded = encodeSSEMessage({ data: 'test' });
      expect(encoded.endsWith('\n\n')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // ConnectionManager
  // ---------------------------------------------------------------------------

  describe('ConnectionManager', () => {
    let manager: ConnectionManager;

    beforeEach(() => {
      manager = new ConnectionManager();
    });

    afterEach(() => {
      manager.destroy();
    });

    function createMockClient(overrides: Partial<SSEClient> = {}): SSEClient {
      const enqueued: Uint8Array[] = [];
      return {
        id: overrides.id ?? 'client-1',
        userId: overrides.userId ?? 'user-1',
        entityId: overrides.entityId ?? 'entity-1',
        controller: {
          enqueue: jest.fn((chunk: Uint8Array) => enqueued.push(chunk)),
          close: jest.fn(),
          error: jest.fn(),
          desiredSize: 1,
        } as unknown as ReadableStreamDefaultController,
        connectedAt: new Date(),
        ...overrides,
      };
    }

    it('should add and track client connections', () => {
      const client = createMockClient();
      manager.addClient(client);

      expect(manager.getConnectionCount()).toBe(1);
      expect(manager.getEntityClients('entity-1')).toHaveLength(1);
    });

    it('should remove client on disconnect', () => {
      const client = createMockClient();
      manager.addClient(client);
      manager.removeClient('client-1');

      expect(manager.getConnectionCount()).toBe(0);
    });

    it('should broadcast to all entity clients', () => {
      const client1 = createMockClient({ id: 'c1', entityId: 'e1' });
      const client2 = createMockClient({ id: 'c2', entityId: 'e1' });
      const client3 = createMockClient({ id: 'c3', entityId: 'e2' });

      manager.addClient(client1);
      manager.addClient(client2);
      manager.addClient(client3);

      const message: SSEMessage = { data: '{"test":true}', event: 'test' };
      const sent = manager.broadcastToEntity('e1', message);

      expect(sent).toBe(2);
      expect(client1.controller.enqueue).toHaveBeenCalled();
      expect(client2.controller.enqueue).toHaveBeenCalled();
      expect(client3.controller.enqueue).not.toHaveBeenCalled();
    });

    it('should broadcast to specific user clients', () => {
      const client1 = createMockClient({ id: 'c1', userId: 'u1' });
      const client2 = createMockClient({ id: 'c2', userId: 'u2' });

      manager.addClient(client1);
      manager.addClient(client2);

      const message: SSEMessage = { data: '{"test":true}' };
      const sent = manager.broadcastToUser('u1', message);

      expect(sent).toBe(1);
      expect(client1.controller.enqueue).toHaveBeenCalled();
      expect(client2.controller.enqueue).not.toHaveBeenCalled();
    });

    it('should return correct connection count', () => {
      expect(manager.getConnectionCount()).toBe(0);

      manager.addClient(createMockClient({ id: 'c1' }));
      manager.addClient(createMockClient({ id: 'c2' }));
      expect(manager.getConnectionCount()).toBe(2);

      manager.removeClient('c1');
      expect(manager.getConnectionCount()).toBe(1);
    });

    it('should handle sending to closed controllers gracefully', () => {
      const client = createMockClient();
      (client.controller.enqueue as jest.Mock).mockImplementation(() => {
        throw new Error('Controller is closed');
      });

      manager.addClient(client);
      const result = manager.sendToClient('client-1', { data: 'test' });

      expect(result).toBe(false);
      // Client should be removed after failed send
      expect(manager.getConnectionCount()).toBe(0);
    });

    it('should clean up stale connections', () => {
      const goodClient = createMockClient({ id: 'good' });
      const staleClient = createMockClient({ id: 'stale' });

      // Simulate stale controller
      (staleClient.controller.enqueue as jest.Mock).mockImplementation(() => {
        throw new Error('Stream closed');
      });

      manager.addClient(goodClient);
      manager.addClient(staleClient);

      expect(manager.getConnectionCount()).toBe(2);
      manager.cleanup();
      expect(manager.getConnectionCount()).toBe(1);
    });

    it('should broadcast to all connected clients', () => {
      const c1 = createMockClient({ id: 'c1', entityId: 'e1' });
      const c2 = createMockClient({ id: 'c2', entityId: 'e2' });

      manager.addClient(c1);
      manager.addClient(c2);

      const sent = manager.broadcastToAll({ data: 'hello' });
      expect(sent).toBe(2);
    });

    it('should send heartbeat to all clients', () => {
      const c1 = createMockClient({ id: 'c1' });
      const c2 = createMockClient({ id: 'c2' });

      manager.addClient(c1);
      manager.addClient(c2);

      manager.sendHeartbeat();

      expect(c1.controller.enqueue).toHaveBeenCalled();
      expect(c2.controller.enqueue).toHaveBeenCalled();
    });
  });
});
