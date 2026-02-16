import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// SSE Types
// ---------------------------------------------------------------------------

export interface SSEClient {
  id: string;
  userId: string;
  entityId: string;
  controller: ReadableStreamDefaultController;
  connectedAt: Date;
  lastEventId?: string;
}

export interface SSEMessage {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

// ---------------------------------------------------------------------------
// SSE Encoding
// ---------------------------------------------------------------------------

/**
 * Encode a message into spec-compliant SSE format.
 * Each field on its own line, multi-line data split with `data:` prefix,
 * terminated by `\n\n`.
 */
export function encodeSSEMessage(message: SSEMessage): string {
  const lines: string[] = [];

  if (message.id) {
    lines.push(`id: ${message.id}`);
  }
  if (message.event) {
    lines.push(`event: ${message.event}`);
  }
  if (message.retry !== undefined) {
    lines.push(`retry: ${message.retry}`);
  }

  // Multi-line data: each line gets its own `data:` prefix
  const dataLines = message.data.split('\n');
  for (const line of dataLines) {
    lines.push(`data: ${line}`);
  }

  return lines.join('\n') + '\n\n';
}

// ---------------------------------------------------------------------------
// Connection Manager (Singleton)
// ---------------------------------------------------------------------------

export class ConnectionManager {
  private clients = new Map<string, SSEClient>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startHeartbeat();
  }

  addClient(client: SSEClient): void {
    this.clients.set(client.id, client);
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  getEntityClients(entityId: string): SSEClient[] {
    const result: SSEClient[] = [];
    for (const client of this.clients.values()) {
      if (client.entityId === entityId) result.push(client);
    }
    return result;
  }

  getUserClients(userId: string): SSEClient[] {
    const result: SSEClient[] = [];
    for (const client of this.clients.values()) {
      if (client.userId === userId) result.push(client);
    }
    return result;
  }

  sendToClient(clientId: string, message: SSEMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    try {
      const encoded = encodeSSEMessage(message);
      client.controller.enqueue(new TextEncoder().encode(encoded));
      return true;
    } catch {
      // Controller likely closed — remove stale client
      this.removeClient(clientId);
      return false;
    }
  }

  broadcastToEntity(entityId: string, message: SSEMessage): number {
    let sent = 0;
    for (const client of this.getEntityClients(entityId)) {
      if (this.sendToClient(client.id, message)) sent++;
    }
    return sent;
  }

  broadcastToUser(userId: string, message: SSEMessage): number {
    let sent = 0;
    for (const client of this.getUserClients(userId)) {
      if (this.sendToClient(client.id, message)) sent++;
    }
    return sent;
  }

  broadcastToAll(message: SSEMessage): number {
    let sent = 0;
    for (const client of this.clients.values()) {
      if (this.sendToClient(client.id, message)) sent++;
    }
    return sent;
  }

  getConnectionCount(): number {
    return this.clients.size;
  }

  sendHeartbeat(): void {
    const encoder = new TextEncoder();
    const heartbeat = encoder.encode(': heartbeat\n\n');

    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.controller.enqueue(heartbeat);
      } catch {
        this.clients.delete(clientId);
      }
    }
  }

  cleanup(): void {
    for (const [clientId, client] of this.clients.entries()) {
      try {
        // Attempt a zero-byte enqueue to probe liveness
        client.controller.enqueue(new TextEncoder().encode(''));
      } catch {
        this.clients.delete(clientId);
      }
    }
  }

  /** Stop the heartbeat timer (for testing / shutdown). */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.clients.clear();
  }

  private startHeartbeat(): void {
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30_000);

    // Allow Node to exit even if interval is active
    if (this.heartbeatInterval) {
      const interval = this.heartbeatInterval as unknown as { unref?: () => void };
      if (typeof interval.unref === 'function') {
        interval.unref();
      }
    }
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager();

// ---------------------------------------------------------------------------
// Stream Creator
// ---------------------------------------------------------------------------

/**
 * Create a new SSE ReadableStream for a client connection.
 * Registers the client with the ConnectionManager and cleans up on cancel.
 */
export function createSSEStream(params: {
  userId: string;
  entityId: string;
  lastEventId?: string;
}): { stream: ReadableStream; clientId: string } {
  const clientId = uuidv4();

  const stream = new ReadableStream({
    start(controller) {
      const client: SSEClient = {
        id: clientId,
        userId: params.userId,
        entityId: params.entityId,
        controller,
        connectedAt: new Date(),
        lastEventId: params.lastEventId,
      };

      connectionManager.addClient(client);
    },
    cancel() {
      connectionManager.removeClient(clientId);
    },
  });

  return { stream, clientId };
}
