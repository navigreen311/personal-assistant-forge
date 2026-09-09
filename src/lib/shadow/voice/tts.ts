// Lightweight browser-native text-to-speech wrapper.
//
// Uses the Web Speech API's SpeechSynthesis. Works offline in most
// browsers. Voices are platform-dependent. For production-grade voice
// output, use ElevenLabs / Google / etc. via the server-side voice
// pipeline.
//
// Supports barge-in via `stop()` — call it as soon as the user starts
// speaking to cancel the current utterance.

const CARD_MARKER_RE =
  /\[(?:ACTION_CARD|NAV_CARD|DECISION_CARD|CONFIRM_CARD)\][\s\S]*?\[\/(?:ACTION_CARD|NAV_CARD|DECISION_CARD|CONFIRM_CARD)\]/g;

export interface ShadowTTSCallbacks {
  onStart: () => void;
  onEnd: () => void;
  /**
   * Called when the utterance fails, or when there is no speech synthesis to
   * speak it with.
   *
   * T-022: `utterance.onerror` used to call `onEnd()` -- the same callback as a
   * successful utterance -- so a caller could not tell "finished speaking" from
   * "never spoke". `onEnd` is still called after this, so existing callers keep
   * their cleanup; this only adds the distinction they had no way to make.
   */
  onError?: (reason: string, detail: unknown) => void;
}

export interface ShadowTTSSpeakOptions {
  rate?: number;
  voice?: string;
  lang?: string;
}

export function isBrowserTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export class ShadowTTS {
  private utterance: SpeechSynthesisUtterance | null = null;
  private speaking = false;
  private readonly onStart: () => void;
  private readonly onEnd: () => void;
  private readonly onError?: (reason: string, detail: unknown) => void;

  constructor({ onStart, onEnd, onError }: ShadowTTSCallbacks) {
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.onError = onError;
  }

  speak(text: string, options: ShadowTTSSpeakOptions = {}): void {
    // Stop anything in flight first.
    this.stop();

    const cleanText = text.replace(CARD_MARKER_RE, '').trim();
    if (!cleanText) return;

    if (!isBrowserTtsSupported()) {
      // Previously this threw a ReferenceError deep inside speak(), or -- worse,
      // server-side -- was never reached and the caller assumed it had spoken.
      this.onError?.('speech synthesis unavailable in this environment', undefined);
      this.onEnd();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = options.rate ?? 1.0;
    utterance.lang = options.lang ?? 'en-US';

    if (options.voice) {
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.name.includes(options.voice!));
      if (match) utterance.voice = match;
    }

    utterance.onstart = () => {
      this.speaking = true;
      this.onStart();
    };
    utterance.onend = () => {
      this.speaking = false;
      this.onEnd();
    };
    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      this.speaking = false;
      this.onError?.(event?.error ?? 'speech synthesis error', event);
      this.onEnd();
    };

    window.speechSynthesis.speak(utterance);
    this.utterance = utterance;
  }

  stop(): void {
    if (typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    if (this.speaking) {
      this.speaking = false;
      this.onEnd();
    }
    this.utterance = null;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }
}
