// ============================================================================
// VoiceForge — Call Lifecycle Hook Registry
// ----------------------------------------------------------------------------
// A lightweight pub/sub for "call started" and "call ended" events so that
// integration code (sentiment monitoring in WS13, continuous voiceprint in
// WS16, future coaching modules, etc.) can register handlers without each
// integration having to edit `outbound-agent.ts` directly.
//
// Why a registry rather than direct calls?
// - Multiple parallel workstreams (WS13 sentiment + WS16 voiceprint) need to
//   subscribe to the same call-start / call-end events. A registry lets each
//   subscribe independently with no merge conflict on the orchestrator file.
// - Handlers run independently — one failing handler must not abort the call
//   flow or prevent other handlers from running.
// - Handlers can be async; the orchestrator awaits `Promise.all` for start
//   (best-effort: failures are swallowed and logged) and end (same).
// ============================================================================

export interface CallStartContext {
  /** VoiceForge call id (Call.id from Prisma). */
  callId: string;
  /** Owning user id, if known. Required for any per-user config lookups. */
  userId?: string;
  /** Owning entity id. */
  entityId: string;
  /** Optional contact being called. */
  contactId?: string;
  /** Persona driving the call. */
  personaId: string;
  /** Optional script id for the call playbook. */
  scriptId?: string;
  /** Free-form playbook payload (script + guardrails) for downstream handlers. */
  playbook?: unknown;
  /** Optional ShadowMessage id to persist sentiment frames against. */
  messageId?: string;
}

export interface CallEndContext {
  callId: string;
  /** Final outcome reported by the orchestrator. */
  outcome?: string;
  /** Final duration in seconds. */
  duration?: number;
}

export type CallStartHandler = (ctx: CallStartContext) => Promise<void> | void;
export type CallEndHandler = (ctx: CallEndContext) => Promise<void> | void;

const startHandlers = new Set<CallStartHandler>();
const endHandlers = new Set<CallEndHandler>();

/** Register a handler to fire when an outbound VoiceForge call starts. */
export function onCallStart(handler: CallStartHandler): () => void {
  startHandlers.add(handler);
  return () => startHandlers.delete(handler);
}

/** Register a handler to fire when an outbound VoiceForge call ends. */
export function onCallEnd(handler: CallEndHandler): () => void {
  endHandlers.add(handler);
  return () => endHandlers.delete(handler);
}

/**
 * Dispatch the call-start event to all registered handlers. Handler errors
 * are caught and logged so the call flow keeps going even if one integration
 * (e.g. sentiment, voiceprint) is broken.
 */
export async function emitCallStart(ctx: CallStartContext): Promise<void> {
  await Promise.all(
    Array.from(startHandlers).map(async (h) => {
      try {
        await h(ctx);
      } catch (err) {
        console.warn(
          `[voiceforge-lifecycle] call-start handler threw for callId=${ctx.callId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );
}

/**
 * Dispatch the call-end event to all registered handlers. Errors are caught
 * and logged so a failing handler cannot block the orchestrator from
 * returning the call result.
 */
export async function emitCallEnd(ctx: CallEndContext): Promise<void> {
  await Promise.all(
    Array.from(endHandlers).map(async (h) => {
      try {
        await h(ctx);
      } catch (err) {
        console.warn(
          `[voiceforge-lifecycle] call-end handler threw for callId=${ctx.callId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );
}

/**
 * Test helper: clear all registered handlers. Production code should never
 * need this, but tests benefit from a deterministic starting state.
 */
export function __resetCallLifecycleHandlersForTesting(): void {
  startHandlers.clear();
  endHandlers.clear();
}
