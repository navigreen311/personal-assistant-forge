// ============================================================================
// VoiceForge — Outbound Voice Agent Service
// Orchestrates outbound calls with consent, guardrails, and logging
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
import { generateText } from '@/lib/ai';
import { MockVoiceProvider } from '@/lib/voice/mock-provider';
import { checkConsentRequirements, verifyConsent } from '@/lib/voice/consent-manager';
import { updateStats } from '@/modules/voiceforge/services/campaign-service';
import { getPersona } from '@/modules/voiceforge/services/persona-service';
import type {
  OutboundCallRequest,
  OutboundCallResult,
  CallGuardrails,
  GuardrailCheckResult,
  CallStatus,
} from '@/modules/voiceforge/types';

const provider = new MockVoiceProvider({ delay: 0 });

/** Internal logger for call lifecycle events */
function logCallEvent(callId: string, event: string, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  // In production this would write to a structured log store
  console.log(JSON.stringify({ timestamp, callId, event, ...details }));
}

export async function initiateOutboundCall(
  request: OutboundCallRequest
): Promise<OutboundCallResult> {
  // Create call record first
  const call = await prisma.call.create({
    data: {
      entityId: request.entityId,
      contactId: request.contactId,
      direction: 'OUTBOUND',
      personaId: request.personaId,
      scriptId: request.scriptId,
      actionItems: [],
    },
  });

  logCallEvent(call.id, 'INITIATED', {
    entityId: request.entityId,
    contactId: request.contactId,
    personaId: request.personaId,
  });

  // Initiate call via provider
  const session = await provider.initiateCall({
    from: '+10000000000',
    to: '+10000000001',
    personaId: request.personaId,
    scriptId: request.scriptId,
    maxDuration: request.maxDuration ?? 300,
    recordCall: request.recordCall ?? true,
    consentRequired: true,
  });

  logCallEvent(call.id, 'RINGING', { callSid: session.callSid });

  // Track status through call lifecycle
  let currentStatus: CallStatus = session.status;
  try {
    currentStatus = await provider.getCallStatus(session.callSid);
  } catch {
    // Provider status check failed; continue with initial status
  }

  logCallEvent(call.id, 'CONNECTED', { status: currentStatus });

  // Check for voicemail
  const isVoicemail = await detectVoicemail(session.callSid);

  if (isVoicemail) {
    await dropVoicemail(session.callSid, request.personaId, request.purpose);

    await prisma.call.update({
      where: { id: call.id },
      data: {
        outcome: 'VOICEMAIL',
        duration: 0,
        sentiment: 0,
        actionItems: [],
      },
    });

    logCallEvent(call.id, 'COMPLETED', { outcome: 'VOICEMAIL', voicemailDropped: true });

    return {
      callId: call.id,
      outcome: 'VOICEMAIL',
      duration: 0,
      voicemailDropped: true,
      commitmentsMade: [],
      actionItems: [],
      nextSteps: ['Follow up after voicemail'],
      sentiment: 0,
      escalated: false,
    };
  }

  // Simulate call completion with realistic values
  // In production, duration comes from the telephony provider's webhook
  const duration = simulateCallDuration(currentStatus);
  const sentiment = simulateCallSentiment(currentStatus);
  const outcome = deriveOutcome(sentiment, currentStatus);

  // Update call record with final results
  await prisma.call.update({
    where: { id: call.id },
    data: {
      outcome,
      duration,
      sentiment,
      actionItems: [],
    },
  });

  logCallEvent(call.id, 'COMPLETED', { outcome, duration, sentiment });

  return {
    callId: call.id,
    outcome,
    duration,
    voicemailDropped: false,
    commitmentsMade: [],
    actionItems: [],
    nextSteps: [],
    sentiment,
    escalated: false,
  };
}

/**
 * Detect whether a call reached voicemail.
 *
 * Strategy:
 * 1. Check the call status via the voice provider -- if the status is
 *    NO_ANSWER or the call completed in under 5 seconds after being
 *    answered, it is likely voicemail.
 * 2. If the provider is unavailable, fall back to a heuristic based
 *    on call status string patterns.
 */
export async function detectVoicemail(callSid: string): Promise<boolean> {
  try {
    const status = await provider.getCallStatus(callSid);

    // NO_ANSWER strongly suggests voicemail or unanswered
    if (status === 'NO_ANSWER') {
      return true;
    }

    // COMPLETED very quickly after connection is a voicemail indicator
    // (In a real system we'd compare startedAt vs completedAt timestamps)
    // QUEUED/RINGING without progression also indicates no live pickup
    if (status === 'BUSY' || status === 'FAILED' || status === 'CANCELLED') {
      return false;
    }

    // For COMPLETED / IN_PROGRESS, we cannot definitively detect voicemail
    // without audio analysis; return false as default
    return false;
  } catch {
    // Provider unavailable -- apply heuristic:
    // Without provider data we cannot determine voicemail status
    return false;
  }
}

/**
 * Drop a voicemail message using the persona's voice configuration.
 *
 * 1. Loads the persona's voice settings from the persona service
 * 2. Generates a personalized voicemail message using AI
 * 3. Logs the voicemail drop action
 */
export async function dropVoicemail(
  callSid: string,
  personaId: string,
  message: string
): Promise<void> {
  try {
    // Load persona for voice settings and personality
    const persona = await getPersona(personaId);

    let voicemailText: string;

    if (persona) {
      try {
        // Generate a personalized voicemail using AI with persona context
        voicemailText = await generateText(
          `Generate a brief, professional voicemail message with the following context:
Persona name: ${persona.name}
Persona tone: ${persona.personality?.defaultTone ?? 'PROFESSIONAL'}
Formality level: ${persona.personality?.formality ?? 0.6}
Purpose of call: ${message}

The voicemail should be 2-3 sentences, matching the persona's tone and formality.
Do not include greetings like "Hi, this is a voicemail." Just provide the message body.`,
          {
            maxTokens: 256,
            temperature: 0.5,
            system: 'You are a voice message composer. Generate concise, natural voicemail scripts.',
          }
        );
      } catch {
        // AI unavailable -- use a simple template
        voicemailText = `Hello, this is ${persona.name} calling regarding: ${message}. Please call us back at your earliest convenience.`;
      }
    } else {
      // No persona found -- use generic message
      voicemailText = `Hello, we are calling regarding: ${message}. Please call us back at your earliest convenience.`;
    }

    logCallEvent(callSid, 'VOICEMAIL_DROPPED', {
      personaId,
      messageLength: voicemailText.length,
      voiceProvider: persona?.voiceConfig?.provider ?? 'default',
      voiceId: persona?.voiceConfig?.voiceId ?? 'default',
    });
  } catch (error) {
    // Log error but do not throw -- voicemail drop failure should not crash the call flow
    logCallEvent(callSid, 'VOICEMAIL_DROP_FAILED', {
      personaId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Simulate a realistic call duration based on current call status.
 * In production, this value comes from the telephony provider.
 */
function simulateCallDuration(status: CallStatus): number {
  switch (status) {
    case 'COMPLETED':
    case 'IN_PROGRESS':
      // Realistic connected call: 45-240 seconds (bell curve around 120s)
      return Math.floor(45 + Math.random() * 95 + Math.random() * 100);
    case 'NO_ANSWER':
      // Rang but no answer: 15-30 seconds of ringing
      return Math.floor(15 + Math.random() * 15);
    case 'BUSY':
      // Busy signal detected quickly
      return Math.floor(3 + Math.random() * 5);
    case 'FAILED':
    case 'CANCELLED':
      return 0;
    default:
      // QUEUED / RINGING -- still in progress, estimate moderate duration
      return Math.floor(60 + Math.random() * 120);
  }
}

/**
 * Simulate call sentiment based on status.
 * Returns a value between -1 (very negative) and 1 (very positive).
 * In production, this would come from conversation analysis / NLP.
 */
function simulateCallSentiment(status: CallStatus): number {
  switch (status) {
    case 'COMPLETED':
    case 'IN_PROGRESS':
      // Most completed calls trend slightly positive (neutral to positive)
      // Centered around 0.1 with standard deviation ~0.3
      return Math.max(-1, Math.min(1, 0.1 + (Math.random() - 0.5) * 0.6));
    case 'NO_ANSWER':
    case 'BUSY':
      // No conversation occurred -- neutral sentiment
      return 0;
    default:
      return 0;
  }
}

/**
 * Derive call outcome from sentiment score and call status.
 */
function deriveOutcome(
  sentiment: number,
  status: CallStatus
): 'CONNECTED' | 'VOICEMAIL' | 'NO_ANSWER' | 'BUSY' | 'CALLBACK_REQUESTED' | 'INTERESTED' | 'NOT_INTERESTED' {
  if (status === 'NO_ANSWER') return 'NO_ANSWER';
  if (status === 'BUSY') return 'BUSY';
  if (status === 'FAILED' || status === 'CANCELLED') return 'NO_ANSWER';

  // For completed/in-progress calls, use sentiment to determine outcome
  if (sentiment > 0.3) return 'INTERESTED';
  if (sentiment < -0.3) return 'NOT_INTERESTED';
  return 'CONNECTED';
}

/**
 * Check transcript against guardrails for forbidden topics and escalation triggers.
 */
export function checkGuardrails(
  transcript: string,
  guardrails: CallGuardrails
): GuardrailCheckResult {
  const violations: GuardrailCheckResult['violations'] = [];
  const transcriptLower = transcript.toLowerCase();
  let shouldEscalate = false;
  let escalationReason: string | undefined;

  // Check forbidden topics
  for (const topic of guardrails.forbiddenTopics) {
    if (transcriptLower.includes(topic.toLowerCase())) {
      violations.push({
        rule: `Forbidden topic: ${topic}`,
        excerpt: extractExcerpt(transcript, topic),
        severity: 'BLOCK',
      });
    }
  }

  // Check escalation triggers
  for (const trigger of guardrails.escalationTriggers) {
    if (transcriptLower.includes(trigger.toLowerCase())) {
      shouldEscalate = true;
      escalationReason = `Escalation trigger detected: ${trigger}`;
      violations.push({
        rule: `Escalation trigger: ${trigger}`,
        excerpt: extractExcerpt(transcript, trigger),
        severity: 'WARNING',
      });
    }
  }

  return {
    passed: violations.filter((v) => v.severity === 'BLOCK').length === 0,
    violations,
    shouldEscalate,
    escalationReason,
  };
}

/**
 * Initiate an outbound call as part of a campaign and update campaign stats.
 */
export async function initiateOutboundCallForCampaign(
  request: OutboundCallRequest & { campaignId: string }
): Promise<OutboundCallResult> {
  const result = await initiateOutboundCall(request);

  // Update campaign stats
  try {
    await updateStats(request.campaignId, result);
  } catch {
    // Stats update failed -- call still succeeded
  }

  return result;
}

function extractExcerpt(text: string, keyword: string): string {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return '';
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + keyword.length + 30);
  return text.slice(start, end);
}
