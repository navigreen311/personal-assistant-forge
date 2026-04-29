// ============================================================================
// Tests — ShadowAuthManager (WS08 voiceprint wiring)
//
// Mocks:
//   - @/lib/db (prisma)
//   - @/lib/shadow/safety/voiceprint-auth (verifyVoiceprint)
//
// Covers:
//   - verifyVoiceprintForAction returns the wrapped verifyVoiceprint result
//   - determineAuthRequired with voiceprintVerified=true AND
//     vafIntegrationConfig.voiceprintUseForAuth=true:
//       * drops SMS at high risk (PIN still required)
//       * drops PIN at medium risk
//   - same call WITHOUT voiceprintVerified returns the legacy result
//   - same call with voiceprintUseForAuth=false returns the legacy result
//     even when voiceprintVerified=true
// ============================================================================

jest.mock('@/lib/db', () => ({
  prisma: {
    shadowSafetyConfig: { findUnique: jest.fn() },
    shadowAuthEvent: { create: jest.fn() },
    shadowTrustedDevice: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    vafIntegrationConfig: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/shadow/safety/voiceprint-auth', () => {
  const actual = jest.requireActual('@/lib/shadow/safety/voiceprint-auth');
  return {
    ...actual,
    verifyVoiceprint: jest.fn(),
  };
});

import { prisma } from '@/lib/db';
import { ShadowAuthManager } from '@/modules/shadow/safety/auth-manager';
import { verifyVoiceprint } from '@/lib/shadow/safety/voiceprint-auth';

const mockedSafetyFindUnique = prisma.shadowSafetyConfig.findUnique as unknown as jest.Mock;
const mockedTrustedFindFirst = prisma.shadowTrustedDevice.findFirst as unknown as jest.Mock;
// vafIntegrationConfig is in schema.prisma but the generated client types don't
// always reflect it in this repo (prisma generate is run at build/CI time).
// Cast through unknown so the test file doesn't pick up that pre-existing issue.
const mockedVafFindUnique = (prisma as unknown as {
  vafIntegrationConfig: { findUnique: jest.Mock };
}).vafIntegrationConfig.findUnique;
const mockedVerifyVoiceprint = verifyVoiceprint as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no safety config row, no trusted device, no VAF config row
  mockedSafetyFindUnique.mockResolvedValue(null);
  mockedTrustedFindFirst.mockResolvedValue(null);
  mockedVafFindUnique.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// verifyVoiceprintForAction
// ---------------------------------------------------------------------------

describe('ShadowAuthManager.verifyVoiceprintForAction', () => {
  it('returns the wrapped verifyVoiceprint result (verified=true path)', async () => {
    mockedVerifyVoiceprint.mockResolvedValue({
      verified: true,
      method: 'voiceprint',
      confidence: 0.92,
      antiSpoofPassed: true,
    });

    const mgr = new ShadowAuthManager();
    const sample = Buffer.from('audio');

    const result = await mgr.verifyVoiceprintForAction({
      userId: 'user-1',
      audioSample: sample,
      riskLevel: 'medium',
    });

    expect(mockedVerifyVoiceprint).toHaveBeenCalledTimes(1);
    expect(mockedVerifyVoiceprint).toHaveBeenCalledWith('user-1', sample, 'medium');
    expect(result).toEqual({
      verified: true,
      confidence: 0.92,
      antiSpoofPassed: true,
    });
  });

  it('passes through anti-spoof failure (verified=false, antiSpoofPassed=false)', async () => {
    mockedVerifyVoiceprint.mockResolvedValue({
      verified: false,
      method: 'voiceprint_spoof_detected',
      confidence: 0,
      antiSpoofPassed: false,
    });

    const mgr = new ShadowAuthManager();
    const result = await mgr.verifyVoiceprintForAction({
      userId: 'user-1',
      audioSample: Buffer.from('audio'),
      riskLevel: 'high',
    });

    expect(result).toEqual({
      verified: false,
      confidence: 0,
      antiSpoofPassed: false,
    });
  });
});

// ---------------------------------------------------------------------------
// determineAuthRequired — voiceprint downgrade behavior
// ---------------------------------------------------------------------------

describe('ShadowAuthManager.determineAuthRequired (voiceprint wiring)', () => {
  // For HIGH-risk scenario we use:
  //   - action='make_payment' → confirmationLevel=VOICE_PIN → PIN forced on
  //   - riskScore=80 → SMS forced on (>= RISK_THRESHOLD_SMS=75)
  //   - channel='api', no deviceIdentifier, no safetyConfig row
  // Legacy result: { requiresPin: true, requiresSmsCode: true }
  const HIGH_PARAMS = {
    userId: 'user-1',
    action: 'make_payment',
    riskScore: 80,
    channel: 'api',
  };

  // For MEDIUM-risk scenario:
  //   - action='make_payment' → PIN forced on
  //   - riskScore=60 → no SMS (< 75), no extra PIN trigger
  //   - channel='api'
  // Legacy result: { requiresPin: true, requiresSmsCode: false }
  const MEDIUM_PARAMS = {
    userId: 'user-1',
    action: 'make_payment',
    riskScore: 60,
    channel: 'api',
  };

  describe('high risk (legacy = PIN + SMS)', () => {
    it('drops SMS when voiceprintVerified=true AND voiceprintUseForAuth=true (PIN stays)', async () => {
      mockedVafFindUnique.mockResolvedValue({ userId: 'user-1', voiceprintUseForAuth: true });

      const mgr = new ShadowAuthManager();
      const result = await mgr.determineAuthRequired({
        ...HIGH_PARAMS,
        voiceprintVerified: true,
      });

      expect(result.requiresPin).toBe(true);
      expect(result.requiresSmsCode).toBe(false);
    });

    it('returns legacy PIN+SMS when voiceprintVerified is omitted (even if config enabled)', async () => {
      mockedVafFindUnique.mockResolvedValue({ userId: 'user-1', voiceprintUseForAuth: true });

      const mgr = new ShadowAuthManager();
      const result = await mgr.determineAuthRequired(HIGH_PARAMS);

      expect(result.requiresPin).toBe(true);
      expect(result.requiresSmsCode).toBe(true);
    });

    it('returns legacy PIN+SMS when voiceprintUseForAuth=false even with voiceprintVerified=true', async () => {
      mockedVafFindUnique.mockResolvedValue({ userId: 'user-1', voiceprintUseForAuth: false });

      const mgr = new ShadowAuthManager();
      const result = await mgr.determineAuthRequired({
        ...HIGH_PARAMS,
        voiceprintVerified: true,
      });

      expect(result.requiresPin).toBe(true);
      expect(result.requiresSmsCode).toBe(true);
    });

    it('returns legacy PIN+SMS when vafIntegrationConfig row is missing', async () => {
      mockedVafFindUnique.mockResolvedValue(null);

      const mgr = new ShadowAuthManager();
      const result = await mgr.determineAuthRequired({
        ...HIGH_PARAMS,
        voiceprintVerified: true,
      });

      expect(result.requiresPin).toBe(true);
      expect(result.requiresSmsCode).toBe(true);
    });
  });

  describe('medium risk (legacy = PIN only)', () => {
    it('drops PIN when voiceprintVerified=true AND voiceprintUseForAuth=true', async () => {
      mockedVafFindUnique.mockResolvedValue({ userId: 'user-1', voiceprintUseForAuth: true });

      const mgr = new ShadowAuthManager();
      const result = await mgr.determineAuthRequired({
        ...MEDIUM_PARAMS,
        voiceprintVerified: true,
      });

      expect(result.requiresPin).toBe(false);
      expect(result.requiresSmsCode).toBe(false);
    });

    it('returns legacy PIN-only when voiceprintVerified is omitted', async () => {
      mockedVafFindUnique.mockResolvedValue({ userId: 'user-1', voiceprintUseForAuth: true });

      const mgr = new ShadowAuthManager();
      const result = await mgr.determineAuthRequired(MEDIUM_PARAMS);

      expect(result.requiresPin).toBe(true);
      expect(result.requiresSmsCode).toBe(false);
    });

    it('returns legacy PIN-only when voiceprintUseForAuth=false', async () => {
      mockedVafFindUnique.mockResolvedValue({ userId: 'user-1', voiceprintUseForAuth: false });

      const mgr = new ShadowAuthManager();
      const result = await mgr.determineAuthRequired({
        ...MEDIUM_PARAMS,
        voiceprintVerified: true,
      });

      expect(result.requiresPin).toBe(true);
      expect(result.requiresSmsCode).toBe(false);
    });
  });

  it('does not query vafIntegrationConfig when voiceprintVerified is undefined', async () => {
    const mgr = new ShadowAuthManager();
    await mgr.determineAuthRequired(HIGH_PARAMS);
    expect(mockedVafFindUnique).not.toHaveBeenCalled();
  });
});
