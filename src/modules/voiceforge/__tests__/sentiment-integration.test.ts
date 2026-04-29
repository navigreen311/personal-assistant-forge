/**
 * WS13 unit tests: VoiceForge call sentiment integration.
 *
 * Covers:
 *   - Sentiment subscription starts on call begin (when flag enabled)
 *   - No subscription when sentimentOnVoiceforgeCalls=false
 *   - Hostile callback sets de-escalation flag
 *   - Threatening callback flags end-call + writes shadowAuthEvent
 *   - Transfer callback flags transfer
 *   - Subscription `close()` is invoked on call end
 *
 * Mocks: monitorCallSentiment, getVafConfig, prisma.shadowAuthEvent.
 */

import type { SentimentResult } from '@/lib/vaf/sentiment-client';
import type {
  EscalationReason,
  CallMonitorHandle,
} from '@/lib/shadow/voice/call-monitor';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMonitorCallSentiment = jest.fn();

jest.mock('@/lib/shadow/voice/call-monitor', () => ({
  monitorCallSentiment: (...args: unknown[]) => mockMonitorCallSentiment(...args),
}));

const mockGetVafConfig = jest.fn();

jest.mock('@/lib/shadow/vaf-config', () => ({
  getVafConfig: (...args: unknown[]) => mockGetVafConfig(...args),
}));

const mockShadowAuthEventCreate = jest.fn().mockResolvedValue({});

jest.mock('@/lib/db', () => ({
  prisma: {
    shadowAuthEvent: {
      create: (...args: unknown[]) => mockShadowAuthEventCreate(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Lazy imports — the registry auto-registers on import, so we want a clean
// state per test.
// ---------------------------------------------------------------------------

import {
  emitCallStart,
  emitCallEnd,
  __resetCallLifecycleHandlersForTesting,
} from '@/modules/voiceforge/services/call-lifecycle';
import {
  registerSentimentIntegration,
  __resetSentimentIntegrationForTesting,
  getPendingEscalation,
  getCallInsights,
} from '@/modules/voiceforge/services/sentiment-integration';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CapturedCallbacks {
  onEscalation: (reason: EscalationReason, sentiment: SentimentResult) => void;
  onInsight: (insight: string) => void;
}

function fakeHandle(): CallMonitorHandle & { closeMock: jest.Mock } {
  const closeMock = jest.fn();
  return {
    sessionId: 'sess-1',
    close: closeMock,
    closeMock,
  } as CallMonitorHandle & { closeMock: jest.Mock };
}

function captureCallbacks(handle: CallMonitorHandle): {
  handle: CallMonitorHandle;
  callbacksPromise: Promise<CapturedCallbacks>;
} {
  let resolve: (cbs: CapturedCallbacks) => void;
  const callbacksPromise = new Promise<CapturedCallbacks>((r) => {
    resolve = r;
  });
  mockMonitorCallSentiment.mockImplementationOnce(
    async (
      _callId: string,
      _playbook: unknown,
      onEscalation: CapturedCallbacks['onEscalation'],
      onInsight: CapturedCallbacks['onInsight'],
    ) => {
      resolve({ onEscalation, onInsight });
      return handle;
    },
  );
  return { handle, callbacksPromise };
}

const STANDARD_CONFIG = {
  userId: 'user-1',
  sttProvider: 'vaf',
  ttsProvider: 'vaf',
  audioEnhancement: true,
  noiseCancellation: true,
  echoSuppression: true,
  voiceprintEnrolled: false,
  voiceprintEnrolledAt: null,
  voiceprintUseForAuth: false,
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
};

const FAKE_SENTIMENT: SentimentResult = {
  overall: 'neutral',
  confidence: 0.9,
  emotions: {
    anger: 0,
    frustration: 0,
    anxiety: 0,
    satisfaction: 0,
    confusion: 0,
    urgency: 0,
  },
  riskFlags: [],
  suggestedAction: 'continue',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockMonitorCallSentiment.mockReset();
  mockGetVafConfig.mockReset();
  mockShadowAuthEventCreate.mockClear();
  __resetSentimentIntegrationForTesting();
  __resetCallLifecycleHandlersForTesting();
  registerSentimentIntegration();
});

describe('Sentiment subscription on call start', () => {
  it('subscribes when sentimentOnVoiceforgeCalls=true', async () => {
    mockGetVafConfig.mockResolvedValue({ ...STANDARD_CONFIG });
    const handle = fakeHandle();
    captureCallbacks(handle);

    await emitCallStart({
      callId: 'call-1',
      userId: 'user-1',
      entityId: 'ent-1',
      personaId: 'per-1',
      playbook: { foo: 'bar' },
    });

    expect(mockMonitorCallSentiment).toHaveBeenCalledTimes(1);
    expect(mockMonitorCallSentiment.mock.calls[0][0]).toBe('call-1');
  });

  it('does NOT subscribe when sentimentOnVoiceforgeCalls=false', async () => {
    mockGetVafConfig.mockResolvedValue({ ...STANDARD_CONFIG, sentimentOnVoiceforgeCalls: false });

    await emitCallStart({
      callId: 'call-2',
      userId: 'user-1',
      entityId: 'ent-1',
      personaId: 'per-1',
    });

    expect(mockMonitorCallSentiment).not.toHaveBeenCalled();
  });

  it('does NOT subscribe when userId is missing', async () => {
    await emitCallStart({
      callId: 'call-3',
      entityId: 'ent-1',
      personaId: 'per-1',
    });

    expect(mockGetVafConfig).not.toHaveBeenCalled();
    expect(mockMonitorCallSentiment).not.toHaveBeenCalled();
  });

  it('forwards messageId to monitorCallSentiment when provided', async () => {
    mockGetVafConfig.mockResolvedValue({ ...STANDARD_CONFIG });
    captureCallbacks(fakeHandle());

    await emitCallStart({
      callId: 'call-4',
      userId: 'user-1',
      entityId: 'ent-1',
      personaId: 'per-1',
      messageId: 'msg-99',
    });

    expect(mockMonitorCallSentiment.mock.calls[0][4]).toBe('msg-99');
  });
});

describe('Escalation callback wiring', () => {
  it('caller_hostile sets the deEscalate flag', async () => {
    mockGetVafConfig.mockResolvedValue({ ...STANDARD_CONFIG });
    const { callbacksPromise } = captureCallbacks(fakeHandle());

    await emitCallStart({
      callId: 'call-h',
      userId: 'user-1',
      entityId: 'ent-1',
      personaId: 'per-1',
    });

    const { onEscalation } = await callbacksPromise;
    onEscalation('caller_hostile', FAKE_SENTIMENT);

    const flags = getPendingEscalation('call-h');
    expect(flags).toBeDefined();
    expect(flags?.deEscalate).toBe(true);
    expect(flags?.endCall).toBe(false);
    expect(flags?.transfer).toBe(false);
    expect(flags?.lastReason).toBe('caller_hostile');
  });

  it('caller_threatening sets endCall + logs shadowAuthEvent', async () => {
    mockGetVafConfig.mockResolvedValue({ ...STANDARD_CONFIG });
    const { callbacksPromise } = captureCallbacks(fakeHandle());

    await emitCallStart({
      callId: 'call-t',
      userId: 'user-1',
      entityId: 'ent-1',
      personaId: 'per-1',
    });

    const { onEscalation } = await callbacksPromise;
    onEscalation('caller_threatening', FAKE_SENTIMENT);

    // shadowAuthEvent.create is fire-and-forget — give the microtask queue a beat.
    await new Promise((r) => setImmediate(r));

    const flags = getPendingEscalation('call-t');
    expect(flags?.endCall).toBe(true);
    expect(flags?.lastReason).toBe('caller_threatening');

    expect(mockShadowAuthEventCreate).toHaveBeenCalledTimes(1);
    expect(mockShadowAuthEventCreate.mock.calls[0][0]).toMatchObject({
      data: {
        userId: 'user-1',
        method: 'voiceforge_call',
        result: 'fail',
        riskLevel: 'high',
        actionAttempted: 'caller_threatening',
      },
    });
  });

  it('ai_recommends_human_transfer sets the transfer flag', async () => {
    mockGetVafConfig.mockResolvedValue({ ...STANDARD_CONFIG });
    const { callbacksPromise } = captureCallbacks(fakeHandle());

    await emitCallStart({
      callId: 'call-x',
      userId: 'user-1',
      entityId: 'ent-1',
      personaId: 'per-1',
    });

    const { onEscalation } = await callbacksPromise;
    onEscalation('ai_recommends_human_transfer', FAKE_SENTIMENT);

    expect(getPendingEscalation('call-x')?.transfer).toBe(true);
  });
});

describe('Insight callback', () => {
  it('appends insights to the per-call feed', async () => {
    mockGetVafConfig.mockResolvedValue({ ...STANDARD_CONFIG });
    const { callbacksPromise } = captureCallbacks(fakeHandle());

    await emitCallStart({
      callId: 'call-i',
      userId: 'user-1',
      entityId: 'ent-1',
      personaId: 'per-1',
    });

    const { onInsight } = await callbacksPromise;
    onInsight('Caller seems confused');
    onInsight('Call going well');

    expect(getCallInsights('call-i')).toEqual([
      'Caller seems confused',
      'Call going well',
    ]);
  });
});

describe('Subscription close on call end', () => {
  it('calls handle.close() when emitCallEnd fires for the same callId', async () => {
    mockGetVafConfig.mockResolvedValue({ ...STANDARD_CONFIG });
    const handle = fakeHandle();
    captureCallbacks(handle);

    await emitCallStart({
      callId: 'call-e',
      userId: 'user-1',
      entityId: 'ent-1',
      personaId: 'per-1',
    });

    await emitCallEnd({ callId: 'call-e', outcome: 'INTERESTED', duration: 60 });

    expect(handle.closeMock).toHaveBeenCalledTimes(1);
    expect(getPendingEscalation('call-e')).toBeUndefined();
  });

  it('is a no-op when no session exists for the callId', async () => {
    await expect(
      emitCallEnd({ callId: 'nonexistent', outcome: 'NO_ANSWER' }),
    ).resolves.toBeUndefined();
  });
});

describe('Failure isolation', () => {
  it('swallows errors thrown by monitorCallSentiment', async () => {
    mockGetVafConfig.mockResolvedValue({ ...STANDARD_CONFIG });
    mockMonitorCallSentiment.mockRejectedValueOnce(new Error('VAF down'));

    await expect(
      emitCallStart({
        callId: 'call-f',
        userId: 'user-1',
        entityId: 'ent-1',
        personaId: 'per-1',
      }),
    ).resolves.toBeUndefined();

    expect(getPendingEscalation('call-f')).toBeUndefined();
  });

  it('swallows errors thrown by getVafConfig', async () => {
    mockGetVafConfig.mockRejectedValueOnce(new Error('db down'));

    await expect(
      emitCallStart({
        callId: 'call-g',
        userId: 'user-1',
        entityId: 'ent-1',
        personaId: 'per-1',
      }),
    ).resolves.toBeUndefined();

    expect(mockMonitorCallSentiment).not.toHaveBeenCalled();
  });
});
