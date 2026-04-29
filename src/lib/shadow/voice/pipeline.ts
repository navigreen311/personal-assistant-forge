// Shadow voice pipeline. Prefers VAF for STT/TTS/audio-quality and
// falls back to the browser Web Speech API when VAF is unavailable.
// The browser-only modules in stt.ts / tts.ts remain in place and are
// wrapped here — this file does not import them, it duplicates the
// minimum required browser invocation so it can run on the same code
// path as the VAF clients.

import {
  VAFSpeechToText,
  type VAFTranscriptionResult,
} from '@/lib/vaf/stt-client';
import { VAFTextToSpeech } from '@/lib/vaf/tts-client';
import {
  VAFAudioQuality,
  type AudioQualityReport,
} from '@/lib/vaf/audio-quality-client';
import { isVAFAvailable } from '@/lib/vaf/health';
import { recordVafFallback, type VafFeature } from '@/lib/shadow/telemetry/vaf-fallback';
import {
  openSttStream,
  type SttStreamHandle,
  type SttStreamCallbacks,
} from '@/lib/vaf/streaming/stt-stream';
import {
  openTtsStream,
  type TtsStreamHandle,
  type TtsStreamCallbacks,
} from '@/lib/vaf/streaming/tts-stream';
import { StreamingPlayer } from '@/lib/vaf/streaming/audio-playback';

const CARD_MARKER_RE =
  /\[(?:ACTION_CARD|NAV_CARD|DECISION_CARD|CONFIRM_CARD)\][\s\S]*?\[\/(?:ACTION_CARD|NAV_CARD|DECISION_CARD|CONFIRM_CARD)\]/g;

export interface PipelineConfig {
  voicePersona: string;
  speechSpeed: number;
  entityVocabulary?: string[];
  entityCompliance?: string[];
}

export interface TranscribeResult {
  text: string;
  confidence: number;
  latencyMs: number;
  provider: 'vaf' | 'browser';
}

export interface SpeakResult {
  audioUrl?: string;
  audioBuffer?: ArrayBuffer;
  duration: number;
  latencyMs: number;
  provider: 'vaf' | 'browser';
}

export interface VoiceOption {
  id: string;
  name: string;
  previewUrl: string;
}

export interface ProcessUserAudioResult {
  transcript: string;
  quality: string;
  enhanced: boolean;
  provider: 'vaf' | 'browser' | 'none';
  report?: AudioQualityReport;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous?: boolean;
  interimResults?: boolean;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  start: () => void;
  stop?: () => void;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export class ShadowVoicePipeline {
  private useVAF = false;
  private voicePersona = 'default';
  private speechSpeed = 1.0;
  private entityVocabulary: string[] = [];
  private userId: string | null = null;
  private readonly stt: VAFSpeechToText;
  private readonly tts: VAFTextToSpeech;
  private readonly audioQuality: VAFAudioQuality;

  constructor(deps?: {
    stt?: VAFSpeechToText;
    tts?: VAFTextToSpeech;
    audioQuality?: VAFAudioQuality;
  }) {
    this.stt = deps?.stt ?? new VAFSpeechToText();
    this.tts = deps?.tts ?? new VAFTextToSpeech();
    this.audioQuality = deps?.audioQuality ?? new VAFAudioQuality();
  }

  async initialize(config: PipelineConfig): Promise<void> {
    this.voicePersona = config.voicePersona;
    this.speechSpeed = config.speechSpeed;
    this.entityVocabulary = config.entityVocabulary ?? [];
    this.useVAF = await isVAFAvailable();
  }

  /**
   * Set the active user id for fallback telemetry. Pipeline is a
   * per-process singleton (see VoiceInAppHandler), so userId is set
   * per-request rather than via initialize(). Pass null to clear.
   * Best-effort: when no userId is set, recordFallback no-ops.
   */
  setUserContext(userId: string | null): void {
    this.userId = userId;
  }

  // Best-effort telemetry. Skipped when no userId is set (legacy /
  // unauthenticated paths produce no telemetry rows).
  private async recordFallback(feature: VafFeature, reason: string): Promise<void> {
    if (!this.userId) return;
    try {
      await recordVafFallback({ userId: this.userId, feature, reason });
    } catch {
      // Telemetry must never break the call path.
    }
  }

  isUsingVAF(): boolean {
    return this.useVAF;
  }

  async transcribeAudio(
    audioBlob: Blob,
    options?: { entityCompliance?: string[]; language?: string }
  ): Promise<TranscribeResult> {
    if (this.useVAF) {
      try {
        const buffer = Buffer.from(await audioBlob.arrayBuffer());
        const result: VAFTranscriptionResult = await this.stt.transcribe({
          audio: buffer,
          format: 'webm',
          sampleRate: 48000,
          language: options?.language ?? 'en-US',
          model: 'accurate',
          vocabulary: this.entityVocabulary,
          complianceMode: options?.entityCompliance,
          streaming: false,
        });
        return {
          text: result.text,
          confidence: result.confidence,
          latencyMs: result.latencyMs,
          provider: 'vaf',
        };
      } catch (err) {
        void this.recordFallback('stt', (err as Error).message || 'vaf_stt_failed');
        // Fall through to browser
      }
    }

    return this.transcribeWithBrowser();
  }

  async speak(
    text: string,
    options?: { emotion?: string; sourceLanguage?: string }
  ): Promise<SpeakResult> {
    const cleanText = text.replace(CARD_MARKER_RE, '').trim();
    if (!cleanText) return { duration: 0, latencyMs: 0, provider: this.useVAF ? 'vaf' : 'browser' };

    if (this.useVAF) {
      try {
        // Build the synthesize request. When the caller passes a
        // `sourceLanguage` (e.g. translation flow replying in Spanish),
        // we attach it as an opaque `language` field. The mock VAF TTS
        // service accepts arbitrary JSON keys; the typed
        // VAFSpeechRequest interface intentionally omits it for now.
        const synthRequest = {
          text: cleanText,
          voice: this.voicePersona,
          speed: this.speechSpeed,
          pitch: 0,
          emotion: options?.emotion ?? 'neutral',
          format: 'mp3' as const,
          sampleRate: 24000,
          streaming: false,
          ...(options?.sourceLanguage
            ? { language: options.sourceLanguage }
            : {}),
        };
        const result = await this.tts.synthesize(synthRequest);
        return {
          audioBuffer: result.audio,
          duration: result.duration,
          latencyMs: result.latencyMs,
          provider: 'vaf',
        };
      } catch (err) {
        void this.recordFallback('tts', (err as Error).message || 'vaf_tts_failed');
        // Fall through to browser
      }
    }

    return this.speakWithBrowser(cleanText);
  }

  async getAvailableVoices(): Promise<VoiceOption[]> {
    if (this.useVAF) {
      try {
        const voices = await this.tts.getVoices();
        return voices.map((v) => ({ id: v.id, name: v.name, previewUrl: v.previewUrl }));
      } catch (err) {
        void this.recordFallback('tts', (err as Error).message || 'vaf_voices_failed');
        // Fall through
      }
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices().map((v) => ({
      id: v.name,
      name: v.name,
      previewUrl: '',
    }));
  }

  // Audio-quality + STT pipeline (Integration 4.2). Buffer-only — caller
  // is expected to be on a server / Node path where audio is already
  // captured. Returns {transcript:'', quality:'poor'} when VAF reports
  // the audio is unusable, signalling the UI to switch to text.
  //
  // Optional per-call options (additive — pre-WS18 callers pass nothing
  // and behaviour is unchanged):
  //   - entityCompliance: forwarded to the STT call as `complianceMode`
  //     so PHI-aware transcription engages for medical entities.
  //   - language: overrides the default 'en-US' STT language. Used by
  //     the translation flow when pre-translated text already exists.
  async processUserAudio(
    audioBuffer: Buffer,
    options?: { entityCompliance?: string[]; language?: string }
  ): Promise<ProcessUserAudioResult> {
    if (!this.useVAF) {
      return { transcript: '', quality: 'unavailable', enhanced: false, provider: 'none' };
    }

    let report: AudioQualityReport;
    try {
      report = await this.audioQuality.analyze(audioBuffer, {
        enhance: true,
        denoise: true,
        removeEcho: true,
      });
    } catch (err) {
      void this.recordFallback(
        'audio_quality',
        (err as Error).message || 'vaf_audio_quality_failed',
      );
      return { transcript: '', quality: 'unavailable', enhanced: false, provider: 'none' };
    }

    if (report.recommendation === 'switch_to_text') {
      return { transcript: '', quality: 'poor', enhanced: false, provider: 'vaf', report };
    }

    const audioForStt = report.enhancedAudio ? Buffer.from(report.enhancedAudio) : audioBuffer;

    const result = await this.stt.transcribe({
      audio: audioForStt,
      format: 'wav',
      sampleRate: 48000,
      language: options?.language ?? 'en-US',
      model: 'accurate',
      vocabulary: this.entityVocabulary,
      complianceMode: options?.entityCompliance,
      streaming: false,
    });

    return {
      transcript: result.text,
      quality: report.recommendation,
      enhanced: !!report.enhancedAudio,
      provider: 'vaf',
      report,
    };
  }

  /**
   * Open a streaming STT session. The caller is responsible for pushing
   * audio chunks into `handle.send()` (typically from a MediaRecorder
   * `dataavailable` event). Returns null when VAF is unavailable —
   * streaming has no batch fallback, the UI should fall back to the
   * non-streaming `transcribeAudio()` path.
   */
  async startStreamingTranscribe(
    callbacks: SttStreamCallbacks,
  ): Promise<SttStreamHandle | null> {
    if (!this.useVAF) return null;
    try {
      return await openSttStream(
        {
          language: 'en-US',
          vocabulary: this.entityVocabulary,
        },
        callbacks,
        { stt: this.stt },
      );
    } catch {
      return null;
    }
  }

  /**
   * Open a streaming TTS session, queue the supplied text for synthesis,
   * and return both the stream handle and a `StreamingPlayer` already
   * wired to enqueue inbound audio chunks. Caller is responsible for
   * calling `stream.close()` and `player.close()` when the response
   * finishes (typically on the `onComplete` callback they pass via
   * `extraCallbacks`, or after the next user turn begins).
   *
   * Falls back to a one-shot batch `speak()` if VAF is unavailable; in
   * that case the returned `stream`/`player` are no-op shims so the
   * caller doesn't have to branch on null.
   */
  async startStreamingSpeak(
    text: string,
    voice?: string,
    extraCallbacks?: Partial<TtsStreamCallbacks>,
  ): Promise<{ stream: TtsStreamHandle; player: StreamingPlayer }> {
    const cleanText = text.replace(CARD_MARKER_RE, '').trim();

    if (!this.useVAF) {
      // No streaming fallback exists — degrade to batch and return shims.
      await this.speak(cleanText);
      return { stream: noopTtsStream(), player: new StreamingPlayer() };
    }

    const player = new StreamingPlayer();
    const callbacks: TtsStreamCallbacks = {
      onAudioChunk: (chunk) => {
        player.enqueue(chunk);
        extraCallbacks?.onAudioChunk?.(chunk);
      },
      onComplete: () => {
        extraCallbacks?.onComplete?.();
      },
      onError: (err) => {
        extraCallbacks?.onError?.(err);
      },
    };

    try {
      const stream = await openTtsStream(
        {
          voice: voice ?? this.voicePersona,
          speed: this.speechSpeed,
        },
        callbacks,
        { tts: this.tts },
      );
      if (cleanText) stream.speak(cleanText);
      return { stream, player };
    } catch {
      await player.close();
      // Same degradation path as VAF-unavailable.
      await this.speak(cleanText);
      return { stream: noopTtsStream(), player: new StreamingPlayer() };
    }
  }

  private transcribeWithBrowser(): Promise<TranscribeResult> {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      return Promise.resolve({ text: '', confidence: 0, latencyMs: 0, provider: 'browser' });
    }

    return new Promise((resolve) => {
      const recognition = new Ctor();
      recognition.lang = 'en-US';
      recognition.onresult = (event: unknown) => {
        const e = event as { results: Array<{ 0: { transcript: string; confidence: number } }> };
        const first = e.results[0]?.[0];
        resolve({
          text: first?.transcript ?? '',
          confidence: first?.confidence ?? 0,
          latencyMs: 0,
          provider: 'browser',
        });
      };
      recognition.onerror = () => {
        resolve({ text: '', confidence: 0, latencyMs: 0, provider: 'browser' });
      };
      recognition.start();
    });
  }

  private speakWithBrowser(cleanText: string): Promise<SpeakResult> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return Promise.resolve({ duration: 0, latencyMs: 0, provider: 'browser' });
    }

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = this.speechSpeed;
      utterance.onend = () => resolve({ duration: 0, latencyMs: 0, provider: 'browser' });
      utterance.onerror = () => resolve({ duration: 0, latencyMs: 0, provider: 'browser' });
      window.speechSynthesis.speak(utterance);
    });
  }
}

function noopTtsStream(): TtsStreamHandle {
  return {
    sessionId: '',
    speak: () => {},
    close: () => {},
  };
}
