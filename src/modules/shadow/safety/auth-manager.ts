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
}

interface StoredSmsCode {
  code: string;
  expiresAt: number;
  attempts: number;
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
// In-memory SMS code store (production would use Redis or Prisma temp table)
// ---------------------------------------------------------------------------

const smsCodeStore = new Map<string, StoredSmsCode>();

/**
 * Clean up expired SMS codes periodically.
 * In production, use Redis TTL or a cron job against Prisma.
 */
function cleanExpiredCodes(): void {
  const now = Date.now();
  for (const [key, entry] of smsCodeStore.entries()) {
    if (entry.expiresAt < now) {
      smsCodeStore.delete(key);
    }
  }
}

// Run cleanup every 60 seconds
if (typeof setInterval !== 'undefined') {
  setInterval(cleanExpiredCodes, 60_000);
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
   * The code is stored in an in-memory Map with a 5-minute TTL.
   */
  async sendSmsCode(userId: string): Promise<{ sent: boolean; expiresIn: number }> {
    // Generate a cryptographically random 6-digit code
    const codeBuffer = randomBytes(4);
    const codeNum = codeBuffer.readUInt32BE(0) % 1_000_000;
    const code = codeNum.toString().padStart(SMS_CODE_LENGTH, '0');

    const expiresAt = Date.now() + SMS_CODE_TTL_MS;

    smsCodeStore.set(userId, {
      code,
      expiresAt,
      attempts: 0,
    });

    // In production: send via Twilio
    // const device = await this.getPrimarySmsDevice(userId);
    // await twilioClient.messages.create({ to: device.phoneNumber, body: `Your code: ${code}` });

    // Log the auth event
    await prisma.shadowAuthEvent.create({
      data: {
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
    const stored = smsCodeStore.get(userId);

    if (!stored) {
      return false;
    }

    // Check expiration
    if (Date.now() > stored.expiresAt) {
      smsCodeStore.delete(userId);
      return false;
    }

    // Check max attempts
    if (stored.attempts >= SMS_MAX_ATTEMPTS) {
      smsCodeStore.delete(userId);
      return false;
    }

    // Increment attempt count
    stored.attempts += 1;

    // Constant-time comparison to prevent timing attacks
    const isValid = timingSafeEqual(code, stored.code);

    if (isValid) {
      smsCodeStore.delete(userId); // One-time use
    }

    // Log the auth event
    await prisma.shadowAuthEvent.create({
      data: {
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
  // Dynamic Auth Determination
  // =========================================================================

  /**
   * Determine what authentication is required for a given action,
   * based on the action classification, user's safety config, risk score,
   * channel, and device trust status.
   */
  async determineAuthRequired(params: DetermineAuthParams): Promise<AuthRequirement> {
    const { userId, action, riskScore, channel, deviceIdentifier } = params;

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
    if (channel === 'voice' && classification.confirmationLevel !== 'NONE' && classification.confirmationLevel !== 'TAP') {
      requiresPin = true;
      reasons.push('Voice channel requires PIN for confirm-phrase and higher actions');
    }

    // Trusted device can downgrade SMS requirement to PIN only
    if (deviceTrusted && requiresSmsCode && !requiresPin) {
      requiresSmsCode = false;
      requiresPin = true;
      reasons.push('Trusted device: SMS downgraded to PIN only');
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
