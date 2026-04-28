// VAFMeetingIntelligence — client for the VisionAudioForge meeting-intel
// service. Wraps `/meeting/process` and surfaces a typed transcript with
// summary, action items, decisions, and key topics.

export interface MeetingTranscriptSegment {
  speaker: string;
  speakerId: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface MeetingActionItem {
  description: string;
  assignee: string;
  deadline?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface MeetingDecision {
  decision: string;
  madeBy: string;
  context: string;
}

export interface MeetingTranscript {
  segments: MeetingTranscriptSegment[];
  summary: string;
  actionItems: MeetingActionItem[];
  decisions: MeetingDecision[];
  keyTopics: string[];
  duration: number;
  speakerCount: number;
}

export interface MeetingProcessOptions {
  knownSpeakers?: Array<{ name: string; voiceprintId: string }>;
  extractActionItems?: boolean;
  extractDecisions?: boolean;
  generateSummary?: boolean;
}

const VAF_BASE_URL = process.env.VAF_SERVICE_URL || 'http://localhost:4100';

export class VAFMeetingIntelligence {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.VAF_API_KEY || '';
  }

  // Process a meeting recording and return transcript + intelligence.
  async processRecording(
    audioUrl: string,
    options?: MeetingProcessOptions
  ): Promise<MeetingTranscript> {
    const body = {
      audioUrl,
      ...options,
      extractActionItems: options?.extractActionItems ?? true,
      extractDecisions: options?.extractDecisions ?? true,
      generateSummary: options?.generateSummary ?? true,
    };

    const res = await fetch(`${VAF_BASE_URL}/api/v1/meeting/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`VAF meeting processing failed: ${res.status}`);
    }

    return (await res.json()) as MeetingTranscript;
  }
}
