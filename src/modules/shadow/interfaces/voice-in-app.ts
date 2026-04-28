// ============================================================================
// Shadow Voice Agent — In-App Voice Handler
// STT/TTS pipeline with failover chains:
//   STT: Whisper API -> Deepgram -> error fallback
//   TTS: ElevenLabs -> Google TTS -> text-only fallback
//
// VAF integration (WS07):
//   When the user's VafIntegrationConfig.sttProvider === 'vaf', STT and
//   audio-quality analysis are routed through ShadowVoicePipeline, which
//   gracefully falls back to the legacy chain if VAF is unavailable.
//   When .ttsProvider === 'vaf', TTS is also routed through the pipeline.
//   Per-message provider/quality telemetry is persisted on ShadowMessage.
// ============================================================================

import type { ShadowResponse } from '../types';
import { prisma } from '@/lib/db';
import { getVafConfig } from '@/lib/shadow/vaf-config';
import { ShadowVoicePipeline } from '@/lib/shadow/voice/pipeline';
import type { AudioQualityReport } from '@/lib/vaf/audio-quality-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioInputParams {
  audioBuffer: Buffer;
  sessionId: string;
  userId: string;
  format?: string;
}

export interface AudioInputResult {
  transcript: string;
  response: ShadowResponse | null;
  audioResponse?: Buffer;
  /**
   * Provider that handled STT for this turn. Mirrors the value persisted
   * onto ShadowMessage.stt_provider for the user-input row.
   */
  sttProvider?: 'vaf' | 'browser' | 'whisper' | 'deepgram' | 'none';
  /**
   * Provider that handled TTS for this turn. Mirrors the value persisted
   * onto ShadowMessage.tts_provider for the assistant-response row.
   */
  ttsProvider?: 'vaf' | 'browser' | 'elevenlabs' | 'google' | 'none';
  /**
   * VAF AudioQualityReport for the user-input audio, when available.
   * Persisted onto ShadowMessage.audio_quality (user-input row only).
   */
  audioQuality?: AudioQualityReport | null;
  /**
   * True when audio quality is too poor to transcribe reliably and the
   * client should switch to text input instead of sending the (empty)
   * transcript through the agent.
   */
  switchToText?: boolean;
  /**
   * Friendly user-facing message accompanying switchToText.
   */
  switchToTextMessage?: string;
}

export interface TTSParams {
  text: string;
  voicePersona?: string;
  speed?: number;
}

export interface TTSResult {
  audio: Buffer;
  format: string;
  durationMs: number;
}

export interface STTParams {
  audio: Buffer;
  format: string;
  language?: string;
}

export interface STTResult {
  transcript: string;
  confidence: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';
const DEEPGRAM_API_URL = 'https://api.deepgram.com/v1/listen';
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const GOOGLE_TTS_API_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // ElevenLabs "Rachel"
const DEFAULT_SPEED = 1.0;
const DEFAULT_LANGUAGE = 'en';
const API_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Execute a fetch with a timeout. Returns the Response or throws on timeout.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Estimate audio duration in milliseconds from a buffer using a rough
 * heuristic. For webm/opus at ~32kbps the formula is:
 *   durationMs ~ (bytes * 8) / 32 = bytes / 4
 * Falls back to 0 if empty.
 */
function estimateAudioDurationMs(buffer: Buffer, format: string): number {
  if (!buffer || buffer.length === 0) return 0;
  // webm/opus ~32kbps; mp3 ~128kbps; wav ~1411kbps
  const bitrateKbps: Record<string, number> = {
    webm: 32,
    opus: 32,
    mp3: 128,
    mpeg: 128,
    wav: 1411,
    ogg: 96,
  };
  const fmt = format.replace('audio/', '').toLowerCase();
  const kbps = bitrateKbps[fmt] ?? 64;
  return Math.round((buffer.length * 8) / kbps);
}

// ---------------------------------------------------------------------------
// VoiceInAppHandler
// ---------------------------------------------------------------------------

export interface VoiceInAppHandlerDeps {
  /**
   * Optional ShadowVoicePipeline injection. Used when the user's VAF
   * config selects 'vaf' as STT or TTS provider. If not supplied, a
   * default singleton is constructed lazily on first use. Tests inject
   * a stubbed pipeline directly.
   */
  pipeline?: ShadowVoicePipeline;
  /**
   * Optional override for VAF config lookup. Production uses the real
   * `getVafConfig`; tests pass a stub.
   */
  vafConfigLoader?: (userId: string) => Promise<{
    sttProvider: string;
    ttsProvider: string;
  }>;
}

const SWITCH_TO_TEXT_MESSAGE =
  "It's hard to hear you. Let me switch to text.";

export class VoiceInAppHandler {
  private readonly pipelineOverride?: ShadowVoicePipeline;
  private pipelineCached?: ShadowVoicePipeline;
  private pipelineInitialized = false;
  private readonly vafConfigLoader: (userId: string) => Promise<{
    sttProvider: string;
    ttsProvider: string;
  }>;

  constructor(deps?: VoiceInAppHandlerDeps) {
    this.pipelineOverride = deps?.pipeline;
    this.vafConfigLoader =
      deps?.vafConfigLoader ??
      (async (userId: string) => {
        const cfg = await getVafConfig(userId);
        return { sttProvider: cfg.sttProvider, ttsProvider: cfg.ttsProvider };
      });
  }

  /**
   * Lazily build (and initialize once) the ShadowVoicePipeline. Reused
   * across requests on the same handler instance. If initialization
   * throws (e.g., VAF probe fails), the pipeline still works in
   * fallback mode — `isUsingVAF()` will return false and the legacy
   * paths take over.
   */
  private async getPipeline(): Promise<ShadowVoicePipeline> {
    if (this.pipelineOverride) {
      // Test injection — assume caller pre-initialized.
      return this.pipelineOverride;
    }
    if (!this.pipelineCached) {
      this.pipelineCached = new ShadowVoicePipeline();
    }
    if (!this.pipelineInitialized) {
      try {
        await this.pipelineCached.initialize({
          voicePersona: 'default',
          speechSpeed: 1.0,
        });
      } catch {
        // Initialization is best-effort. Pipeline remains usable in
        // browser/fallback mode.
      }
      this.pipelineInitialized = true;
    }
    return this.pipelineCached;
  }

  // -------------------------------------------------------------------------
  // processAudioInput — Full pipeline: STT -> process -> TTS
  // -------------------------------------------------------------------------

  async processAudioInput(params: AudioInputParams): Promise<AudioInputResult> {
    const { audioBuffer, sessionId, userId, format = 'webm' } = params;

    // Resolve VAF config to choose providers. Falls back to legacy
    // behavior on any failure (non-breaking).
    let sttProviderPref = 'whisper';
    let ttsProviderPref = 'elevenlabs';
    try {
      const cfg = await this.vafConfigLoader(userId);
      sttProviderPref = cfg.sttProvider;
      ttsProviderPref = cfg.ttsProvider;
    } catch {
      // Treat as legacy.
    }

    // 1. Speech-to-text + audio quality
    let transcript = '';
    let sttProviderUsed: AudioInputResult['sttProvider'] = 'none';
    let audioQuality: AudioQualityReport | null = null;
    let switchToText = false;

    if (sttProviderPref === 'vaf') {
      const pipeline = await this.getPipeline();
      try {
        const vafResult = await pipeline.processUserAudio(audioBuffer);
        audioQuality = vafResult.report ?? null;
        if (vafResult.quality === 'poor') {
          // Persist provider/quality telemetry, then bail out without
          // running the agent.
          switchToText = true;
          sttProviderUsed = 'vaf';
          await this.persistUserMessage({
            sessionId,
            transcript: '',
            sttProvider: 'vaf',
            audioQuality,
          });
          return {
            transcript: '',
            response: null,
            sttProvider: 'vaf',
            audioQuality,
            switchToText,
            switchToTextMessage: SWITCH_TO_TEXT_MESSAGE,
          };
        }
        if (vafResult.provider === 'vaf' && vafResult.transcript) {
          transcript = vafResult.transcript;
          sttProviderUsed = 'vaf';
        }
      } catch {
        // Pipeline failure — fall through to legacy STT.
      }
    }

    if (!transcript) {
      // Legacy STT path (unchanged when sttProviderPref is not 'vaf',
      // OR a fallback when VAF couldn't transcribe).
      const sttResult = await this.speechToText({
        audio: audioBuffer,
        format,
        language: DEFAULT_LANGUAGE,
      });
      transcript = sttResult.transcript;
      // The legacy path tries Whisper first; we cannot perfectly know
      // which provider succeeded without surfacing it from
      // speechToText. Mark as 'whisper' if an OpenAI key is configured,
      // else 'deepgram', else 'none'.
      if (sttProviderUsed === 'none') {
        if (transcript) {
          sttProviderUsed = process.env.OPENAI_API_KEY
            ? 'whisper'
            : process.env.DEEPGRAM_API_KEY
              ? 'deepgram'
              : 'none';
        }
      }
    }

    if (!transcript || transcript.trim().length === 0) {
      await this.persistUserMessage({
        sessionId,
        transcript: '',
        sttProvider: sttProviderUsed,
        audioQuality,
      });
      return {
        transcript: '',
        response: null,
        sttProvider: sttProviderUsed,
        audioQuality,
        switchToText: false,
      };
    }

    // 2. Build a minimal ShadowResponse from the transcript.
    //    In production, the agent pipeline would process this through
    //    intent classification + tool execution. Here we return a
    //    placeholder that the caller (API route) should replace with
    //    the real agent response.
    const response: ShadowResponse = {
      text: `Received: "${transcript}"`,
      contentType: 'TEXT',
      sessionId,
    };

    // Persist the user-input message with provider + quality telemetry
    // BEFORE generating TTS so the user row exists even if TTS hangs.
    await this.persistUserMessage({
      sessionId,
      transcript,
      sttProvider: sttProviderUsed,
      audioQuality,
    });

    // 3. Generate TTS for the response text
    let audioResponse: Buffer | undefined;
    let ttsProviderUsed: AudioInputResult['ttsProvider'] = 'none';

    if (ttsProviderPref === 'vaf') {
      const pipeline = await this.getPipeline();
      try {
        const speakResult = await pipeline.speak(response.text);
        if (speakResult.audioBuffer && speakResult.audioBuffer.byteLength > 0) {
          audioResponse = Buffer.from(speakResult.audioBuffer);
          ttsProviderUsed = speakResult.provider;
        } else if (speakResult.provider === 'vaf') {
          // VAF returned no audio — treat as failure, fall through.
        } else {
          // Browser fallback returned nothing (server has no Web Speech).
        }
      } catch {
        // Fall through to legacy TTS.
      }
    }

    if (!audioResponse) {
      try {
        const ttsResult = await this.textToSpeech({ text: response.text });
        if (ttsResult.audio.length > 0) {
          audioResponse = ttsResult.audio;
          ttsProviderUsed = process.env.ELEVENLABS_API_KEY
            ? 'elevenlabs'
            : process.env.GOOGLE_TTS_API_KEY
              ? 'google'
              : 'none';
        }
      } catch {
        // TTS failed entirely — continue without audio
        audioResponse = undefined;
      }
    }

    // Persist the assistant-response message with TTS provider only
    // (audioQuality lives on the user-input row).
    await this.persistAssistantMessage({
      sessionId,
      text: response.text,
      ttsProvider: ttsProviderUsed,
    });

    return {
      transcript,
      response,
      audioResponse,
      sttProvider: sttProviderUsed,
      ttsProvider: ttsProviderUsed,
      audioQuality,
      switchToText: false,
    };
  }

  // -------------------------------------------------------------------------
  // Persistence helpers — write provider/quality telemetry onto
  // ShadowMessage rows. Best-effort: any DB error is swallowed to avoid
  // breaking the voice request path.
  // -------------------------------------------------------------------------

  private async persistUserMessage(args: {
    sessionId: string;
    transcript: string;
    sttProvider: AudioInputResult['sttProvider'];
    audioQuality: AudioQualityReport | null;
  }): Promise<void> {
    try {
      // Only persist if the session row actually exists. The voice
      // route creates client-side ad-hoc session ids like
      // `voice_<ts>` for unauthenticated/local dev paths; writing
      // those would violate the FK to ShadowVoiceSession.
      const session = await prisma.shadowVoiceSession.findUnique({
        where: { id: args.sessionId },
        select: { id: true, currentChannel: true },
      });
      if (!session) return;

      await prisma.shadowMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: args.transcript,
          contentType: 'TEXT',
          channel: session.currentChannel,
          sttProvider: args.sttProvider ?? null,
          // Cast: prisma's Json input type is fiddly across versions;
          // AudioQualityReport is a plain JSON-compatible object.
          audioQuality: (args.audioQuality ?? null) as unknown as never,
        },
      });
    } catch (err) {
      console.warn('[VoiceInApp] persistUserMessage failed:', err);
    }
  }

  private async persistAssistantMessage(args: {
    sessionId: string;
    text: string;
    ttsProvider: AudioInputResult['ttsProvider'];
  }): Promise<void> {
    try {
      const session = await prisma.shadowVoiceSession.findUnique({
        where: { id: args.sessionId },
        select: { id: true, currentChannel: true },
      });
      if (!session) return;

      await prisma.shadowMessage.create({
        data: {
          sessionId: session.id,
          role: 'assistant',
          content: args.text,
          contentType: 'TEXT',
          channel: session.currentChannel,
          ttsProvider: args.ttsProvider ?? null,
        },
      });
    } catch (err) {
      console.warn('[VoiceInApp] persistAssistantMessage failed:', err);
    }
  }

  // -------------------------------------------------------------------------
  // textToSpeech — ElevenLabs -> Google TTS -> text-only fallback
  // -------------------------------------------------------------------------

  async textToSpeech(params: TTSParams): Promise<TTSResult> {
    const { text, voicePersona, speed = DEFAULT_SPEED } = params;

    if (!text || text.trim().length === 0) {
      throw new Error('TTS: empty text provided');
    }

    // Attempt 1: ElevenLabs
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    if (elevenLabsKey) {
      try {
        const result = await this.elevenLabsTTS(text, voicePersona, speed, elevenLabsKey);
        return result;
      } catch (err) {
        console.warn('[VoiceInApp] ElevenLabs TTS failed, trying Google TTS:', err);
      }
    }

    // Attempt 2: Google Cloud TTS
    const googleKey = process.env.GOOGLE_TTS_API_KEY;
    if (googleKey) {
      try {
        const result = await this.googleTTS(text, speed, googleKey);
        return result;
      } catch (err) {
        console.warn('[VoiceInApp] Google TTS failed, returning text-only fallback:', err);
      }
    }

    // Fallback: Return an empty audio buffer (text-only mode)
    return {
      audio: Buffer.alloc(0),
      format: 'text/plain',
      durationMs: 0,
    };
  }

  // -------------------------------------------------------------------------
  // speechToText — Whisper API -> Deepgram -> error fallback
  // -------------------------------------------------------------------------

  async speechToText(params: STTParams): Promise<STTResult> {
    const { audio, format, language = DEFAULT_LANGUAGE } = params;
    const startMs = Date.now();

    if (!audio || audio.length === 0) {
      return { transcript: '', confidence: 0, durationMs: 0 };
    }

    // Attempt 1: OpenAI Whisper
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const result = await this.whisperSTT(audio, format, language, openaiKey);
        return { ...result, durationMs: Date.now() - startMs };
      } catch (err) {
        console.warn('[VoiceInApp] Whisper STT failed, trying Deepgram:', err);
      }
    }

    // Attempt 2: Deepgram
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (deepgramKey) {
      try {
        const result = await this.deepgramSTT(audio, format, language, deepgramKey);
        return { ...result, durationMs: Date.now() - startMs };
      } catch (err) {
        console.warn('[VoiceInApp] Deepgram STT failed:', err);
      }
    }

    // Fallback: Return error message as transcript
    return {
      transcript: '',
      confidence: 0,
      durationMs: Date.now() - startMs,
    };
  }

  // -------------------------------------------------------------------------
  // Private: ElevenLabs TTS
  // -------------------------------------------------------------------------

  private async elevenLabsTTS(
    text: string,
    voicePersona: string | undefined,
    speed: number,
    apiKey: string,
  ): Promise<TTSResult> {
    const voiceId = voicePersona ?? DEFAULT_VOICE_ID;
    const url = `${ELEVENLABS_API_URL}/${voiceId}`;

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          speed,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown');
      throw new Error(`ElevenLabs TTS HTTP ${response.status}: ${body}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audio = Buffer.from(arrayBuffer);

    return {
      audio,
      format: 'audio/mpeg',
      durationMs: estimateAudioDurationMs(audio, 'mp3'),
    };
  }

  // -------------------------------------------------------------------------
  // Private: Google Cloud TTS
  // -------------------------------------------------------------------------

  private async googleTTS(
    text: string,
    speed: number,
    apiKey: string,
  ): Promise<TTSResult> {
    const url = `${GOOGLE_TTS_API_URL}?key=${apiKey}`;

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: 'en-US',
          name: 'en-US-Neural2-F',
          ssmlGender: 'FEMALE',
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: speed,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown');
      throw new Error(`Google TTS HTTP ${response.status}: ${body}`);
    }

    const json = (await response.json()) as { audioContent: string };
    const audio = Buffer.from(json.audioContent, 'base64');

    return {
      audio,
      format: 'audio/mpeg',
      durationMs: estimateAudioDurationMs(audio, 'mp3'),
    };
  }

  // -------------------------------------------------------------------------
  // Private: OpenAI Whisper STT
  // -------------------------------------------------------------------------

  private async whisperSTT(
    audio: Buffer,
    format: string,
    language: string,
    apiKey: string,
  ): Promise<{ transcript: string; confidence: number }> {
    // Build multipart form data manually using Blob + FormData
    const ext = format.replace('audio/', '').split(';')[0] || 'webm';
    const mimeType = format.includes('/') ? format : `audio/${format}`;

    const formData = new FormData();
    const blob = new Blob([audio], { type: mimeType });
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('language', language);
    formData.append('response_format', 'verbose_json');

    const response = await fetchWithTimeout(WHISPER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown');
      throw new Error(`Whisper STT HTTP ${response.status}: ${body}`);
    }

    const json = (await response.json()) as {
      text: string;
      segments?: Array<{ avg_logprob?: number }>;
    };

    // Derive confidence from average log probability of segments
    let confidence = 0.85; // reasonable default
    if (json.segments && json.segments.length > 0) {
      const avgLogProb =
        json.segments.reduce((sum, s) => sum + (s.avg_logprob ?? -0.3), 0) /
        json.segments.length;
      // Convert log prob to 0-1 scale: exp(logprob) clamped
      confidence = Math.min(1, Math.max(0, Math.exp(avgLogProb)));
    }

    return {
      transcript: json.text?.trim() ?? '',
      confidence,
    };
  }

  // -------------------------------------------------------------------------
  // Private: Deepgram STT
  // -------------------------------------------------------------------------

  private async deepgramSTT(
    audio: Buffer,
    format: string,
    language: string,
    apiKey: string,
  ): Promise<{ transcript: string; confidence: number }> {
    const mimeType = format.includes('/') ? format : `audio/${format}`;
    const queryParams = new URLSearchParams({
      model: 'nova-2',
      language,
      smart_format: 'true',
      punctuate: 'true',
    });

    const url = `${DEEPGRAM_API_URL}?${queryParams.toString()}`;

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': mimeType,
      },
      body: audio,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown');
      throw new Error(`Deepgram STT HTTP ${response.status}: ${body}`);
    }

    const json = (await response.json()) as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string;
            confidence?: number;
          }>;
        }>;
      };
    };

    const alt = json.results?.channels?.[0]?.alternatives?.[0];

    return {
      transcript: alt?.transcript?.trim() ?? '',
      confidence: alt?.confidence ?? 0,
    };
  }
}
