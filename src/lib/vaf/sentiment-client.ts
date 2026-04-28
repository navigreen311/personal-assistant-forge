// ============================================================================
// VAF Sentiment Analyzer Client
// ----------------------------------------------------------------------------
// Wraps the VisionAudioForge real-time sentiment API. Two modes:
//   - Streaming: open a WebSocket session for live analysis during a call.
//   - Batch: analyze a completed call recording end-to-end.
// ============================================================================

const VAF_BASE_URL = process.env.VAF_SERVICE_URL || 'http://localhost:4100';

// ---------------------------------------------------------------------------
// Public types — exact shapes from the PAF/VAF integration spec (section 3.1)
// ---------------------------------------------------------------------------

export type SentimentOverall = 'positive' | 'neutral' | 'negative' | 'hostile';

export type SentimentSuggestedAction =
  | 'de-escalate'
  | 'transfer_to_human'
  | 'continue'
  | 'end_call';

export interface SentimentEmotions {
  anger: number;
  frustration: number;
  anxiety: number;
  satisfaction: number;
  confusion: number;
  urgency: number;
}

export interface SentimentResult {
  overall: SentimentOverall;
  confidence: number;
  emotions: SentimentEmotions;
  riskFlags: string[];
  suggestedAction?: SentimentSuggestedAction;
}

export interface SentimentStreamingSession {
  sessionId: string;
  websocketUrl: string;
}

export interface SentimentTimelineEntry {
  timestamp: number;
  sentiment: SentimentResult;
}

export interface SentimentPeak {
  timestamp: number;
  event: string;
}

export interface SentimentRecordingAnalysis {
  timeline: SentimentTimelineEntry[];
  overall: SentimentResult;
  peaks: SentimentPeak[];
}

// ---------------------------------------------------------------------------
// VAFSentimentAnalyzer
// ---------------------------------------------------------------------------

export class VAFSentimentAnalyzer {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey ?? process.env.VAF_API_KEY ?? '';
    this.baseUrl = options?.baseUrl ?? VAF_BASE_URL;
  }

  /**
   * Open a streaming WebSocket session for real-time sentiment during a call.
   * VAF analyzes every 5s of audio and pushes a SentimentResult over the WS.
   */
  async createStreamingSession(callId: string): Promise<SentimentStreamingSession> {
    const res = await fetch(`${this.baseUrl}/api/v1/sentiment/stream/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        callId,
        analyzeInterval: 5,
        includeSuggestions: true,
        alertOnHostile: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`VAF sentiment stream failed: ${res.status}`);
    }

    return (await res.json()) as SentimentStreamingSession;
  }

  /**
   * Analyze a completed call recording. Returns a sentiment timeline,
   * overall sentiment, and notable peak events (anger spikes, etc).
   */
  async analyzeRecording(audioUrl: string): Promise<SentimentRecordingAnalysis> {
    const res = await fetch(`${this.baseUrl}/api/v1/sentiment/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ audioUrl }),
    });

    if (!res.ok) {
      throw new Error(`VAF sentiment analysis failed: ${res.status}`);
    }

    return (await res.json()) as SentimentRecordingAnalysis;
  }
}
