import { ShadowVoicePipeline } from '@/lib/shadow/voice/pipeline';
import { VAFSpeechToText } from '@/lib/vaf/stt-client';
import { VAFTextToSpeech } from '@/lib/vaf/tts-client';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  delete process.env.VAF_SERVICE_URL;
  delete process.env.VAF_API_KEY;
  delete (global as unknown as { window?: unknown }).window;
});

function mockHealthOk() {
  global.fetch = jest.fn(async (url) => {
    if (typeof url === 'string' && url.includes('/api/v1/health')) {
      return new Response('ok', { status: 200 });
    }
    return new Response('ok', { status: 200 });
  }) as unknown as typeof fetch;
}

function mockHealthDown() {
  global.fetch = jest.fn(async () => {
    throw new Error('econnrefused');
  }) as unknown as typeof fetch;
}

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

describe('ShadowVoicePipeline streaming methods', () => {
  describe('startStreamingTranscribe', () => {
    it('returns a handle when VAF is available', async () => {
      mockHealthOk();
      const stt = new VAFSpeechToText();
      jest.spyOn(stt, 'createStreamingSession').mockResolvedValue({
        sessionId: 'sess-stream',
        websocketUrl: 'ws://test/stt',
      });
      // Inject the fake WebSocket via global so openSttStream picks it up.
      (global as unknown as { WebSocket: typeof WebSocket }).WebSocket =
        FakeWebSocket as unknown as typeof WebSocket;

      const pipeline = new ShadowVoicePipeline({ stt });
      await pipeline.initialize({ voicePersona: 'shadow', speechSpeed: 1.0 });

      const handle = await pipeline.startStreamingTranscribe({
        onPartial: jest.fn(),
        onFinal: jest.fn(),
        onError: jest.fn(),
        onClose: jest.fn(),
      });
      expect(handle).not.toBeNull();
      expect(handle?.sessionId).toBe('sess-stream');

      delete (global as unknown as { WebSocket?: unknown }).WebSocket;
    });

    it('returns null when VAF is unavailable (no streaming fallback)', async () => {
      mockHealthDown();
      const pipeline = new ShadowVoicePipeline();
      await pipeline.initialize({ voicePersona: 'shadow', speechSpeed: 1.0 });

      const handle = await pipeline.startStreamingTranscribe({
        onPartial: jest.fn(),
        onFinal: jest.fn(),
        onError: jest.fn(),
        onClose: jest.fn(),
      });
      expect(handle).toBeNull();
    });

    it('returns null when the session creation throws', async () => {
      mockHealthOk();
      const stt = new VAFSpeechToText();
      jest
        .spyOn(stt, 'createStreamingSession')
        .mockRejectedValue(new Error('VAF stream session failed'));

      const pipeline = new ShadowVoicePipeline({ stt });
      await pipeline.initialize({ voicePersona: 'shadow', speechSpeed: 1.0 });

      const handle = await pipeline.startStreamingTranscribe({
        onPartial: jest.fn(),
        onFinal: jest.fn(),
        onError: jest.fn(),
        onClose: jest.fn(),
      });
      expect(handle).toBeNull();
    });
  });

  describe('startStreamingSpeak', () => {
    it('opens a streaming TTS session and immediately speaks the cleaned text', async () => {
      mockHealthOk();
      const tts = new VAFTextToSpeech();
      jest.spyOn(tts, 'createStreamingSession').mockResolvedValue({
        sessionId: 'sess-tts',
        websocketUrl: 'ws://test/tts',
      });
      (global as unknown as { WebSocket: typeof WebSocket }).WebSocket =
        FakeWebSocket as unknown as typeof WebSocket;

      const pipeline = new ShadowVoicePipeline({ tts });
      await pipeline.initialize({ voicePersona: 'shadow', speechSpeed: 1.0 });

      const { stream, player } = await pipeline.startStreamingSpeak(
        'Hello [ACTION_CARD]drop[/ACTION_CARD] world',
      );
      expect(stream.sessionId).toBe('sess-tts');

      // The first frame should be the speak() call with card markers stripped.
      const textFrame = lastSocket().sent.find(
        (s) => typeof s === 'string' && s.includes('"type":"text"'),
      );
      expect(textFrame).toBeDefined();
      const parsed = JSON.parse(textFrame as string);
      expect(parsed.text).not.toContain('[ACTION_CARD]');
      expect(parsed.text).toContain('Hello');
      expect(parsed.text).toContain('world');

      stream.close();
      await player.close();
      delete (global as unknown as { WebSocket?: unknown }).WebSocket;
    });

    it('falls back to batch speak() when VAF is unavailable', async () => {
      mockHealthDown();
      const tts = new VAFTextToSpeech();
      const synthesizeSpy = jest.spyOn(tts, 'synthesize');

      const pipeline = new ShadowVoicePipeline({ tts });
      await pipeline.initialize({ voicePersona: 'shadow', speechSpeed: 1.0 });

      const { stream } = await pipeline.startStreamingSpeak('hi there');
      // Returned stream is a no-op shim.
      expect(stream.sessionId).toBe('');
      // Batch synthesize was NOT called either — VAF is unavailable so
      // speak() takes the browser path which falls through to a noop in
      // the absence of `window.speechSynthesis`.
      expect(synthesizeSpy).not.toHaveBeenCalled();
    });

    it('falls back to batch speak() when streaming session creation throws', async () => {
      mockHealthOk();
      const tts = new VAFTextToSpeech();
      jest
        .spyOn(tts, 'createStreamingSession')
        .mockRejectedValue(new Error('VAF stream down'));
      const synthesizeSpy = jest.spyOn(tts, 'synthesize').mockResolvedValue({
        audio: new ArrayBuffer(0),
        duration: 0.5,
        latencyMs: 50,
      });

      const pipeline = new ShadowVoicePipeline({ tts });
      await pipeline.initialize({ voicePersona: 'shadow', speechSpeed: 1.0 });

      const { stream } = await pipeline.startStreamingSpeak('fall back please');
      expect(stream.sessionId).toBe('');
      expect(synthesizeSpy).toHaveBeenCalledTimes(1);
    });
  });
});
