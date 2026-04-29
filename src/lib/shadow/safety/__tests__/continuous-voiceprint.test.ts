// ============================================================================
// Tests — continuous voiceprint verification
// Covers:
//   - Start + close happy path (WS opened against the URL VAF returns).
//   - WS frame verified=true + anti-spoof passes → onVerified.
//   - WS frame verified=false (anti-spoof passes) → onMismatch + auth event.
//   - WS frame anti-spoof fails → onSpoof + HIGH-risk auth event.
//   - Lifecycle hook gating: voiceprintUseForAuth=false → no WS opened.
//   - Lifecycle hook gating: not enrolled → no WS opened.
//   - Lifecycle hook: 3 consecutive mismatches → requestCallTermination fires.
//   - Lifecycle hook: spoof → requestCallTermination fires immediately.
//   - Lifecycle hook: onCallEnd closes the WS.
// ============================================================================

jest.mock('@/lib/db', () => ({
  prisma: {
    shadowAuthEvent: { create: jest.fn() },
    shadowTrustedDevice: { findFirst: jest.fn() },
  },
}));

jest.mock('@/lib/shadow/vaf-config', () => ({
  getVafConfig: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getVafConfig } from '@/lib/shadow/vaf-config';
import {
  startContinuousVerification,
  continuousVoiceprintCallStart,
  continuousVoiceprintCallEnd,
  __setSpeakerIDClientForTesting,
  __setWebSocketFactoryForTesting,
  __resetActiveSessionsForTesting,
  __getActiveSessionForTesting,
  type ContinuousVerificationWebSocket,
  type ContinuousVerificationFrame,
} from '@/lib/shadow/safety/continuous-voiceprint';
import {
  __resetCallTerminationForTesting,
  onTerminationRequest,
} from '@/lib/shadow/voice/call-lifecycle';
import type { VAFSpeakerID } from '@/lib/vaf/speaker-id-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class FakeWS implements ContinuousVerificationWebSocket {
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
  }

  emit(frame: ContinuousVerificationFrame): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  emitRaw(data: string): void {
    this.onmessage?.({ data });
  }

  close(): void {
    this.closed = true;
  }
}

function fakeSpeakerID(
  createImpl: (userId: string) => Promise<{ sessionId: string; websocketUrl: string }>,
): VAFSpeakerID {
  return {
    enroll: jest.fn(),
    verify: jest.fn(),
    createContinuousSession: jest.fn(createImpl),
    deleteVoiceprint: jest.fn(),
  } as unknown as VAFSpeakerID;
}

function buildFrame(overrides: Partial<ContinuousVerificationFrame> = {}): ContinuousVerificationFrame {
  const baseAntiSpoof = { isLiveVoice: true, isNotSynthesized: true, confidence: 0.95 };
  return {
    verified: overrides.verified ?? true,
    confidence: overrides.confidence ?? 0.9,
    timestamp: overrides.timestamp ?? 1700000000,
    antiSpoofResult: overrides.antiSpoofResult
      ? { ...baseAntiSpoof, ...overrides.antiSpoofResult }
      : baseAntiSpoof,
  };
}

const mockedAuthEventCreate = prisma.shadowAuthEvent.create as unknown as jest.Mock;
const mockedFindFirst = prisma.shadowTrustedDevice.findFirst as unknown as jest.Mock;
const mockedGetVafConfig = getVafConfig as unknown as jest.Mock;

let lastWS: FakeWS | null = null;

beforeEach(() => {
  lastWS = null;
  jest.clearAllMocks();
  mockedAuthEventCreate.mockResolvedValue({});
  __setSpeakerIDClientForTesting(null);
  __setWebSocketFactoryForTesting((url) => {
    lastWS = new FakeWS(url);
    return lastWS;
  });
  __resetActiveSessionsForTesting();
  __resetCallTerminationForTesting();
});

afterAll(() => {
  __setSpeakerIDClientForTesting(null);
});

// ---------------------------------------------------------------------------
// startContinuousVerification — direct API
// ---------------------------------------------------------------------------

describe('startContinuousVerification', () => {
  it('opens a WS against the URL VAF returns and exposes sessionId', async () => {
    __setSpeakerIDClientForTesting(
      fakeSpeakerID(async () => ({
        sessionId: 'cont-1',
        websocketUrl: 'ws://vaf.test/cont/cont-1',
      })),
    );

    const handle = await startContinuousVerification({
      userId: 'u1',
      callSessionId: 'call-1',
      onVerified: jest.fn(),
      onMismatch: jest.fn(),
      onSpoof: jest.fn(),
    });

    expect(handle.sessionId).toBe('cont-1');
    expect(lastWS).not.toBeNull();
    expect(lastWS!.url).toBe('ws://vaf.test/cont/cont-1');

    handle.close();
    expect(lastWS!.closed).toBe(true);
  });

  it('fires onVerified when verified=true and anti-spoof passes', async () => {
    __setSpeakerIDClientForTesting(
      fakeSpeakerID(async () => ({ sessionId: 's', websocketUrl: 'ws://x' })),
    );

    const onVerified = jest.fn();
    const onMismatch = jest.fn();
    const onSpoof = jest.fn();

    await startContinuousVerification({
      userId: 'u1',
      callSessionId: 'call-1',
      onVerified,
      onMismatch,
      onSpoof,
    });

    lastWS!.emit(buildFrame({ verified: true, confidence: 0.93, timestamp: 1234 }));

    expect(onVerified).toHaveBeenCalledWith({ confidence: 0.93, timestamp: 1234 });
    expect(onMismatch).not.toHaveBeenCalled();
    expect(onSpoof).not.toHaveBeenCalled();
    expect(mockedAuthEventCreate).not.toHaveBeenCalled();
  });

  it('fires onMismatch + logs medium-risk auth event when verified=false', async () => {
    __setSpeakerIDClientForTesting(
      fakeSpeakerID(async () => ({ sessionId: 's', websocketUrl: 'ws://x' })),
    );

    const onMismatch = jest.fn();

    await startContinuousVerification({
      userId: 'u1',
      callSessionId: 'call-1',
      onVerified: jest.fn(),
      onMismatch,
      onSpoof: jest.fn(),
    });

    lastWS!.emit(buildFrame({ verified: false, confidence: 0.4 }));

    expect(onMismatch).toHaveBeenCalledTimes(1);

    // Auth-event create is fire-and-forget. Flush microtasks.
    await Promise.resolve();

    expect(mockedAuthEventCreate).toHaveBeenCalledTimes(1);
    expect(mockedAuthEventCreate).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        sessionId: 'call-1',
        method: 'voiceprint',
        result: 'fail',
        riskLevel: 'medium',
        actionAttempted: 'continuous_voiceprint_mismatch',
      },
    });
  });

  it('fires onSpoof + logs HIGH-risk auth event when isLiveVoice is false', async () => {
    __setSpeakerIDClientForTesting(
      fakeSpeakerID(async () => ({ sessionId: 's', websocketUrl: 'ws://x' })),
    );

    const onSpoof = jest.fn();
    const onVerified = jest.fn();

    await startContinuousVerification({
      userId: 'u1',
      callSessionId: 'call-1',
      onVerified,
      onMismatch: jest.fn(),
      onSpoof,
    });

    lastWS!.emit(
      buildFrame({
        verified: true, // would have been verified, but anti-spoof must short-circuit FIRST
        antiSpoofResult: { isLiveVoice: false, isNotSynthesized: true, confidence: 0.6 },
      }),
    );

    expect(onSpoof).toHaveBeenCalledTimes(1);
    expect(onVerified).not.toHaveBeenCalled();

    await Promise.resolve();

    expect(mockedAuthEventCreate).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        sessionId: 'call-1',
        method: 'voiceprint',
        result: 'fail',
        riskLevel: 'high',
        actionAttempted: 'continuous_voiceprint_spoof',
      },
    });
  });

  it('fires onSpoof when isNotSynthesized is false (AI clone)', async () => {
    __setSpeakerIDClientForTesting(
      fakeSpeakerID(async () => ({ sessionId: 's', websocketUrl: 'ws://x' })),
    );

    const onSpoof = jest.fn();

    await startContinuousVerification({
      userId: 'u1',
      callSessionId: 'call-1',
      onVerified: jest.fn(),
      onMismatch: jest.fn(),
      onSpoof,
    });

    lastWS!.emit(
      buildFrame({
        verified: true,
        antiSpoofResult: { isLiveVoice: true, isNotSynthesized: false, confidence: 0.5 },
      }),
    );

    expect(onSpoof).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(mockedAuthEventCreate.mock.calls[0][0].data.riskLevel).toBe('high');
  });

  it('ignores malformed JSON frames without crashing', async () => {
    __setSpeakerIDClientForTesting(
      fakeSpeakerID(async () => ({ sessionId: 's', websocketUrl: 'ws://x' })),
    );

    const onVerified = jest.fn();
    const onMismatch = jest.fn();
    const onSpoof = jest.fn();

    await startContinuousVerification({
      userId: 'u1',
      callSessionId: 'call-1',
      onVerified,
      onMismatch,
      onSpoof,
    });

    expect(() => lastWS!.emitRaw('not json')).not.toThrow();
    expect(onVerified).not.toHaveBeenCalled();
    expect(onMismatch).not.toHaveBeenCalled();
    expect(onSpoof).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Lifecycle hook integration
// ---------------------------------------------------------------------------

describe('continuousVoiceprint lifecycle handlers', () => {
  beforeEach(() => {
    __setSpeakerIDClientForTesting(
      fakeSpeakerID(async () => ({
        sessionId: 'cont-x',
        websocketUrl: 'ws://vaf.test/cont/cont-x',
      })),
    );
  });

  it('does NOT open a session when voiceprintUseForAuth is false', async () => {
    mockedGetVafConfig.mockResolvedValue({ voiceprintUseForAuth: false });
    mockedFindFirst.mockResolvedValue({ id: 'd1' }); // would be enrolled, but flag is off

    await continuousVoiceprintCallStart({ callId: 'call-1', userId: 'u1', entityId: 'e1', personaId: 'p1' });

    expect(lastWS).toBeNull();
    expect(__getActiveSessionForTesting('call-1')).toBeUndefined();
  });

  it('does NOT open a session when the user has no voiceprint enrollment', async () => {
    mockedGetVafConfig.mockResolvedValue({ voiceprintUseForAuth: true });
    mockedFindFirst.mockResolvedValue(null); // not enrolled

    await continuousVoiceprintCallStart({ callId: 'call-1', userId: 'u1', entityId: 'e1', personaId: 'p1' });

    expect(lastWS).toBeNull();
    expect(__getActiveSessionForTesting('call-1')).toBeUndefined();
  });

  it('does NOT open a session when userId is undefined', async () => {
    mockedGetVafConfig.mockResolvedValue({ voiceprintUseForAuth: true });
    mockedFindFirst.mockResolvedValue({ id: 'd1' });

    await continuousVoiceprintCallStart({ callId: 'call-1', userId: undefined, entityId: 'e1', personaId: 'p1' });

    expect(lastWS).toBeNull();
    expect(__getActiveSessionForTesting('call-1')).toBeUndefined();
  });

  it('opens a session when both gates pass and closes it on call end', async () => {
    mockedGetVafConfig.mockResolvedValue({ voiceprintUseForAuth: true });
    mockedFindFirst.mockResolvedValue({ id: 'd1', userId: 'u1', deviceType: 'voiceprint', isActive: true });

    await continuousVoiceprintCallStart({ callId: 'call-1', userId: 'u1', entityId: 'e1', personaId: 'p1' });

    expect(lastWS).not.toBeNull();
    expect(__getActiveSessionForTesting('call-1')).toEqual({
      consecutiveMismatches: 0,
      terminated: false,
      sessionId: 'cont-x',
    });

    await continuousVoiceprintCallEnd({ callId: 'call-1', outcome: 'COMPLETED', duration: 0 });

    expect(lastWS!.closed).toBe(true);
    expect(__getActiveSessionForTesting('call-1')).toBeUndefined();
  });

  it('requests termination after 3 consecutive mismatches', async () => {
    mockedGetVafConfig.mockResolvedValue({ voiceprintUseForAuth: true });
    mockedFindFirst.mockResolvedValue({ id: 'd1', userId: 'u1', deviceType: 'voiceprint', isActive: true });

    const terminator = jest.fn();
    onTerminationRequest(terminator);

    await continuousVoiceprintCallStart({ callId: 'call-1', userId: 'u1', entityId: 'e1', personaId: 'p1' });
    expect(lastWS).not.toBeNull();

    // First mismatch — warning, no termination.
    lastWS!.emit(buildFrame({ verified: false }));
    expect(__getActiveSessionForTesting('call-1')!.consecutiveMismatches).toBe(1);
    expect(terminator).not.toHaveBeenCalled();

    // Second mismatch — still no termination.
    lastWS!.emit(buildFrame({ verified: false }));
    expect(__getActiveSessionForTesting('call-1')!.consecutiveMismatches).toBe(2);
    expect(terminator).not.toHaveBeenCalled();

    // Third mismatch — termination requested.
    lastWS!.emit(buildFrame({ verified: false }));
    expect(__getActiveSessionForTesting('call-1')!.consecutiveMismatches).toBe(3);
    expect(__getActiveSessionForTesting('call-1')!.terminated).toBe(true);
    expect(terminator).toHaveBeenCalledTimes(1);
    expect(terminator).toHaveBeenCalledWith('call-1', 'continuous_voiceprint_mismatch');

    // Further mismatches do NOT re-fire termination.
    lastWS!.emit(buildFrame({ verified: false }));
    expect(terminator).toHaveBeenCalledTimes(1);
  });

  it('requests termination IMMEDIATELY on a single spoof frame', async () => {
    mockedGetVafConfig.mockResolvedValue({ voiceprintUseForAuth: true });
    mockedFindFirst.mockResolvedValue({ id: 'd1', userId: 'u1', deviceType: 'voiceprint', isActive: true });

    const terminator = jest.fn();
    onTerminationRequest(terminator);

    await continuousVoiceprintCallStart({ callId: 'call-1', userId: 'u1', entityId: 'e1', personaId: 'p1' });

    lastWS!.emit(
      buildFrame({
        verified: true,
        antiSpoofResult: { isLiveVoice: false, isNotSynthesized: true, confidence: 0.6 },
      }),
    );

    expect(terminator).toHaveBeenCalledTimes(1);
    expect(terminator).toHaveBeenCalledWith('call-1', 'continuous_voiceprint_spoof');
    expect(__getActiveSessionForTesting('call-1')!.terminated).toBe(true);
  });

  it('onCallEnd is a no-op when no session was opened', async () => {
    expect(() => continuousVoiceprintCallEnd({ callId: 'unknown-call', outcome: 'COMPLETED', duration: 0 })).not.toThrow();
  });

  it('does not double-open if onCallStart is fired twice for the same callId', async () => {
    mockedGetVafConfig.mockResolvedValue({ voiceprintUseForAuth: true });
    mockedFindFirst.mockResolvedValue({ id: 'd1', userId: 'u1', deviceType: 'voiceprint', isActive: true });

    let createdCount = 0;
    __setSpeakerIDClientForTesting(
      fakeSpeakerID(async () => {
        createdCount += 1;
        return { sessionId: `s-${createdCount}`, websocketUrl: `ws://x/${createdCount}` };
      }),
    );

    await continuousVoiceprintCallStart({ callId: 'call-1', userId: 'u1', entityId: 'e1', personaId: 'p1' });
    await continuousVoiceprintCallStart({ callId: 'call-1', userId: 'u1', entityId: 'e1', personaId: 'p1' });

    expect(createdCount).toBe(1);
  });

  it('non-consecutive mismatches do not accumulate to termination', async () => {
    // NOTE: The spec calls for 3 *consecutive* mismatches. A verified frame
    // between mismatches resets the counter back to zero (this is desirable
    // — a one-off failed verification frame shouldn't ratchet toward
    // termination across an entire call).
    mockedGetVafConfig.mockResolvedValue({ voiceprintUseForAuth: true });
    mockedFindFirst.mockResolvedValue({ id: 'd1', userId: 'u1', deviceType: 'voiceprint', isActive: true });

    const terminator = jest.fn();
    onTerminationRequest(terminator);

    await continuousVoiceprintCallStart({ callId: 'call-1', userId: 'u1', entityId: 'e1', personaId: 'p1' });

    // Two mismatches, then a verified, then two more mismatches — not 3 in a row.
    lastWS!.emit(buildFrame({ verified: false }));
    lastWS!.emit(buildFrame({ verified: false }));
    lastWS!.emit(buildFrame({ verified: true }));
    lastWS!.emit(buildFrame({ verified: false }));
    lastWS!.emit(buildFrame({ verified: false }));

    expect(terminator).not.toHaveBeenCalled();
  });
});
