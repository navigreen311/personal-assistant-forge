// VAFTranslation — client for the VisionAudioForge speech translation
// endpoint. Accepts an audio buffer in a source language and returns the
// transcribed source text plus a translation in the requested target.

export interface TranslateSpeechOptions {
  sourceLanguage: string; // e.g. 'es', 'fr', 'zh', or 'auto'
  targetLanguage: string; // e.g. 'en'
  respondInSource?: boolean;
}

export interface TranslateSpeechResult {
  sourceText: string;
  translatedText: string;
  sourceLanguage: string;
  confidence: number;
}

const VAF_BASE_URL = process.env.VAF_SERVICE_URL || 'http://localhost:4100';

export class VAFTranslation {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.VAF_API_KEY || '';
  }

  // Real-time speech translation. The VAF service handles STT + MT in one
  // call so the client only sees a single round trip.
  async translateSpeech(
    audioBuffer: Buffer,
    options: TranslateSpeechOptions
  ): Promise<TranslateSpeechResult> {
    const formData = new FormData();
    formData.append('audio', new Blob([new Uint8Array(audioBuffer)]));
    formData.append('sourceLanguage', options.sourceLanguage);
    formData.append('targetLanguage', options.targetLanguage);
    if (options.respondInSource !== undefined) {
      formData.append('respondInSource', String(options.respondInSource));
    }

    const res = await fetch(`${VAF_BASE_URL}/api/v1/translate/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`VAF translation failed: ${res.status}`);
    }

    return (await res.json()) as TranslateSpeechResult;
  }
}
