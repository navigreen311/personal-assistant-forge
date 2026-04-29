import { openTtsStream } from '../tts-stream';
import { VAFTextToSpeech } from '../../tts-client';

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  binaryType: 'arraybuffer' | 'blob' = 'blob';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sent: any[] = [];

  private listeners: Record<string, Array<(ev: unknown) => void>> = {};

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
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

function makeTts(session = { sessionId: 'sess-tts', websocketUrl: 'ws://test/tts' }) {
  const tts = new VAFTextToSpeech();
  jest.spyOn(tts, 'createStreamingSession').mockResolvedValue(session);
  return tts;
}

const WSCtor = FakeWebSocket as unknown as typeof WebSocket;

describe('openTtsStream', () => {
  it('opens the WebSocket and returns the sessionId', async () => {
    const tts = makeTts();
    const handle = await openTtsStream(
      { voice: 'shadow' },
      { onAudioChunk: jest.fn(), onComplete: jest.fn(), onError: jest.fn() },
      { tts, webSocketCtor: WSCtor },
    );
    expect(handle.sessionId).toBe('sess-tts');
  });

  it('dispatches binary frames as ArrayBuffer to onAudioChunk', async () => {
    const tts = makeTts();
    const onAudioChunk = jest.fn();
    await openTtsStream(
      { voice: 'shadow' },
      { onAudioChunk, onComplete: jest.fn(), onError: jest.fn() },
      { tts, webSocketCtor: WSCtor },
    );

    const buf = new Uint8Array([1, 2, 3, 4]).buffer;
    lastSocket().emitMessage(buf);
    expect(onAudioChunk).toHaveBeenCalledTimes(1);
    expect(onAudioChunk.mock.calls[0][0]).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(onAudioChunk.mock.calls[0][0])).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('unwraps ArrayBufferView frames into the underlying ArrayBuffer', async () => {
    const tts = makeTts();
    const onAudioChunk = jest.fn();
    await openTtsStream(
      { voice: 'shadow' },
      { onAudioChunk, onComplete: jest.fn(), onError: jest.fn() },
      { tts, webSocketCtor: WSCtor },
    );

    const view = new Uint8Array([5, 6, 7]);
    lastSocket().emitMessage(view);
    expect(onAudioChunk).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(onAudioChunk.mock.calls[0][0])).toEqual(new Uint8Array([5, 6, 7]));
  });

  it('fires onComplete on a {type:"complete"} control frame', async () => {
    const tts = makeTts();
    const onComplete = jest.fn();
    await openTtsStream(
      { voice: 'shadow' },
      { onAudioChunk: jest.fn(), onComplete, onError: jest.fn() },
      { tts, webSocketCtor: WSCtor },
    );

    lastSocket().emitMessage(JSON.stringify({ type: 'complete' }));
    expect(onComplete).toHaveBeenCalled();
  });

  it('fires onError on a {type:"error"} control frame', async () => {
    const tts = makeTts();
    const onError = jest.fn();
    await openTtsStream(
      { voice: 'shadow' },
      { onAudioChunk: jest.fn(), onComplete: jest.fn(), onError },
      { tts, webSocketCtor: WSCtor },
    );

    lastSocket().emitMessage(JSON.stringify({ type: 'error', message: 'voice not found' }));
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toContain('voice not found');
  });

  it('speak() sends a {type:"text"} JSON frame', async () => {
    const tts = makeTts();
    const handle = await openTtsStream(
      { voice: 'shadow' },
      { onAudioChunk: jest.fn(), onComplete: jest.fn(), onError: jest.fn() },
      { tts, webSocketCtor: WSCtor },
    );

    handle.speak('hello world');
    const sent = lastSocket().sent[0];
    expect(typeof sent).toBe('string');
    expect(JSON.parse(sent)).toEqual({ type: 'text', text: 'hello world' });
  });

  it('close() sends a {type:"close"} frame and closes the socket', async () => {
    const tts = makeTts();
    const handle = await openTtsStream(
      { voice: 'shadow' },
      { onAudioChunk: jest.fn(), onComplete: jest.fn(), onError: jest.fn() },
      { tts, webSocketCtor: WSCtor },
    );

    handle.close();
    const closeFrame = lastSocket().sent.find(
      (s) => typeof s === 'string' && s.includes('"type":"close"'),
    );
    expect(closeFrame).toBeDefined();
    expect(lastSocket().readyState).toBe(FakeWebSocket.CLOSED);
  });
});
