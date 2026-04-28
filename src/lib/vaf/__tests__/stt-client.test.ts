import { VAFSpeechToText } from '../stt-client';

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

describe('VAFSpeechToText', () => {
  describe('transcribe', () => {
    it('POSTs multipart form to /api/v1/stt/transcribe with auth header', async () => {
      process.env.VAF_SERVICE_URL = 'http://vaf.test';
      process.env.VAF_API_KEY = 'sekret';

      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      mockFetchOnce(async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return new Response(
          JSON.stringify({
            text: 'hello world',
            confidence: 0.93,
            isFinal: true,
            words: [],
            language: 'en-US',
            latencyMs: 240,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const stt = new VAFSpeechToText();
      const result = await stt.transcribe({
        audio: Buffer.from('audio-bytes'),
        format: 'webm',
        sampleRate: 48000,
        language: 'en-US',
        model: 'accurate',
        vocabulary: ['HCQC'],
        streaming: false,
      });

      expect(capturedUrl).toBe('http://vaf.test/api/v1/stt/transcribe');
      expect(capturedInit?.method).toBe('POST');
      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer sekret');
      expect(capturedInit?.body).toBeInstanceOf(FormData);
      const fd = capturedInit?.body as FormData;
      expect(fd.get('language')).toBe('en-US');
      expect(fd.get('model')).toBe('accurate');
      expect(fd.get('vocabulary')).toBe(JSON.stringify(['HCQC']));
      expect(result.text).toBe('hello world');
      expect(result.confidence).toBeCloseTo(0.93);
    });

    it('throws when transcribe response is not ok', async () => {
      mockFetchOnce(async () => new Response('boom', { status: 500 }));
      const stt = new VAFSpeechToText();
      await expect(
        stt.transcribe({
          audio: Buffer.from('x'),
          format: 'wav',
          sampleRate: 16000,
          language: 'en-US',
          model: 'fast',
          streaming: false,
        }),
      ).rejects.toThrow(/VAF transcription failed: 500/);
    });
  });

  describe('createStreamingSession', () => {
    it('POSTs JSON config and returns websocket descriptor', async () => {
      process.env.VAF_SERVICE_URL = 'http://vaf.test';
      process.env.VAF_API_KEY = 'k';

      let capturedBody = '';
      let capturedUrl = '';
      mockFetchOnce(async (url, init) => {
        capturedUrl = url;
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({ sessionId: 'sess-1', websocketUrl: 'ws://vaf.test/stream/sess-1' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const stt = new VAFSpeechToText();
      const session = await stt.createStreamingSession({
        language: 'en-US',
        model: 'realtime',
        speakerId: 'user-1',
        vocabulary: ['MedLink'],
        entityCompliance: ['HIPAA'],
      });

      expect(capturedUrl).toBe('http://vaf.test/api/v1/stt/stream/create');
      const body = JSON.parse(capturedBody);
      expect(body.language).toBe('en-US');
      expect(body.model).toBe('realtime');
      expect(body.enableSpeakerDiarization).toBe(true);
      expect(body.customVocabulary).toEqual(['MedLink']);
      expect(body.complianceMode).toEqual(['HIPAA']);
      expect(body.profanityFilter).toBe(false);
      expect(body.interimResults).toBe(true);
      expect(session.sessionId).toBe('sess-1');
      expect(session.websocketUrl).toBe('ws://vaf.test/stream/sess-1');
    });

    it('throws on non-200 response', async () => {
      mockFetchOnce(async () => new Response('nope', { status: 401 }));
      const stt = new VAFSpeechToText();
      await expect(stt.createStreamingSession({})).rejects.toThrow(/VAF STT session failed: 401/);
    });
  });
});
