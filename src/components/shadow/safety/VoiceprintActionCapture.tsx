'use client';

// ============================================================================
// VoiceprintActionCapture
// ----------------------------------------------------------------------------
// Modal that captures a voiceprint sample at action-time and posts it to
// /api/shadow/voiceprint/verify. On verified=true, calls onVerified so the
// caller can proceed without (or with reduced) PIN/SMS prompts per spec
// section 2.2.
//
// This component is the runtime sibling of VoiceprintEnrollmentSection. The
// MediaRecorder pattern is intentionally COPIED from that file (same
// startRecording helper, same getUserMedia + chunked Blob assembly) so the
// behavior of the two voiceprint surfaces stays consistent — capturing a
// new sample for verify must work identically to capturing a sample for
// enroll, otherwise users experience subtle UI drift between the two
// flows.
//
// Accessibility: focus-trapped modal, escape cancels, aria-modal="true".
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionRiskLevel = 'low' | 'medium' | 'high';

export interface VoiceprintActionCaptureProps {
  open: boolean;
  riskLevel: ActionRiskLevel;
  /** Shown to the user, e.g. "Confirm sending $5,000 to Acme Corp". */
  actionDescription: string;
  /** Phrase the user should read aloud. Defaults to a randomly-generated phrase. */
  promptPhrase?: string;
  onVerified: (result: { confidence: number; antiSpoofPassed: boolean }) => void;
  /** Called when the user explicitly chooses PIN instead, or when the API is unreachable. */
  onFallback: () => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Phrase helpers (mirrors VoiceprintEnrollmentSection)
// ---------------------------------------------------------------------------

const RANDOM_PHRASE_WORDS = [
  'amber', 'beacon', 'cobalt', 'delta', 'ember', 'fjord', 'glacier',
  'horizon', 'indigo', 'juniper', 'kestrel', 'lantern', 'meridian',
  'nebula', 'opal', 'prairie', 'quartz', 'raven', 'silver', 'tundra',
];

function generateActionPhrase(): string {
  const cryptoLike = typeof globalThis !== 'undefined'
    ? (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto
    : undefined;

  const pool = [...RANDOM_PHRASE_WORDS];
  const picks: string[] = [];
  const wordCount = 3;

  for (let i = 0; i < wordCount && pool.length > 0; i++) {
    let idx: number;
    if (cryptoLike?.getRandomValues) {
      const buf = new Uint32Array(1);
      cryptoLike.getRandomValues(buf);
      idx = buf[0] % pool.length;
    } else {
      idx = Math.floor(Math.random() * pool.length);
    }
    picks.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return `Please say: ${picks.join(' ')}`;
}

// ---------------------------------------------------------------------------
// MediaRecorder helper (copied from VoiceprintEnrollmentSection for parity)
// ---------------------------------------------------------------------------

interface RecordingHandle {
  stop: () => Promise<Blob>;
}

async function startRecording(): Promise<RecordingHandle> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    throw new Error('Microphone is not available in this browser');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  recorder.start();

  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        };
        recorder.stop();
      }),
  };
}

// ---------------------------------------------------------------------------
// Verify response shape (matches /api/shadow/voiceprint/verify)
// ---------------------------------------------------------------------------

interface VerifyResponseData {
  verified: boolean;
  method: string;
  confidence: number;
  antiSpoofPassed: boolean;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Status =
  | 'idle'
  | 'recording'
  | 'submitting'
  | 'spoof_detected'
  | 'mismatch'
  | 'api_error';

export default function VoiceprintActionCapture({
  open,
  riskLevel,
  actionDescription,
  promptPhrase,
  onVerified,
  onFallback,
  onCancel,
}: VoiceprintActionCaptureProps) {
  // Generate the phrase ONCE per modal-open cycle so the user isn't asked
  // to repeat a moving target.
  const [phrase, setPhrase] = useState<string>(() => promptPhrase ?? generateActionPhrase());
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Track the previous `open` value as state (NOT a ref) so we can detect
  // closed→open transitions during render and reset internal UI state.
  // This is the canonical React pattern for "derive new state from a prop
  // change" — see https://react.dev/reference/react/useState#storing-information-from-previous-renders.
  // It avoids both the setState-in-effect anti-pattern and the
  // ref-access-during-render rule.
  const [prevOpen, setPrevOpen] = useState<boolean>(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPhrase(promptPhrase ?? generateActionPhrase());
      setStatus('idle');
      setErrorMsg(null);
    }
  }

  const recordingHandleRef = useRef<RecordingHandle | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const recordButtonRef = useRef<HTMLButtonElement | null>(null);

  // Escape key cancels.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  // Focus the record button when the modal opens.
  useEffect(() => {
    if (open && recordButtonRef.current) {
      recordButtonRef.current.focus();
    }
  }, [open]);

  const handleStart = useCallback(async () => {
    setErrorMsg(null);
    try {
      const handle = await startRecording();
      recordingHandleRef.current = handle;
      setStatus('recording');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start recording');
      setStatus('api_error');
    }
  }, []);

  const handleStop = useCallback(async () => {
    const handle = recordingHandleRef.current;
    if (!handle) return;
    setStatus('submitting');
    try {
      const blob = await handle.stop();
      recordingHandleRef.current = null;

      const formData = new FormData();
      formData.append('audio', blob, 'verify.webm');
      formData.append('riskLevel', riskLevel);

      const res = await fetch('/api/shadow/voiceprint/verify', {
        method: 'POST',
        body: formData,
      });

      const body = (await res.json().catch(() => ({}))) as ApiEnvelope<VerifyResponseData>;

      if (!res.ok || !body.success || !body.data) {
        setErrorMsg(
          body.error?.message ??
            `Voice verification unavailable (${res.status}). Use PIN instead.`,
        );
        setStatus('api_error');
        return;
      }

      const data = body.data;

      if (!data.antiSpoofPassed) {
        setErrorMsg(
          'We could not confirm a live human voice. Try again in a quiet room or use PIN.',
        );
        setStatus('spoof_detected');
        return;
      }

      if (!data.verified) {
        setErrorMsg(
          'Voice did not match your enrollment. Try again or use PIN.',
        );
        setStatus('mismatch');
        return;
      }

      onVerified({
        confidence: data.confidence,
        antiSpoofPassed: data.antiSpoofPassed,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Voice verification failed',
      );
      setStatus('api_error');
    }
  }, [riskLevel, onVerified]);

  const handleTryAgain = useCallback(() => {
    setErrorMsg(null);
    setStatus('idle');
  }, []);

  if (!open) return null;

  const riskBadge = riskLevelBadge(riskLevel);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="voiceprint-action-capture-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voiceprint-action-title"
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
        data-testid="voiceprint-action-capture-dialog"
      >
        <div className="flex items-center justify-between mb-3">
          <h2
            id="voiceprint-action-title"
            className="text-sm font-semibold text-gray-900 dark:text-white"
          >
            Voiceprint Verification
          </h2>
          <span
            data-testid="voiceprint-action-risk-badge"
            className={
              'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ' +
              riskBadge.className
            }
          >
            {riskBadge.label}
          </span>
        </div>

        <p className="text-xs text-gray-700 dark:text-gray-300 mb-3">
          {actionDescription}
        </p>

        <div className="rounded border border-gray-200 dark:border-gray-700 p-3 mb-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Read this phrase aloud:
          </p>
          <p
            className="text-sm italic text-gray-800 dark:text-gray-100"
            data-testid="voiceprint-action-prompt-phrase"
          >
            &ldquo;{phrase}&rdquo;
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mb-3 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded"
            data-testid="voiceprint-action-error"
          >
            {errorMsg}
          </div>
        )}

        <div
          className="text-xs text-gray-500 dark:text-gray-400 mb-3"
          data-testid="voiceprint-action-status"
          aria-live="polite"
        >
          {statusLine(status)}
        </div>

        <div className="flex flex-wrap gap-2">
          {status === 'idle' && (
            <button
              ref={recordButtonRef}
              type="button"
              onClick={handleStart}
              className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
              data-testid="voiceprint-action-record-button"
            >
              Start recording
            </button>
          )}

          {status === 'recording' && (
            <button
              type="button"
              onClick={handleStop}
              className="px-3 py-1.5 text-xs font-medium rounded bg-red-600 text-white"
              data-testid="voiceprint-action-stop-button"
            >
              Stop recording
            </button>
          )}

          {(status === 'spoof_detected' || status === 'mismatch') && (
            <button
              type="button"
              onClick={handleTryAgain}
              className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
              data-testid="voiceprint-action-try-again-button"
            >
              Try again
            </button>
          )}

          {(status === 'spoof_detected' ||
            status === 'mismatch' ||
            status === 'api_error') && (
            <button
              type="button"
              onClick={onFallback}
              className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
              data-testid="voiceprint-action-fallback-button"
            >
              Use PIN instead
            </button>
          )}

          {status !== 'submitting' && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 ml-auto"
              data-testid="voiceprint-action-cancel-button"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function riskLevelBadge(level: ActionRiskLevel): { label: string; className: string } {
  switch (level) {
    case 'high':
      return {
        label: 'High risk',
        className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      };
    case 'medium':
      return {
        label: 'Medium risk',
        className:
          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      };
    case 'low':
    default:
      return {
        label: 'Low risk',
        className:
          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
      };
  }
}

function statusLine(status: Status): string {
  switch (status) {
    case 'recording':
      return 'Recording... press Stop when finished.';
    case 'submitting':
      return 'Verifying voice...';
    case 'spoof_detected':
      return 'Anti-spoof check failed.';
    case 'mismatch':
      return 'Voice did not match.';
    case 'api_error':
      return 'Verification unavailable.';
    case 'idle':
    default:
      return 'Press Start recording, then read the phrase aloud.';
  }
}
