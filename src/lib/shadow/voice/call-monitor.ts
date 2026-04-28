// ============================================================================
// Shadow Call Sentiment Monitor
// ----------------------------------------------------------------------------
// Opens a VAF sentiment streaming WebSocket for an in-progress VoiceForge
// call and dispatches escalation triggers (hostility, threats, AI-recommended
// transfer) plus coaching insights (confusion, satisfaction) back to the
// caller-supplied handlers.
// ============================================================================

import {
  VAFSentimentAnalyzer,
  type SentimentResult,
} from '@/lib/vaf/sentiment-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscalationReason =
  | 'caller_hostile'
  | 'caller_threatening'
  | 'ai_recommends_human_transfer';

export type EscalationCallback = (
  reason: EscalationReason,
  sentiment: SentimentResult,
) => void;

export type InsightCallback = (insight: string) => void;

export interface CallMonitorHandle {
  sessionId: string;
  close: () => void;
}

/**
 * Minimal subset of `WebSocket` we actually use. Lets the test suite swap
 * in a fake socket without depending on `lib.dom.d.ts`.
 */
export interface CallMonitorWebSocket {
  onmessage: ((event: { data: string }) => void) | null;
  onerror?: ((event: unknown) => void) | null;
  close: () => void;
}

export type WebSocketFactory = (url: string) => CallMonitorWebSocket;

// ---------------------------------------------------------------------------
// Module dependencies (overridable for tests)
// ---------------------------------------------------------------------------

let analyzer: VAFSentimentAnalyzer | null = null;

function getAnalyzer(): VAFSentimentAnalyzer {
  if (!analyzer) {
    analyzer = new VAFSentimentAnalyzer();
  }
  return analyzer;
}

let webSocketFactory: WebSocketFactory = (url) => {
  // Use the global WebSocket constructor at runtime. Cast through `unknown`
  // so this file does not require `lib.dom` to compile in the node test env.
  const ctor = (globalThis as unknown as {
    WebSocket: new (url: string) => CallMonitorWebSocket;
  }).WebSocket;
  return new ctor(url);
};

export function __setSentimentAnalyzerForTesting(
  next: VAFSentimentAnalyzer | null,
): void {
  analyzer = next;
}

export function __setWebSocketFactoryForTesting(next: WebSocketFactory): void {
  webSocketFactory = next;
}

// ---------------------------------------------------------------------------
// Thresholds (kept as named constants so they're easy to tune)
// ---------------------------------------------------------------------------

const ANGER_ESCALATION_THRESHOLD = 0.8;
const CONFUSION_INSIGHT_THRESHOLD = 0.7;
const SATISFACTION_INSIGHT_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start monitoring a call's sentiment in real time.
 *
 * @param callId   VoiceForge call id passed to VAF.
 * @param playbook The playbook driving this call (currently unused in the
 *                 dispatch logic, but accepted for parity with the spec and
 *                 future per-playbook overrides).
 * @param onEscalation Fired for events that should change call control flow:
 *                     hostility, threats, or VAF's own transfer recommendation.
 * @param onInsight    Fired for coaching cues: caller confusion or satisfaction.
 * @returns A handle exposing the VAF sessionId and a `close()` to tear down
 *          the websocket.
 */
export async function monitorCallSentiment(
  callId: string,
  playbook: unknown,
  onEscalation: EscalationCallback,
  onInsight: InsightCallback,
): Promise<CallMonitorHandle> {
  // `playbook` is reserved for future per-playbook escalation overrides.
  void playbook;

  const session = await getAnalyzer().createStreamingSession(callId);
  const ws = webSocketFactory(session.websocketUrl);

  ws.onmessage = (event) => {
    let sentiment: SentimentResult;
    try {
      const parsed = JSON.parse(event.data) as { sentiment: SentimentResult };
      sentiment = parsed.sentiment;
    } catch {
      // Malformed message — skip silently. VAF can transiently emit pings.
      return;
    }
    if (!sentiment || typeof sentiment !== 'object') return;

    // --- Escalation triggers ----------------------------------------------
    if (
      sentiment.overall === 'hostile' ||
      sentiment.emotions.anger > ANGER_ESCALATION_THRESHOLD
    ) {
      onEscalation('caller_hostile', sentiment);
    }

    if (sentiment.riskFlags.includes('threatening')) {
      onEscalation('caller_threatening', sentiment);
    }

    if (sentiment.suggestedAction === 'transfer_to_human') {
      onEscalation('ai_recommends_human_transfer', sentiment);
    }

    // --- Coaching insights -------------------------------------------------
    if (sentiment.emotions.confusion > CONFUSION_INSIGHT_THRESHOLD) {
      onInsight('Caller seems confused — Shadow may want to simplify the message');
    }

    if (sentiment.emotions.satisfaction > SATISFACTION_INSIGHT_THRESHOLD) {
      onInsight('Call going well — good time to ask for commitment');
    }
  };

  return {
    sessionId: session.sessionId,
    close: () => ws.close(),
  };
}
