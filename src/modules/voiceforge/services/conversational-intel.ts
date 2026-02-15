// ============================================================================
// VoiceForge — Conversational Intelligence Service
// Transcript analysis, info extraction, compliance checking, and summarization
// ============================================================================

import type {
  TranscriptSegment,
  CallAnalysis,
  ExtractedInfo,
  ComplianceIssue,
  CallSummary,
} from '@/modules/voiceforge/types';

// Positive and negative word lists for basic sentiment analysis
const POSITIVE_WORDS = [
  'great', 'good', 'excellent', 'wonderful', 'amazing', 'fantastic', 'love',
  'happy', 'pleased', 'perfect', 'thank', 'appreciate', 'yes', 'absolutely',
  'agree', 'sure', 'definitely', 'awesome', 'brilliant', 'delighted',
];

const NEGATIVE_WORDS = [
  'bad', 'terrible', 'awful', 'hate', 'angry', 'frustrated', 'disappointed',
  'no', 'never', 'cancel', 'worst', 'horrible', 'unacceptable', 'refuse',
  'complain', 'problem', 'issue', 'wrong', 'fail', 'poor',
];

// Compliance keyword maps per profile
const COMPLIANCE_KEYWORDS: Record<string, { keywords: string[]; severity: ComplianceIssue['severity'] }[]> = {
  HIPAA: [
    { keywords: ['patient name', 'diagnosis', 'medical record', 'health condition', 'prescription'], severity: 'VIOLATION' },
    { keywords: ['doctor', 'hospital', 'treatment'], severity: 'WARNING' },
  ],
  GDPR: [
    { keywords: ['personal data', 'data processing', 'consent withdrawn'], severity: 'VIOLATION' },
    { keywords: ['data subject', 'right to erasure', 'data breach'], severity: 'WARNING' },
  ],
  CCPA: [
    { keywords: ['sell my data', 'personal information', 'opt out'], severity: 'WARNING' },
  ],
};

export async function analyzeCall(
  callId: string,
  segments: TranscriptSegment[]
): Promise<CallAnalysis> {
  const keyInfoExtracted = extractKeyInfo(segments);
  const complianceIssues = checkCompliance(segments, []);
  const summary = generateSummary(segments, keyInfoExtracted);
  const talkRatio = calculateTalkRatio(segments);

  const sentimentTimeline = segments.map((seg) => ({
    time: seg.startTime,
    sentiment: seg.sentiment,
  }));

  const overallSentiment =
    segments.length > 0
      ? segments.reduce((sum, s) => sum + s.sentiment, 0) / segments.length
      : 0;

  return {
    callId,
    transcript: segments,
    overallSentiment,
    sentimentTimeline,
    keyInfoExtracted,
    complianceIssues,
    summary,
    talkRatio,
  };
}

export function calculateSentiment(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  let score = 0;

  for (const word of words) {
    if (POSITIVE_WORDS.includes(word)) score += 1;
    if (NEGATIVE_WORDS.includes(word)) score -= 1;
  }

  // Clamp to [-1, 1]
  const maxMagnitude = Math.max(Math.abs(score), 1);
  return Math.max(-1, Math.min(1, score / maxMagnitude));
}

export function extractKeyInfo(segments: TranscriptSegment[]): ExtractedInfo[] {
  const results: ExtractedInfo[] = [];

  // Email regex
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  // Phone regex (various US formats)
  const phoneRegex = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
  // Date regex (Month DD, YYYY or MM/DD/YYYY or YYYY-MM-DD)
  const dateRegex = /(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/g;
  // Dollar amount regex
  const amountRegex = /\$[\d,]+(?:\.\d{2})?/g;

  for (let i = 0; i < segments.length; i++) {
    const text = segments[i].text;

    for (const match of text.matchAll(emailRegex)) {
      results.push({
        type: 'EMAIL',
        value: match[0],
        confidence: 0.95,
        segmentIndex: i,
      });
    }

    for (const match of text.matchAll(phoneRegex)) {
      results.push({
        type: 'PHONE',
        value: match[0],
        confidence: 0.9,
        segmentIndex: i,
      });
    }

    for (const match of text.matchAll(dateRegex)) {
      results.push({
        type: 'DATE',
        value: match[0],
        confidence: 0.85,
        segmentIndex: i,
      });
    }

    for (const match of text.matchAll(amountRegex)) {
      results.push({
        type: 'AMOUNT',
        value: match[0],
        confidence: 0.9,
        segmentIndex: i,
      });
    }
  }

  return results;
}

export function checkCompliance(
  segments: TranscriptSegment[],
  profile: string[]
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  for (const profileName of profile) {
    const rules = COMPLIANCE_KEYWORDS[profileName];
    if (!rules) continue;

    for (let i = 0; i < segments.length; i++) {
      const textLower = segments[i].text.toLowerCase();

      for (const rule of rules) {
        for (const keyword of rule.keywords) {
          if (textLower.includes(keyword.toLowerCase())) {
            issues.push({
              type: profileName,
              description: `Potential ${profileName} compliance issue: "${keyword}" detected`,
              severity: rule.severity,
              segmentIndex: i,
              excerpt: segments[i].text.slice(0, 100),
            });
          }
        }
      }
    }
  }

  return issues;
}

export function generateSummary(
  segments: TranscriptSegment[],
  extractedInfo: ExtractedInfo[]
): CallSummary {
  if (segments.length === 0) {
    return {
      oneLineSummary: 'No transcript data available',
      keyPoints: [],
      actionItems: [],
      followUpNeeded: false,
      nextSteps: [],
    };
  }

  // Build key points from segments
  const keyPoints: string[] = [];
  const actionItems: string[] = [];

  // Take first and last substantive segments as key points
  if (segments.length > 0) {
    keyPoints.push(`Call opened: "${segments[0].text.slice(0, 80)}..."`);
  }
  if (segments.length > 1) {
    const lastSeg = segments[segments.length - 1];
    keyPoints.push(`Call closed: "${lastSeg.text.slice(0, 80)}..."`);
  }

  // Extract action items from extracted info
  for (const info of extractedInfo) {
    if (info.type === 'ACTION_ITEM') {
      actionItems.push(info.value);
    }
  }

  // Determine follow-up need based on sentiment
  const avgSentiment =
    segments.reduce((sum, s) => sum + s.sentiment, 0) / segments.length;
  const followUpNeeded = avgSentiment < -0.3 || actionItems.length > 0;

  const oneLineSummary = `${segments.length}-segment call with ${
    avgSentiment > 0.3 ? 'positive' : avgSentiment < -0.3 ? 'negative' : 'neutral'
  } sentiment. ${extractedInfo.length} key items extracted.`;

  return {
    oneLineSummary,
    keyPoints,
    actionItems,
    followUpNeeded,
    followUpReason: followUpNeeded
      ? avgSentiment < -0.3
        ? 'Negative sentiment detected'
        : 'Action items require follow-up'
      : undefined,
    nextSteps: actionItems.length > 0 ? ['Review and address action items'] : [],
  };
}

export function calculateTalkRatio(
  segments: TranscriptSegment[]
): { agent: number; caller: number } {
  if (segments.length === 0) {
    return { agent: 0, caller: 0 };
  }

  let agentDuration = 0;
  let callerDuration = 0;

  for (const seg of segments) {
    const duration = seg.endTime - seg.startTime;
    if (seg.speaker === 'AGENT') {
      agentDuration += duration;
    } else {
      callerDuration += duration;
    }
  }

  const total = agentDuration + callerDuration;
  if (total === 0) return { agent: 0, caller: 0 };

  return {
    agent: Math.round((agentDuration / total) * 100),
    caller: Math.round((callerDuration / total) * 100),
  };
}
