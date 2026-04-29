// ============================================================================
// SSE: VoiceForge call coaching stream
// ----------------------------------------------------------------------------
// GET /api/shadow/voiceforge/calls/[callId]/coaching/stream
//
// Proxies the VAF sentiment WebSocket (which lives behind a server-only API
// key, and uses ws:// — neither of which work from the browser) into a
// standard SSE feed of *coaching strings* the TalkMeThroughButton panel can
// consume via EventSource.
//
// Why this server-side bridge exists (the non-obvious bit):
//   - VAF's sentiment stream is WS, not SSE. EventSource in the browser
//     only speaks SSE.
//   - The VAF API key must never reach the client.
//   - The coaching-message *rules* (anger / confusion / satisfaction) are
//     pure logic that can run anywhere; running them server-side means we
//     ship strings to the client, not raw sentiment numbers — which is also
//     better for privacy and keeps the client tiny.
//   - We deliberately do NOT reuse `monitorCallSentiment` here: that path
//     is owned by WS09 and shapes its callbacks for *call control*
//     (escalation), not for coaching narration. Reusing it would force a
//     call-monitor rewrite that's outside this WS's scope.
// ============================================================================

import { NextRequest } from 'next/server';
import {
  VAFSentimentAnalyzer,
  type SentimentResult,
} from '@/lib/vaf/sentiment-client';
import { buildSentimentCoachingMessage } from '@/lib/shadow/voice/sentiment-coaching';
import { encodeSSEMessage } from '@/lib/realtime/sse';

// ---------------------------------------------------------------------------
// Test seams — let unit tests inject a fake analyzer + fake WS without
// patching the modules under test.
// ---------------------------------------------------------------------------

let analyzerForTesting: VAFSentimentAnalyzer | null = null;

export function __setSentimentAnalyzerForTesting(
  next: VAFSentimentAnalyzer | null,
): void {
  analyzerForTesting = next;
}

/** Minimal WS surface used by this route. Mirrors call-monitor's seam. */
export interface CoachingWebSocket {
  onmessage: ((event: { data: string }) => void) | null;
  onerror?: ((event: unknown) => void) | null;
  onclose?: (() => void) | null;
  close: () => void;
}

export type CoachingWebSocketFactory = (url: string) => CoachingWebSocket;

let webSocketFactory: CoachingWebSocketFactory = (url) => {
  const ctor = (globalThis as unknown as {
    WebSocket: new (url: string) => CoachingWebSocket;
  }).WebSocket;
  return new ctor(url);
};

export function __setWebSocketFactoryForTesting(
  next: CoachingWebSocketFactory,
): void {
  webSocketFactory = next;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

interface RouteContext {
  params: Promise<{ callId: string }> | { callId: string };
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<Response> {
  const params = await Promise.resolve(ctx.params);
  const callId = params.callId;

  if (!callId) {
    return new Response('callId is required', { status: 400 });
  }

  const analyzer = analyzerForTesting ?? new VAFSentimentAnalyzer();

  let session: { sessionId: string; websocketUrl: string };
  try {
    session = await analyzer.createStreamingSession(callId);
  } catch (err) {
    const message = (err as Error).message ?? 'unknown';
    return new Response(`Failed to open VAF sentiment session: ${message}`, {
      status: 502,
    });
  }

  const ws = webSocketFactory(session.websocketUrl);
  const encoder = new TextEncoder();
  let frameCounter = 0;

  const stream = new ReadableStream({
    start(controller) {
      // Send a one-shot "ready" comment so the client EventSource fires
      // `onopen` immediately and the panel can show "listening for
      // coaching" state without waiting for the first sentiment frame.
      controller.enqueue(encoder.encode(': ready\n\n'));

      ws.onmessage = (event) => {
        let sentiment: SentimentResult;
        try {
          const parsed = JSON.parse(event.data) as { sentiment: SentimentResult };
          sentiment = parsed.sentiment;
        } catch {
          // Malformed frame — VAF may emit ping/keepalive. Ignore.
          return;
        }
        if (!sentiment || typeof sentiment !== 'object') return;

        const message = buildSentimentCoachingMessage(sentiment);
        if (!message) return;

        frameCounter += 1;
        const id = `${session.sessionId}-${frameCounter}`;

        try {
          controller.enqueue(
            encoder.encode(
              encodeSSEMessage({
                id,
                event: 'coaching',
                data: JSON.stringify({ id, callId, message }),
              }),
            ),
          );
        } catch {
          // Client disconnected; tear the WS down on next cancel().
        }
      };

      ws.onerror = () => {
        try {
          controller.enqueue(
            encoder.encode(
              encodeSSEMessage({
                event: 'error',
                data: JSON.stringify({ callId, message: 'sentiment stream error' }),
              }),
            ),
          );
        } catch {
          /* client gone — ignore */
        }
      };

      ws.onclose = () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
    },
    cancel() {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Coaching-Session-Id': session.sessionId,
    },
  });
}
