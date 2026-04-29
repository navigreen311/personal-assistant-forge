'use client';

// useStreamingVoice — building-block hook combining MediaRecorder with the
// streaming STT bridge. NOT mounted anywhere yet; intended for future UI
// integration. The shape of the return is intentionally minimal — a full
// voice agent UI (audio level, mute, history, etc.) is out of scope here.
//
// Example:
// ```tsx
// function MyPage() {
//   const { partialTranscript, finalTranscript, isRecording, start, stop } =
//     useStreamingVoice();
//   return (
//     <>
//       <button onClick={isRecording ? stop : start}>
//         {isRecording ? 'Stop' : 'Start'}
//       </button>
//       <p>{partialTranscript}</p>
//       <ul>{finalTranscript.map((t, i) => <li key={i}>{t}</li>)}</ul>
//     </>
//   );
// }
// ```

import { useCallback, useEffect, useRef, useState } from 'react';
import { ShadowVoicePipeline } from '@/lib/shadow/voice/pipeline';
import type { SttStreamHandle } from '@/lib/vaf/streaming/stt-stream';

export interface UseStreamingVoiceResult {
  /** Most recent partial (interim) transcript. */
  partialTranscript: string;
  /** Accumulated final transcripts, in arrival order. */
  finalTranscript: string[];
  /** True while the MediaRecorder is capturing audio. */
  isRecording: boolean;
  /** Latest error, or null. */
  error: string | null;
  /** Begin capture and open an STT stream. */
  start: () => Promise<void>;
  /** Stop capture and close the stream. */
  stop: () => void;
}

export interface UseStreamingVoiceOptions {
  /** Inject a pre-built pipeline (used by tests). */
  pipeline?: ShadowVoicePipeline;
  /** MediaRecorder timeslice in ms — default 250 per the spec. */
  timesliceMs?: number;
}

const DEFAULT_TIMESLICE_MS = 250;
const PREFERRED_MIME_TYPE = 'audio/webm;codecs=opus';
const FALLBACK_MIME_TYPE = 'audio/webm';

export function useStreamingVoice(
  options?: UseStreamingVoiceOptions,
): UseStreamingVoiceResult {
  const timesliceMs = options?.timesliceMs ?? DEFAULT_TIMESLICE_MS;
  const injectedPipeline = options?.pipeline;

  const [partialTranscript, setPartial] = useState('');
  const [finalTranscript, setFinal] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pipelineRef = useRef<ShadowVoicePipeline | null>(injectedPipeline ?? null);
  const handleRef = useRef<SttStreamHandle | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    } catch {
      // Ignore — cleanup path.
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;

    if (handleRef.current) {
      handleRef.current.close();
      handleRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access is not supported in this browser.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder is not supported in this browser.');
      return;
    }

    try {
      // Lazy-init a default pipeline if the caller didn't inject one.
      // We call `initialize` so VAF availability is probed before we try
      // to open a streaming session.
      if (!pipelineRef.current) {
        const p = new ShadowVoicePipeline();
        await p.initialize({ voicePersona: 'default', speechSpeed: 1.0 });
        pipelineRef.current = p;
      }

      const handle = await pipelineRef.current.startStreamingTranscribe({
        onPartial: (text) => setPartial(text),
        onFinal: (text) => {
          setPartial('');
          if (text) setFinal((prev) => [...prev, text]);
        },
        onError: (err) => setError(err.message),
        onClose: () => {
          // Connection went away while we may still be recording —
          // surface as a stop so the UI doesn't hang in `isRecording`.
          setIsRecording(false);
        },
      });

      if (!handle) {
        setError('Streaming STT is unavailable.');
        return;
      }
      handleRef.current = handle;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported(PREFERRED_MIME_TYPE)
        ? PREFERRED_MIME_TYPE
        : MediaRecorder.isTypeSupported(FALLBACK_MIME_TYPE)
          ? FALLBACK_MIME_TYPE
          : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0 && handleRef.current) {
          handleRef.current.send(event.data);
        }
      };
      recorder.onerror = () => {
        setError('Recording error occurred.');
        stop();
      };
      recorder.onstop = () => {
        setIsRecording(false);
      };

      recorder.start(timesliceMs);
      setIsRecording(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start streaming voice';
      setError(message);
      stop();
    }
  }, [timesliceMs, stop]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    partialTranscript,
    finalTranscript,
    isRecording,
    error,
    start,
    stop,
  };
}
