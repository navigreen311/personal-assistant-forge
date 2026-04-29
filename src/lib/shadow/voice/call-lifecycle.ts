// ============================================================================
// Shadow Call Termination Registry
// ----------------------------------------------------------------------------
// Sibling to the VoiceForge call-lifecycle registry at
// `@/modules/voiceforge/services/call-lifecycle` (which owns onCallStart /
// onCallEnd / emitCallStart / emitCallEnd).
//
// This file owns the termination channel: integrations that detect a
// runtime condition requiring the call to end (continuous voiceprint
// mismatch, spoof, future detectors) call `requestCallTermination`. The
// orchestrator subscribes via `onTerminationRequest`. If no listener is
// registered, requests are logged and dropped (call continues), keeping
// the registry useful in tests and partial environments.
// ============================================================================

export type TerminationListener = (callId: string, reason: string) => void | Promise<void>;

const terminationListeners = new Set<TerminationListener>();

/**
 * Subscribe to termination requests (typically the call orchestrator).
 * Returns a deregister function.
 */
export function onTerminationRequest(listener: TerminationListener): () => void {
  terminationListeners.add(listener);
  return () => {
    terminationListeners.delete(listener);
  };
}

/**
 * Request that the orchestrator terminate the given call.
 * If no termination listener is registered, logs a warning and returns —
 * the call continues. Used by continuous-voiceprint on sustained
 * mismatch or spoof detection.
 */
export function requestCallTermination(callId: string, reason: string): void {
  if (terminationListeners.size === 0) {
    console.warn(
      `[call-termination] requested for ${callId} (reason=${reason}) but no listener is registered`,
    );
    return;
  }
  for (const listener of terminationListeners) {
    try {
      const maybe = listener(callId, reason);
      if (maybe && typeof (maybe as Promise<void>).catch === 'function') {
        (maybe as Promise<void>).catch((err) => {
          console.warn('[call-termination] listener rejected:', (err as Error).message);
        });
      }
    } catch (err) {
      console.warn('[call-termination] listener threw:', (err as Error).message);
    }
  }
}

/** Drop all termination listeners. Use in test `beforeEach`. */
export function __resetCallTerminationForTesting(): void {
  terminationListeners.clear();
}
