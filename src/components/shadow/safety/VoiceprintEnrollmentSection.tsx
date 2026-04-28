'use client';

// ============================================================================
// VoiceprintEnrollmentSection
// ----------------------------------------------------------------------------
// Settings section for enrolling and (GDPR-)deleting a voiceprint. Three-step
// recording flow per spec section 2.3:
//   1. Fixed phrase: "My voice is my passport, verify me"
//   2. User-chosen phrase
//   3. A randomly generated phrase
//
// The component is mounted by WS04 inside the Advanced Voice Settings tab.
// All audio is captured via MediaRecorder, posted to /api/shadow/voiceprint/
// enroll as multipart/form-data (sample_0..sample_2). Delete fires
// /api/shadow/voiceprint/delete.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Phrase helpers
// ---------------------------------------------------------------------------

const FIXED_PHRASE = 'My voice is my passport, verify me';

const RANDOM_PHRASE_WORDS = [
  'amber', 'beacon', 'cobalt', 'delta', 'ember', 'fjord', 'glacier',
  'horizon', 'indigo', 'juniper', 'kestrel', 'lantern', 'meridian',
  'nebula', 'opal', 'prairie', 'quartz', 'raven', 'silver', 'tundra',
  'umbra', 'velvet', 'willow', 'xenon', 'yarrow', 'zenith',
];

/**
 * Picks 5 distinct words and joins them. Uses crypto.getRandomValues when
 * available so we don't seed VAF enrollment phrases from Math.random.
 */
function generateRandomPhrase(): string {
  const cryptoLike = typeof globalThis !== 'undefined'
    ? (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto
    : undefined;

  const pool = [...RANDOM_PHRASE_WORDS];
  const picks: string[] = [];
  const wordCount = 5;

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
  return `Please remember the words ${picks.join(', ')}`;
}

// ---------------------------------------------------------------------------
// MediaRecorder helper
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
// Component
// ---------------------------------------------------------------------------

export interface VoiceprintEnrollmentSectionProps {
  initialEnrolled?: boolean;
  onEnrollmentChange?: (enrolled: boolean) => void;
}

type StepIndex = 0 | 1 | 2;

interface StepState {
  blob: Blob | null;
  recording: boolean;
}

export default function VoiceprintEnrollmentSection({
  initialEnrolled = false,
  onEnrollmentChange,
}: VoiceprintEnrollmentSectionProps) {
  const [enrolled, setEnrolled] = useState(initialEnrolled);
  const [showFlow, setShowFlow] = useState(false);
  const [userPhrase, setUserPhrase] = useState('');
  const [randomPhrase] = useState<string>(() => generateRandomPhrase());
  const [steps, setSteps] = useState<StepState[]>([
    { blob: null, recording: false },
    { blob: null, recording: false },
    { blob: null, recording: false },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const recordingHandleRef = useRef<RecordingHandle | null>(null);
  const activeStepRef = useRef<StepIndex | null>(null);

  useEffect(() => {
    setEnrolled(initialEnrolled);
  }, [initialEnrolled]);

  const phrases = useMemo(() => {
    return [FIXED_PHRASE, userPhrase.trim(), randomPhrase];
  }, [userPhrase, randomPhrase]);

  const allRecorded = steps.every((s) => s.blob !== null);
  const canSubmit = allRecorded && phrases[1].length > 0 && !submitting;

  function setStep(index: StepIndex, patch: Partial<StepState>): void {
    setSteps((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  async function handleStartRecording(index: StepIndex): Promise<void> {
    setErrorMsg(null);
    if (index === 1 && phrases[1].length === 0) {
      setErrorMsg('Enter your custom phrase before recording step 2');
      return;
    }
    try {
      const handle = await startRecording();
      recordingHandleRef.current = handle;
      activeStepRef.current = index;
      setStep(index, { recording: true });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start recording');
    }
  }

  async function handleStopRecording(): Promise<void> {
    const handle = recordingHandleRef.current;
    const idx = activeStepRef.current;
    if (!handle || idx === null) return;
    try {
      const blob = await handle.stop();
      setStep(idx, { recording: false, blob });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to stop recording');
      setStep(idx, { recording: false });
    } finally {
      recordingHandleRef.current = null;
      activeStepRef.current = null;
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const formData = new FormData();
      steps.forEach((s, i) => {
        if (s.blob) formData.append(`sample_${i}`, s.blob, `sample_${i}.webm`);
      });

      const res = await fetch('/api/shadow/voiceprint/enroll', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `Enrollment failed (${res.status})`);
      }

      setEnrolled(true);
      setShowFlow(false);
      setSteps([
        { blob: null, recording: false },
        { blob: null, recording: false },
        { blob: null, recording: false },
      ]);
      setSuccessMsg('Voiceprint enrolled successfully');
      onEnrollmentChange?.(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to enroll voiceprint');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!enrolled) return;
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        'Permanently delete your voiceprint? This cannot be undone.',
      );
      if (!ok) return;
    }
    setDeleting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/shadow/voiceprint/delete', { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `Delete failed (${res.status})`);
      }
      setEnrolled(false);
      setSuccessMsg('Voiceprint data deleted');
      onEnrollmentChange?.(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete voiceprint');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
      data-testid="voiceprint-enrollment-section"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Voiceprint Verification
        </h3>
        <span
          className={
            'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ' +
            (enrolled
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300')
          }
        >
          {enrolled ? 'Enrolled' : 'Not Enrolled'}
        </span>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Use your voice as a second form of identification. This is a convenience
        feature that can reduce PIN prompts for medium-risk actions. It is never
        the sole security gate — high-risk actions always require your PIN.
      </p>

      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Anti-spoof protection: Shadow detects recordings and AI-generated voice
        clones and rejects them automatically.
      </p>

      {errorMsg && (
        <div
          role="alert"
          className="mb-3 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded"
        >
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="mb-3 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded"
        >
          {successMsg}
        </div>
      )}

      {!enrolled && !showFlow && (
        <button
          type="button"
          onClick={() => setShowFlow(true)}
          className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Enroll voiceprint
        </button>
      )}

      {!enrolled && showFlow && (
        <div className="space-y-4" data-testid="voiceprint-enrollment-flow">
          {/* Step 1 */}
          <EnrollmentStep
            stepNumber={1}
            label="Read this exact phrase"
            phrase={FIXED_PHRASE}
            state={steps[0]}
            onStart={() => handleStartRecording(0)}
            onStop={handleStopRecording}
          />

          {/* Step 2 */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Step 2 — Choose your own phrase
            </label>
            <input
              type="text"
              value={userPhrase}
              onChange={(e) => setUserPhrase(e.target.value)}
              placeholder="Enter a phrase you'll remember"
              className="w-full px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              data-testid="voiceprint-user-phrase-input"
            />
            <EnrollmentStep
              stepNumber={2}
              label="Read your phrase"
              phrase={phrases[1] || '(enter a phrase above)'}
              state={steps[1]}
              onStart={() => handleStartRecording(1)}
              onStop={handleStopRecording}
              disabled={phrases[1].length === 0}
            />
          </div>

          {/* Step 3 */}
          <EnrollmentStep
            stepNumber={3}
            label="Read this randomly generated phrase"
            phrase={randomPhrase}
            state={steps[2]}
            onStart={() => handleStartRecording(2)}
            onStop={handleStopRecording}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              data-testid="voiceprint-submit-button"
            >
              {submitting ? 'Enrolling...' : 'Submit enrollment'}
            </button>
            <button
              type="button"
              onClick={() => setShowFlow(false)}
              className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {enrolled && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="px-3 py-1.5 text-xs font-medium rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
          data-testid="voiceprint-delete-button"
        >
          {deleting ? 'Deleting...' : 'Delete voiceprint data (GDPR)'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline subcomponent — single recording step
// ---------------------------------------------------------------------------

interface EnrollmentStepProps {
  stepNumber: number;
  label: string;
  phrase: string;
  state: StepState;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}

function EnrollmentStep({
  stepNumber,
  label,
  phrase,
  state,
  onStart,
  onStop,
  disabled = false,
}: EnrollmentStepProps) {
  return (
    <div
      className="border border-gray-200 dark:border-gray-700 rounded p-3 space-y-2"
      data-testid={`voiceprint-step-${stepNumber}`}
    >
      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
        Step {stepNumber} — {label}
      </p>
      <p className="text-xs italic text-gray-600 dark:text-gray-400">&ldquo;{phrase}&rdquo;</p>
      <div className="flex items-center gap-2">
        {!state.recording && !state.blob && (
          <button
            type="button"
            onClick={onStart}
            disabled={disabled}
            className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
          >
            Start recording
          </button>
        )}
        {state.recording && (
          <button
            type="button"
            onClick={onStop}
            className="px-2 py-1 text-xs rounded bg-red-600 text-white"
          >
            Stop recording
          </button>
        )}
        {state.blob && !state.recording && (
          <>
            <span className="text-xs text-green-700 dark:text-green-300">Recorded</span>
            <button
              type="button"
              onClick={onStart}
              className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
            >
              Re-record
            </button>
          </>
        )}
      </div>
    </div>
  );
}
