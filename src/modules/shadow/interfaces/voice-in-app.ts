// ============================================================================
// Shadow Voice Agent — In-App Voice Handler
// STT/TTS pipeline with failover chains:
//   STT: Whisper API -> Deepgram -> error fallback
//   TTS: ElevenLabs -> Google TTS -> text-only fallback
// ============================================================================

import type { ShadowResponse } from '../types';

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

export class VoiceInAppHandler {
  // -------------------------------------------------------------------------
  // processAudioInput — Full pipeline: STT -> process -> TTS
  // -------------------------------------------------------------------------

  async processAudioInput(params: AudioInputParams): Promise<AudioInputResult> {
    const { audioBuffer, sessionId, format = 'webm' } = params;

    // 1. Speech-to-text
    const sttResult = await this.speechToText({
      audio: audioBuffer,
      format,
      language: DEFAULT_LANGUAGE,
    });

    if (!sttResult.transcript || sttResult.transcript.trim().length === 0) {
      return {
        transcript: '',
        response: null,
      };
    }

    // 2. Build a minimal ShadowResponse from the transcript.
    //    In production, the agent pipeline would process this through
    //    intent classification + tool execution. Here we return a
    //    placeholder that the caller (API route) should replace with
    //    the real agent response.
    const response: ShadowResponse = {
      text: `Received: "${sttResult.transcript}"`,
      contentType: 'TEXT',
      sessionId,
    };

    // 3. Generate TTS for the response text
    let audioResponse: Buffer | undefined;
    try {
      const ttsResult = await this.textToSpeech({ text: response.text });
      audioResponse = ttsResult.audio;
    } catch {
      // TTS failed entirely — continue without audio
      audioResponse = undefined;
    }

    return {
      transcript: sttResult.transcript,
      response,
      audioResponse,
    };
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
