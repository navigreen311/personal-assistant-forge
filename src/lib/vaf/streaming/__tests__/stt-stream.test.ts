import { openSttStream } from '../stt-stream';
import { VAFSpeechToText } from '../../stt-client';

// Minimal hand-rolled fake — we only exercise the surface stt-stream
// touches (addEventListener/removeEventListener, send, close, readyState).
// Each constructed instance is appended to FakeWebSocket.instances so
// tests can grab the live socket without needing to subclass-and-trap.
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  binaryType: 'arraybuffer' | 'blob' = 'blob';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sent: any[] = [];

  private listeners: Record<string, Array<(ev: unknown) => void>> = {};

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
    // Schedule "open" on next microtask so awaiters can attach first.
    queueMicrotask(() => this.dispatch('open', { type: 'open' }));
  }

  readonly OPEN = FakeWebSocket.OPEN;
  readonly CLOSED = FakeWebSocket.CLOSED;

  addEventListener(type: string, fn: (ev: unknown) => void) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener(type: string, fn: (ev: unknown) => void) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(data: any) {
    this.sent.push(data);
  }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch('close', { type: 'close' });
  }
  emitMessage(data: unknown) {
    this.dispatch('message', { data });
  }
  emitError(message = 'boom') {
    this.dispatch('error', { type: 'error', message });
  }
  private dispatch(type: string, ev: unknown) {
    (this.listeners[type] || []).forEach((fn) => fn(ev));
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
});

function lastSocket(): FakeWebSocket {
  const s = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (!s) throw new Error('No FakeWebSocket has been created');
  return s;
}

function makeStt(session = { sessionId: 'sess-stt', websocketUrl: 'ws://test/stream' }) {
  const stt = new VAFSpeechToText();
  jest.spyOn(stt, 'createStreamingSession').mockResolvedValue(session);
  return stt;
}

const WSCtor = FakeWebSocket as unknown as typeof WebSocket;

describe('openSttStream', () => {
  it('creates a session and resolves once the WebSocket opens', async () => {
    const stt = makeStt();
    const callbacks = {
      onPartial: jest.fn(),
      onFinal: jest.fn(),
      onError: jest.fn(),
      onClose: jest.fn(),
    };
    const handle = await openSttStream({}, callbacks, { stt, webSocketCtor: WSCtor });
    expect(handle.sessionId).toBe('sess-stt');
  });

  it('dispatches partial and final transcripts based on isFinal', async () => {
    const stt = makeStt();
    const callbacks = {
      onPartial: jest.fn(),
      onFinal: jest.fn(),
      onError: jest.fn(),
      onClose: jest.fn(),
    };
    await openSttStream({}, callbacks, { stt, webSocketCtor: WSCtor });

    const socket = lastSocket();
    socket.emitMessage(JSON.stringify({ text: 'hel', confidence: 0.4, isFinal: false }));
    socket.emitMessage(JSON.stringify({ text: 'hello', confidence: 0.9, isFinal: true }));

    expect(callbacks.onPartial).toHaveBeenCalledWith('hel', 0.4);
    expect(callbacks.onFinal).toHaveBeenCalledWith('hello', 0.9);
  });

  it('reports onError when message JSON is unparseable', async () => {
    const stt = makeStt();
    const callbacks = {
      onPartial: jest.fn(),
      onFinal: jest.fn(),
      onError: jest.fn(),
      onClose: jest.fn(),
    };
    await openSttStream({}, callbacks, { stt, webSocketCtor: WSCtor });

    lastSocket().emitMessage('not json');
    expect(callbacks.onError).toHaveBeenCalled();
  });

  it('send(Blob) converts to ArrayBuffer before sending', async () => {
    const stt = makeStt();
    const handle = await openSttStream(
      {},
      { onPartial: jest.fn(), onFinal: jest.fn(), onError: jest.fn(), onClose: jest.fn() },
      { stt, webSocketCtor: WSCtor },
    );

    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    handle.send(blob);
    // Blob.arrayBuffer is async; flush microtasks.
    await new Promise((r) => setImmediate(r));
    const socket = lastSocket();
    expect(socket.sent).toHaveLength(1);
    expect(socket.sent[0]).toBeInstanceOf(ArrayBuffer);
  });

  it('send(ArrayBuffer) passes through unchanged', async () => {
    const stt = makeStt();
    const handle = await openSttStream(
      {},
      { onPartial: jest.fn(), onFinal: jest.fn(), onError: jest.fn(), onClose: jest.fn() },
      { stt, webSocketCtor: WSCtor },
    );

    const buf = new Uint8Array([9, 8, 7]).buffer;
    handle.send(buf);
    expect(lastSocket().sent[0]).toBe(buf);
  });

  it('close() sends a close-frame and closes the socket', async () => {
    const stt = makeStt();
    const callbacks = {
      onPartial: jest.fn(),
      onFinal: jest.fn(),
      onError: jest.fn(),
      onClose: jest.fn(),
    };
    const handle = await openSttStream({}, callbacks, { stt, webSocketCtor: WSCtor });

    handle.close();
    const socket = lastSocket();
    const closeFrame = socket.sent.find(
      (s) => typeof s === 'string' && s.includes('"type":"close"'),
    );
    expect(closeFrame).toBeDefined();
    expect(callbacks.onClose).toHaveBeenCalled();
  });

  it('throws when WebSocket is unavailable', async () => {
    const stt = makeStt();

    // Temporarily clear the global WebSocket so the lazy fallback in
    // openSttStream finds nothing.
    const savedGlobal = (global as unknown as { WebSocket?: unknown }).WebSocket;
    delete (global as unknown as { WebSocket?: unknown }).WebSocket;
    // Patch the WebSocket reference inside the module's scope by also
    // wiping the binding the function captured at import. Easiest path
    // is to call with an explicit undefined deps and rely on `typeof
    // WebSocket !== 'undefined'` evaluating to false now.
    try {
      await expect(
        openSttStream(
          {},
          { onPartial: jest.fn(), onFinal: jest.fn(), onError: jest.fn(), onClose: jest.fn() },
          { stt },
        ),
      ).rejects.toThrow(/WebSocket is not available/);
    } finally {
      if (savedGlobal !== undefined) {
        (global as unknown as { WebSocket: unknown }).WebSocket = savedGlobal;
      }
    }
  });
});
