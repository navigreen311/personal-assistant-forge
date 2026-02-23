'use client';

// ============================================================================
// Shadow Voice Agent — useVoiceSession Hook
// Manages microphone capture, silence detection, audio playback,
// and keyboard shortcuts for the voice interface.
// ============================================================================

import { useState, useRef, useCallback, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoiceSessionState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'paused'
  | 'error';

export interface VoiceSessionResult {
  /** Current session state */
  state: VoiceSessionState;
  /** Whether the mic is actively recording */
  isListening: boolean;
  /** Whether Shadow is speaking a response */
  isSpeaking: boolean;
  /** Whether the voice pipeline is processing (STT/agent/TTS) */
  isProcessing: boolean;
  /** Whether the mic is muted (recording paused) */
  isMuted: boolean;
  /** Normalized audio level 0-1 from the mic, updated in real-time */
  audioLevel: number;
  /** Latest transcript from STT */
  transcript: string;
  /** Full conversation transcript history */
  transcriptHistory: TranscriptEntry[];
  /** Any error message */
  errorMessage: string | null;

  // Actions
  startListening: () => Promise<void>;
  stopListening: () => void;
  toggleMute: () => void;
  playAudio: (audioUrl: string) => Promise<void>;
  stopAudio: () => void;
  reset: () => void;
}

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

interface VoiceApiResponse {
  transcript: string;
  response: {
    text: string;
    contentType: string;
  };
  audioUrl?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SILENCE_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 1_500;
const AUDIO_MIME_TYPE = 'audio/webm;codecs=opus';
const FALLBACK_MIME_TYPE = 'audio/webm';
const VOICE_API_ENDPOINT = '/api/shadow/voice';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVoiceSession(): VoiceSessionResult {
  // State
  const [state, setState] = useState<VoiceSessionState>('idle');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [transcriptHistory, setTranscriptHistory] = useState<TranscriptEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs for cleanup and cross-callback access
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSilentRef = useRef(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const isMutedRef = useRef(false);
  const sessionIdRef = useRef<string>(generateSessionId());

  // Keep muted ref in sync
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // -------------------------------------------------------------------------
  // Audio Level Monitoring
  // -------------------------------------------------------------------------

  const startAudioLevelMonitoring = useCallback(
    (stream: MediaStream) => {
      // Feature detection
      const AudioContextClass =
        typeof window !== 'undefined'
          ? window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
          : null;

      if (!AudioContextClass) {
        console.warn('[useVoiceSession] AudioContext not available');
        return;
      }

      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate RMS level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = dataArray[i] / 255;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setAudioLevel(rms);

        // Silence detection
        if (!isMutedRef.current) {
          if (rms < SILENCE_THRESHOLD) {
            if (!isSilentRef.current) {
              isSilentRef.current = true;
              silenceTimerRef.current = setTimeout(() => {
                // User has been silent for SILENCE_DURATION_MS — stop recording
                if (mediaRecorderRef.current?.state === 'recording') {
                  mediaRecorderRef.current.stop();
                }
              }, SILENCE_DURATION_MS);
            }
          } else {
            // User is speaking — reset silence timer
            isSilentRef.current = false;
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          }
        }

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      animationFrameRef.current = requestAnimationFrame(updateLevel);
    },
    [],
  );

  const stopAudioLevelMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    isSilentRef.current = false;
    setAudioLevel(0);
  }, []);

  // -------------------------------------------------------------------------
  // Send Audio to API
  // -------------------------------------------------------------------------

  const sendAudioToApi = useCallback(
    async (audioBlob: Blob) => {
      setState('processing');
      setIsProcessing(true);
      setErrorMessage(null);

      try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('sessionId', sessionIdRef.current);
        formData.append('format', 'webm');

        const response = await fetch(VOICE_API_ENDPOINT, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => 'Unknown error');
          throw new Error(`Voice API error ${response.status}: ${errBody}`);
        }

        // Check if the response is audio (streamed) or JSON
        const contentType = response.headers.get('content-type') ?? '';

        if (contentType.includes('audio/')) {
          // Audio response — play it directly
          const arrayBuffer = await response.arrayBuffer();
          const blob = new Blob([arrayBuffer], { type: contentType });
          const url = URL.createObjectURL(blob);

          // We don't have the transcript in this case
          setTranscript('');
          await playAudioInternal(url);
          URL.revokeObjectURL(url);
        } else {
          // JSON response
          const data = (await response.json()) as VoiceApiResponse;

          if (data.transcript) {
            setTranscript(data.transcript);
            setTranscriptHistory((prev) => [
              ...prev,
              { role: 'user', text: data.transcript, timestamp: Date.now() },
            ]);
          }

          if (data.response?.text) {
            setTranscriptHistory((prev) => [
              ...prev,
              { role: 'assistant', text: data.response.text, timestamp: Date.now() },
            ]);
          }

          if (data.audioUrl) {
            await playAudioInternal(data.audioUrl);
          } else {
            setState('idle');
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Voice processing failed';
        console.error('[useVoiceSession] API error:', message);
        setErrorMessage(message);
        setState('error');
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Start Listening
  // -------------------------------------------------------------------------

  const startListening = useCallback(async () => {
    // Feature detection
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Microphone access is not supported in this browser.');
      setState('error');
      return;
    }

    // Check MediaRecorder support
    if (typeof MediaRecorder === 'undefined') {
      setErrorMessage('MediaRecorder is not supported in this browser.');
      setState('error');
      return;
    }

    try {
      setErrorMessage(null);
      setState('listening');
      setIsListening(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      mediaStreamRef.current = stream;

      // Start audio level monitoring
      startAudioLevelMonitoring(stream);

      // Determine supported MIME type
      const mimeType = MediaRecorder.isTypeSupported(AUDIO_MIME_TYPE)
        ? AUDIO_MIME_TYPE
        : MediaRecorder.isTypeSupported(FALLBACK_MIME_TYPE)
          ? FALLBACK_MIME_TYPE
          : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsListening(false);

        // Stop the media stream tracks
        stream.getTracks().forEach((track) => track.stop());
        stopAudioLevelMonitoring();

        if (chunksRef.current.length === 0) {
          setState('idle');
          return;
        }

        const audioBlob = new Blob(chunksRef.current, {
          type: mimeType || 'audio/webm',
        });
        chunksRef.current = [];

        // Only send if there's meaningful audio (> 1KB to filter out noise-only)
        if (audioBlob.size > 1024) {
          await sendAudioToApi(audioBlob);
        } else {
          setState('idle');
        }
      };

      recorder.onerror = (event) => {
        console.error('[useVoiceSession] MediaRecorder error:', event);
        setErrorMessage('Recording error occurred.');
        setState('error');
        setIsListening(false);
        stopAudioLevelMonitoring();
      };

      // Start recording, collecting data every 250ms
      recorder.start(250);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === 'NotAllowedError'
            ? 'Microphone permission was denied. Please allow access and try again.'
            : err.message
          : 'Failed to start recording';

      console.error('[useVoiceSession] Start error:', message);
      setErrorMessage(message);
      setState('error');
      setIsListening(false);
    }
  }, [startAudioLevelMonitoring, stopAudioLevelMonitoring, sendAudioToApi]);

  // -------------------------------------------------------------------------
  // Stop Listening
  // -------------------------------------------------------------------------

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // -------------------------------------------------------------------------
  // Toggle Mute
  // -------------------------------------------------------------------------

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;

      // Mute/unmute the media stream tracks
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !next;
        });
      }

      // Clear silence timer when muting to prevent auto-stop
      if (next && silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      return next;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Audio Playback
  // -------------------------------------------------------------------------

  const playAudioInternal = useCallback(async (url: string) => {
    setState('speaking');
    setIsSpeaking(true);

    return new Promise<void>((resolve) => {
      const audio = new Audio(url);
      audioElementRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        setState('idle');
        audioElementRef.current = null;
        resolve();
      };

      audio.onerror = () => {
        console.warn('[useVoiceSession] Audio playback error');
        setIsSpeaking(false);
        setState('idle');
        audioElementRef.current = null;
        resolve();
      };

      audio.play().catch((err) => {
        console.warn('[useVoiceSession] Could not play audio:', err);
        setIsSpeaking(false);
        setState('idle');
        audioElementRef.current = null;
        resolve();
      });
    });
  }, []);

  const playAudio = useCallback(
    async (audioUrl: string) => {
      await playAudioInternal(audioUrl);
    },
    [playAudioInternal],
  );

  const stopAudio = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }
    setIsSpeaking(false);
    if (state === 'speaking') {
      setState('idle');
    }
  }, [state]);

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  const reset = useCallback(() => {
    stopListening();
    stopAudio();
    stopAudioLevelMonitoring();

    setState('idle');
    setIsListening(false);
    setIsSpeaking(false);
    setIsProcessing(false);
    setIsMuted(false);
    setAudioLevel(0);
    setTranscript('');
    setTranscriptHistory([]);
    setErrorMessage(null);
    sessionIdRef.current = generateSessionId();
  }, [stopListening, stopAudio, stopAudioLevelMonitoring]);

  // -------------------------------------------------------------------------
  // Keyboard Shortcut: Ctrl+Shift+S
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        if (isListening) {
          stopListening();
        } else {
          startListening();
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isListening, startListening, stopListening]);

  // -------------------------------------------------------------------------
  // Cleanup on Unmount
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      // Stop any active recording
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      // Stop all tracks
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      // Stop audio monitoring
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close().catch(() => {});
      }
      // Stop playback
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    state,
    isListening,
    isSpeaking,
    isProcessing,
    isMuted,
    audioLevel,
    transcript,
    transcriptHistory,
    errorMessage,
    startListening,
    stopListening,
    toggleMute,
    playAudio,
    stopAudio,
    reset,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `vs_${timestamp}_${random}`;
}
