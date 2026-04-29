// ============================================================================
// Shadow Action Gate — Voiceprint decision matrix
// ----------------------------------------------------------------------------
// Centralizes the per-action decision: should we show the voiceprint capture
// modal as a substitute for the legacy PIN/SMS prompts?
//
// The result `requireVoiceprintCapture: true` is ONLY returned when ALL of
// the following hold:
//   1. The user is enrolled (a `shadowTrustedDevice` row exists with
//      `deviceType: 'voiceprint'` and `isActive: true`).
//   2. `vafIntegrationConfig.voiceprintUseForAuth === true`.
//   3. The action's risk level is `medium` (where voiceprint replaces PIN)
//      or `high` (where voiceprint replaces SMS — PIN is still mandatory
//      and is collected separately).
//
// For low risk we always return false: per spec section 2.2 low-risk
// actions need no auth at all, so there is nothing to replace.
//
// IMPORTANT: This helper is decision-only. It does NOT itself verify the
// voiceprint — callers post audio to /api/shadow/voiceprint/verify (which
// runs anti-spoof + match) and forward the verified flag back into the
// existing auth pipeline (`ShadowAuthManager.determineAuthRequired`).
// ============================================================================

import { prisma } from '@/lib/db';
import { getVafConfig } from '@/lib/shadow/vaf-config';
import type { ActionRiskLevel } from '@/lib/shadow/safety/voiceprint-auth';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GateActionParams {
  userId: string;
  actionRiskLevel: ActionRiskLevel;
  /**
   * Whether the calling surface believes voiceprint capture is feasible
   * here (microphone permission, browser support, network online, etc.).
   * If false, the gate short-circuits to PIN — even when the user is
   * enrolled and opted in.
   */
  voiceprintAvailable: boolean;
}

export interface GateActionResult {
  /**
   * If true, callers should show the `<VoiceprintActionCapture />` modal
   * BEFORE falling through to the legacy PIN prompt. On `onVerified`,
   * the existing auth pipeline accepts voiceprint as a PIN/SMS substitute
   * per the spec section 2.2 matrix. On `onFallback`, callers proceed
   * with the legacy PIN flow.
   */
  requireVoiceprintCapture: boolean;
  /**
   * Human-readable explanation of WHY the gate decided as it did. Useful
   * for QA, server logs, and the demo page. Never shown to end users.
   */
  reason: string;
}

// ---------------------------------------------------------------------------
// gateActionWithVoiceprint
// ---------------------------------------------------------------------------

/**
 * Decide whether to capture a voiceprint sample for this action. See the
 * file header for the full matrix.
 *
 * Server-only — reads prisma + getVafConfig. Callers in client components
 * should call this through a thin API surface (e.g., a server action or a
 * Route Handler), never bundle it into the browser.
 */
export async function gateActionWithVoiceprint(
  params: GateActionParams,
): Promise<GateActionResult> {
  const { userId, actionRiskLevel, voiceprintAvailable } = params;

  // Low-risk actions: no auth needed at all, so nothing to replace.
  if (actionRiskLevel === 'low') {
    return {
      requireVoiceprintCapture: false,
      reason: 'no auth needed for low-risk action',
    };
  }

  // The browser doesn't support / can't access the mic right now.
  // Skip the modal so the user isn't stuck on a dead-end UI.
  if (!voiceprintAvailable) {
    return {
      requireVoiceprintCapture: false,
      reason: 'voiceprint capture not available in this context',
    };
  }

  // The user must be enrolled. We check the same row the verify route
  // checks so the decision and the verification can never diverge.
  const enrollment = await prisma.shadowTrustedDevice.findFirst({
    where: { userId, deviceType: 'voiceprint', isActive: true },
  });

  if (!enrollment) {
    return {
      requireVoiceprintCapture: false,
      reason: 'user has not enrolled a voiceprint',
    };
  }

  // The user must have explicitly opted in via Advanced Voice Settings.
  // Without this, voiceprint is purely a future-feature toggle and the
  // legacy PIN flow is authoritative.
  const vafConfig = await getVafConfig(userId);
  if (!vafConfig.voiceprintUseForAuth) {
    return {
      requireVoiceprintCapture: false,
      reason: 'voiceprintUseForAuth is disabled in VAF config',
    };
  }

  // medium → voiceprint replaces PIN
  // high   → voiceprint replaces SMS (PIN still required, prompted separately)
  return {
    requireVoiceprintCapture: true,
    reason:
      actionRiskLevel === 'medium'
        ? 'medium risk: voiceprint replaces PIN'
        : 'high risk: voiceprint replaces SMS (PIN still required)',
  };
}
