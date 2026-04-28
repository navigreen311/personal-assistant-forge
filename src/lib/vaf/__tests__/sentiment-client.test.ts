// ============================================================================
// Tests — VAFSentimentAnalyzer client
// Mocks fetch for streaming + batch flows. Streaming session creation also
// fakes a WebSocket so callers downstream of this client can rely on the URL.
// ============================================================================

import {
  VAFSentimentAnalyzer,
  type SentimentRecordingAnalysis,
  type SentimentResult,
  type SentimentStreamingSession,
} from '@/lib/vaf/sentiment-client';

// ---------------------------------------------------------------------------
// fetch + WebSocket mocks
// ---------------------------------------------------------------------------

interface MockFetchCall {
  url: string;
  init: RequestInit | undefined;
}

function installMockFetch(responder: (url: string, init?: RequestInit) => Response): {
  calls: MockFetchCall[];
  restore: () => void;
} {
  const calls: MockFetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return responder(url, init);
  }) as unknown as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  close(): void {
    this.closed = true;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VAFSentimentAnalyzer', () => {
  const baseUrl = 'http://vaf.test';
  const apiKey = 'sentiment-key';

  describe('createStreamingSession', () => {
    it('POSTs JSON to /api/v1/sentiment/stream/create and returns the session', async () => {
      const session: SentimentStreamingSession = {
        sessionId: 'sent-sess',
        websocketUrl: 'ws://vaf.test/sent/sent-sess',
      };

      const fetchMock = installMockFetch(() => jsonResponse(session));
      const client = new VAFSentimentAnalyzer({ apiKey, baseUrl });

      const result = await client.createStreamingSession('call-123');

      expect(result).toEqual(session);
      expect(fetchMock.calls[0].url).toBe(`${baseUrl}/api/v1/sentiment/stream/create`);
      expect(fetchMock.calls[0].init?.method).toBe('POST');

      const headers = fetchMock.calls[0].init?.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Authorization).toBe(`Bearer ${apiKey}`);

      const body = JSON.parse(fetchMock.calls[0].init?.body as string);
      expect(body).toEqual({
        callId: 'call-123',
        analyzeInterval: 5,
        includeSuggestions: true,
        alertOnHostile: true,
      });

      fetchMock.restore();
    });

    it('lets a downstream consumer open a WebSocket against the returned URL', async () => {
      const session: SentimentStreamingSession = {
        sessionId: 'abc',
        websocketUrl: 'ws://vaf.test/sent/abc',
      };

      FakeWebSocket.instances = [];
      const originalWS = (globalThis as { WebSocket?: unknown }).WebSocket;
      (globalThis as unknown as { WebSocket: typeof FakeWebSocket }).WebSocket = FakeWebSocket;

      const fetchMock = installMockFetch(() => jsonResponse(session));
      const client = new VAFSentimentAnalyzer({ apiKey, baseUrl });

      const result = await client.createStreamingSession('call-x');

      // Downstream consumer pattern (mirrors call-monitor.ts)
      const Ctor = (globalThis as unknown as { WebSocket: typeof FakeWebSocket }).WebSocket;
      const ws = new Ctor(result.websocketUrl);

      expect(ws).toBeInstanceOf(FakeWebSocket);
      expect(ws.url).toBe('ws://vaf.test/sent/abc');
      expect(FakeWebSocket.instances).toHaveLength(1);

      fetchMock.restore();
      if (originalWS === undefined) {
        delete (globalThis as { WebSocket?: unknown }).WebSocket;
      } else {
        (globalThis as { WebSocket?: unknown }).WebSocket = originalWS;
      }
    });

    it('throws when VAF returns an error', async () => {
      const fetchMock = installMockFetch(
        () => new Response('upstream', { status: 503 }),
      );
      const client = new VAFSentimentAnalyzer({ apiKey, baseUrl });

      await expect(client.createStreamingSession('call-1')).rejects.toThrow(
        /VAF sentiment stream failed: 503/,
      );

      fetchMock.restore();
    });
  });

  describe('analyzeRecording', () => {
    it('POSTs the audioUrl and returns timeline + overall + peaks', async () => {
      const overall: SentimentResult = {
        overall: 'positive',
        confidence: 0.9,
        emotions: {
          anger: 0.05,
          frustration: 0.1,
          anxiety: 0.05,
          satisfaction: 0.85,
          confusion: 0.1,
          urgency: 0.2,
        },
        riskFlags: [],
      };

      const analysis: SentimentRecordingAnalysis = {
        overall,
        timeline: [{ timestamp: 0, sentiment: overall }],
        peaks: [{ timestamp: 12.5, event: 'satisfaction_peak' }],
      };

      const fetchMock = installMockFetch(() => jsonResponse(analysis));
      const client = new VAFSentimentAnalyzer({ apiKey, baseUrl });

      const result = await client.analyzeRecording('https://recordings.example.com/x.wav');

      expect(result).toEqual(analysis);
      expect(fetchMock.calls[0].url).toBe(`${baseUrl}/api/v1/sentiment/analyze`);
      const body = JSON.parse(fetchMock.calls[0].init?.body as string);
      expect(body).toEqual({ audioUrl: 'https://recordings.example.com/x.wav' });

      fetchMock.restore();
    });

    it('throws when VAF returns non-ok', async () => {
      const fetchMock = installMockFetch(() => new Response('bad', { status: 400 }));
      const client = new VAFSentimentAnalyzer({ apiKey, baseUrl });

      await expect(client.analyzeRecording('x')).rejects.toThrow(
        /VAF sentiment analysis failed: 400/,
      );

      fetchMock.restore();
    });
  });
});
