// ============================================================================
// Shadow Continuous Voiceprint Verification
// ----------------------------------------------------------------------------
// Per VAF integration spec section 2.1: while a VoiceForge call is in
// progress, VAF re-verifies the speaker every ~30s over a websocket. This
// module:
//
//   1. Opens that websocket via VAFSpeakerID.createContinuousSession.
//   2. Dispatches each frame to onVerified / onMismatch / onSpoof callbacks.
//   3. Logs a shadowAuthEvent on mismatch (fail) and spoof (HIGH-risk fail).
//   4. Wires itself into call lifecycle: opens the WS at call start (if
//      voiceprintUseForAuth=true and the user is enrolled), closes it at
//      call end. Three consecutive mismatches OR a single spoof
//      detection requests call termination.
//
// Coordination with WS13 (sentiment subscription):
//   We register against the shared VoiceForge call-lifecycle registry at
//   `@/modules/voiceforge/services/call-lifecycle` so WS13 sentiment and
//   WS16 voiceprint subscribe independently to the same emit points.
// ============================================================================

import { prisma } from '@/lib/db';
import { VAFSpeakerID, type VoiceprintAntiSpoofResult } from '@/lib/vaf/speaker-id-client';
import { getVafConfig } from '@/lib/shadow/vaf-config';
import {
  onCallStart,
  onCallEnd,
  type CallStartContext,
  type CallEndContext,
} from '@/modules/voiceforge/services/call-lifecycle';
import { requestCallTermination } from '@/lib/shadow/voice/call-lifecycle';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerificationFrame {
  confidence: number;
  timestamp: number;
}

/**
 * Shape of each WS frame VAF emits. Matches the spec contract; antiSpoof
 * mirrors the per-sample anti-spoof result returned by `verify`.
 */
export interface ContinuousVerificationFrame {
  verified: boolean;
  confidence: number;
  antiSpoofResult: VoiceprintAntiSpoofResult;
  timestamp: number;
}

export interface ContinuousVerificationHandle {
  sessionId: string;
  close: () => void;
}

/**
 * Minimal subset of `WebSocket` we use. Lets tests swap a fake socket in
 * without depending on `lib.dom.d.ts`.
 */
export interface ContinuousVerificationWebSocket {
  onmessage: ((event: { data: string }) => void) | null;
  onerror?: ((event: unknown) => void) | null;
  close: () => void;
}

export type ContinuousWebSocketFactory = (url: string) => ContinuousVerificationWebSocket;

// ---------------------------------------------------------------------------
// Module dependencies (overridable for tests)
// ---------------------------------------------------------------------------

let speakerIDClient: VAFSpeakerID | null = null;

function getSpeakerIDClient(): VAFSpeakerID {
  if (!speakerIDClient) {
    speakerIDClient = new VAFSpeakerID();
  }
  return speakerIDClient;
}

let webSocketFactory: ContinuousWebSocketFactory = (url) => {
  const ctor = (globalThis as unknown as {
    WebSocket: new (url: string) => ContinuousVerificationWebSocket;
  }).WebSocket;
  return new ctor(url);
};

export function __setSpeakerIDClientForTesting(client: VAFSpeakerID | null): void {
  speakerIDClient = client;
}

export function __setWebSocketFactoryForTesting(next: ContinuousWebSocketFactory): void {
  webSocketFactory = next;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Three consecutive mismatched frames terminate the call. */
const MISMATCH_TERMINATION_THRESHOLD = 3;

// Termination reasons (kept as string constants for stable log queries).
export const TERMINATION_REASON_MISMATCH = 'continuous_voiceprint_mismatch';
export const TERMINATION_REASON_SPOOF = 'continuous_voiceprint_spoof';

// ---------------------------------------------------------------------------
// startContinuousVerification — public API
// ---------------------------------------------------------------------------

/**
 * Open a continuous voiceprint verification session for an in-progress
 * call. Returns a handle whose `close()` tears down the WebSocket.
 *
 * - Each frame with `verified=true` AND anti-spoof passing → onVerified.
 * - Anti-spoof failing (live or synthesized) → onSpoof + HIGH-risk auth event.
 * - `verified=false` (and anti-spoof passed) → onMismatch + auth event.
 * - Malformed JSON frames are ignored silently (VAF can emit pings).
 */
export async function startContinuousVerification(params: {
  userId: string;
  callSessionId: string;
  onVerified: (frame: VerificationFrame) => void;
  onMismatch: (frame: VerificationFrame) => void;
  onSpoof: (frame: VerificationFrame) => void;
}): Promise<ContinuousVerificationHandle> {
  const { userId, callSessionId, onVerified, onMismatch, onSpoof } = params;

  const session = await getSpeakerIDClient().createContinuousSession(userId);
  const ws = webSocketFactory(session.websocketUrl);

  ws.onmessage = (event) => {
    let frame: ContinuousVerificationFrame;
    try {
      frame = JSON.parse(event.data) as ContinuousVerificationFrame;
    } catch {
      // Malformed message — skip silently (VAF can transiently emit pings).
      return;
    }
    if (!frame || typeof frame !== 'object' || !frame.antiSpoofResult) return;

    const summary: VerificationFrame = {
      confidence: frame.confidence,
      timestamp: frame.timestamp,
    };

    const antiSpoofPassed =
      !!frame.antiSpoofResult.isLiveVoice && !!frame.antiSpoofResult.isNotSynthesized;

    // Spoof check MUST run before the verified branch — a "verified=true"
    // frame with a spoofed anti-spoof signal is still a spoof.
    if (!antiSpoofPassed) {
      onSpoof(summary);
      void prisma.shadowAuthEvent
        .create({
          data: {
            userId,
            sessionId: callSessionId,
            method: 'voiceprint',
            result: 'fail',
            riskLevel: 'high',
            actionAttempted: 'continuous_voiceprint_spoof',
          },
        })
        .catch((err: unknown) => {
          console.warn(
            `[continuous-voiceprint] failed to log spoof event for ${userId}:`,
            (err as Error).message,
          );
        });
      return;
    }

    if (frame.verified) {
      onVerified(summary);
      return;
    }

    // Anti-spoof passed but speaker doesn't match the enrolled voiceprint.
    onMismatch(summary);
    void prisma.shadowAuthEvent
      .create({
        data: {
          userId,
          sessionId: callSessionId,
          method: 'voiceprint',
          result: 'fail',
          riskLevel: 'medium',
          actionAttempted: 'continuous_voiceprint_mismatch',
        },
      })
      .catch((err: unknown) => {
        console.warn(
          `[continuous-voiceprint] failed to log mismatch event for ${userId}:`,
          (err as Error).message,
        );
      });
  };

  return {
    sessionId: session.sessionId,
    close: () => ws.close(),
  };
}

// ---------------------------------------------------------------------------
// Lifecycle hook — wires startContinuousVerification into VoiceForge calls
// ---------------------------------------------------------------------------

interface ActiveSession {
  handle: ContinuousVerificationHandle;
  consecutiveMismatches: number;
  terminated: boolean;
}

const activeSessions = new Map<string, ActiveSession>();

/**
 * Should we open continuous verification for this user? Both gates must pass:
 *   1. `vafConfig.voiceprintUseForAuth` is true.
 *   2. The user has an active voiceprint enrollment in shadowTrustedDevice.
 */
async function shouldVerifyForUser(userId: string): Promise<boolean> {
  let config;
  try {
    config = await getVafConfig(userId);
  } catch {
    return false;
  }
  if (!config.voiceprintUseForAuth) return false;

  const enrollment = await prisma.shadowTrustedDevice.findFirst({
    where: { userId, deviceType: 'voiceprint', isActive: true },
  });
  return !!enrollment;
}

/**
 * Call-start handler. Exported for tests; production registration happens
 * at module load (see bottom of file).
 */
export const continuousVoiceprintCallStart = async (ctx: CallStartContext): Promise<void> => {
  const { callId, userId } = ctx;
  if (!userId) return;
  if (activeSessions.has(callId)) return; // already started
  if (!(await shouldVerifyForUser(userId))) return;

  let handle: ContinuousVerificationHandle;
  try {
    handle = await startContinuousVerification({
      userId,
      callSessionId: callId,
      onVerified: () => {
        // A clean re-verification resets the consecutive-mismatch counter
        // — the spec wants 3 *consecutive* mismatches to terminate, so
        // a verified frame in between should reset the streak.
        const session = activeSessions.get(callId);
        if (!session || session.terminated) return;
        session.consecutiveMismatches = 0;
      },
      onMismatch: () => {
        const session = activeSessions.get(callId);
        if (!session || session.terminated) return;
        session.consecutiveMismatches += 1;
        if (session.consecutiveMismatches >= MISMATCH_TERMINATION_THRESHOLD) {
          session.terminated = true;
          requestCallTermination(callId, TERMINATION_REASON_MISMATCH);
        }
      },
      onSpoof: () => {
        const session = activeSessions.get(callId);
        if (!session || session.terminated) return;
        session.terminated = true;
        requestCallTermination(callId, TERMINATION_REASON_SPOOF);
      },
    });
  } catch (err) {
    console.warn(
      `[continuous-voiceprint] failed to open session for call ${callId}:`,
      (err as Error).message,
    );
    return;
  }

  activeSessions.set(callId, {
    handle,
    consecutiveMismatches: 0,
    terminated: false,
  });
};

/**
 * Call-end handler. Closes the WS for the given call.
 */
export const continuousVoiceprintCallEnd = (ctx: CallEndContext): void => {
  const { callId } = ctx;
  const session = activeSessions.get(callId);
  if (!session) return;
  try {
    session.handle.close();
  } catch (err) {
    console.warn(
      `[continuous-voiceprint] failed to close session for call ${callId}:`,
      (err as Error).message,
    );
  }
  activeSessions.delete(callId);
};

// Register the handlers eagerly on module load.
let deregisterStart: (() => void) | null = null;
let deregisterEnd: (() => void) | null = null;
if (deregisterStart === null) {
  deregisterStart = onCallStart(continuousVoiceprintCallStart);
  deregisterEnd = onCallEnd(continuousVoiceprintCallEnd);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Drop all in-flight session handles. Use in test `beforeEach`. */
export function __resetActiveSessionsForTesting(): void {
  activeSessions.clear();
}

export function __getActiveSessionForTesting(callId: string):
  | { consecutiveMismatches: number; terminated: boolean; sessionId: string }
  | undefined {
  const s = activeSessions.get(callId);
  if (!s) return undefined;
  return {
    consecutiveMismatches: s.consecutiveMismatches,
    terminated: s.terminated,
    sessionId: s.handle.sessionId,
  };
}
