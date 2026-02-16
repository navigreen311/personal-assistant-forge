import { prisma } from '@/lib/db';
import type { Message, Sensitivity, Contact } from '@/shared/types';
import type {
  TriageResult,
  MessageIntent,
  MessageCategory,
  SuggestedAction,
  TriageFlag,
  BatchTriageRequest,
  BatchTriageResult,
} from './inbox.types';

// --- Keyword dictionaries ---

const URGENT_KEYWORDS = [
  'urgent',
  'asap',
  'emergency',
  'immediately',
  'critical',
  'time-sensitive',
  'right away',
  'top priority',
];

const REQUEST_KEYWORDS = [
  'please',
  'could you',
  'would you',
  'need you to',
  'can you',
  'kindly',
  'request',
  'asking you to',
];

const INQUIRY_KEYWORDS = [
  '?',
  'wondering',
  'question',
  'curious',
  'what is',
  'how do',
  'why is',
  'when will',
  'where is',
  'who is',
];

const FINANCIAL_KEYWORDS = [
  '$',
  'invoice',
  'payment',
  'billing',
  'amount due',
  'balance',
  'receipt',
  'refund',
  'transaction',
  'wire transfer',
];

const SCHEDULING_KEYWORDS = [
  'meet',
  'call',
  'schedule',
  'calendar',
  'availability',
  'appointment',
  'reschedule',
  'book a time',
];

const FOLLOW_UP_KEYWORDS = [
  'following up',
  'circling back',
  'checking in',
  'any update',
  'just wanted to check',
  'touching base',
  'status update',
];

const COMPLAINT_KEYWORDS = [
  'disappointed',
  'frustrated',
  'unacceptable',
  'issue with',
  'problem with',
  'not satisfied',
  'terrible',
  'horrible',
  'complaint',
];

const APPROVAL_KEYWORDS = [
  'approve',
  'sign off',
  'greenlight',
  'authorization',
  'permission',
  'sign-off',
  'approval needed',
];

const LEGAL_KEYWORDS = [
  'contract',
  'lawsuit',
  'compliance',
  'subpoena',
  'litigation',
  'liability',
  'legal',
  'attorney',
  'counsel',
  'regulation',
  'statute',
  'indemnify',
];

const NEGATIVE_SENTIMENT_KEYWORDS = [
  'disappointed',
  'frustrated',
  'angry',
  'unacceptable',
  'terrible',
  'worst',
  'horrible',
  'disgraceful',
  'outrageous',
  'furious',
  'annoyed',
  'upset',
];

const INTRODUCTION_KEYWORDS = [
  'nice to meet',
  'introducing',
  'allow me to introduce',
  'new here',
  'just joined',
  'first time',
];

const SOCIAL_KEYWORDS = [
  'happy birthday',
  'congratulations',
  'thank you',
  'thanks',
  'happy holidays',
  'good luck',
  'well done',
];

// PHI patterns
const PHI_PATTERNS = [
  /\bMRN[:\s#]*\d+/i,
  /\bmedical record/i,
  /\bdiagnos(?:is|ed|tic)/i,
  /\bpatient\b.*\b(?:name|id|record)/i,
  /\bICD-?\d{1,2}/i,
  /\bHIPAA/i,
  /\bprotected health/i,
];

// PII patterns
const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\bSSN[:\s]*\d/i,
  /\b(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/\d{4}\b/, // DOB mm/dd/yyyy
  /\bdate of birth/i,
  /\bDOB[:\s]/i,
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
];

// Confidential patterns
const CONFIDENTIAL_PATTERNS = [
  /\bsalary\b/i,
  /\bcompensation\b/i,
  /\bacquisition\b.*\btarget/i,
  /\bmerger\b/i,
  /\btrade secret/i,
  /\bconfidential/i,
  /\bnon-?disclosure/i,
  /\bproprietary/i,
];

// Deadline patterns (dates within 7 days)
const DEADLINE_PATTERNS = [
  /\bby\s+(?:tomorrow|tonight|end of day|EOD|COB)/i,
  /\bdeadline\b/i,
  /\bdue\s+(?:by|on|date)/i,
  /\bby\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i,
  /\bno later than/i,
  /\bASAP/i,
  /\bwithin\s+\d+\s+(?:hour|day)/i,
  /\bexpires?\s+(?:on|in|by)/i,
];

const MONEY_PATTERNS = [
  /\$[\d,.]+/,
  /\b\d+(?:\.\d{2})?\s*(?:USD|EUR|GBP)/i,
  /\binvoice\s*#?\s*\d+/i,
  /\bpayment\b/i,
  /\bamount\s+due/i,
];

export class TriageService {
  async triageMessage(
    messageId: string,
    entityId: string
  ): Promise<TriageResult> {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    // Try to load sender contact
    let sender: Contact | undefined;
    try {
      const contactRecord = await prisma.contact.findUnique({
        where: { id: message.senderId },
      });
      if (contactRecord) {
        sender = {
          ...contactRecord,
          email: contactRecord.email ?? undefined,
          phone: contactRecord.phone ?? undefined,
          lastTouch: contactRecord.lastTouch,
          channels: contactRecord.channels as unknown as Contact['channels'],
          commitments: contactRecord.commitments as unknown as Contact['commitments'],
          preferences: contactRecord.preferences as unknown as Contact['preferences'],
        };
      }
    } catch {
      // Sender may not be a contact
    }

    // Load entity for compliance profile
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
    });

    const entityProfiles = entity?.complianceProfile ?? [];

    const text = `${message.subject ?? ''} ${message.body}`;
    const urgencyScore = this.calculateUrgencyScore(
      message as unknown as Message,
      sender
    );
    const intent = this.classifyIntent(message.body, message.subject ?? undefined);
    const sensitivity = this.detectSensitivity(text, entityProfiles);
    const category = this.categorizeMessage(
      text,
      intent,
      entity?.type ?? 'Personal'
    );
    const flags = this.detectFlags(text, sender);
    const suggestedAction = this.suggestAction(urgencyScore, intent);
    const suggestedPriority: 'P0' | 'P1' | 'P2' =
      urgencyScore >= 8 ? 'P0' : urgencyScore >= 5 ? 'P1' : 'P2';

    const reasoning = this.buildReasoning(urgencyScore, intent, flags);
    const confidence = this.calculateConfidence(text, flags);

    const result: TriageResult = {
      messageId,
      urgencyScore,
      intent,
      sensitivity,
      category,
      suggestedPriority,
      suggestedAction,
      reasoning,
      confidence,
      flags,
    };

    // Persist triage score and intent back to message
    await prisma.message.update({
      where: { id: messageId },
      data: {
        triageScore: urgencyScore,
        intent,
        sensitivity,
      },
    });

    return result;
  }

  async batchTriage(request: BatchTriageRequest): Promise<BatchTriageResult> {
    const startTime = Date.now();
    const maxMessages = request.maxMessages ?? 50;

    let messageIds: string[] = request.messageIds ?? [];
    if (messageIds.length === 0) {
      // Find untriaged messages (default score of 5 and no intent)
      const untriaged = await prisma.message.findMany({
        where: {
          entityId: request.entityId,
          intent: null,
        },
        select: { id: true },
        take: maxMessages,
        orderBy: { createdAt: 'desc' },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messageIds = untriaged.map((m: any) => m.id as string);
    } else {
      messageIds = messageIds.slice(0, maxMessages);
    }

    const results: TriageResult[] = [];
    for (const id of messageIds) {
      try {
        const result = await this.triageMessage(id, request.entityId);
        results.push(result);
      } catch {
        // Skip messages that fail triage
      }
    }

    const summary = {
      urgent: results.filter((r) => r.urgencyScore >= 8).length,
      needsResponse: results.filter(
        (r) => r.intent === 'REQUEST' || r.intent === 'INQUIRY'
      ).length,
      canArchive: results.filter(
        (r) => r.suggestedAction === 'ARCHIVE' || r.suggestedAction === 'NO_ACTION'
      ).length,
      flagged: results.filter((r) => r.flags.length > 0).length,
    };

    return {
      processed: results.length,
      results,
      summary,
      processingTimeMs: Date.now() - startTime,
    };
  }

  async updateTriageScore(
    messageId: string,
    newScore: number,
    reason: string
  ): Promise<TriageResult> {
    const clamped = Math.max(1, Math.min(10, newScore));

    await prisma.message.update({
      where: { id: messageId },
      data: { triageScore: clamped },
    });

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    const text = `${message.subject ?? ''} ${message.body}`;
    const intent = this.classifyIntent(message.body, message.subject ?? undefined);
    const sensitivity = this.detectSensitivity(text, []);
    const category = this.categorizeMessage(text, intent, 'Personal');
    const flags = this.detectFlags(text);
    const suggestedAction = this.suggestAction(clamped, intent);
    const suggestedPriority: 'P0' | 'P1' | 'P2' =
      clamped >= 8 ? 'P0' : clamped >= 5 ? 'P1' : 'P2';

    return {
      messageId,
      urgencyScore: clamped,
      intent,
      sensitivity,
      category,
      suggestedPriority,
      suggestedAction,
      reasoning: `Manually updated to ${clamped}: ${reason}`,
      confidence: 1.0,
      flags,
    };
  }

  calculateUrgencyScore(message: Message, sender?: Contact): number {
    let score = 3; // Base score

    const body = message.body.toLowerCase();
    const subject = (message.subject ?? '').toLowerCase();
    const text = `${subject} ${body}`;

    // VIP sender: +2
    if (sender?.tags?.includes('VIP')) {
      score += 2;
    }

    // High relationship score: +1
    if (sender && sender.relationshipScore > 80) {
      score += 1;
    }

    // Urgent keywords: +2
    if (URGENT_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()))) {
      score += 2;
    }

    // Deadline mentioned: +1
    if (DEADLINE_PATTERNS.some((p) => p.test(text))) {
      score += 1;
    }

    // Channel priority: VOICE +2, SMS +1
    if (message.channel === 'VOICE') {
      score += 2;
    } else if (message.channel === 'SMS') {
      score += 1;
    }

    // Thread escalation: +1 (check via threadId — we detect based on message content indicators)
    if (FOLLOW_UP_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()))) {
      score += 1;
    }

    // Financial content: +1
    if (FINANCIAL_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()))) {
      score += 1;
    }

    // Legal language: +1
    if (LEGAL_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()))) {
      score += 1;
    }

    // Compliance risk (PHI/PII): +2
    if (
      PHI_PATTERNS.some((p) => p.test(text)) ||
      PII_PATTERNS.some((p) => p.test(text))
    ) {
      score += 2;
    }

    // Outside business hours: -1
    const hour = new Date().getHours();
    if (hour < 8 || hour >= 18) {
      score -= 1;
    }

    // Cap 1-10
    return Math.max(1, Math.min(10, score));
  }

  classifyIntent(body: string, subject?: string): MessageIntent {
    const text = `${subject ?? ''} ${body}`.toLowerCase();

    // Order matters — check most specific first
    if (URGENT_KEYWORDS.some((kw) => text.includes(kw))) return 'URGENT';
    if (APPROVAL_KEYWORDS.some((kw) => text.includes(kw))) return 'APPROVAL';
    if (FINANCIAL_KEYWORDS.some((kw) => text.includes(kw))) return 'FINANCIAL';
    if (COMPLAINT_KEYWORDS.some((kw) => text.includes(kw))) return 'COMPLAINT';
    if (SCHEDULING_KEYWORDS.some((kw) => text.includes(kw))) return 'SCHEDULING';
    if (FOLLOW_UP_KEYWORDS.some((kw) => text.includes(kw))) return 'FOLLOW_UP';
    if (INTRODUCTION_KEYWORDS.some((kw) => text.includes(kw)))
      return 'INTRODUCTION';
    if (SOCIAL_KEYWORDS.some((kw) => text.includes(kw))) return 'SOCIAL';
    if (REQUEST_KEYWORDS.some((kw) => text.includes(kw))) return 'REQUEST';
    if (INQUIRY_KEYWORDS.some((kw) => text.includes(kw))) return 'INQUIRY';

    // Heuristic: if body has factual statements, UPDATE; otherwise FYI
    if (body.length > 100) return 'UPDATE';
    return 'FYI';
  }

  detectSensitivity(body: string, entityProfiles: string[]): Sensitivity {
    if (PHI_PATTERNS.some((p) => p.test(body))) return 'REGULATED';
    if (PII_PATTERNS.some((p) => p.test(body))) return 'RESTRICTED';
    if (CONFIDENTIAL_PATTERNS.some((p) => p.test(body))) return 'CONFIDENTIAL';

    // If entity has compliance profiles, default to INTERNAL
    if (entityProfiles.length > 0) return 'INTERNAL';

    return 'PUBLIC';
  }

  categorizeMessage(
    body: string,
    intent: MessageIntent,
    entityType: string
  ): MessageCategory {
    const text = body.toLowerCase();

    if (intent === 'FINANCIAL') return 'FINANCE';
    if (LEGAL_KEYWORDS.some((kw) => text.includes(kw))) return 'LEGAL';
    if (
      text.includes('compliance') ||
      text.includes('regulation') ||
      text.includes('audit')
    )
      return 'COMPLIANCE';
    if (text.includes('hire') || text.includes('onboard') || text.includes('hr'))
      return 'HR';
    if (
      text.includes('marketing') ||
      text.includes('campaign') ||
      text.includes('brand')
    )
      return 'MARKETING';
    if (text.includes('sales') || text.includes('prospect') || text.includes('lead'))
      return 'SALES';
    if (
      text.includes('support') ||
      text.includes('help desk') ||
      text.includes('ticket')
    )
      return 'SUPPORT';
    if (intent === 'SOCIAL' || entityType === 'Personal') return 'PERSONAL';
    if (
      intent === 'APPROVAL' ||
      text.includes('executive') ||
      text.includes('board')
    )
      return 'EXECUTIVE';

    return 'OPERATIONS';
  }

  suggestAction(score: number, intent: MessageIntent): SuggestedAction {
    if (score >= 9) return 'RESPOND_IMMEDIATELY';
    if (score >= 7) return 'RESPOND_TODAY';
    if (intent === 'REQUEST' || intent === 'INQUIRY') return 'RESPOND_THIS_WEEK';
    if (intent === 'APPROVAL') return 'FLAG_FOR_REVIEW';
    if (intent === 'FOLLOW_UP') return 'SCHEDULE_FOLLOW_UP';
    if (intent === 'FYI' || score <= 2) return 'ARCHIVE';
    if (score <= 3) return 'NO_ACTION';
    return 'RESPOND_THIS_WEEK';
  }

  detectFlags(body: string, sender?: Contact): TriageFlag[] {
    const flags: TriageFlag[] = [];

    if (sender?.tags?.includes('VIP')) {
      flags.push({
        type: 'VIP_SENDER',
        description: `VIP contact: ${sender.name}`,
        severity: 'HIGH',
      });
    }

    if (DEADLINE_PATTERNS.some((p) => p.test(body))) {
      flags.push({
        type: 'DEADLINE_MENTIONED',
        description: 'Message contains deadline reference',
        severity: 'MEDIUM',
      });
    }

    if (MONEY_PATTERNS.some((p) => p.test(body))) {
      flags.push({
        type: 'MONEY_MENTIONED',
        description: 'Financial amounts or payment references detected',
        severity: 'MEDIUM',
      });
    }

    if (LEGAL_KEYWORDS.some((kw) => body.toLowerCase().includes(kw))) {
      flags.push({
        type: 'LEGAL_LANGUAGE',
        description: 'Legal terminology detected',
        severity: 'HIGH',
      });
    }

    if (PHI_PATTERNS.some((p) => p.test(body))) {
      flags.push({
        type: 'PHI_DETECTED',
        description: 'Protected health information detected',
        severity: 'HIGH',
      });
    }

    if (PII_PATTERNS.some((p) => p.test(body))) {
      flags.push({
        type: 'PII_DETECTED',
        description: 'Personally identifiable information detected',
        severity: 'HIGH',
      });
    }

    if (NEGATIVE_SENTIMENT_KEYWORDS.some((kw) => body.toLowerCase().includes(kw))) {
      flags.push({
        type: 'SENTIMENT_NEGATIVE',
        description: 'Negative sentiment detected',
        severity: 'MEDIUM',
      });
    }

    // Compliance risk: PHI/PII in non-secure channel (heuristic)
    if (
      (PHI_PATTERNS.some((p) => p.test(body)) ||
        PII_PATTERNS.some((p) => p.test(body))) &&
      body.toLowerCase().includes('email')
    ) {
      flags.push({
        type: 'COMPLIANCE_RISK',
        description: 'Sensitive data detected in potentially non-compliant channel',
        severity: 'HIGH',
      });
    }

    return flags;
  }

  private buildReasoning(
    score: number,
    intent: MessageIntent,
    flags: TriageFlag[]
  ): string {
    const parts: string[] = [];
    parts.push(`Score ${score}/10.`);
    parts.push(`Intent: ${intent}.`);
    if (flags.length > 0) {
      parts.push(`Flags: ${flags.map((f) => f.type).join(', ')}.`);
    }
    if (score >= 8) parts.push('Requires immediate attention.');
    else if (score >= 5) parts.push('Moderate priority.');
    else parts.push('Low priority.');
    return parts.join(' ');
  }

  private calculateConfidence(text: string, flags: TriageFlag[]): number {
    // Higher confidence when we have more signals
    let confidence = 0.5;
    if (text.length > 200) confidence += 0.1;
    if (flags.length > 0) confidence += 0.1 * Math.min(flags.length, 3);
    return Math.min(1.0, confidence);
  }
}
