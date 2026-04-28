import { ShadowVoicePipeline } from '@/lib/shadow/voice/pipeline';
import { VAFSpeechToText } from '../stt-client';
import { VAFTextToSpeech } from '../tts-client';
import { VAFAudioQuality } from '../audio-quality-client';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  delete process.env.VAF_SERVICE_URL;
  delete process.env.VAF_API_KEY;
  // Clean up any window mock we attach for browser-fallback paths
  delete (global as unknown as { window?: unknown }).window;
  delete (global as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
});

function mockHealthOk() {
  global.fetch = jest.fn(async (url) => {
    if (typeof url === 'string' && url.includes('/api/v1/health')) {
      return new Response('ok', { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

function mockHealthDown() {
  global.fetch = jest.fn(async () => {
    throw new Error('econnrefused');
  }) as unknown as typeof fetch;
}

describe('ShadowVoicePipeline', () => {
  describe('initialize', () => {
    it('marks VAF active when health endpoint returns ok', async () => {
      mockHealthOk();
      const pipeline = new ShadowVoicePipeline();
      await pipeline.initialize({ voicePersona: 'shadow-warm', speechSpeed: 1.0 });
      expect(pipeline.isUsingVAF()).toBe(true);
    });

    it('marks VAF inactive when health probe throws', async () => {
      mockHealthDown();
      const pipeline = new ShadowVoicePipeline();
      await pipeline.initialize({ voicePersona: 'default', speechSpeed: 1.0 });
      expect(pipeline.isUsingVAF()).toBe(false);
    });
  });

  describe('speak — card marker stripping', () => {
    it('removes [ACTION_CARD], [NAV_CARD], [DECISION_CARD], [CONFIRM_CARD] blocks before TTS', async () => {
      mockHealthOk();
      const tts = new VAFTextToSpeech();
      const synthesizeSpy = jest
        .spyOn(tts, 'synthesize')
        .mockResolvedValue({ audio: new ArrayBuffer(0), duration: 1, latencyMs: 50 });

      const pipeline = new ShadowVoicePipeline({ tts });
      await pipeline.initialize({ voicePersona: 'shadow', speechSpeed: 1.0 });

      const text =
        'Hello there. [ACTION_CARD]drop me[/ACTION_CARD] Goodbye. ' +
        '[NAV_CARD]nope[/NAV_CARD]Trail. ' +
        '[DECISION_CARD]x[/DECISION_CARD] [CONFIRM_CARD]y[/CONFIRM_CARD] Done.';
      await pipeline.speak(text);

      expect(synthesizeSpy).toHaveBeenCalledTimes(1);
      const arg = synthesizeSpy.mock.calls[0][0];
      expect(arg.text).not.toContain('[ACTION_CARD]');
      expect(arg.text).not.toContain('[NAV_CARD]');
      expect(arg.text).not.toContain('[DECISION_CARD]');
      expect(arg.text).not.toContain('[CONFIRM_CARD]');
      expect(arg.text).not.toContain('drop me');
      expect(arg.text).toContain('Hello there.');
      expect(arg.text).toContain('Done.');
    });

    it('returns empty result without calling TTS when text is only card markers', async () => {
      mockHealthOk();
      const tts = new VAFTextToSpeech();
      const synthesizeSpy = jest.spyOn(tts, 'synthesize');

      const pipeline = new ShadowVoicePipeline({ tts });
      await pipeline.initialize({ voicePersona: 'shadow', speechSpeed: 1.0 });

      const result = await pipeline.speak('[ACTION_CARD]only[/ACTION_CARD]');
      expect(result.duration).toBe(0);
      expect(synthesizeSpy).not.toHaveBeenCalled();
    });
  });

  describe('transcribeAudio', () => {
    it('uses VAF when available and returns provider=vaf', async () => {
      mockHealthOk();
      const stt = new VAFSpeechToText();
      jest.spyOn(stt, 'transcribe').mockResolvedValue({
        text: 'hello vaf',
        confidence: 0.9,
        isFinal: true,
        words: [],
        language: 'en-US',
        latencyMs: 200,
      });

      const pipeline = new ShadowVoicePipeline({ stt });
      await pipeline.initialize({ voicePersona: 'x', speechSpeed: 1.0 });

      const blob = new Blob([new Uint8Array([1, 2, 3])]);
      const result = await pipeline.transcribeAudio(blob);
      expect(result.text).toBe('hello vaf');
      expect(result.provider).toBe('vaf');
      expect(result.confidence).toBeCloseTo(0.9);
    });

    it('falls back to browser when VAF transcribe throws', async () => {
      mockHealthOk();
      const stt = new VAFSpeechToText();
      jest.spyOn(stt, 'transcribe').mockRejectedValue(new Error('VAF down'));

      // Stub browser SpeechRecognition by attaching `window.webkitSpeechRecognition`
      const fakeRecognition: {
        lang: string;
        onresult: ((event: unknown) => void) | null;
        onerror: ((event: unknown) => void) | null;
        start: () => void;
      } = {
        lang: 'en-US',
        onresult: null,
        onerror: null,
        start() {
          if (this.onresult) {
            this.onresult({
              results: [[{ transcript: 'browser fallback text', confidence: 0.7 }]],
            });
          }
        },
      };
      const Ctor = function () {
        return fakeRecognition;
      } as unknown as new () => typeof fakeRecognition;
      (global as unknown as { window: unknown }).window = { webkitSpeechRecognition: Ctor };

      const pipeline = new ShadowVoicePipeline({ stt });
      await pipeline.initialize({ voicePersona: 'x', speechSpeed: 1.0 });
      expect(pipeline.isUsingVAF()).toBe(true);

      const blob = new Blob([new Uint8Array([1, 2, 3])]);
      const result = await pipeline.transcribeAudio(blob);
      expect(result.provider).toBe('browser');
      expect(result.text).toBe('browser fallback text');
      expect(result.confidence).toBeCloseTo(0.7);
    });

    it('returns empty browser result when VAF is down and no browser API exists', async () => {
      mockHealthDown();
      const pipeline = new ShadowVoicePipeline();
      await pipeline.initialize({ voicePersona: 'x', speechSpeed: 1.0 });
      const blob = new Blob([new Uint8Array([1])]);
      const result = await pipeline.transcribeAudio(blob);
      expect(result.provider).toBe('browser');
      expect(result.text).toBe('');
    });
  });

  describe('processUserAudio', () => {
    it('returns transcript:"" + quality:"poor" when VAF recommends switch_to_text', async () => {
      mockHealthOk();
      const audioQuality = new VAFAudioQuality();
      jest.spyOn(audioQuality, 'analyze').mockResolvedValue({
        noiseLevel: 0.95,
        echoDetected: true,
        clippingDetected: true,
        signalToNoise: 2,
        packetLoss: 0.4,
        bandwidth: 'narrowband',
        recommendation: 'switch_to_text',
      });

      const stt = new VAFSpeechToText();
      const sttSpy = jest.spyOn(stt, 'transcribe');

      const pipeline = new ShadowVoicePipeline({ stt, audioQuality });
      await pipeline.initialize({ voicePersona: 'x', speechSpeed: 1.0 });

      const out = await pipeline.processUserAudio(Buffer.from('audio'));
      expect(out.transcript).toBe('');
      expect(out.quality).toBe('poor');
      expect(sttSpy).not.toHaveBeenCalled();
    });

    it('runs STT against enhanced audio when present', async () => {
      mockHealthOk();
      const enhanced = new Uint8Array([9, 9, 9]).buffer;
      const audioQuality = new VAFAudioQuality();
      jest.spyOn(audioQuality, 'analyze').mockResolvedValue({
        noiseLevel: 0.3,
        echoDetected: false,
        clippingDetected: false,
        signalToNoise: 22,
        packetLoss: 0,
        bandwidth: 'wideband',
        recommendation: 'good',
        enhancedAudio: enhanced,
      });

      const stt = new VAFSpeechToText();
      const sttSpy = jest.spyOn(stt, 'transcribe').mockResolvedValue({
        text: 'enhanced transcript',
        confidence: 0.95,
        isFinal: true,
        words: [],
        language: 'en-US',
        latencyMs: 120,
      });

      const pipeline = new ShadowVoicePipeline({ stt, audioQuality });
      await pipeline.initialize({ voicePersona: 'x', speechSpeed: 1.0 });

      const out = await pipeline.processUserAudio(Buffer.from('raw'));
      expect(out.transcript).toBe('enhanced transcript');
      expect(out.enhanced).toBe(true);
      expect(sttSpy).toHaveBeenCalledTimes(1);
      const arg = sttSpy.mock.calls[0][0];
      // STT must be called against the enhanced bytes (9,9,9), not the raw 'raw' bytes
      const passedAudio = arg.audio as Buffer;
      expect(Array.from(passedAudio)).toEqual([9, 9, 9]);
    });
  });
});
