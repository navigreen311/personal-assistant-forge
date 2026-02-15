// ============================================================================
// VoiceForge — Consent Manager
// Handles recording consent based on US state laws
// ============================================================================

import { prisma } from '@/lib/db';
import type { ConsentCheck } from './types';

// The 12 US states that require two-party (all-party) consent for recording
const TWO_PARTY_CONSENT_STATES = new Set([
  'CA', 'CT', 'FL', 'IL', 'MD', 'MA', 'MI', 'MT', 'NV', 'NH', 'PA', 'WA',
]);

/**
 * Check consent requirements based on caller and recipient state.
 * If either party is in a two-party consent state, two-party consent is required.
 */
export function checkConsentRequirements(
  callerState: string,
  recipientState: string
): ConsentCheck {
  const callerUpperCase = callerState.toUpperCase();
  const recipientUpperCase = recipientState.toUpperCase();

  const callerTwoParty = TWO_PARTY_CONSENT_STATES.has(callerUpperCase);
  const recipientTwoParty = TWO_PARTY_CONSENT_STATES.has(recipientUpperCase);

  if (callerTwoParty || recipientTwoParty) {
    const jurisdiction = callerTwoParty ? callerUpperCase : recipientUpperCase;
    return {
      allowed: false,
      reason: `Two-party consent required: ${jurisdiction} is a two-party consent state`,
      consentType: 'TWO_PARTY',
      jurisdiction,
      recordingAllowed: false,
    };
  }

  return {
    allowed: true,
    reason: 'One-party consent: both states allow single-party consent recording',
    consentType: 'ONE_PARTY',
    jurisdiction: `${callerUpperCase}/${recipientUpperCase}`,
    recordingAllowed: true,
  };
}

/**
 * Record a consent receipt in the database.
 */
export async function recordConsent(
  callId: string,
  contactId: string,
  consentType: string
) {
  const receipt = await prisma.consentReceipt.create({
    data: {
      actionId: callId,
      description: `Recording consent for call ${callId}`,
      reason: `${consentType} consent obtained from contact ${contactId}`,
      impacted: [contactId],
      reversible: true,
      confidence: 1.0,
    },
  });
  return receipt;
}

/**
 * Verify that consent exists for a given call.
 */
export async function verifyConsent(callId: string) {
  const receipt = await prisma.consentReceipt.findFirst({
    where: { actionId: callId },
  });
  return {
    valid: receipt !== null,
    receipt,
  };
}

/**
 * Revoke a consent receipt.
 */
export async function revokeConsent(receiptId: string): Promise<void> {
  await prisma.consentReceipt.update({
    where: { id: receiptId },
    data: {
      reversible: false,
      rollbackLink: `revoked:${new Date().toISOString()}`,
    },
  });
}
