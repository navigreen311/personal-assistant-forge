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

  isUsingVAF(): boolean {
    return this.useVAF;
  }

  async transcribeAudio(audioBlob: Blob): Promise<TranscribeResult> {
    if (this.useVAF) {
      try {
        const buffer = Buffer.from(await audioBlob.arrayBuffer());
        const result: VAFTranscriptionResult = await this.stt.transcribe({
          audio: buffer,
          format: 'webm',
          sampleRate: 48000,
          language: 'en-US',
          model: 'accurate',
          vocabulary: this.entityVocabulary,
          streaming: false,
        });
        return {
          text: result.text,
          confidence: result.confidence,
          latencyMs: result.latencyMs,
          provider: 'vaf',
        };
      } catch {
        // Fall through to browser
      }
    }

    return this.transcribeWithBrowser();
  }

  async speak(text: string, options?: { emotion?: string }): Promise<SpeakResult> {
    const cleanText = text.replace(CARD_MARKER_RE, '').trim();
    if (!cleanText) return { duration: 0, latencyMs: 0, provider: this.useVAF ? 'vaf' : 'browser' };

    if (this.useVAF) {
      try {
        const result = await this.tts.synthesize({
          text: cleanText,
          voice: this.voicePersona,
          speed: this.speechSpeed,
          pitch: 0,
          emotion: options?.emotion ?? 'neutral',
          format: 'mp3',
          sampleRate: 24000,
          streaming: false,
        });
        return {
          audioBuffer: result.audio,
          duration: result.duration,
          latencyMs: result.latencyMs,
          provider: 'vaf',
        };
      } catch {
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
      } catch {
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
  async processUserAudio(audioBuffer: Buffer): Promise<ProcessUserAudioResult> {
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
    } catch {
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
      language: 'en-US',
      model: 'accurate',
      vocabulary: this.entityVocabulary,
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
