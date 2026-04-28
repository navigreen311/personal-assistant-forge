// ============================================================================
// Tests — monitorCallSentiment
// Feeds simulated WS messages and asserts onEscalation / onInsight fire with
// the right reasons. Uses the test seams to swap in a fake VAFSentimentAnalyzer
// and a fake WebSocket factory so no real network is involved.
// ============================================================================

const mockWriteSentimentToMessage = jest.fn();

jest.mock('@/lib/shadow/voice/sentiment-storage', () => ({
  writeSentimentToMessage: (...args: unknown[]) =>
    mockWriteSentimentToMessage(...args),
}));

import {
  monitorCallSentiment,
  __setSentimentAnalyzerForTesting,
  __setWebSocketFactoryForTesting,
  type CallMonitorWebSocket,
} from '@/lib/shadow/voice/call-monitor';
import {
  VAFSentimentAnalyzer,
  type SentimentResult,
} from '@/lib/vaf/sentiment-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class FakeWS implements CallMonitorWebSocket {
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
  }

  emit(sentiment: SentimentResult): void {
    this.onmessage?.({ data: JSON.stringify({ sentiment }) });
  }

  emitRaw(data: string): void {
    this.onmessage?.({ data });
  }

  close(): void {
    this.closed = true;
  }
}

function makeAnalyzerStub(): VAFSentimentAnalyzer {
  return {
    createStreamingSession: jest.fn(async (_callId: string) => ({
      sessionId: 'sess-xyz',
      websocketUrl: 'ws://vaf.test/sent/sess-xyz',
    })),
    analyzeRecording: jest.fn(),
  } as unknown as VAFSentimentAnalyzer;
}

function buildSentiment(overrides: Partial<SentimentResult> = {}): SentimentResult {
  const base: SentimentResult = {
    overall: 'neutral',
    confidence: 0.8,
    emotions: {
      anger: 0,
      frustration: 0,
      anxiety: 0,
      satisfaction: 0,
      confusion: 0,
      urgency: 0,
    },
    riskFlags: [],
  };
  return {
    ...base,
    ...overrides,
    emotions: { ...base.emotions, ...(overrides.emotions ?? {}) },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let lastWS: FakeWS | null = null;

beforeEach(() => {
  lastWS = null;
  mockWriteSentimentToMessage.mockReset();
  mockWriteSentimentToMessage.mockResolvedValue(undefined);
  __setSentimentAnalyzerForTesting(makeAnalyzerStub());
  __setWebSocketFactoryForTesting((url) => {
    lastWS = new FakeWS(url);
    return lastWS;
  });
});

afterAll(() => {
  __setSentimentAnalyzerForTesting(null);
  // Reset factory back to default by setting one that throws if used
  // (each test re-sets it via beforeEach so this is just hygiene).
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('monitorCallSentiment', () => {
  it('opens a WS against the URL returned by createStreamingSession', async () => {
    const onEscalation = jest.fn();
    const onInsight = jest.fn();

    const handle = await monitorCallSentiment('call-1', null, onEscalation, onInsight);

    expect(handle.sessionId).toBe('sess-xyz');
    expect(lastWS).not.toBeNull();
    expect(lastWS!.url).toBe('ws://vaf.test/sent/sess-xyz');

    handle.close();
    expect(lastWS!.closed).toBe(true);
  });

  it('fires caller_hostile when overall is hostile', async () => {
    const onEscalation = jest.fn();
    const onInsight = jest.fn();

    await monitorCallSentiment('call-1', null, onEscalation, onInsight);
    lastWS!.emit(buildSentiment({ overall: 'hostile' }));

    expect(onEscalation).toHaveBeenCalledWith('caller_hostile', expect.objectContaining({ overall: 'hostile' }));
  });

  it('fires caller_hostile when anger > 0.8', async () => {
    const onEscalation = jest.fn();
    const onInsight = jest.fn();

    await monitorCallSentiment('call-1', null, onEscalation, onInsight);
    lastWS!.emit(buildSentiment({ emotions: { anger: 0.9 } as SentimentResult['emotions'] }));

    expect(onEscalation).toHaveBeenCalledTimes(1);
    expect(onEscalation).toHaveBeenCalledWith('caller_hostile', expect.any(Object));
  });

  it('does NOT fire caller_hostile when anger is at the threshold (0.8)', async () => {
    const onEscalation = jest.fn();
    const onInsight = jest.fn();

    await monitorCallSentiment('call-1', null, onEscalation, onInsight);
    lastWS!.emit(buildSentiment({ emotions: { anger: 0.8 } as SentimentResult['emotions'] }));

    expect(onEscalation).not.toHaveBeenCalled();
  });

  it('fires caller_threatening when riskFlags contains "threatening"', async () => {
    const onEscalation = jest.fn();
    const onInsight = jest.fn();

    await monitorCallSentiment('call-1', null, onEscalation, onInsight);
    lastWS!.emit(buildSentiment({ riskFlags: ['escalating', 'threatening'] }));

    expect(onEscalation).toHaveBeenCalledWith('caller_threatening', expect.any(Object));
  });

  it('fires ai_recommends_human_transfer when suggestedAction = transfer_to_human', async () => {
    const onEscalation = jest.fn();
    const onInsight = jest.fn();

    await monitorCallSentiment('call-1', null, onEscalation, onInsight);
    lastWS!.emit(buildSentiment({ suggestedAction: 'transfer_to_human' }));

    expect(onEscalation).toHaveBeenCalledWith('ai_recommends_human_transfer', expect.any(Object));
  });

  it('fires confusion insight when confusion > 0.7', async () => {
    const onEscalation = jest.fn();
    const onInsight = jest.fn();

    await monitorCallSentiment('call-1', null, onEscalation, onInsight);
    lastWS!.emit(buildSentiment({ emotions: { confusion: 0.9 } as SentimentResult['emotions'] }));

    expect(onInsight).toHaveBeenCalledWith(expect.stringMatching(/confused/i));
  });

  it('fires satisfaction insight when satisfaction > 0.8', async () => {
    const onEscalation = jest.fn();
    const onInsight = jest.fn();

    await monitorCallSentiment('call-1', null, onEscalation, onInsight);
    lastWS!.emit(buildSentiment({ emotions: { satisfaction: 0.95 } as SentimentResult['emotions'] }));

    expect(onInsight).toHaveBeenCalledWith(expect.stringMatching(/going well|commitment/i));
  });

  it('ignores malformed JSON messages without crashing', async () => {
    const onEscalation = jest.fn();
    const onInsight = jest.fn();

    await monitorCallSentiment('call-1', null, onEscalation, onInsight);
    expect(() => lastWS!.emitRaw('not json')).not.toThrow();
    expect(onEscalation).not.toHaveBeenCalled();
    expect(onInsight).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Optional ShadowMessage persistence (messageId branch)
  // -------------------------------------------------------------------------

  it('does NOT call writeSentimentToMessage when messageId is omitted', async () => {
    const onEscalation = jest.fn();
    const onInsight = jest.fn();

    await monitorCallSentiment('call-1', null, onEscalation, onInsight);
    lastWS!.emit(buildSentiment({ overall: 'positive' }));

    expect(mockWriteSentimentToMessage).not.toHaveBeenCalled();
  });

  it('calls writeSentimentToMessage with messageId + sentiment when provided', async () => {
    const onEscalation = jest.fn();
    const onInsight = jest.fn();

    await monitorCallSentiment(
      'call-1',
      null,
      onEscalation,
      onInsight,
      'msg-42',
    );

    const sentiment = buildSentiment({ overall: 'positive' });
    lastWS!.emit(sentiment);

    expect(mockWriteSentimentToMessage).toHaveBeenCalledTimes(1);
    expect(mockWriteSentimentToMessage).toHaveBeenCalledWith(
      'msg-42',
      expect.objectContaining({ overall: 'positive' }),
    );
  });

  it('still dispatches escalation/insight when persistence rejects', async () => {
    mockWriteSentimentToMessage.mockRejectedValueOnce(new Error('db down'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const onEscalation = jest.fn();
    const onInsight = jest.fn();

    await monitorCallSentiment(
      'call-1',
      null,
      onEscalation,
      onInsight,
      'msg-42',
    );

    lastWS!.emit(buildSentiment({ overall: 'hostile' }));

    expect(onEscalation).toHaveBeenCalledWith(
      'caller_hostile',
      expect.any(Object),
    );

    // Allow the rejected promise to settle so the warn is captured.
    await new Promise((resolve) => setImmediate(resolve));
    warnSpy.mockRestore();
  });

  it('does NOT call writeSentimentToMessage on malformed messages', async () => {
    const onEscalation = jest.fn();
    const onInsight = jest.fn();

    await monitorCallSentiment(
      'call-1',
      null,
      onEscalation,
      onInsight,
      'msg-42',
    );
    lastWS!.emitRaw('not json');

    expect(mockWriteSentimentToMessage).not.toHaveBeenCalled();
  });
});
