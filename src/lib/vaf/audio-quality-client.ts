// VAF Audio Quality client. Analyzes raw audio for noise/echo/clipping and
// optionally returns an enhanced version for downstream STT.

export interface AudioQualityReport {
  noiseLevel: number;
  echoDetected: boolean;
  clippingDetected: boolean;
  signalToNoise: number;
  packetLoss: number;
  bandwidth: 'narrowband' | 'wideband' | 'fullband';
  recommendation: string;
  enhancedAudio?: ArrayBuffer;
}

export interface AudioQualityOptions {
  enhance?: boolean;
  denoise?: boolean;
  removeEcho?: boolean;
}

function vafBaseUrl(): string {
  return process.env.VAF_SERVICE_URL || 'http://localhost:4100';
}

export class VAFAudioQuality {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.VAF_API_KEY || '';
  }

  async analyze(audioBuffer: Buffer, options?: AudioQualityOptions): Promise<AudioQualityReport> {
    const formData = new FormData();
    formData.append('audio', new Blob([new Uint8Array(audioBuffer)]), 'audio.wav');
    if (options?.enhance) formData.append('enhance', 'true');
    if (options?.denoise) formData.append('denoise', 'true');
    if (options?.removeEcho) formData.append('removeEcho', 'true');

    const res = await fetch(`${vafBaseUrl()}/api/v1/audio/quality`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) throw new Error(`VAF audio quality failed: ${res.status}`);
    return res.json();
  }
}
