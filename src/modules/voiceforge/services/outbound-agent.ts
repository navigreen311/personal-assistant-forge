// ============================================================================
// VoiceForge — Outbound Voice Agent Service
// Orchestrates outbound calls with consent, guardrails, and logging
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
import { MockVoiceProvider } from '@/lib/voice/mock-provider';
import { checkConsentRequirements, verifyConsent } from '@/lib/voice/consent-manager';
import { updateStats } from '@/modules/voiceforge/services/campaign-service';
import type {
  OutboundCallRequest,
  OutboundCallResult,
  CallGuardrails,
  GuardrailCheckResult,
} from '@/modules/voiceforge/types';

const provider = new MockVoiceProvider({ delay: 0 });

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

  // Simulate call completion (in reality this would be async with webhooks)
  const duration = Math.floor(Math.random() * 180) + 30;
  const sentiment = Math.random() * 2 - 1; // -1 to 1
  const outcome = sentiment > 0.3 ? 'INTERESTED' : sentiment < -0.3 ? 'NOT_INTERESTED' : 'CONNECTED';

  // Update call record
  await prisma.call.update({
    where: { id: call.id },
    data: {
      outcome,
      duration,
      sentiment,
      actionItems: [],
    },
  });

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
 * Placeholder: detect voicemail (real implementation would use audio analysis)
 */
export async function detectVoicemail(_callSid: string): Promise<boolean> {
  return false;
}

/**
 * Placeholder: drop voicemail message
 */
export async function dropVoicemail(
  _callSid: string,
  _personaId: string,
  _message: string
): Promise<void> {
  // Placeholder implementation
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
