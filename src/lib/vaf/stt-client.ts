// VAF Speech-to-Text client. Talks to the VisionAudioForge service for
// batch + streaming STT. Streaming returns a session descriptor; the
// caller is responsible for opening the WebSocket and pumping audio.

export interface VAFTranscriptionRequest {
  audio: Buffer | ReadableStream;
  format: 'wav' | 'webm' | 'ogg' | 'raw';
  sampleRate: number;
  language: string;
  model: 'fast' | 'accurate' | 'realtime';
  speakerId?: string;
  vocabulary?: string[];
  /**
   * Optional compliance flags (e.g. ['HIPAA'], ['PCI'], ['HIPAA','GDPR'])
   * forwarded to the VAF batch transcribe endpoint as a `complianceMode`
   * form field. Mirrors the existing `entityCompliance` option on
   * createStreamingSession so the same upstream concept reaches both the
   * batch and streaming code paths. The mock VAF service (WS10) accepts
   * arbitrary form fields, so this is forward-compatible without a server
   * change.
   */
  complianceMode?: string[];
  streaming: boolean;
}

export interface VAFTranscriptionWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string;
}

export interface VAFTranscriptionResult {
  text: string;
  confidence: number;
  isFinal: boolean;
  words: VAFTranscriptionWord[];
  language: string;
  latencyMs: number;
}

export interface VAFStreamingSession {
  sessionId: string;
  websocketUrl: string;
}

export interface VAFStreamingOptions {
  language?: string;
  model?: 'fast' | 'accurate' | 'realtime';
  speakerId?: string;
  vocabulary?: string[];
  entityCompliance?: string[];
}

function vafBaseUrl(): string {
  return process.env.VAF_SERVICE_URL || 'http://localhost:4100';
}

export class VAFSpeechToText {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.VAF_API_KEY || '';
  }

  async createStreamingSession(options: VAFStreamingOptions): Promise<VAFStreamingSession> {
    const res = await fetch(`${vafBaseUrl()}/api/v1/stt/stream/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        language: options.language || 'en-US',
        model: options.model || 'realtime',
        enableSpeakerDiarization: !!options.speakerId,
        customVocabulary: options.vocabulary || [],
        complianceMode: options.entityCompliance || [],
        interimResults: true,
        punctuation: true,
        profanityFilter: false,
      }),
    });

    if (!res.ok) throw new Error(`VAF STT session failed: ${res.status}`);
    return res.json();
  }

  async transcribe(request: VAFTranscriptionRequest): Promise<VAFTranscriptionResult> {
    const formData = new FormData();
    const audioBlob = Buffer.isBuffer(request.audio)
      ? new Blob([new Uint8Array(request.audio)])
      : new Blob([await streamToBuffer(request.audio as ReadableStream)]);
    formData.append('audio', audioBlob, `audio.${request.format}`);
    formData.append('language', request.language);
    formData.append('model', request.model);
    formData.append('sampleRate', String(request.sampleRate));
    if (request.vocabulary) {
      formData.append('vocabulary', JSON.stringify(request.vocabulary));
    }
    if (request.speakerId) {
      formData.append('speakerId', request.speakerId);
    }
    if (request.complianceMode && request.complianceMode.length > 0) {
      // Send as a JSON-encoded array string for parity with the
      // streaming endpoint's `complianceMode` body field. The mock VAF
      // service treats unknown form fields as opaque metadata.
      formData.append('complianceMode', JSON.stringify(request.complianceMode));
    }

    const res = await fetch(`${vafBaseUrl()}/api/v1/stt/transcribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) throw new Error(`VAF transcription failed: ${res.status}`);
    return res.json();
  }
}

async function streamToBuffer(stream: ReadableStream): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
