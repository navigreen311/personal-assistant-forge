// ============================================================================
// VoiceForge — Sentiment + Escalation Integration (WS13)
// ----------------------------------------------------------------------------
// Wires `monitorCallSentiment` (lib/shadow/voice/call-monitor.ts) into the
// VoiceForge outbound call lifecycle. When a call starts, we open a VAF
// streaming sentiment session for it; when the call ends, we close it.
//
// onEscalation callback maps to playbook actions:
//   - 'caller_hostile'              -> set `pendingEscalation.deEscalate` flag
//   - 'caller_threatening'          -> end call + log shadowAuthEvent
//                                       (result='fail', actionAttempted=
//                                       'caller_threatening')
//   - 'ai_recommends_human_transfer' -> set `pendingEscalation.transfer` flag
//
// onInsight callback appends coaching notes to the call session insight feed.
// Downstream UI / agent coaching code reads `getCallInsights(callId)` to
// surface them live.
//
// The orchestrator (`outbound-agent.ts`) does NOT call this module directly.
// Instead, this module registers itself with the call-lifecycle registry the
// first time it is imported. That keeps the orchestrator agnostic of which
// integrations are wired up (WS13 sentiment, WS16 voiceprint, etc.).
// ============================================================================

import { prisma } from '@/lib/db';
import { getVafConfig } from '@/lib/shadow/vaf-config';
import {
  monitorCallSentiment,
  type CallMonitorHandle,
  type EscalationReason,
} from '@/lib/shadow/voice/call-monitor';
import {
  onCallStart,
  onCallEnd,
  type CallStartContext,
  type CallEndContext,
} from '@/modules/voiceforge/services/call-lifecycle';

// ---------------------------------------------------------------------------
// Per-call session state
// ---------------------------------------------------------------------------

/**
 * Flags set by the sentiment escalation handler. The call orchestrator (or
 * any downstream consumer) can read these to react: e.g. switch to a
 * de-escalation script, terminate the call, or flag for human transfer.
 */
export interface PendingEscalation {
  deEscalate: boolean;
  endCall: boolean;
  transfer: boolean;
  /** Most recent escalation reason emitted by the sentiment monitor. */
  lastReason?: EscalationReason;
}

interface CallSentimentSession {
  handle: CallMonitorHandle;
  pendingEscalation: PendingEscalation;
  insights: string[];
}

const sessions = new Map<string, CallSentimentSession>();

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleCallStart(ctx: CallStartContext): Promise<void> {
  // Without a userId we can't look up the per-user config flag; in that case
  // we err on the side of NOT subscribing (the user hasn't consented).
  if (!ctx.userId) {
    return;
  }

  let cfg;
  try {
    cfg = await getVafConfig(ctx.userId);
  } catch (err) {
    console.warn(
      `[vf-sentiment] failed to load VAF config for user ${ctx.userId}:`,
      err instanceof Error ? err.message : err,
    );
    return;
  }

  if (!cfg.sentimentOnVoiceforgeCalls) {
    return;
  }

  const pendingEscalation: PendingEscalation = {
    deEscalate: false,
    endCall: false,
    transfer: false,
  };
  const insights: string[] = [];

  let handle: CallMonitorHandle;
  try {
    handle = await monitorCallSentiment(
      ctx.callId,
      ctx.playbook ?? null,
      (reason, sentiment) => {
        pendingEscalation.lastReason = reason;
        switch (reason) {
          case 'caller_hostile':
            pendingEscalation.deEscalate = true;
            break;
          case 'caller_threatening':
            pendingEscalation.endCall = true;
            // Best-effort log to ShadowAuthEvent for audit trail.
            void prisma.shadowAuthEvent
              .create({
                data: {
                  userId: ctx.userId,
                  method: 'voiceforge_call',
                  result: 'fail',
                  riskLevel: 'high',
                  actionAttempted: 'caller_threatening',
                },
              })
              .catch((err) => {
                console.warn(
                  `[vf-sentiment] failed to log threatening-caller event for callId=${ctx.callId}:`,
                  err instanceof Error ? err.message : err,
                );
              });
            break;
          case 'ai_recommends_human_transfer':
            pendingEscalation.transfer = true;
            break;
        }
        // Reference `sentiment` so type-checkers don't complain about unused
        // params; future work may want to log the score that triggered.
        void sentiment;
      },
      (insight) => {
        insights.push(insight);
      },
      ctx.messageId,
    );
  } catch (err) {
    console.warn(
      `[vf-sentiment] failed to start sentiment monitor for callId=${ctx.callId}:`,
      err instanceof Error ? err.message : err,
    );
    return;
  }

  sessions.set(ctx.callId, { handle, pendingEscalation, insights });
}

function handleCallEnd(ctx: CallEndContext): void {
  const session = sessions.get(ctx.callId);
  if (!session) return;
  try {
    session.handle.close();
  } catch (err) {
    console.warn(
      `[vf-sentiment] failed to close sentiment session for callId=${ctx.callId}:`,
      err instanceof Error ? err.message : err,
    );
  }
  sessions.delete(ctx.callId);
}

// ---------------------------------------------------------------------------
// Public read helpers
// ---------------------------------------------------------------------------

/**
 * Read the current escalation flags for an in-progress call. Returns
 * undefined if no sentiment session is active for this call.
 */
export function getPendingEscalation(callId: string): PendingEscalation | undefined {
  return sessions.get(callId)?.pendingEscalation;
}

/**
 * Read accumulated coaching insights for an in-progress call. Returns an
 * empty array if no session is active.
 */
export function getCallInsights(callId: string): string[] {
  return sessions.get(callId)?.insights.slice() ?? [];
}

// ---------------------------------------------------------------------------
// Registration — happens once at module load
// ---------------------------------------------------------------------------

let registered = false;
let unregisterStart: (() => void) | null = null;
let unregisterEnd: (() => void) | null = null;

/**
 * Register the sentiment integration with the call-lifecycle registry. Safe
 * to call multiple times — registration is idempotent.
 */
export function registerSentimentIntegration(): void {
  if (registered) return;
  unregisterStart = onCallStart(handleCallStart);
  unregisterEnd = onCallEnd(handleCallEnd);
  registered = true;
}

/** Test helper: tear down registration and clear in-memory sessions. */
export function __resetSentimentIntegrationForTesting(): void {
  unregisterStart?.();
  unregisterEnd?.();
  unregisterStart = null;
  unregisterEnd = null;
  registered = false;
  sessions.clear();
}

// Auto-register on import. Calling code can simply
//   import '@/modules/voiceforge/services/sentiment-integration';
// to wire it up.
registerSentimentIntegration();
