import { VAFTextToSpeech } from '../tts-client';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  delete process.env.VAF_SERVICE_URL;
  delete process.env.VAF_API_KEY;
});

function mockFetchOnce(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  global.fetch = jest.fn(handler as unknown as typeof fetch);
}

describe('VAFTextToSpeech', () => {
  describe('synthesize', () => {
    it('returns ArrayBuffer + parses X-Audio-Duration / X-Latency-Ms headers', async () => {
      process.env.VAF_SERVICE_URL = 'http://vaf.test';
      process.env.VAF_API_KEY = 'k';

      const audioBytes = new Uint8Array([1, 2, 3, 4, 5]);
      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      mockFetchOnce(async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return new Response(audioBytes, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'X-Audio-Duration': '3.25',
            'X-Latency-Ms': '180',
          },
        });
      });

      const tts = new VAFTextToSpeech();
      const result = await tts.synthesize({
        text: 'hi',
        voice: 'shadow-warm',
        speed: 1.0,
        pitch: 0,
        emotion: 'warm',
        format: 'mp3',
        sampleRate: 24000,
        streaming: false,
      });

      expect(capturedUrl).toBe('http://vaf.test/api/v1/tts/synthesize');
      expect(capturedInit?.method).toBe('POST');
      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer k');
      expect(headers['Content-Type']).toBe('application/json');
      const body = JSON.parse(capturedInit?.body as string);
      expect(body.text).toBe('hi');
      expect(body.voice).toBe('shadow-warm');
      expect(body.format).toBe('mp3');
      expect(result.audio.byteLength).toBe(5);
      expect(result.duration).toBeCloseTo(3.25);
      expect(result.latencyMs).toBe(180);
    });

    it('throws on non-ok response', async () => {
      mockFetchOnce(async () => new Response('boom', { status: 503 }));
      const tts = new VAFTextToSpeech();
      await expect(
        tts.synthesize({
          text: 'x',
          voice: 'v',
          speed: 1.0,
          pitch: 0,
          format: 'mp3',
          sampleRate: 24000,
          streaming: false,
        }),
      ).rejects.toThrow(/VAF TTS failed: 503/);
    });

    it('defaults missing duration/latency headers to zero', async () => {
      mockFetchOnce(async () => new Response(new Uint8Array([0]), { status: 200 }));
      const tts = new VAFTextToSpeech();
      const result = await tts.synthesize({
        text: 'x',
        voice: 'v',
        speed: 1.0,
        pitch: 0,
        format: 'mp3',
        sampleRate: 24000,
        streaming: false,
      });
      expect(result.duration).toBe(0);
      expect(result.latencyMs).toBe(0);
    });
  });

  describe('getVoices', () => {
    it('GETs /api/v1/tts/voices with auth header', async () => {
      process.env.VAF_API_KEY = 'k';
      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      mockFetchOnce(async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return new Response(
          JSON.stringify([
            {
              id: 'v1',
              name: 'Shadow Warm',
              gender: 'female',
              language: 'en-US',
              accent: 'us',
              style: 'warm',
              previewUrl: 'http://x/preview',
              isCloned: false,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const tts = new VAFTextToSpeech();
      const voices = await tts.getVoices();

      expect(capturedUrl).toContain('/api/v1/tts/voices');
      expect(capturedInit?.method).toBeUndefined();
      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer k');
      expect(voices).toHaveLength(1);
      expect(voices[0].id).toBe('v1');
    });
  });

  describe('createStreamingSession', () => {
    it('POSTs JSON to /api/v1/tts/stream/create and returns descriptor', async () => {
      process.env.VAF_SERVICE_URL = 'http://vaf.test';
      let capturedBody = '';
      let capturedUrl = '';

      mockFetchOnce(async (url, init) => {
        capturedUrl = url;
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({ sessionId: 'tts-1', websocketUrl: 'ws://vaf.test/tts/tts-1' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const tts = new VAFTextToSpeech();
      const session = await tts.createStreamingSession({ voice: 'shadow-warm' });

      expect(capturedUrl).toBe('http://vaf.test/api/v1/tts/stream/create');
      const body = JSON.parse(capturedBody);
      expect(body.voice).toBe('shadow-warm');
      expect(body.speed).toBe(1.0);
      expect(body.emotion).toBe('neutral');
      expect(body.format).toBe('pcm');
      expect(body.sampleRate).toBe(24000);
      expect(session.sessionId).toBe('tts-1');
    });
  });
});
