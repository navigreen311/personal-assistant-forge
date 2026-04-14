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

  constructor(onTranscript: TranscriptHandler) {
    this.onTranscript = onTranscript;
  }

  start(lang: string = 'en-US'): void {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      throw new Error('Speech recognition not supported in this browser');
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
      // eslint-disable-next-line no-console
      console.error('[ShadowSTT] recognition error', event);
    };

    recognition.start();
    this.recognition = recognition;
  }

  stop(): void {
    this.recognition?.stop();
    this.recognition = null;
  }
}
