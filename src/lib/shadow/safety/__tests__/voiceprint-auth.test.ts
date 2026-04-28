// ============================================================================
// Tests — verifyVoiceprint + getAuthRequirements
// Mocks @/lib/db and the VAFSpeakerID client (via the testing seam exported
// from voiceprint-auth.ts). Covers:
//   - not-enrolled → verified=false
//   - anti-spoof failure logs a HIGH-risk shadowAuthEvent and short-circuits
//   - threshold pass → verified=true
//   - mismatch → verified=false
//   - getAuthRequirements full matrix (low/medium/high × verified true/false)
// ============================================================================

jest.mock('@/lib/db', () => ({
  prisma: {
    shadowTrustedDevice: {
      findFirst: jest.fn(),
    },
    shadowAuthEvent: {
      create: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  verifyVoiceprint,
  getAuthRequirements,
  __setSpeakerIDClientForTesting,
} from '@/lib/shadow/safety/voiceprint-auth';
import type { VAFSpeakerID, VoiceprintVerification } from '@/lib/vaf/speaker-id-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockedFindFirst = prisma.shadowTrustedDevice.findFirst as unknown as jest.Mock;
const mockedAuthEventCreate = prisma.shadowAuthEvent.create as unknown as jest.Mock;

function fakeSpeakerID(verifyImpl: (userId: string, sample: Buffer) => Promise<VoiceprintVerification>): VAFSpeakerID {
  return {
    verify: jest.fn(verifyImpl),
    enroll: jest.fn(),
    createContinuousSession: jest.fn(),
    deleteVoiceprint: jest.fn(),
  } as unknown as VAFSpeakerID;
}

beforeEach(() => {
  jest.clearAllMocks();
  __setSpeakerIDClientForTesting(null);
});

afterAll(() => {
  __setSpeakerIDClientForTesting(null);
});

// ---------------------------------------------------------------------------
// verifyVoiceprint
// ---------------------------------------------------------------------------

describe('verifyVoiceprint', () => {
  const userId = 'user-1';
  const audio = Buffer.from('audio');

  it('returns verified=false when the user has no active voiceprint enrollment', async () => {
    mockedFindFirst.mockResolvedValue(null);
    const speakerID = fakeSpeakerID(async () => {
      throw new Error('should not be called');
    });
    __setSpeakerIDClientForTesting(speakerID);

    const result = await verifyVoiceprint(userId, audio, 'medium');

    expect(result).toEqual({
      verified: false,
      method: 'voiceprint_not_enrolled',
      confidence: 0,
      antiSpoofPassed: false,
    });
    expect(speakerID.verify).not.toHaveBeenCalled();
    expect(mockedAuthEventCreate).not.toHaveBeenCalled();
  });

  it('logs HIGH-risk voiceprint_spoof_detected and short-circuits when isLiveVoice is false', async () => {
    mockedFindFirst.mockResolvedValue({ id: 'd1', userId, deviceType: 'voiceprint', isActive: true });
    const speakerID = fakeSpeakerID(async () => ({
      match: true,             // would have matched, but anti-spoof must short-circuit FIRST
      confidence: 0.99,
      threshold: 0.85,
      latencyMs: 100,
      antiSpoofResult: { isLiveVoice: false, isNotSynthesized: true, confidence: 0.6 },
    }));
    __setSpeakerIDClientForTesting(speakerID);

    const result = await verifyVoiceprint(userId, audio, 'medium');

    expect(result.verified).toBe(false);
    expect(result.method).toBe('voiceprint_spoof_detected');
    expect(result.antiSpoofPassed).toBe(false);

    expect(mockedAuthEventCreate).toHaveBeenCalledTimes(1);
    expect(mockedAuthEventCreate).toHaveBeenCalledWith({
      data: {
        method: 'voiceprint',
        result: 'fail',
        riskLevel: 'high',
        actionAttempted: `voiceprint_spoof_detected:${userId}`,
      },
    });
  });

  it('logs HIGH-risk spoof event when isNotSynthesized is false (AI clone)', async () => {
    mockedFindFirst.mockResolvedValue({ id: 'd1', userId, deviceType: 'voiceprint', isActive: true });
    const speakerID = fakeSpeakerID(async () => ({
      match: true,
      confidence: 0.99,
      threshold: 0.85,
      latencyMs: 100,
      antiSpoofResult: { isLiveVoice: true, isNotSynthesized: false, confidence: 0.55 },
    }));
    __setSpeakerIDClientForTesting(speakerID);

    const result = await verifyVoiceprint(userId, audio, 'high');

    expect(result.verified).toBe(false);
    expect(result.method).toBe('voiceprint_spoof_detected');
    expect(mockedAuthEventCreate.mock.calls[0][0].data.riskLevel).toBe('high');
  });

  it('returns verified=true and logs a pass event when match >= threshold', async () => {
    mockedFindFirst.mockResolvedValue({ id: 'd1', userId, deviceType: 'voiceprint', isActive: true });
    const speakerID = fakeSpeakerID(async () => ({
      match: true,
      confidence: 0.92,
      threshold: 0.85,
      latencyMs: 110,
      antiSpoofResult: { isLiveVoice: true, isNotSynthesized: true, confidence: 0.99 },
    }));
    __setSpeakerIDClientForTesting(speakerID);

    const result = await verifyVoiceprint(userId, audio, 'medium');

    expect(result).toEqual({
      verified: true,
      method: 'voiceprint',
      confidence: 0.92,
      antiSpoofPassed: true,
    });

    expect(mockedAuthEventCreate).toHaveBeenCalledWith({
      data: {
        method: 'voiceprint',
        result: 'pass',
        riskLevel: 'medium',
        actionAttempted: `voiceprint_verified:${userId}`,
      },
    });
  });

  it('returns voiceprint_mismatch when confidence is below threshold', async () => {
    mockedFindFirst.mockResolvedValue({ id: 'd1', userId, deviceType: 'voiceprint', isActive: true });
    const speakerID = fakeSpeakerID(async () => ({
      match: false,
      confidence: 0.5,
      threshold: 0.85,
      latencyMs: 110,
      antiSpoofResult: { isLiveVoice: true, isNotSynthesized: true, confidence: 0.99 },
    }));
    __setSpeakerIDClientForTesting(speakerID);

    const result = await verifyVoiceprint(userId, audio, 'medium');

    expect(result.verified).toBe(false);
    expect(result.method).toBe('voiceprint_mismatch');
    expect(result.antiSpoofPassed).toBe(true);
    expect(mockedAuthEventCreate).toHaveBeenCalledWith({
      data: {
        method: 'voiceprint',
        result: 'fail',
        riskLevel: 'medium',
        actionAttempted: `voiceprint_mismatch:${userId}`,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// getAuthRequirements — full matrix
// ---------------------------------------------------------------------------

describe('getAuthRequirements', () => {
  it('low risk requires nothing regardless of voiceprint', () => {
    expect(getAuthRequirements('low', false, null)).toEqual({
      requirePin: false,
      requireSmsCode: false,
      requireVoiceprint: false,
    });
    expect(getAuthRequirements('low', true, null)).toEqual({
      requirePin: false,
      requireSmsCode: false,
      requireVoiceprint: false,
    });
  });

  it('medium risk: voiceprint replaces PIN', () => {
    expect(getAuthRequirements('medium', true, null)).toEqual({
      requirePin: false,
      requireSmsCode: false,
      requireVoiceprint: false,
    });
    expect(getAuthRequirements('medium', false, null)).toEqual({
      requirePin: true,
      requireSmsCode: false,
      requireVoiceprint: false,
    });
  });

  it('high risk: PIN is ALWAYS required; voiceprint replaces SMS only', () => {
    expect(getAuthRequirements('high', false, null)).toEqual({
      requirePin: true,
      requireSmsCode: true,
      requireVoiceprint: false,
    });
    expect(getAuthRequirements('high', true, null)).toEqual({
      requirePin: true,
      requireSmsCode: false,
      requireVoiceprint: false,
    });
  });
});
