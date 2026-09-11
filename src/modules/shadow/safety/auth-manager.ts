// ============================================================================
// Shadow Voice Agent — Auth Manager
// Manages voice PIN verification, SMS 2FA codes, trusted devices,
// and dynamic auth-level determination based on risk scoring.
// ============================================================================

import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import { classifyAction } from './action-classifier';
import type { BlastRadiusScope } from './action-classifier';
import {
  verifyVoiceprint,
  getAuthRequirements,
  type ActionRiskLevel,
  type VoiceprintVerifyResult,
} from '@/lib/shadow/safety/voiceprint-auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrustedDevice {
  id: string;
  userId: string;
  deviceType: string;
  deviceFingerprint: string | null;
  phoneNumber: string | null;
  name: string;
  verifiedAt: Date;
  lastUsedAt: Date | null;
  isActive: boolean;
}

export interface AddDeviceParams {
  deviceType: string;
  phoneNumber?: string;
  name: string;
  deviceFingerprint?: string;
}

export interface AuthRequirement {
  requiresPin: boolean;
  requiresSmsCode: boolean;
  reason: string;
}

export interface DetermineAuthParams {
  userId: string;
  action: string;
  riskScore: number;
  channel: string;
  deviceIdentifier?: string;
  /**
   * Optional flag indicating whether the caller has already passed a
   * voiceprint check for this request. When `true` and the user has
   * `vafIntegrationConfig.voiceprintUseForAuth` enabled, voiceprint
   * verification can substitute for SMS at high risk and PIN at medium
   * risk. Per spec, PIN is ALWAYS required for high risk regardless.
   *
   * If omitted (the default), behavior is identical to pre-VAF.
   */
  voiceprintVerified?: boolean;
}

export interface VerifyVoiceprintForActionParams {
  userId: string;
  audioSample: Buffer;
  riskLevel: ActionRiskLevel;
}

export interface VerifyVoiceprintForActionResult {
  verified: boolean;
  confidence: number;
  antiSpoofPassed: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BCRYPT_ROUNDS = 12;
const SMS_CODE_LENGTH = 6;
const SMS_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SMS_MAX_ATTEMPTS = 3;

/** Risk score thresholds */
const RISK_THRESHOLD_PIN = 50;
const RISK_THRESHOLD_SMS = 75;

/** Blast radius ordering for comparison */
const BLAST_RADIUS_ORDER: Record<BlastRadiusScope, number> = {
  self: 0,
  entity: 1,
  external: 2,
  public: 3,
};

// ---------------------------------------------------------------------------
// SMS code storage
// ---------------------------------------------------------------------------
//
// P-33: this was `const smsCodeStore = new Map<string, StoredSmsCode>()`, with a
// comment reading "production would use Redis or Prisma temp table" and a
// `setInterval(cleanExpiredCodes, 60_000)` sweeper beside it.
//
// The Prisma table it was asking for already exists, and has since P-00. Its
// doc-comment in the schema names this exact line:
//
//     /// T-007 - replaces shadow/safety/auth-manager.ts:109.
//     /// In-flight second factors vanishing on restart strand a user
//     /// mid-verification.
//     model ShadowSmsCode { cacheKey @unique, code, attempts, expiresAt, ... }
//
// P-00 shipped eleven `T-007 - replaces ...` models. Ten of them are wired
// (`executionGateRule`, `queuedAction`, `rollbackPlan`, `workflowApproval`,
// `deadManSwitch`, `role`, `userRoleAssignment`, `eSignRequest`,
// `workflowExecutionRecord`, `runbookExecution` all appear in `src/`).
// `prisma.shadowSmsCode` appeared ZERO times -- the one that was left behind is
// the second factor. The table was provably always empty, and
// `tests/db/control-plane-schema.test.ts` was green over it because it only
// asserts the table can be counted.
//
// This class already writes `shadowSafetyConfig`, `shadowTrustedDevice`,
// `shadowAuthEvent` and `vafIntegrationConfig`, so it was never a module
// without database access -- it was one Map left in an otherwise-persisted
// service.
//
// Consequences that are now closed:
//   - any deploy, crash, or serverless cold start between send and verify
//     invalidated every outstanding code (`verifySmsCode` returns false, which
//     is indistinguishable from a wrong code);
//   - the SMS_MAX_ATTEMPTS=3 brute-force lockout reset to zero on the same
//     event, so an attacker could reset their attempt budget at will if they
//     could provoke a restart -- and on a multi-instance deploy did not even
//     need to, because each instance had its own Map and its own counter.
//
// `@@index([expiresAt])` replaces the 60-second sweeper: expiry is enforced on
// read, and `purgeExpiredSmsCodes()` below is the sweep, callable by a job
// rather than by a module-load timer that also kept the process alive.

/**
 * Delete a user's outstanding code, tolerating its absence.
 *
 * `deleteMany` rather than `delete` on purpose: `delete` throws P2025 when the
 * row is already gone, and two concurrent verifies (a double-tapped submit) can
 * both reach the delete. `Map.delete` was idempotent, so using `delete` here
 * would have quietly traded a Map for a 500 on the 2FA endpoint.
 */
async function consumeSmsCode(userId: string): Promise<void> {
  await prisma.shadowSmsCode.deleteMany({ where: { cacheKey: userId } });
}

/**
 * Expired codes are rejected on read; this is the optional bulk sweep.
 *
 * It has no caller yet, and that is deliberate rather than an oversight: this
 * is the seam a maintenance job should use, and correctness does not depend on
 * it running. Expiry is enforced in `verifySmsCode` against `expiresAt`, so an
 * unswept row is already unusable — the sweep only reclaims space.
 */
export async function purgeExpiredSmsCodes(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.shadowSmsCode.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return count;
}

// ---------------------------------------------------------------------------
// ShadowAuthManager
// ---------------------------------------------------------------------------

export class ShadowAuthManager {
  // =========================================================================
  // PIN Management
  // =========================================================================

  /**
   * Verify a user's voice PIN against the stored bcrypt hash.
   * Returns false if no PIN is set or if the PIN does not match.
   */
  async verifyPin(userId: string, pin: string): Promise<boolean> {
    const config = await prisma.shadowSafetyConfig.findUnique({
      where: { userId },
    });

    if (!config?.voicePin) {
      return false;
    }

    return bcrypt.compare(pin, config.voicePin);
  }

  /**
   * Set (or update) a user's voice PIN. The PIN is stored as a bcrypt hash.
   * Creates the ShadowSafetyConfig record if it doesn't exist.
   */
  async setPin(userId: string, pin: string): Promise<void> {
    const hashedPin = await bcrypt.hash(pin, BCRYPT_ROUNDS);

    await prisma.shadowSafetyConfig.upsert({
      where: { userId },
      create: {
        userId,
        voicePin: hashedPin,
      },
      update: {
        voicePin: hashedPin,
      },
    });
  }

  // =========================================================================
  // SMS Verification
  // =========================================================================

  /**
   * Generate and "send" a 6-digit SMS verification code.
   * In production, this would integrate with Twilio. Currently mocked.
   *
   * The code is written to `ShadowSmsCode` with a 5-minute TTL, keyed by
   * `cacheKey = userId`. `cacheKey` is `@unique`, so a re-send replaces the
   * outstanding code rather than leaving two live -- an `upsert`, which also
   * resets `attempts` to 0 for the new code.
   */
  async sendSmsCode(userId: string): Promise<{ sent: boolean; expiresIn: number }> {
    // Generate a cryptographically random 6-digit code
    const codeBuffer = randomBytes(4);
    const codeNum = codeBuffer.readUInt32BE(0) % 1_000_000;
    const code = codeNum.toString().padStart(SMS_CODE_LENGTH, '0');

    const expiresAt = new Date(Date.now() + SMS_CODE_TTL_MS);

    await prisma.shadowSmsCode.upsert({
      where: { cacheKey: userId },
      create: { cacheKey: userId, code, attempts: 0, expiresAt },
      update: { code, attempts: 0, expiresAt },
    });

    // In production: send via Twilio
    // const device = await this.getPrimarySmsDevice(userId);
    // await twilioClient.messages.create({ to: device.phoneNumber, body: `Your code: ${code}` });

    // Log the auth event.
    // P-33: `userId` is passed now. It was in scope and omitted, which made the
    // security audit trail unattributable -- `ShadowAuthEvent.userId` is
    // nullable and `@@index([userId])`, so the column exists precisely to be
    // queried by user. `continuous-voiceprint.ts` already fills it in.
    await prisma.shadowAuthEvent.create({
      data: {
        userId,
        method: 'sms_code_sent',
        result: 'sent',
        riskLevel: 'info',
        actionAttempted: 'send_sms_code',
      },
    });

    return {
      sent: true,
      expiresIn: Math.floor(SMS_CODE_TTL_MS / 1000),
    };
  }

  /**
   * Verify a 6-digit SMS code for a user.
   * Returns false if the code is expired, incorrect, or max attempts exceeded.
   */
  async verifySmsCode(userId: string, code: string): Promise<boolean> {
    const stored = await prisma.shadowSmsCode.findUnique({
      where: { cacheKey: userId },
    });

    if (!stored) {
      return false;
    }

    // Check expiration
    if (Date.now() > stored.expiresAt.getTime()) {
      await consumeSmsCode(userId);
      return false;
    }

    // Check max attempts
    if (stored.attempts >= SMS_MAX_ATTEMPTS) {
      await consumeSmsCode(userId);
      return false;
    }

    // Increment attempt count.
    // The Map version mutated `stored.attempts` in place, which only counted
    // because every attempt shared one object. A row has to be written back, or
    // the lockout never advances past 1.
    await prisma.shadowSmsCode.update({
      where: { cacheKey: userId },
      data: { attempts: { increment: 1 } },
    });

    // Constant-time comparison to prevent timing attacks
    const isValid = timingSafeEqual(code, stored.code);

    if (isValid) {
      // One-time use
      await consumeSmsCode(userId);
    }

    // Log the auth event (see sendSmsCode for why `userId` is filled in)
    await prisma.shadowAuthEvent.create({
      data: {
        userId,
        method: 'sms_code_verify',
        result: isValid ? 'success' : 'failure',
        riskLevel: isValid ? 'info' : 'warning',
        actionAttempted: 'verify_sms_code',
      },
    });

    return isValid;
  }

  // =========================================================================
  // Trusted Devices
  // =========================================================================

  /**
   * Check if a device is trusted for a given user.
   */
  async isTrustedDevice(userId: string, identifier: string): Promise<boolean> {
    const device = await prisma.shadowTrustedDevice.findFirst({
      where: {
        userId,
        isActive: true,
        OR: [
          { deviceFingerprint: identifier },
          { phoneNumber: identifier },
        ],
      },
    });

    if (device) {
      // Update last used timestamp
      await prisma.shadowTrustedDevice.update({
        where: { id: device.id },
        data: { lastUsedAt: new Date() },
      });
      return true;
    }

    return false;
  }

  /**
   * Add a new trusted device for a user.
   */
  async addTrustedDevice(userId: string, device: AddDeviceParams): Promise<TrustedDevice> {
    const created = await prisma.shadowTrustedDevice.create({
      data: {
        userId,
        deviceType: device.deviceType,
        phoneNumber: device.phoneNumber ?? null,
        name: device.name,
        deviceFingerprint: device.deviceFingerprint ?? null,
        verifiedAt: new Date(),
        isActive: true,
      },
    });

    return created as TrustedDevice;
  }

  /**
   * Remove (deactivate) a trusted device by ID.
   */
  async removeTrustedDevice(deviceId: string): Promise<void> {
    await prisma.shadowTrustedDevice.update({
      where: { id: deviceId },
      data: { isActive: false },
    });
  }

  /**
   * List all trusted devices for a user (active only by default).
   */
  async listTrustedDevices(userId: string): Promise<TrustedDevice[]> {
    const devices = await prisma.shadowTrustedDevice.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: { verifiedAt: 'desc' },
    });

    return devices as TrustedDevice[];
  }

  // =========================================================================
  // Voiceprint Verification (thin wrapper)
  // =========================================================================

  /**
   * Verify a user's voiceprint for an action. Thin wrapper around
   * `verifyVoiceprint` from @/lib/shadow/safety/voiceprint-auth so that
   * callers can route everything voice-auth-related through the
   * `ShadowAuthManager` seam without importing the lib helper directly.
   *
   * Anti-spoof short-circuits inside the underlying helper; this wrapper
   * passes the result through unchanged.
   */
  async verifyVoiceprintForAction(
    params: VerifyVoiceprintForActionParams
  ): Promise<VerifyVoiceprintForActionResult> {
    const { userId, audioSample, riskLevel } = params;
    const result: VoiceprintVerifyResult = await verifyVoiceprint(
      userId,
      audioSample,
      riskLevel
    );
    return {
      verified: result.verified,
      confidence: result.confidence,
      antiSpoofPassed: result.antiSpoofPassed,
    };
  }

  // =========================================================================
  // Dynamic Auth Determination
  // =========================================================================

  /**
   * Determine what authentication is required for a given action,
   * based on the action classification, user's safety config, risk score,
   * channel, and device trust status.
   */
  async determineAuthRequired(params: DetermineAuthParams): Promise<AuthRequirement> {
    const { userId, action, riskScore, channel, deviceIdentifier, voiceprintVerified } = params;

    // Classify the action
    const classification = classifyAction(action);

    // If the action requires no confirmation, no auth needed
    if (classification.confirmationLevel === 'NONE') {
      return {
        requiresPin: false,
        requiresSmsCode: false,
        reason: 'Action requires no confirmation',
      };
    }

    // Load user's safety configuration
    const safetyConfig = await prisma.shadowSafetyConfig.findUnique({
      where: { userId },
    });

    // Check if device is trusted (reduces auth requirements)
    let deviceTrusted = false;
    if (deviceIdentifier) {
      deviceTrusted = await this.isTrustedDevice(userId, deviceIdentifier);
    }

    // Start with the base requirements from action classification
    let requiresPin = false;
    let requiresSmsCode = false;
    const reasons: string[] = [];

    // VOICE_PIN actions always require PIN
    if (classification.confirmationLevel === 'VOICE_PIN') {
      requiresPin = true;
      reasons.push(`Action "${action}" requires voice PIN confirmation`);
    }

    // CONFIRM_PHRASE actions require PIN if user config demands it
    if (classification.confirmationLevel === 'CONFIRM_PHRASE') {
      if (safetyConfig?.requirePinForExternal && classification.blastRadius === 'external') {
        requiresPin = true;
        reasons.push('User config requires PIN for external actions');
      }
    }

    // Financial actions may require PIN based on user config
    if (
      safetyConfig?.requirePinForFinancial &&
      (action.includes('payment') || action.includes('invoice') || action.includes('transfer'))
    ) {
      requiresPin = true;
      reasons.push('User config requires PIN for financial actions');
    }

    // Crisis actions require PIN based on user config
    if (safetyConfig?.requirePinForCrisis && action === 'declare_crisis') {
      requiresPin = true;
      reasons.push('User config requires PIN for crisis declaration');
    }

    // Blast radius check against user's max allowed without PIN
    if (safetyConfig?.maxBlastRadiusWithoutPin) {
      const maxAllowed = safetyConfig.maxBlastRadiusWithoutPin as BlastRadiusScope;
      const actionRadius = classification.blastRadius;
      if (BLAST_RADIUS_ORDER[actionRadius] > BLAST_RADIUS_ORDER[maxAllowed]) {
        requiresPin = true;
        reasons.push(
          `Blast radius "${actionRadius}" exceeds max allowed without PIN ("${maxAllowed}")`
        );
      }
    }

    // Risk score thresholds
    if (riskScore >= RISK_THRESHOLD_SMS) {
      requiresSmsCode = true;
      reasons.push(`Risk score ${riskScore} exceeds SMS verification threshold (${RISK_THRESHOLD_SMS})`);
    } else if (riskScore >= RISK_THRESHOLD_PIN) {
      requiresPin = true;
      reasons.push(`Risk score ${riskScore} exceeds PIN threshold (${RISK_THRESHOLD_PIN})`);
    }

    // Voice channel always requires PIN for CONFIRM_PHRASE+ actions
    // `NONE` already returned early above, so `!== 'TAP'` is the whole test.
    //
    // P-17: `'phone'` added. The test was `channel === 'voice'` alone, and
    // NOTHING IN THE PLATFORM EVER PASSES `'voice'`. `SessionChannel` is
    // `'web' | 'phone' | 'mobile'`, `ShadowVoiceSession.currentChannel` holds
    // one of those three, and `ShadowAgent.processMessage` is typed
    // `channel: 'web' | 'phone' | 'mobile'`. So the rule the spec calls out in
    // Addition 1.1 -- an inbound CALL is the least verifiable channel and needs
    // the most auth -- could not fire, and a `place_call` or `send_email`
    // confirmed over the phone was treated exactly like one confirmed in an
    // authenticated browser tab.
    //
    // `'voice'` is KEPT rather than replaced: the value is the one the existing
    // unit test passes, and an auth check that silently stops recognising a
    // channel name is the failure being fixed, not a tidy-up to repeat.
    if ((channel === 'voice' || channel === 'phone') && classification.confirmationLevel !== 'TAP') {
      requiresPin = true;
      reasons.push('Voice channel requires PIN for confirm-phrase and higher actions');
    }

    // Trusted device can downgrade SMS requirement to PIN only
    if (deviceTrusted && requiresSmsCode && !requiresPin) {
      requiresSmsCode = false;
      requiresPin = true;
      reasons.push('Trusted device: SMS downgraded to PIN only');
    }

    // -----------------------------------------------------------------------
    // Voiceprint downgrade (gated behind vafIntegrationConfig.voiceprintUseForAuth)
    // -----------------------------------------------------------------------
    // STRICTLY ADDITIVE: only runs when the caller passes voiceprintVerified
    // AND the user has explicitly opted in via vafIntegrationConfig.
    if (voiceprintVerified === true) {
      // vafIntegrationConfig is defined in schema.prisma but the generated
      // Prisma client types in this repo don't always include it until
      // `prisma generate` runs in CI. Cast through unknown to avoid a
      // tsc error in this changed file; runtime behavior is unchanged.
      const vafConfig = await (
        prisma as unknown as {
          vafIntegrationConfig: {
            findUnique: (args: {
              where: { userId: string };
            }) => Promise<{ voiceprintUseForAuth?: boolean } | null>;
          };
        }
      ).vafIntegrationConfig.findUnique({
        where: { userId },
      });

      if (vafConfig?.voiceprintUseForAuth === true) {
        // Map riskScore back to the low/medium/high bucket the matrix uses.
        const computedRiskLevel: ActionRiskLevel =
          riskScore >= RISK_THRESHOLD_SMS
            ? 'high'
            : riskScore >= RISK_THRESHOLD_PIN
              ? 'medium'
              : 'low';

        // High risk: PIN stays mandatory; voiceprint replaces SMS only.
        // Medium risk: voiceprint replaces PIN.
        // Low risk: nothing to drop.
        if (computedRiskLevel === 'high' && requiresPin && requiresSmsCode) {
          const matrix = getAuthRequirements('high', true, safetyConfig);
          requiresSmsCode = matrix.requireSmsCode; // false
          reasons.push('Voiceprint verified: SMS dropped (PIN still required for high risk)');
        } else if (computedRiskLevel === 'medium' && requiresPin && !requiresSmsCode) {
          const matrix = getAuthRequirements('medium', true, safetyConfig);
          requiresPin = matrix.requirePin; // false
          reasons.push('Voiceprint verified: PIN dropped at medium risk');
        }
      }
    }

    // If no specific reason triggered, and classification level is TAP,
    // neither PIN nor SMS is required (just UI tap confirmation)
    if (!requiresPin && !requiresSmsCode && classification.confirmationLevel === 'TAP') {
      return {
        requiresPin: false,
        requiresSmsCode: false,
        reason: 'Action requires tap confirmation only (no PIN or SMS needed)',
      };
    }

    return {
      requiresPin,
      requiresSmsCode,
      reason: reasons.length > 0 ? reasons.join('; ') : 'No additional auth required',
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Constant-time string comparison to prevent timing attacks.
 * Both strings must be the same length for this to be meaningful.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

// ---------------------------------------------------------------------------
// Singleton export for convenience
// ---------------------------------------------------------------------------

export const shadowAuthManager = new ShadowAuthManager();
