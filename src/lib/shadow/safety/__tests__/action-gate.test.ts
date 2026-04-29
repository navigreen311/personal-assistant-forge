// ============================================================================
// Tests — gateActionWithVoiceprint
// ----------------------------------------------------------------------------
// Covers the full decision matrix:
//   - low risk always → false (no auth needed)
//   - voiceprintAvailable=false → false (mic dead-end)
//   - not enrolled → false
//   - voiceprintUseForAuth=false → false
//   - enrolled + opted-in + medium → true (replaces PIN)
//   - enrolled + opted-in + high   → true (replaces SMS)
//   - PIN fallback regression: when the gate returns false the caller can
//     proceed straight to PIN, with no DB write or side effect from the gate.
// ============================================================================

jest.mock('@/lib/db', () => ({
  prisma: {
    shadowTrustedDevice: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('@/lib/shadow/vaf-config', () => ({
  getVafConfig: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getVafConfig } from '@/lib/shadow/vaf-config';
import { gateActionWithVoiceprint } from '@/lib/shadow/safety/action-gate';

const mockedFindFirst = prisma.shadowTrustedDevice.findFirst as unknown as jest.Mock;
const mockedGetVafConfig = getVafConfig as unknown as jest.Mock;

const ENROLLED_ROW = {
  id: 'tdev-1',
  userId: 'user-1',
  deviceType: 'voiceprint',
  isActive: true,
};

function vafConfigStub(overrides: Partial<{ voiceprintUseForAuth: boolean }> = {}) {
  return {
    userId: 'user-1',
    voiceprintEnrolled: true,
    voiceprintEnrolledAt: new Date(),
    voiceprintUseForAuth: true,
    sttProvider: 'vaf',
    ttsProvider: 'vaf',
    audioEnhancement: true,
    noiseCancellation: true,
    echoSuppression: true,
    sentimentOnVoiceforgeCalls: true,
    sentimentAlertThreshold: 0.8,
    autoProcessMeetings: false,
    autoExtractActionItems: true,
    autoCreateTasks: true,
    documentAnalysisEnabled: true,
    screenVisionFallback: false,
    primaryLanguage: 'en-US',
    secondaryLanguage: null,
    autoDetectLanguage: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('gateActionWithVoiceprint — decision matrix', () => {
  it('low risk → false regardless of enrollment / opt-in / availability', async () => {
    const result = await gateActionWithVoiceprint({
      userId: 'user-1',
      actionRiskLevel: 'low',
      voiceprintAvailable: true,
    });

    expect(result.requireVoiceprintCapture).toBe(false);
    expect(result.reason).toMatch(/no auth needed/i);
    // Short-circuited before any DB call.
    expect(mockedFindFirst).not.toHaveBeenCalled();
    expect(mockedGetVafConfig).not.toHaveBeenCalled();
  });

  it('voiceprintAvailable=false → false (skip mic dead-end)', async () => {
    const result = await gateActionWithVoiceprint({
      userId: 'user-1',
      actionRiskLevel: 'medium',
      voiceprintAvailable: false,
    });

    expect(result.requireVoiceprintCapture).toBe(false);
    expect(result.reason).toMatch(/not available/i);
    expect(mockedFindFirst).not.toHaveBeenCalled();
  });

  it('not enrolled → false', async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    const result = await gateActionWithVoiceprint({
      userId: 'user-1',
      actionRiskLevel: 'medium',
      voiceprintAvailable: true,
    });

    expect(result.requireVoiceprintCapture).toBe(false);
    expect(result.reason).toMatch(/not enrolled/i);
    // Did NOT proceed to read VAF config (would have been wasted I/O).
    expect(mockedGetVafConfig).not.toHaveBeenCalled();
  });

  it('voiceprintUseForAuth=false → false', async () => {
    mockedFindFirst.mockResolvedValueOnce(ENROLLED_ROW);
    mockedGetVafConfig.mockResolvedValueOnce(
      vafConfigStub({ voiceprintUseForAuth: false }),
    );

    const result = await gateActionWithVoiceprint({
      userId: 'user-1',
      actionRiskLevel: 'medium',
      voiceprintAvailable: true,
    });

    expect(result.requireVoiceprintCapture).toBe(false);
    expect(result.reason).toMatch(/voiceprintUseForAuth is disabled/i);
  });

  it('enrolled + opted-in + medium risk → true (replaces PIN)', async () => {
    mockedFindFirst.mockResolvedValueOnce(ENROLLED_ROW);
    mockedGetVafConfig.mockResolvedValueOnce(vafConfigStub());

    const result = await gateActionWithVoiceprint({
      userId: 'user-1',
      actionRiskLevel: 'medium',
      voiceprintAvailable: true,
    });

    expect(result.requireVoiceprintCapture).toBe(true);
    expect(result.reason).toMatch(/medium risk.*replaces PIN/i);
  });

  it('enrolled + opted-in + high risk → true (replaces SMS, PIN still required)', async () => {
    mockedFindFirst.mockResolvedValueOnce(ENROLLED_ROW);
    mockedGetVafConfig.mockResolvedValueOnce(vafConfigStub());

    const result = await gateActionWithVoiceprint({
      userId: 'user-1',
      actionRiskLevel: 'high',
      voiceprintAvailable: true,
    });

    expect(result.requireVoiceprintCapture).toBe(true);
    expect(result.reason).toMatch(/high risk.*replaces SMS/i);
    expect(result.reason).toMatch(/PIN still required/i);
  });

  // ---------------------------------------------------------------------------
  // Regression — PIN fallback path
  // ---------------------------------------------------------------------------
  it('PIN fallback regression: when not enrolled, gate returns false and writes nothing', async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    const result = await gateActionWithVoiceprint({
      userId: 'user-not-enrolled',
      actionRiskLevel: 'high',
      voiceprintAvailable: true,
    });

    // Caller now proceeds with the legacy PIN flow as if WS15 didn't exist.
    expect(result.requireVoiceprintCapture).toBe(false);
    // Crucially: the gate must not have any side effects that the legacy
    // PIN flow would later be confused by.
    expect(mockedGetVafConfig).not.toHaveBeenCalled();
  });

  it('PIN fallback regression: opted-out users still get the legacy PIN path', async () => {
    mockedFindFirst.mockResolvedValueOnce(ENROLLED_ROW);
    mockedGetVafConfig.mockResolvedValueOnce(
      vafConfigStub({ voiceprintUseForAuth: false }),
    );

    const result = await gateActionWithVoiceprint({
      userId: 'user-1',
      actionRiskLevel: 'high',
      voiceprintAvailable: true,
    });

    expect(result.requireVoiceprintCapture).toBe(false);
  });
});
