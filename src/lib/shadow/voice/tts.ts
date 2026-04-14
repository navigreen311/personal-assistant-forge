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

  constructor({ onStart, onEnd }: ShadowTTSCallbacks) {
    this.onStart = onStart;
    this.onEnd = onEnd;
  }

  speak(text: string, options: ShadowTTSSpeakOptions = {}): void {
    // Stop anything in flight first.
    this.stop();

    const cleanText = text.replace(CARD_MARKER_RE, '').trim();
    if (!cleanText) return;

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
    utterance.onerror = () => {
      this.speaking = false;
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
