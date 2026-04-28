// VAF Text-to-Speech client. Returns rendered audio as ArrayBuffer for
// batch synthesis, or a session descriptor for streaming TTS.

export interface VAFSpeechRequest {
  text: string;
  voice: string;
  speed: number;
  pitch: number;
  emotion?: string;
  format: 'mp3' | 'wav' | 'ogg' | 'pcm';
  sampleRate: number;
  streaming: boolean;
}

export interface VAFVoice {
  id: string;
  name: string;
  gender: string;
  language: string;
  accent: string;
  style: string;
  previewUrl: string;
  isCloned: boolean;
}

export interface VAFSynthesisResult {
  audio: ArrayBuffer;
  duration: number;
  latencyMs: number;
}

export interface VAFTtsStreamingOptions {
  voice: string;
  speed?: number;
  emotion?: string;
}

export interface VAFTtsStreamingSession {
  sessionId: string;
  websocketUrl: string;
}

function vafBaseUrl(): string {
  return process.env.VAF_SERVICE_URL || 'http://localhost:4100';
}

export class VAFTextToSpeech {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.VAF_API_KEY || '';
  }

  async getVoices(): Promise<VAFVoice[]> {
    const res = await fetch(`${vafBaseUrl()}/api/v1/tts/voices`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`VAF voices fetch failed: ${res.status}`);
    return res.json();
  }

  async synthesize(request: VAFSpeechRequest): Promise<VAFSynthesisResult> {
    const res = await fetch(`${vafBaseUrl()}/api/v1/tts/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!res.ok) throw new Error(`VAF TTS failed: ${res.status}`);

    const audio = await res.arrayBuffer();
    const duration = parseFloat(res.headers.get('X-Audio-Duration') || '0');
    const latencyMs = parseFloat(res.headers.get('X-Latency-Ms') || '0');

    return { audio, duration, latencyMs };
  }

  async createStreamingSession(options: VAFTtsStreamingOptions): Promise<VAFTtsStreamingSession> {
    const res = await fetch(`${vafBaseUrl()}/api/v1/tts/stream/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        voice: options.voice,
        speed: options.speed ?? 1.0,
        emotion: options.emotion ?? 'neutral',
        format: 'pcm',
        sampleRate: 24000,
      }),
    });

    if (!res.ok) throw new Error(`VAF TTS stream failed: ${res.status}`);
    return res.json();
  }
}
