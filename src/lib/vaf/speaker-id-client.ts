// ============================================================================
// VAF Speaker Identification Client
// ----------------------------------------------------------------------------
// Wraps the VisionAudioForge speaker / voiceprint API. Used by Shadow's
// voiceprint authentication flow (enrollment, verification, continuous
// re-verification during phone calls, and GDPR delete).
// ============================================================================

const VAF_BASE_URL = process.env.VAF_SERVICE_URL || 'http://localhost:4100';

// ---------------------------------------------------------------------------
// Public types — exact shapes from the PAF/VAF integration spec (section 2.1)
// ---------------------------------------------------------------------------

export interface VoiceprintEnrollment {
  userId: string;
  sampleUrls: string[];
  qualityScores: number[];
  enrolled: boolean;
  enrolledAt: string;
}

export interface VoiceprintAntiSpoofResult {
  isLiveVoice: boolean;
  isNotSynthesized: boolean;
  confidence: number;
}

export interface VoiceprintVerification {
  match: boolean;
  confidence: number;
  threshold: number;
  latencyMs: number;
  antiSpoofResult: VoiceprintAntiSpoofResult;
}

export interface VoiceprintContinuousSession {
  sessionId: string;
  websocketUrl: string;
}

// ---------------------------------------------------------------------------
// VAFSpeakerID
// ---------------------------------------------------------------------------

export class VAFSpeakerID {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey ?? process.env.VAF_API_KEY ?? '';
    this.baseUrl = options?.baseUrl ?? VAF_BASE_URL;
  }

  /**
   * Enroll a user's voiceprint by submitting three reference audio samples.
   * Returns enrollment metadata including per-sample quality scores.
   */
  async enroll(userId: string, audioSamples: Buffer[]): Promise<VoiceprintEnrollment> {
    const formData = new FormData();
    formData.append('userId', userId);
    audioSamples.forEach((sample, i) => {
      formData.append(`sample_${i}`, new Blob([sample as unknown as ArrayBuffer]), `sample_${i}.wav`);
    });

    const res = await fetch(`${this.baseUrl}/api/v1/speaker/enroll`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`VAF enrollment failed: ${res.status}`);
    }

    return (await res.json()) as VoiceprintEnrollment;
  }

  /**
   * Verify a single audio sample against an enrolled user's voiceprint.
   * Includes anti-spoof signals (live-voice, not-synthesized) which the
   * caller is expected to short-circuit on.
   */
  async verify(userId: string, audioSample: Buffer): Promise<VoiceprintVerification> {
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('audio', new Blob([audioSample as unknown as ArrayBuffer]), 'verify.wav');

    const res = await fetch(`${this.baseUrl}/api/v1/speaker/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`VAF verification failed: ${res.status}`);
    }

    return (await res.json()) as VoiceprintVerification;
  }

  /**
   * Open a continuous verification session for an in-progress phone call.
   * VAF re-verifies the speaker every checkIntervalSeconds (default 30s)
   * and emits messages over the returned websocket URL.
   */
  async createContinuousSession(userId: string): Promise<VoiceprintContinuousSession> {
    const res = await fetch(`${this.baseUrl}/api/v1/speaker/continuous/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        userId,
        threshold: 0.85,
        checkIntervalSeconds: 30,
        enableAntiSpoof: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`VAF continuous session failed: ${res.status}`);
    }

    return (await res.json()) as VoiceprintContinuousSession;
  }

  /**
   * GDPR delete — permanently removes a user's voiceprint data from VAF.
   */
  async deleteVoiceprint(userId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/speaker/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      throw new Error(`VAF voiceprint delete failed: ${res.status}`);
    }
  }
}
