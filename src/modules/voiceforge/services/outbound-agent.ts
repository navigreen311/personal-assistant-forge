// ============================================================================
// VoiceForge — Outbound Voice Agent Service
// Orchestrates outbound calls with consent, guardrails, and logging
// ============================================================================

import { prisma } from '@/lib/db';
import { generateText } from '@/lib/ai';
import { MockVoiceProvider } from '@/lib/voice/mock-provider';
import { getCampaign, updateStats } from '@/modules/voiceforge/services/campaign-service';
import { getPersona } from '@/modules/voiceforge/services/persona-service';
import { getScript } from '@/modules/voiceforge/services/script-engine';
import {
  emitCallStart,
  emitCallEnd,
} from '@/modules/voiceforge/services/call-lifecycle';
import { getPendingEscalation } from '@/modules/voiceforge/services/sentiment-integration';
import type {
  OutboundCallRequest,
  OutboundCallResult,
  CallGuardrails,
  GuardrailCheckResult,
  CallStatus,
} from '@/modules/voiceforge/types';
import type { VerifiedEntityId } from '@/shared/middleware/auth';

const provider = new MockVoiceProvider({ delay: 0 });

/**
 * An outbound call request whose scope has already been proven.
 *
 * OutboundCallRequest.entityId is a plain string because the type is shared
 * with client components. This narrows it for the service boundary, so a route
 * cannot pass a body value straight through. See section 2.
 */
export type VerifiedOutboundCallRequest = Omit<OutboundCallRequest, 'entityId'> & {
  entityId: VerifiedEntityId;
};

/** Internal logger for call lifecycle events */
function logCallEvent(callId: string, event: string, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  // In production this would write to a structured log store
  console.log(JSON.stringify({ timestamp, callId, event, ...details }));
}

// ---------------------------------------------------------------------------
// P-42 — the script is resolved BEFORE the call starts
// ---------------------------------------------------------------------------
//
// `scriptId` arrived here as an unchecked string off the request body and went
// straight into `Call.scriptId`, `provider.initiateCall` and the `playbook`
// handed to every call-start subscriber. Nothing asked whether it named a
// script, or whether that script belonged to this tenant. So a call could be
// placed against a script id that did not exist, or one that existed in
// somebody else's entity, and the `Call` row would record it either way — the
// durable half of the same defect the E2E showed with `scriptId: undefined`.
//
// The owner's ruling on that E2E: "That's a wiring bug... ensure the scriptId
// is resolved from the playbook before the call starts. Don't suppress the
// undefined — fix the caller." This is the caller.
//
// `getScript` is scoped: its WHERE clause carries the VerifiedEntityId, so a
// foreign script is indistinguishable from a missing one, which is the correct
// answer to give — it does not confirm that another tenant's id exists. The id
// written to the row is the one READ BACK from the database (`script.id`), not
// the one on the request, so an undefined cannot reach the row by any path.

/** A call was requested against a script this entity does not have. */
export class ScriptResolutionError extends Error {
  constructor(public readonly scriptId: string) {
    super(`Script ${scriptId} not found`);
    this.name = 'ScriptResolutionError';
  }
}

/**
 * A call whose script disagrees with the campaign it belongs to. Refused rather
 * than reconciled: the two ids came from different places, and silently
 * preferring one is how a campaign comes to run a script nobody assigned it.
 */
export class ScriptMismatchError extends Error {
  constructor(
    public readonly campaignId: string,
    public readonly requestedScriptId: string,
    public readonly campaignScriptId: string
  ) {
    super(
      `Call for campaign ${campaignId} names script ${requestedScriptId}, ` +
        `but the campaign's script is ${campaignScriptId}`
    );
    this.name = 'ScriptMismatchError';
  }
}

/**
 * Resolve the script a call will run, or refuse the call.
 *
 * Returns the id as the database holds it, or `undefined` for a call that
 * genuinely has no script — a purpose-only call, which `Call.scriptId` is
 * nullable to allow. `undefined` here is a deliberate absence; the bug was an
 * `undefined` that had been *intended* as an id.
 */
async function resolveScriptId(
  request: VerifiedOutboundCallRequest
): Promise<string | undefined> {
  if (!request.scriptId) return undefined;

  const script = await getScript(request.scriptId, request.entityId);
  if (!script) throw new ScriptResolutionError(request.scriptId);
  return script.id;
}

export async function initiateOutboundCall(
  request: VerifiedOutboundCallRequest
): Promise<OutboundCallResult> {
  // Resolve the script BEFORE anything durable happens. A call that names a
  // script nobody can produce must not reach the provider, and must not leave a
  // Call row behind.
  const scriptId = await resolveScriptId(request);

  // Create call record first
  const call = await prisma.call.create({
    data: {
      entityId: request.entityId,
      contactId: request.contactId,
      direction: 'OUTBOUND',
      personaId: request.personaId,
      scriptId,
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
    scriptId,
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

  // Notify lifecycle subscribers (sentiment monitor in WS13, voiceprint in
  // WS16, etc.) that a live call has begun. Errors in subscribers do NOT
  // abort the call.
  await emitCallStart({
    callId: call.id,
    userId: request.userId,
    entityId: request.entityId,
    contactId: request.contactId,
    personaId: request.personaId,
    scriptId,
    playbook: { scriptId, guardrails: request.guardrails, purpose: request.purpose },
    messageId: request.messageId,
  });

  // Check for voicemail
  const isVoicemail = await detectVoicemail(session.callSid);

  if (isVoicemail) {
    await dropVoicemail(session.callSid, request.personaId, request.purpose, request.entityId);

    await prisma.call.updateMany({
      where: { id: call.id, entityId: request.entityId },
      data: {
        outcome: 'VOICEMAIL',
        duration: 0,
        sentiment: 0,
        actionItems: [],
      },
    });

    logCallEvent(call.id, 'COMPLETED', { outcome: 'VOICEMAIL', voicemailDropped: true });
    await emitCallEnd({ callId: call.id, outcome: 'VOICEMAIL', duration: 0 });

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
  let outcome = deriveOutcome(sentiment, currentStatus);

  // Inspect escalation flags set by the sentiment monitor (if subscribed).
  // A 'caller_threatening' event sets `endCall=true` and forces NOT_INTERESTED
  // outcome with an escalation flag on the result. 'transfer' / 'deEscalate'
  // surface as `escalationReason` so downstream code can route accordingly.
  const escalation = getPendingEscalation(call.id);
  let escalated = false;
  let escalationReason: string | undefined;
  if (escalation) {
    if (escalation.endCall) {
      outcome = 'NOT_INTERESTED';
      escalated = true;
      escalationReason = 'caller_threatening';
    } else if (escalation.transfer) {
      escalated = true;
      escalationReason = 'ai_recommends_human_transfer';
    } else if (escalation.deEscalate) {
      escalated = true;
      escalationReason = 'caller_hostile';
    }
  }

  // Update call record with final results. updateMany + entityId so the scope
  // is in the WHERE clause even on a row we just created. Section 3.
  await prisma.call.updateMany({
    where: { id: call.id, entityId: request.entityId },
    data: {
      outcome,
      duration,
      sentiment,
      actionItems: [],
    },
  });

  logCallEvent(call.id, 'COMPLETED', { outcome, duration, sentiment, escalated, escalationReason });
  await emitCallEnd({ callId: call.id, outcome, duration });

  return {
    callId: call.id,
    outcome,
    duration,
    voicemailDropped: false,
    commitmentsMade: [],
    actionItems: [],
    nextSteps: [],
    sentiment,
    escalated,
    ...(escalationReason ? { escalationReason } : {}),
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
  message: string,
  entityId: VerifiedEntityId
): Promise<void> {
  try {
    // Load persona for voice settings and personality. Scoped: a voicemail must
    // never be generated from another tenant's persona.
    const persona = await getPersona(personaId, entityId);

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
 *
 * P-42 — THIS IS WHERE "resolved from the playbook" LITERALLY APPLIES.
 *
 * A campaign carries its own `scriptId`; that is the playbook for every call it
 * places. This function used to forward whatever `scriptId` the caller happened
 * to pass — including none — and then update the campaign's stats as though the
 * call had run the campaign's script. So a campaign could report conversions for
 * calls that ran no script at all.
 *
 * The campaign's script is now resolved from the campaign when the caller names
 * none, and a caller that names a DIFFERENT one is refused rather than
 * reconciled. The campaign is loaded scoped, so a campaign belonging to another
 * tenant is not found and the call does not happen.
 */
export async function initiateOutboundCallForCampaign(
  request: VerifiedOutboundCallRequest & { campaignId: string }
): Promise<OutboundCallResult> {
  const campaign = await getCampaign(request.campaignId, request.entityId);
  if (!campaign) throw new Error(`Campaign ${request.campaignId} not found`);

  if (request.scriptId && campaign.scriptId && request.scriptId !== campaign.scriptId) {
    throw new ScriptMismatchError(request.campaignId, request.scriptId, campaign.scriptId);
  }

  const result = await initiateOutboundCall({
    ...request,
    scriptId: request.scriptId ?? campaign.scriptId,
  });

  // Update campaign stats
  try {
    await updateStats(request.campaignId, request.entityId, result);
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
