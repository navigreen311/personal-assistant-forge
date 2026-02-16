// ============================================================================
// Drafting Engine Service
// Generates multi-variant message drafts with tone control and compliance.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
import type { Contact, Tone, ComplianceProfile, MessageChannel } from '@/shared/types';
import type {
  DraftRequest,
  DraftVariant,
  DraftResponse,
  RecipientAnalysis,
  PowerDynamicAnalysis,
  ComplianceScanResult,
  ComplianceFlag,
} from '@/modules/communication/types';
import { analyzeTone, shiftTone } from './tone-analyzer';

// --- Compliance patterns (5+ common patterns) ---

const COMPLIANCE_PATTERNS: { rule: string; pattern: RegExp; severity: 'WARNING' | 'ERROR'; suggestion: string }[] = [
  {
    rule: 'PII_SSN',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/,
    severity: 'ERROR',
    suggestion: 'Remove Social Security numbers from communications.',
  },
  {
    rule: 'PII_EMAIL',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    severity: 'WARNING',
    suggestion: 'Verify that including email addresses is appropriate for this channel.',
  },
  {
    rule: 'THREAT_LANGUAGE',
    pattern: /\b(threaten|sue|legal action|lawyer|court|lawsuit)\b/i,
    severity: 'WARNING',
    suggestion: 'Review threatening language — ensure it is appropriate and reviewed by legal.',
  },
  {
    rule: 'PROMISE_GUARANTEE',
    pattern: /\b(guarantee|promise|assure|warrant|certify)\b/i,
    severity: 'WARNING',
    suggestion: 'Avoid making guarantees or promises that may create liability.',
  },
  {
    rule: 'REGULATED_TERMS',
    pattern: /\b(HIPAA|PHI|protected health|patient record|diagnosis|prescription)\b/i,
    severity: 'ERROR',
    suggestion: 'Regulated health information detected — ensure HIPAA compliance.',
  },
  {
    rule: 'CONFIDENTIAL_MARKERS',
    pattern: /\b(confidential|proprietary|trade secret|classified|restricted|internal only)\b/i,
    severity: 'WARNING',
    suggestion: 'Message contains confidentiality markers — verify channel security.',
  },
  {
    rule: 'FINANCIAL_PII',
    pattern: /\b(\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4})\b/,
    severity: 'ERROR',
    suggestion: 'Possible credit card number detected — remove financial PII.',
  },
];

// --- Tone variant strategies ---

const VARIANT_STRATEGIES: { label: string; toneShift: Tone; description: string }[] = [
  { label: 'Direct Approach', toneShift: 'DIRECT', description: 'Gets straight to the point' },
  { label: 'Diplomatic Approach', toneShift: 'DIPLOMATIC', description: 'Balances firmness with tact' },
  { label: 'Warm Approach', toneShift: 'WARM', description: 'Emphasizes relationship and empathy' },
  { label: 'Formal Approach', toneShift: 'FORMAL', description: 'Professional and structured' },
  { label: 'Empathetic Approach', toneShift: 'EMPATHETIC', description: 'Leads with understanding' },
];

function getReadingLevel(wordCount: number, sentenceCount: number): string {
  if (sentenceCount === 0) return 'N/A';
  const avgWordsPerSentence = wordCount / sentenceCount;
  if (avgWordsPerSentence <= 10) return 'Grade 6';
  if (avgWordsPerSentence <= 15) return 'Grade 8';
  if (avgWordsPerSentence <= 20) return 'Grade 10';
  if (avgWordsPerSentence <= 25) return 'Grade 12';
  return 'Professional';
}

function countSentences(text: string): number {
  const matches = text.match(/[.!?]+/g);
  return matches ? matches.length : 1;
}

function buildDraftBody(intent: string, tone: Tone, channel: MessageChannel, context?: string): string {
  const contextLine = context ? ` Given the context: ${context}.` : '';
  const channelNote = channel === 'SMS' ? ' Keep it brief.' : '';

  const baseMessages: Record<Tone, string> = {
    FIRM: `I need to address an important matter.${contextLine} ${intent}. I expect a response at your earliest convenience.${channelNote}`,
    DIPLOMATIC: `I wanted to reach out regarding a matter that I believe we can work through together.${contextLine} ${intent}. I value our relationship and look forward to finding a mutually beneficial resolution.${channelNote}`,
    WARM: `I hope you're doing well!${contextLine} ${intent}. I really appreciate your time and look forward to hearing from you.${channelNote}`,
    DIRECT: `${intent}.${contextLine}${channelNote}`,
    CASUAL: `Hey! Quick note —${contextLine} ${intent}. Let me know what you think!${channelNote}`,
    FORMAL: `I am writing to formally address the following matter.${contextLine} ${intent}. Please do not hesitate to contact me should you require any further information.${channelNote}`,
    EMPATHETIC: `I understand this may be a lot, and I appreciate your patience.${contextLine} ${intent}. Please know that I am here to support you through this.${channelNote}`,
    AUTHORITATIVE: `After careful review, I am providing the following directive.${contextLine} ${intent}. This is effective immediately and requires your compliance.${channelNote}`,
  };

  return baseMessages[tone] ?? baseMessages.DIRECT;
}

/**
 * Generate 2-3 draft variants for a communication request.
 */
export async function generateDrafts(request: DraftRequest): Promise<DraftResponse> {
  const { recipientId, entityId, channel, intent, tone, context, replyToMessageId } = request;

  // Fetch recipient
  const contact = await prisma.contact.findUnique({ where: { id: recipientId } });
  if (!contact) {
    throw new Error(`Contact not found: ${recipientId}`);
  }

  // Build recipient analysis
  const messages = await prisma.message.findMany({
    where: { recipientId, entityId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const preferences = (contact.preferences as Record<string, unknown>) ?? {};
  const recipientProfile: RecipientAnalysis = {
    preferredTone: (preferences.preferredTone as Tone) ?? 'DIRECT',
    preferredChannel: (preferences.preferredChannel as MessageChannel) ?? 'EMAIL',
    responseRate: messages.length > 0 ? Math.min(messages.length / 50, 1) : 0,
    averageResponseTime: messages.length > 0 ? '24 hours' : 'Unknown',
    topTopics: extractTopTopics(messages.map((m) => m.intent).filter(Boolean) as string[]),
  };

  // Fetch entity for compliance profile
  const entity = await prisma.entity.findUnique({ where: { id: entityId } });
  const complianceProfiles = (entity?.complianceProfile ?? []) as ComplianceProfile[];

  // Select variant strategies: include requested tone + 1-2 alternatives
  const selectedStrategies = selectVariantStrategies(tone);

  // Generate variants
  const variants: DraftVariant[] = selectedStrategies.map((strategy) => {
    const body = buildDraftBody(intent, strategy.toneShift, channel, context);
    const complianceScan = scanCompliance(body, complianceProfiles);
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    const sentenceCount = countSentences(body);

    return {
      id: uuidv4(),
      label: strategy.label,
      subject: channel === 'EMAIL' ? `Re: ${intent.slice(0, 60)}` : undefined,
      body,
      tone: strategy.toneShift,
      wordCount,
      readingLevel: getReadingLevel(wordCount, sentenceCount),
      complianceFlags: complianceScan.flags.map((f) => `${f.severity}: ${f.rule}`),
    };
  });

  // Power dynamics
  const powerAnalysis = await analyzePowerDynamics(entityId, recipientId);

  return {
    variants,
    recipientProfile,
    powerDynamicNote: powerAnalysis.recommendation,
  };
}

/**
 * Adapt a draft body to match a contact's preferences (tone, formality).
 */
export function adaptToAudience(draft: string, contact: Contact): string {
  const preferredTone = contact.preferences?.preferredTone ?? 'DIRECT';
  return shiftTone(draft, preferredTone);
}

/**
 * Analyze the power dynamic between a sender entity and a recipient contact.
 */
export async function analyzePowerDynamics(
  senderId: string,
  recipientId: string
): Promise<PowerDynamicAnalysis> {
  const contact = await prisma.contact.findUnique({ where: { id: recipientId } });
  if (!contact) {
    return { dynamic: 'PEER', recommendation: 'Treat as peer — no additional context available.' };
  }

  const tags = contact.tags ?? [];
  const lowerTags = tags.map((t: string) => t.toLowerCase());

  if (lowerTags.includes('client') || lowerTags.includes('customer')) {
    return {
      dynamic: 'CLIENT',
      recommendation: 'This is a client relationship — prioritize service-oriented language and responsiveness.',
    };
  }
  if (lowerTags.includes('vendor') || lowerTags.includes('supplier')) {
    return {
      dynamic: 'VENDOR',
      recommendation: 'This is a vendor relationship — be clear about expectations and timelines.',
    };
  }
  if (lowerTags.includes('subordinate') || lowerTags.includes('report') || lowerTags.includes('employee')) {
    return {
      dynamic: 'AUTHORITY',
      recommendation: 'You hold authority here — be clear but supportive. Avoid micro-management tone.',
    };
  }
  if (lowerTags.includes('manager') || lowerTags.includes('boss') || lowerTags.includes('executive')) {
    return {
      dynamic: 'SUBORDINATE',
      recommendation: 'Recipient is in a position of authority — be respectful, concise, and solution-oriented.',
    };
  }

  return {
    dynamic: 'PEER',
    recommendation: 'This appears to be a peer relationship — use collaborative and balanced language.',
  };
}

/**
 * Scan a draft for compliance issues against the given compliance profiles.
 */
export function scanCompliance(
  draft: string,
  complianceProfiles: ComplianceProfile[]
): ComplianceScanResult {
  const flags: ComplianceFlag[] = [];

  for (const pattern of COMPLIANCE_PATTERNS) {
    const match = pattern.pattern.exec(draft);
    if (match) {
      flags.push({
        severity: pattern.severity,
        rule: pattern.rule,
        excerpt: match[0],
        suggestion: pattern.suggestion,
      });
    }
  }

  // Profile-specific checks
  if (complianceProfiles.includes('HIPAA')) {
    if (/\b(patient|diagnosis|treatment|prescription|medical record)\b/i.test(draft)) {
      flags.push({
        severity: 'ERROR',
        rule: 'HIPAA_PHI',
        excerpt: 'HIPAA-regulated content detected',
        suggestion: 'Ensure this communication is sent through a HIPAA-compliant channel.',
      });
    }
  }

  if (complianceProfiles.includes('GDPR')) {
    if (/\b(personal data|data subject|processing|consent)\b/i.test(draft)) {
      flags.push({
        severity: 'WARNING',
        rule: 'GDPR_PERSONAL_DATA',
        excerpt: 'GDPR-related terms detected',
        suggestion: 'Verify that data processing references comply with GDPR requirements.',
      });
    }
  }

  return {
    passed: flags.filter((f) => f.severity === 'ERROR').length === 0,
    flags,
  };
}

function selectVariantStrategies(requestedTone: Tone): { label: string; toneShift: Tone; description: string }[] {
  // Always include the requested tone
  const primary = VARIANT_STRATEGIES.find((s) => s.toneShift === requestedTone)
    ?? { label: `${requestedTone} Approach`, toneShift: requestedTone, description: 'Requested tone' };

  // Pick 1-2 complementary tones
  const complementary = VARIANT_STRATEGIES.filter((s) => s.toneShift !== requestedTone);
  const selected = [primary, ...complementary.slice(0, 2)];

  return selected;
}

function extractTopTopics(intents: string[]): string[] {
  if (intents.length === 0) return [];

  const wordFreq: Record<string, number> = {};
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'for', 'of', 'and', 'in', 'on', 'at', 'by']);

  for (const intent of intents) {
    const words = intent.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 2 && !stopWords.has(word)) {
        wordFreq[word] = (wordFreq[word] ?? 0) + 1;
      }
    }
  }

  return Object.entries(wordFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([word]) => word);
}
