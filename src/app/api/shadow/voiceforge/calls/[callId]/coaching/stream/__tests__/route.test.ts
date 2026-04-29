// ============================================================================
// Tests — SSE coaching stream route
// Verifies the route opens a VAF sentiment session, transforms each
// SentimentResult frame through buildSentimentCoachingMessage, and emits
// SSE-encoded `coaching` events for non-null results only.
// ============================================================================

/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import {
  GET,
  __setSentimentAnalyzerForTesting,
  __setWebSocketFactoryForTesting,
  type CoachingWebSocket,
} from '../route';
import {
  VAFSentimentAnalyzer,
  type SentimentResult,
} from '@/lib/vaf/sentiment-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class FakeWS implements CoachingWebSocket {
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
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

function makeAnalyzerStub(
  url = 'ws://vaf.test/sent/sess-zzz',
): VAFSentimentAnalyzer {
  return {
    createStreamingSession: jest.fn(async () => ({
      sessionId: 'sess-zzz',
      websocketUrl: url,
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

async function readAll(stream: ReadableStream<Uint8Array>, limitBytes = 32768): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  // Drain any chunks already enqueued before the test cancels the stream.
  // We use a tight bounded read so the test doesn't hang on a still-open stream.
  while (out.length < limitBytes) {
    // Race the read against a microtask so we exit when nothing more is queued.
    const result = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value?: undefined }>((resolve) =>
        setImmediate(() => resolve({ done: true })),
      ),
    ]);
    if (result.done) break;
    out += decoder.decode(result.value, { stream: true });
  }
  reader.releaseLock();
  return out;
}

function makeRequest(callId: string): NextRequest {
  return new NextRequest(
    new Request(`http://localhost/api/shadow/voiceforge/calls/${callId}/coaching/stream`),
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let lastWS: FakeWS | null = null;

beforeEach(() => {
  lastWS = null;
  __setSentimentAnalyzerForTesting(makeAnalyzerStub());
  __setWebSocketFactoryForTesting((url) => {
    lastWS = new FakeWS(url);
    return lastWS;
  });
});

afterAll(() => {
  __setSentimentAnalyzerForTesting(null);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/shadow/voiceforge/calls/[callId]/coaching/stream', () => {
  it('opens a VAF session and returns SSE response headers', async () => {
    const res = await GET(makeRequest('call-123'), {
      params: Promise.resolve({ callId: 'call-123' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toContain('no-cache');
    expect(res.headers.get('X-Coaching-Session-Id')).toBe('sess-zzz');
    expect(lastWS).not.toBeNull();
    expect(lastWS!.url).toBe('ws://vaf.test/sent/sess-zzz');

    await res.body?.cancel();
  });

  it('returns 400 when callId is missing', async () => {
    const res = await GET(makeRequest(''), {
      params: Promise.resolve({ callId: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 502 when VAF session creation fails', async () => {
    __setSentimentAnalyzerForTesting({
      createStreamingSession: jest.fn(async () => {
        throw new Error('vaf down');
      }),
      analyzeRecording: jest.fn(),
    } as unknown as VAFSentimentAnalyzer);

    const res = await GET(makeRequest('call-x'), {
      params: Promise.resolve({ callId: 'call-x' }),
    });
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toMatch(/vaf down/);
  });

  it('emits a coaching SSE event for hostile sentiment', async () => {
    const res = await GET(makeRequest('call-1'), {
      params: Promise.resolve({ callId: 'call-1' }),
    });
    expect(lastWS).not.toBeNull();

    lastWS!.emit(buildSentiment({ overall: 'hostile' }));

    const body = await readAll(res.body as ReadableStream<Uint8Array>);
    expect(body).toContain('event: coaching');
    expect(body).toMatch(/frustrated/);
    expect(body).toContain('"callId":"call-1"');

    await res.body?.cancel();
  });

  it('does NOT emit a coaching event when the frame yields null (neutral)', async () => {
    const res = await GET(makeRequest('call-1'), {
      params: Promise.resolve({ callId: 'call-1' }),
    });
    lastWS!.emit(buildSentiment({ overall: 'neutral' }));

    const body = await readAll(res.body as ReadableStream<Uint8Array>);
    expect(body).not.toContain('event: coaching');

    await res.body?.cancel();
  });

  it('does NOT emit a coaching event when threatening (escalation, not coaching)', async () => {
    const res = await GET(makeRequest('call-1'), {
      params: Promise.resolve({ callId: 'call-1' }),
    });
    lastWS!.emit(
      buildSentiment({
        riskFlags: ['threatening'],
        overall: 'hostile',
      }),
    );

    const body = await readAll(res.body as ReadableStream<Uint8Array>);
    expect(body).not.toContain('event: coaching');

    await res.body?.cancel();
  });

  it('ignores malformed JSON frames without crashing', async () => {
    const res = await GET(makeRequest('call-1'), {
      params: Promise.resolve({ callId: 'call-1' }),
    });
    expect(() => lastWS!.emitRaw('not json')).not.toThrow();

    const body = await readAll(res.body as ReadableStream<Uint8Array>);
    expect(body).not.toContain('event: coaching');

    await res.body?.cancel();
  });

  it('closes the underlying VAF WebSocket when the SSE stream is cancelled', async () => {
    const res = await GET(makeRequest('call-1'), {
      params: Promise.resolve({ callId: 'call-1' }),
    });
    expect(lastWS!.closed).toBe(false);

    await res.body?.cancel();
    expect(lastWS!.closed).toBe(true);
  });
});
