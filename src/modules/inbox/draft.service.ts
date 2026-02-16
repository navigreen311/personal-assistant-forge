import { prisma } from '@/lib/db';
import { generateText, chat } from '@/lib/ai';
import type { Tone } from '@/shared/types';
import type { DraftRequest, DraftResponse, MessageIntent } from './inbox.types';

// --- Tone configuration ---

interface ToneConfig {
  greeting: string;
  closing: string;
  formalityLevel: 'high' | 'medium' | 'low';
  wordChoices: Record<string, string>;
}

const TONE_CONFIGS: Record<Tone, ToneConfig> = {
  FORMAL: {
    greeting: 'Dear',
    closing: 'Sincerely',
    formalityLevel: 'high',
    wordChoices: {
      get: 'obtain',
      help: 'assist',
      ask: 'inquire',
      tell: 'inform',
      need: 'require',
      give: 'provide',
      start: 'commence',
      end: 'conclude',
    },
  },
  DIPLOMATIC: {
    greeting: 'Dear',
    closing: 'Best regards',
    formalityLevel: 'high',
    wordChoices: {
      problem: 'concern',
      wrong: 'not quite aligned',
      disagree: 'see it differently',
      no: 'perhaps we could explore alternatives',
      bad: 'less than ideal',
      fail: 'not meet expectations',
    },
  },
  WARM: {
    greeting: 'Hi',
    closing: 'Warmly',
    formalityLevel: 'medium',
    wordChoices: {
      inform: 'let you know',
      request: 'ask',
      respond: 'get back to you',
    },
  },
  DIRECT: {
    greeting: 'Hi',
    closing: 'Regards',
    formalityLevel: 'medium',
    wordChoices: {},
  },
  CASUAL: {
    greeting: 'Hey',
    closing: 'Cheers',
    formalityLevel: 'low',
    wordChoices: {
      regarding: 'about',
      inquire: 'ask',
      obtain: 'get',
      provide: 'give',
      commence: 'start',
    },
  },
  FIRM: {
    greeting: 'Dear',
    closing: 'Regards',
    formalityLevel: 'high',
    wordChoices: {
      maybe: 'will',
      might: 'will',
      could: 'need to',
      hope: 'expect',
    },
  },
  EMPATHETIC: {
    greeting: 'Hi',
    closing: 'Take care',
    formalityLevel: 'medium',
    wordChoices: {
      problem: 'situation',
      wrong: 'challenging',
      issue: 'concern',
    },
  },
  AUTHORITATIVE: {
    greeting: 'Dear',
    closing: 'Regards',
    formalityLevel: 'high',
    wordChoices: {
      think: 'recommend',
      maybe: 'advise',
      try: 'implement',
    },
  },
};

// --- Intent-based response templates ---

const RESPONSE_TEMPLATES: Partial<Record<MessageIntent, string[]>> = {
  INQUIRY: [
    'Thank you for your question. {{response_body}}',
    'Great question. {{response_body}}',
    'I appreciate you reaching out. {{response_body}}',
  ],
  REQUEST: [
    'Thank you for your request. {{response_body}}',
    'I have received your request and {{response_body}}',
    "I'll take care of this. {{response_body}}",
  ],
  URGENT: [
    'I understand the urgency. {{response_body}}',
    "I'm on it right away. {{response_body}}",
    'This is my top priority. {{response_body}}',
  ],
  COMPLAINT: [
    'I sincerely apologize for the inconvenience. {{response_body}}',
    'I understand your frustration, and I want to help resolve this. {{response_body}}',
    'Thank you for bringing this to my attention. {{response_body}}',
  ],
  FINANCIAL: [
    'Regarding your financial inquiry, {{response_body}}',
    'I have reviewed the financial details. {{response_body}}',
    'Thank you for the financial information. {{response_body}}',
  ],
  SCHEDULING: [
    "I'd be happy to arrange a time. {{response_body}}",
    'Let me check availability. {{response_body}}',
    'Regarding scheduling, {{response_body}}',
  ],
  FOLLOW_UP: [
    'Thank you for following up. {{response_body}}',
    'I appreciate your patience. {{response_body}}',
    'Here is an update on the matter. {{response_body}}',
  ],
  APPROVAL: [
    'I have reviewed the request. {{response_body}}',
    'Regarding the approval, {{response_body}}',
    'I have considered the matter. {{response_body}}',
  ],
  FYI: [
    'Thank you for the information. {{response_body}}',
    'Noted. {{response_body}}',
    'I appreciate the update. {{response_body}}',
  ],
  UPDATE: [
    'Thank you for the update. {{response_body}}',
    'I appreciate being kept in the loop. {{response_body}}',
  ],
  INTRODUCTION: [
    'Nice to meet you! {{response_body}}',
    'Thank you for the introduction. {{response_body}}',
  ],
  SOCIAL: [
    'Thank you! {{response_body}}',
    'I appreciate your kind words. {{response_body}}',
  ],
};

const DEFAULT_RESPONSE_BODIES: Partial<Record<MessageIntent, string>> = {
  INQUIRY:
    'I will look into this and get back to you with the information you need.',
  REQUEST:
    'I will work on this and keep you posted on progress.',
  URGENT:
    'I will address this immediately and follow up with next steps shortly.',
  COMPLAINT:
    'I will investigate this matter and ensure it is resolved promptly.',
  FINANCIAL:
    'I will review the details and respond with the necessary information.',
  SCHEDULING:
    'I will review available times and share some options with you.',
  FOLLOW_UP:
    'Things are progressing well. I will share a detailed update shortly.',
  APPROVAL:
    'I will review all the details and provide my decision shortly.',
  FYI: 'I will keep this in mind going forward.',
  UPDATE: 'I will factor this into our current plans.',
  INTRODUCTION:
    'I look forward to working together.',
  SOCIAL: 'That means a lot.',
};

const ALTERNATIVE_TONES: Record<Tone, Tone[]> = {
  FORMAL: ['DIPLOMATIC', 'DIRECT'],
  DIPLOMATIC: ['WARM', 'FORMAL'],
  WARM: ['CASUAL', 'EMPATHETIC'],
  DIRECT: ['FORMAL', 'FIRM'],
  CASUAL: ['WARM', 'DIRECT'],
  FIRM: ['AUTHORITATIVE', 'DIRECT'],
  EMPATHETIC: ['WARM', 'DIPLOMATIC'],
  AUTHORITATIVE: ['FIRM', 'FORMAL'],
};

export class DraftService {
  async generateDraft(request: DraftRequest): Promise<DraftResponse> {
    const message = await prisma.message.findUnique({
      where: { id: request.messageId },
    });

    if (!message) {
      throw new Error(`Message not found: ${request.messageId}`);
    }

    // Determine tone
    const tone = request.tone ?? 'FORMAL';
    const toneConfig = TONE_CONFIGS[tone];

    // Detect intent from original message
    const intent = this.detectIntent(message.body, message.subject ?? undefined);

    // Add disclaimers if needed
    const complianceNotes: string[] = [];
    if (request.includeDisclaimer) {
      const disclaimers = await this.getDisclaimers(request.entityId);
      complianceNotes.push(...disclaimers);
    }

    let draftBody: string;
    let alternatives: { tone: Tone; body: string }[] = [];
    let confidenceScore = 0.7;

    try {
      // Build AI prompt with full context
      const constraintsText = request.constraints?.length
        ? `\nConstraints: ${request.constraints.join('; ')}`
        : '';
      const disclaimerText = complianceNotes.length > 0
        ? `\nInclude this compliance disclaimer at the end: ${complianceNotes.join(' | ')}`
        : '';
      const maxLengthText = request.maxLength
        ? `\nMaximum length: ${request.maxLength} characters.`
        : '';

      const prompt = `Write a reply to the following message.

Original message subject: ${message.subject ?? '(none)'}
Original message body: ${message.body}

Tone: ${tone} (formality level: ${toneConfig.formalityLevel})
Intent of reply: ${request.intent ?? 'Respond appropriately to the message'}${constraintsText}${disclaimerText}${maxLengthText}

Write only the reply body text. Do not include subject lines or metadata.`;

      draftBody = await generateText(prompt, {
        maxTokens: 1024,
        temperature: 0.7,
        system: `You are a professional communication assistant. Write in a ${tone.toLowerCase()} tone. Be concise and appropriate.`,
      });

      // Generate alternative drafts with different tones
      const altTones = ALTERNATIVE_TONES[tone] ?? ['FORMAL', 'CASUAL'];
      const altPromises = altTones.slice(0, 2).map(async (altTone) => {
        const altConfig = TONE_CONFIGS[altTone];
        const altBody = await generateText(prompt.replace(
          `Tone: ${tone} (formality level: ${toneConfig.formalityLevel})`,
          `Tone: ${altTone} (formality level: ${altConfig.formalityLevel})`
        ), {
          maxTokens: 1024,
          temperature: 0.7,
          system: `You are a professional communication assistant. Write in a ${altTone.toLowerCase()} tone. Be concise and appropriate.`,
        });
        return { tone: altTone, body: altBody };
      });
      alternatives = await Promise.all(altPromises);
      confidenceScore = 0.85;

      console.log(`[DraftService] AI draft generated for message ${request.messageId}`);
    } catch (aiError) {
      console.warn(`[DraftService] AI draft generation failed, using template fallback:`, aiError);

      // Fall back to template-based generation
      draftBody = this.buildDraft(
        intent,
        tone,
        message.body,
        request.intent,
        request.constraints,
        request.maxLength
      );

      const altTones = ALTERNATIVE_TONES[tone] ?? ['FORMAL', 'CASUAL'];
      alternatives = altTones.slice(0, 2).map((altTone) => ({
        tone: altTone,
        body: this.buildDraft(
          intent,
          altTone,
          message.body,
          request.intent,
          request.constraints,
          request.maxLength
        ),
      }));
    }

    const bodyWithDisclaimer =
      complianceNotes.length > 0
        ? `${draftBody}\n\n---\n${complianceNotes.join('\n')}`
        : draftBody;

    // Suggest subject for reply
    const suggestedSubject = message.subject
      ? `Re: ${message.subject.replace(/^Re:\s*/i, '')}`
      : undefined;

    return {
      messageId: request.messageId,
      draftBody: bodyWithDisclaimer,
      tone,
      confidenceScore,
      complianceNotes,
      suggestedSubject,
      alternatives,
    };
  }

  async generateFromTemplate(
    cannedResponseId: string,
    variables: Record<string, string>,
    customizations?: Partial<DraftRequest>
  ): Promise<DraftResponse> {
    // We store canned responses in memory (since no DB model for them)
    // For now, return a template-based response
    const tone = customizations?.tone ?? 'FORMAL';

    // Substitute variables in a placeholder body
    let body = `[Canned response ${cannedResponseId}]`;

    for (const [key, value] of Object.entries(variables)) {
      body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    return {
      messageId: customizations?.messageId ?? '',
      draftBody: body,
      tone,
      confidenceScore: 0.9,
      complianceNotes: [],
      alternatives: [],
    };
  }

  async refineDraft(
    draftBody: string,
    feedback: string,
    tone?: Tone
  ): Promise<DraftResponse> {
    const targetTone = tone ?? 'FORMAL';
    let refined: string;

    try {
      refined = await chat([
        {
          role: 'user',
          content: `Here is a draft message I need you to refine:\n\n${draftBody}\n\nFeedback: ${feedback}`,
        },
      ], {
        maxTokens: 1024,
        temperature: 0.7,
        system: `You are a professional communication assistant. Refine the draft based on the feedback. Use a ${targetTone.toLowerCase()} tone. Return only the refined message body, no explanations.`,
      });
      console.log('[DraftService] AI refinement completed');
    } catch (aiError) {
      console.warn('[DraftService] AI refinement failed, using heuristic fallback:', aiError);

      // Fall back to heuristic-based refinement
      refined = this.applyTone(draftBody, targetTone);
      const feedbackLower = feedback.toLowerCase();
      if (feedbackLower.includes('shorter') || feedbackLower.includes('concise')) {
        const sentences = refined.split(/\.\s+/);
        const keep = Math.max(1, Math.ceil(sentences.length * 0.66));
        refined = sentences.slice(0, keep).join('. ');
        if (!refined.endsWith('.')) refined += '.';
      }
      if (feedbackLower.includes('longer') || feedbackLower.includes('elaborate')) {
        refined +=
          ' I would be happy to discuss this further at your convenience. Please do not hesitate to reach out if you have any additional questions.';
      }
      if (feedbackLower.includes('friendlier') || feedbackLower.includes('warmer')) {
        refined = this.applyTone(refined, 'WARM');
      }
      if (feedbackLower.includes('more formal') || feedbackLower.includes('professional')) {
        refined = this.applyTone(refined, 'FORMAL');
      }
    }

    const altTones = ALTERNATIVE_TONES[targetTone] ?? ['FORMAL', 'CASUAL'];
    const alternatives = altTones.slice(0, 2).map((altTone) => ({
      tone: altTone,
      body: this.applyTone(draftBody, altTone),
    }));

    return {
      messageId: '',
      draftBody: refined,
      tone: targetTone,
      confidenceScore: 0.65,
      complianceNotes: [],
      alternatives,
    };
  }

  applyTone(body: string, tone: Tone): string {
    const config = TONE_CONFIGS[tone];
    if (!config) return body;

    let result = body;
    for (const [original, replacement] of Object.entries(config.wordChoices)) {
      result = result.replace(new RegExp(`\\b${original}\\b`, 'gi'), replacement);
    }

    return result;
  }

  async getDisclaimers(entityId: string): Promise<string[]> {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
    });

    if (!entity) return [];

    const disclaimers: string[] = [];
    const profiles = entity.complianceProfile ?? [];

    if (profiles.includes('HIPAA')) {
      disclaimers.push(
        'CONFIDENTIALITY NOTICE: This communication may contain protected health information (PHI) subject to HIPAA regulations. If you are not the intended recipient, please notify the sender immediately and delete this message.'
      );
    }
    if (profiles.includes('GDPR')) {
      disclaimers.push(
        'This message may contain personal data processed under GDPR. For data subject rights, contact our Data Protection Officer.'
      );
    }
    if (profiles.includes('SOX') || profiles.includes('SEC')) {
      disclaimers.push(
        'This communication may contain material non-public information. Trading on or sharing such information may violate federal securities laws.'
      );
    }
    if (disclaimers.length === 0) {
      disclaimers.push(
        'This message is confidential and intended solely for the addressee. If you received this in error, please notify the sender and delete it.'
      );
    }

    return disclaimers;
  }

  private detectIntent(body: string, subject?: string): MessageIntent {
    const text = `${subject ?? ''} ${body}`.toLowerCase();

    if (['urgent', 'asap', 'emergency', 'immediately'].some((kw) => text.includes(kw)))
      return 'URGENT';
    if (['approve', 'sign off', 'authorization'].some((kw) => text.includes(kw)))
      return 'APPROVAL';
    if (['invoice', 'payment', 'billing', '$'].some((kw) => text.includes(kw)))
      return 'FINANCIAL';
    if (
      ['disappointed', 'frustrated', 'unacceptable'].some((kw) =>
        text.includes(kw)
      )
    )
      return 'COMPLAINT';
    if (['schedule', 'meet', 'call', 'calendar'].some((kw) => text.includes(kw)))
      return 'SCHEDULING';
    if (
      ['following up', 'circling back', 'any update'].some((kw) =>
        text.includes(kw)
      )
    )
      return 'FOLLOW_UP';
    if (['please', 'could you', 'need you to'].some((kw) => text.includes(kw)))
      return 'REQUEST';
    if (text.includes('?')) return 'INQUIRY';

    return 'UPDATE';
  }

  private buildDraft(
    intent: MessageIntent,
    tone: Tone,
    originalBody: string,
    userIntent?: string,
    constraints?: string[],
    maxLength?: number
  ): string {
    const config = TONE_CONFIGS[tone];
    const templates = RESPONSE_TEMPLATES[intent] ?? RESPONSE_TEMPLATES.UPDATE!;
    const template = templates[0];
    const responseBody =
      userIntent ?? DEFAULT_RESPONSE_BODIES[intent] ?? 'I will follow up shortly.';

    let draft = template.replace('{{response_body}}', responseBody);

    // Wrap with greeting and closing
    draft = `${config.greeting},\n\n${draft}\n\n${config.closing}`;

    // Apply tone word choices
    draft = this.applyTone(draft, tone);

    // Apply constraints
    if (constraints?.length) {
      for (const constraint of constraints) {
        if (constraint.toLowerCase().startsWith('avoid:')) {
          const avoid = constraint.substring(6).trim();
          draft = draft.replace(new RegExp(avoid, 'gi'), '');
        }
      }
    }

    // Enforce max length
    if (maxLength && draft.length > maxLength) {
      draft = draft.substring(0, maxLength - 3) + '...';
    }

    return draft;
  }
}
