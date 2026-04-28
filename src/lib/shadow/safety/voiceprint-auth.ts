// ============================================================================
// Shadow Voiceprint Authentication
// ----------------------------------------------------------------------------
// Wires the VAF speaker-id client into Shadow's auth flow.
//
// IMPORTANT RULES (per spec section 2.2):
//   - Anti-spoof MUST short-circuit before the match check. If the sample
//     looks like a recording or AI-synthesized voice, log a HIGH-risk
//     `voiceprint_spoof_detected` auth event and return verified=false.
//   - Voiceprint is NEVER the sole gate for high-risk actions.
//     For HIGH risk: PIN is always required; voiceprint can replace SMS.
//     For MEDIUM risk: voiceprint can replace PIN.
//     For LOW risk: no auth needed.
// ============================================================================

import { prisma } from '@/lib/db';
import { VAFSpeakerID } from '@/lib/vaf/speaker-id-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionRiskLevel = 'low' | 'medium' | 'high';

export interface VoiceprintVerifyResult {
  verified: boolean;
  method: string;
  confidence: number;
  antiSpoofPassed: boolean;
}

export interface AuthRequirements {
  requirePin: boolean;
  requireSmsCode: boolean;
  requireVoiceprint: boolean;
}

/**
 * Subset of ShadowSafetyConfig that this helper actually reads.
 * Kept loose so it can accept the full Prisma model or a small fixture.
 */
export interface SafetyConfigInput {
  voicePin?: string | null;
  requirePinForFinancial?: boolean;
  requirePinForExternal?: boolean;
  requirePinForCrisis?: boolean;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let speakerIDClient: VAFSpeakerID | null = null;

function getSpeakerIDClient(): VAFSpeakerID {
  if (!speakerIDClient) {
    speakerIDClient = new VAFSpeakerID();
  }
  return speakerIDClient;
}

/**
 * Test/dependency-injection seam. Resets to a freshly-constructed client
 * by default; pass an instance to override.
 */
export function __setSpeakerIDClientForTesting(client: VAFSpeakerID | null): void {
  speakerIDClient = client;
}

// ---------------------------------------------------------------------------
// verifyVoiceprint — main entry point used by the verify API route
// ---------------------------------------------------------------------------

export async function verifyVoiceprint(
  userId: string,
  audioSample: Buffer,
  actionRiskLevel: ActionRiskLevel,
): Promise<VoiceprintVerifyResult> {
  // 1. Confirm the user has an active voiceprint enrollment.
  const enrollment = await prisma.shadowTrustedDevice.findFirst({
    where: { userId, deviceType: 'voiceprint', isActive: true },
  });

  if (!enrollment) {
    return {
      verified: false,
      method: 'voiceprint_not_enrolled',
      confidence: 0,
      antiSpoofPassed: false,
    };
  }

  // 2. Run the VAF verification.
  const result = await getSpeakerIDClient().verify(userId, audioSample);

  // 3. Anti-spoof short-circuit. MUST run before the match check.
  if (!result.antiSpoofResult.isLiveVoice || !result.antiSpoofResult.isNotSynthesized) {
    await prisma.shadowAuthEvent.create({
      data: {
        userId,
        method: 'voiceprint',
        result: 'fail',
        riskLevel: 'high',
        actionAttempted: 'voiceprint_spoof_detected',
      },
    });

    return {
      verified: false,
      method: 'voiceprint_spoof_detected',
      confidence: 0,
      antiSpoofPassed: false,
    };
  }

  // 4. Match check. Use the threshold returned by VAF (default 0.85).
  if (result.match && result.confidence >= result.threshold) {
    await prisma.shadowAuthEvent.create({
      data: {
        userId,
        method: 'voiceprint',
        result: 'pass',
        riskLevel: actionRiskLevel,
        actionAttempted: 'voiceprint_verified',
      },
    });

    return {
      verified: true,
      method: 'voiceprint',
      confidence: result.confidence,
      antiSpoofPassed: true,
    };
  }

  // 5. Live voice but not a match.
  await prisma.shadowAuthEvent.create({
    data: {
      userId,
      method: 'voiceprint',
      result: 'fail',
      riskLevel: actionRiskLevel,
      actionAttempted: 'voiceprint_mismatch',
    },
  });

  return {
    verified: false,
    method: 'voiceprint_mismatch',
    confidence: result.confidence,
    antiSpoofPassed: true,
  };
}

// ---------------------------------------------------------------------------
// getAuthRequirements — auth-matrix lookup used by Shadow's risk gate
// ---------------------------------------------------------------------------

export function getAuthRequirements(
  actionRiskLevel: ActionRiskLevel,
  voiceprintVerified: boolean,
  _safetyConfig?: SafetyConfigInput | null,
): AuthRequirements {
  if (actionRiskLevel === 'low') {
    return { requirePin: false, requireSmsCode: false, requireVoiceprint: false };
  }

  if (actionRiskLevel === 'medium') {
    if (voiceprintVerified) {
      return { requirePin: false, requireSmsCode: false, requireVoiceprint: false };
    }
    return { requirePin: true, requireSmsCode: false, requireVoiceprint: false };
  }

  // HIGH RISK — PIN is always required; voiceprint can replace SMS only.
  return {
    requirePin: true,
    requireSmsCode: !voiceprintVerified,
    requireVoiceprint: false,
  };
}
