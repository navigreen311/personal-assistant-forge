// Lightweight browser-native speech-to-text wrapper.
//
// Uses the Web Speech API (Chromium/Edge/Safari). Free, no backend key
// required. Accuracy is lower than cloud providers — for production
// quality, the existing server-side STT path via useVoiceSession →
// MediaRecorder → /api/shadow/voice is a better choice.
//
// This class is useful when the environment doesn't have a configured
// STT provider (no DEEPGRAM_API_KEY, etc.) and a best-effort mic
// experience is good enough.

export type TranscriptHandler = (text: string, isFinal: boolean) => void;

/**
 * Called when recognition fails, or when this fallback cannot run at all.
 *
 * T-022: before this existed, `onerror` wrote to console.error and returned.
 * The caller -- a UI with a live mic button -- was told nothing, so a denied
 * microphone permission, a network drop or an unsupported browser all looked
 * exactly like a user who had simply stopped talking. That is silent failure,
 * and it is the same shape as a TTS/STT provider chain that reports success
 * with an empty result. Nothing here reaches Deepgram; this class is the
 * key-less fallback the provider chain lands on.
 */
export type SttErrorHandler = (reason: string, detail: unknown) => void;

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function isBrowserSttSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

export class ShadowSTT {
  private recognition: SpeechRecognitionLike | null = null;
  private readonly onTranscript: TranscriptHandler;
  private readonly onError?: SttErrorHandler;

  constructor(onTranscript: TranscriptHandler, onError?: SttErrorHandler) {
    this.onTranscript = onTranscript;
    this.onError = onError;
  }

  start(lang: string = 'en-US'): void {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      // Report AND throw. A caller that registered a handler learns why the mic
      // is dead; one that did not still gets the exception rather than a button
      // that silently does nothing.
      const reason = 'Speech recognition not supported in this browser';
      this.onError?.(reason, undefined);
      throw new Error(reason);
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: unknown) => {
      const e = event as {
        resultIndex: number;
        results: Array<{
          isFinal: boolean;
          0: { transcript: string };
        }>;
      };
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (final) this.onTranscript(final, true);
      else if (interim) this.onTranscript(interim, false);
    };

    recognition.onerror = (event: unknown) => {
      const detail = event as { error?: unknown } | undefined;
      const reason =
        typeof detail?.error === 'string' ? detail.error : 'speech recognition error';
      console.error('[ShadowSTT] recognition error', event);
      this.onError?.(reason, event);
      // The engine has stopped; drop the handle so isListening() and a later
      // stop() do not claim a session that no longer exists.
      this.recognition = null;
    };

    recognition.start();
    this.recognition = recognition;
  }

  stop(): void {
    this.recognition?.stop();
    this.recognition = null;
  }

  /** Whether a recognition session is actually live right now. */
  isListening(): boolean {
    return this.recognition !== null;
  }
}
