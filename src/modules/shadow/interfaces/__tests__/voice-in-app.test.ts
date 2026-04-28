/**
 * Unit tests: VoiceInAppHandler — VAF wiring + telemetry persistence (WS07)
 *
 * Verifies:
 *   - When the user's VAF config selects sttProvider='vaf', STT routes
 *     through ShadowVoicePipeline.processUserAudio.
 *   - When sttProvider='browser' (or any non-'vaf' value), behavior is
 *     unchanged from the legacy STT chain. (Validated by asserting the
 *     pipeline is never invoked.)
 *   - Poor audio quality returns switchToText:true with no agent run.
 *   - audioQuality JSON is persisted onto the user-input ShadowMessage
 *     row but NOT onto the assistant-response row.
 */

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the SUT)
// ---------------------------------------------------------------------------

const mockShadowMessageCreate = jest.fn();
const mockShadowVoiceSessionFindUnique = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    shadowMessage: {
      create: (...args: unknown[]) => mockShadowMessageCreate(...args),
    },
    shadowVoiceSession: {
      findUnique: (...args: unknown[]) => mockShadowVoiceSessionFindUnique(...args),
    },
  },
}));

const mockGetVafConfig = jest.fn();
jest.mock('@/lib/shadow/vaf-config', () => ({
  getVafConfig: (userId: string) => mockGetVafConfig(userId),
}));

import {
  VoiceInAppHandler,
  type AudioInputParams,
} from '@/modules/shadow/interfaces/voice-in-app';
import { ShadowVoicePipeline } from '@/lib/shadow/voice/pipeline';
import type { AudioQualityReport } from '@/lib/vaf/audio-quality-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_ID = 'sess-1';
const USER_ID = 'user-abc';

const STORED_SESSION = { id: SESSION_ID, currentChannel: 'web' };

function makeAudioParams(overrides?: Partial<AudioInputParams>): AudioInputParams {
  return {
    audioBuffer: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]),
    sessionId: SESSION_ID,
    userId: USER_ID,
    format: 'webm',
    ...overrides,
  };
}

function makePipelineStub(): jest.Mocked<
  Pick<ShadowVoicePipeline, 'processUserAudio' | 'speak' | 'isUsingVAF'>
> {
  return {
    processUserAudio: jest.fn(),
    speak: jest.fn(),
    isUsingVAF: jest.fn().mockReturnValue(true),
  } as unknown as jest.Mocked<
    Pick<ShadowVoicePipeline, 'processUserAudio' | 'speak' | 'isUsingVAF'>
  >;
}

const GOOD_QUALITY_REPORT: AudioQualityReport = {
  noiseLevel: 0.1,
  echoDetected: false,
  clippingDetected: false,
  signalToNoise: 22,
  packetLoss: 0,
  bandwidth: 'wideband',
  recommendation: 'good',
};

const POOR_QUALITY_REPORT: AudioQualityReport = {
  noiseLevel: 0.9,
  echoDetected: true,
  clippingDetected: true,
  signalToNoise: 2,
  packetLoss: 0.3,
  bandwidth: 'narrowband',
  recommendation: 'switch_to_text',
};

beforeEach(() => {
  mockShadowMessageCreate.mockReset();
  mockShadowVoiceSessionFindUnique.mockReset();
  mockGetVafConfig.mockReset();

  // Default: session exists, message create succeeds.
  mockShadowVoiceSessionFindUnique.mockResolvedValue(STORED_SESSION);
  mockShadowMessageCreate.mockResolvedValue({ id: 'msg-1' });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VoiceInAppHandler — VAF path (sttProvider=vaf)', () => {
  it('routes STT through ShadowVoicePipeline.processUserAudio', async () => {
    mockGetVafConfig.mockResolvedValue({
      sttProvider: 'vaf',
      ttsProvider: 'vaf',
    });

    const pipeline = makePipelineStub();
    pipeline.processUserAudio.mockResolvedValue({
      transcript: 'hello shadow',
      quality: 'good',
      enhanced: false,
      provider: 'vaf',
      report: GOOD_QUALITY_REPORT,
    });
    pipeline.speak.mockResolvedValue({
      audioBuffer: new ArrayBuffer(64),
      duration: 1.2,
      latencyMs: 50,
      provider: 'vaf',
    });

    const handler = new VoiceInAppHandler({
      pipeline: pipeline as unknown as ShadowVoicePipeline,
    });
    const result = await handler.processAudioInput(makeAudioParams());

    expect(pipeline.processUserAudio).toHaveBeenCalledTimes(1);
    expect(pipeline.processUserAudio).toHaveBeenCalledWith(expect.any(Buffer));
    expect(pipeline.speak).toHaveBeenCalledTimes(1);
    expect(result.transcript).toBe('hello shadow');
    expect(result.sttProvider).toBe('vaf');
    expect(result.ttsProvider).toBe('vaf');
    expect(result.audioQuality).toEqual(GOOD_QUALITY_REPORT);
    expect(result.switchToText).toBe(false);
    expect(result.audioResponse).toBeInstanceOf(Buffer);
  });

  it('persists audioQuality JSON onto the user-input row only', async () => {
    mockGetVafConfig.mockResolvedValue({
      sttProvider: 'vaf',
      ttsProvider: 'vaf',
    });

    const pipeline = makePipelineStub();
    pipeline.processUserAudio.mockResolvedValue({
      transcript: 'hi',
      quality: 'good',
      enhanced: true,
      provider: 'vaf',
      report: GOOD_QUALITY_REPORT,
    });
    pipeline.speak.mockResolvedValue({
      audioBuffer: new ArrayBuffer(8),
      duration: 0.4,
      latencyMs: 10,
      provider: 'vaf',
    });

    const handler = new VoiceInAppHandler({
      pipeline: pipeline as unknown as ShadowVoicePipeline,
    });
    await handler.processAudioInput(makeAudioParams());

    expect(mockShadowMessageCreate).toHaveBeenCalledTimes(2);
    const userCall = mockShadowMessageCreate.mock.calls[0][0];
    const assistantCall = mockShadowMessageCreate.mock.calls[1][0];

    expect(userCall.data.role).toBe('user');
    expect(userCall.data.sttProvider).toBe('vaf');
    expect(userCall.data.audioQuality).toEqual(GOOD_QUALITY_REPORT);

    expect(assistantCall.data.role).toBe('assistant');
    expect(assistantCall.data.ttsProvider).toBe('vaf');
    // audioQuality is omitted on the assistant row — Prisma input only
    // includes the fields we explicitly set.
    expect(assistantCall.data.audioQuality).toBeUndefined();
  });
});

describe('VoiceInAppHandler — switch-to-text on poor quality', () => {
  it('returns switchToText:true and skips agent + TTS when quality === poor', async () => {
    mockGetVafConfig.mockResolvedValue({
      sttProvider: 'vaf',
      ttsProvider: 'vaf',
    });

    const pipeline = makePipelineStub();
    pipeline.processUserAudio.mockResolvedValue({
      transcript: '',
      quality: 'poor',
      enhanced: false,
      provider: 'vaf',
      report: POOR_QUALITY_REPORT,
    });

    const handler = new VoiceInAppHandler({
      pipeline: pipeline as unknown as ShadowVoicePipeline,
    });
    const result = await handler.processAudioInput(makeAudioParams());

    expect(result.switchToText).toBe(true);
    expect(result.switchToTextMessage).toMatch(/text/i);
    expect(result.transcript).toBe('');
    expect(result.response).toBeNull();
    expect(result.audioQuality).toEqual(POOR_QUALITY_REPORT);

    // Pipeline was used for STT; speak() must NOT have been called.
    expect(pipeline.speak).not.toHaveBeenCalled();

    // Only the user-input row is written (with poor-quality telemetry).
    expect(mockShadowMessageCreate).toHaveBeenCalledTimes(1);
    const userCall = mockShadowMessageCreate.mock.calls[0][0];
    expect(userCall.data.role).toBe('user');
    expect(userCall.data.sttProvider).toBe('vaf');
    expect(userCall.data.audioQuality).toEqual(POOR_QUALITY_REPORT);
  });
});

describe('VoiceInAppHandler — legacy path (sttProvider=browser)', () => {
  it('does not invoke ShadowVoicePipeline at all', async () => {
    mockGetVafConfig.mockResolvedValue({
      sttProvider: 'browser',
      ttsProvider: 'browser',
    });

    const pipeline = makePipelineStub();

    // Stub legacy STT/TTS at the network level. Both providers absent
    // so the handler falls through to the empty-transcript exit.
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEEPGRAM_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.GOOGLE_TTS_API_KEY;

    const handler = new VoiceInAppHandler({
      pipeline: pipeline as unknown as ShadowVoicePipeline,
    });
    const result = await handler.processAudioInput(makeAudioParams());

    // Critical: the pipeline was NEVER called.
    expect(pipeline.processUserAudio).not.toHaveBeenCalled();
    expect(pipeline.speak).not.toHaveBeenCalled();

    // Empty transcript path → no response, no switch-to-text flag.
    expect(result.transcript).toBe('');
    expect(result.response).toBeNull();
    expect(result.switchToText).toBe(false);
    expect(result.audioQuality).toBeNull();
  });

  it('still works (with legacy fallback) when getVafConfig throws', async () => {
    mockGetVafConfig.mockRejectedValue(new Error('db down'));

    const pipeline = makePipelineStub();

    delete process.env.OPENAI_API_KEY;
    delete process.env.DEEPGRAM_API_KEY;

    const handler = new VoiceInAppHandler({
      pipeline: pipeline as unknown as ShadowVoicePipeline,
    });
    const result = await handler.processAudioInput(makeAudioParams());

    expect(pipeline.processUserAudio).not.toHaveBeenCalled();
    expect(result.transcript).toBe('');
    expect(result.switchToText).toBe(false);
  });
});

describe('VoiceInAppHandler — ad-hoc session id (no DB row)', () => {
  it('does not throw when ShadowVoiceSession does not exist', async () => {
    mockGetVafConfig.mockResolvedValue({
      sttProvider: 'vaf',
      ttsProvider: 'browser',
    });
    mockShadowVoiceSessionFindUnique.mockResolvedValue(null);

    const pipeline = makePipelineStub();
    pipeline.processUserAudio.mockResolvedValue({
      transcript: 'hello',
      quality: 'good',
      enhanced: false,
      provider: 'vaf',
      report: GOOD_QUALITY_REPORT,
    });

    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.GOOGLE_TTS_API_KEY;

    const handler = new VoiceInAppHandler({
      pipeline: pipeline as unknown as ShadowVoicePipeline,
    });
    const result = await handler.processAudioInput(
      makeAudioParams({ sessionId: 'voice_1234567' }),
    );

    expect(result.transcript).toBe('hello');
    expect(mockShadowMessageCreate).not.toHaveBeenCalled();
  });
});
