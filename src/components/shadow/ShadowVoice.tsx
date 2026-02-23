'use client';

// ============================================================================
// Shadow Voice Agent — Voice Interaction Overlay
// Full-screen voice UI with waveform visualization, live transcript,
// and controls for mic toggle, pause, mute, and text mode switch.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useVoiceSession, type TranscriptEntry } from '@/hooks/useVoiceSession';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShadowVoiceProps {
  isActive: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WAVEFORM_BAR_COUNT = 24;
const STATUS_LABELS: Record<string, string> = {
  idle: 'Ready',
  listening: 'Listening...',
  processing: 'Thinking...',
  speaking: 'Speaking...',
  paused: 'Paused',
  error: 'Error',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShadowVoice({ isActive, onClose }: ShadowVoiceProps) {
  const {
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
    stopAudio,
    reset,
  } = useVoiceSession();

  const [isTextMode, setIsTextMode] = useState(false);
  const [textInput, setTextInput] = useState('');
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptHistory, transcript]);

  // Focus text input when switching to text mode
  useEffect(() => {
    if (isTextMode) {
      textInputRef.current?.focus();
    }
  }, [isTextMode]);

  // Auto-start listening when overlay opens (if not in text mode)
  useEffect(() => {
    if (isActive && !isTextMode && !isListening && state === 'idle') {
      startListening();
    }
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle close
  const handleClose = useCallback(() => {
    stopListening();
    stopAudio();
    reset();
    onClose();
  }, [stopListening, stopAudio, reset, onClose]);

  // Handle text mode submit
  const handleTextSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!textInput.trim()) return;

      // Send as text through the voice API (text fallback)
      const input = textInput.trim();
      setTextInput('');

      try {
        const response = await fetch('/api/shadow/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: input,
            sessionId: `text_${Date.now()}`,
          }),
        });

        if (response.ok) {
          // Response handled by the hook via transcript updates
        }
      } catch (err) {
        console.error('[ShadowVoice] Text submit error:', err);
      }
    },
    [textInput],
  );

  // Handle mic button click
  const handleMicToggle = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Handle barge-in (user clicks while Shadow is speaking)
  const handleBargeIn = useCallback(() => {
    if (isSpeaking) {
      stopAudio();
      // Start listening for the user's new input
      startListening();
    }
  }, [isSpeaking, stopAudio, startListening]);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    if (isActive) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isActive, handleClose]);

  if (!isActive) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900/95 backdrop-blur-sm"
      onClick={isSpeaking ? handleBargeIn : undefined}
      role="dialog"
      aria-label="Shadow Voice Interface"
      aria-modal="true"
    >
      {/* Close Button */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-800"
        aria-label="Close voice interface"
      >
        <CloseIcon />
      </button>

      {/* Keyboard Shortcut Hint */}
      <div className="absolute top-4 left-4 text-xs text-gray-500">
        <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 font-mono">
          Ctrl+Shift+S
        </kbd>{' '}
        to toggle voice &middot;{' '}
        <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 font-mono">
          Esc
        </kbd>{' '}
        to close
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center gap-8 w-full max-w-lg px-4">
        {/* Status Label */}
        <div className="text-center">
          <h2 className="text-white text-lg font-semibold mb-1">Shadow</h2>
          <p
            className={`text-sm font-medium ${
              state === 'error'
                ? 'text-red-400'
                : state === 'listening'
                  ? 'text-green-400'
                  : state === 'speaking'
                    ? 'text-blue-400'
                    : state === 'processing'
                      ? 'text-amber-400'
                      : 'text-gray-400'
            }`}
          >
            {STATUS_LABELS[state] || 'Ready'}
          </p>
        </div>

        {/* Waveform Visualization */}
        <WaveformVisualizer
          audioLevel={audioLevel}
          isActive={isListening || isSpeaking}
          isSpeaking={isSpeaking}
        />

        {/* Error Message */}
        {errorMessage && (
          <div className="w-full bg-red-900/40 border border-red-700 rounded-lg px-4 py-2 text-sm text-red-300">
            {errorMessage}
          </div>
        )}

        {/* Live Transcript Display */}
        <div className="w-full max-h-48 overflow-y-auto rounded-lg bg-gray-800/60 border border-gray-700 p-3">
          {transcriptHistory.length === 0 && !transcript ? (
            <p className="text-gray-500 text-sm text-center italic">
              {isListening ? 'Speak now...' : 'Press the mic to start'}
            </p>
          ) : (
            <div className="space-y-2">
              {transcriptHistory.map((entry, i) => (
                <TranscriptLine key={`${entry.timestamp}-${i}`} entry={entry} />
              ))}
              {/* Live transcript (in-progress) */}
              {transcript && isListening && (
                <div className="flex gap-2">
                  <span className="text-xs text-green-400 font-medium shrink-0 mt-0.5">
                    You:
                  </span>
                  <span className="text-sm text-gray-300 italic">{transcript}</span>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>

        {/* Text Mode Input */}
        {isTextMode && (
          <form onSubmit={handleTextSubmit} className="w-full flex gap-2">
            <input
              ref={textInputRef}
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!textInput.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </form>
        )}

        {/* Controls */}
        <div className="flex items-center gap-4">
          {/* Mute Button */}
          <button
            onClick={toggleMute}
            disabled={!isListening}
            className={`p-3 rounded-full transition-all ${
              isMuted
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            } ${!isListening ? 'opacity-40 cursor-not-allowed' : ''}`}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOffIcon /> : <MicIcon />}
          </button>

          {/* Main Mic / Stop Button */}
          <button
            onClick={handleMicToggle}
            disabled={isProcessing}
            className={`p-5 rounded-full transition-all shadow-lg ${
              isListening
                ? 'bg-red-500 hover:bg-red-600 text-white scale-110 animate-pulse'
                : isProcessing
                  ? 'bg-amber-500 text-white cursor-wait'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:scale-105'
            }`}
            aria-label={isListening ? 'Stop recording' : 'Start recording'}
          >
            {isListening ? <StopIcon /> : isProcessing ? <SpinnerIcon /> : <MicLargeIcon />}
          </button>

          {/* Switch to Text Mode */}
          <button
            onClick={() => {
              if (isListening) stopListening();
              setIsTextMode((prev) => !prev);
            }}
            className={`p-3 rounded-full transition-all ${
              isTextMode
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            aria-label={isTextMode ? 'Switch to voice mode' : 'Switch to text mode'}
            title={isTextMode ? 'Voice mode' : 'Text mode'}
          >
            <KeyboardIcon />
          </button>
        </div>

        {/* Hold-to-talk hint */}
        {!isTextMode && !isListening && !isProcessing && (
          <p className="text-xs text-gray-500 text-center">
            Click the mic or press <strong>Ctrl+Shift+S</strong> to speak
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waveform Visualizer
// ---------------------------------------------------------------------------

function WaveformVisualizer({
  audioLevel,
  isActive,
  isSpeaking,
}: {
  audioLevel: number;
  isActive: boolean;
  isSpeaking: boolean;
}) {
  return (
    <div
      className="flex items-center justify-center gap-1 h-16"
      aria-hidden="true"
    >
      {Array.from({ length: WAVEFORM_BAR_COUNT }).map((_, i) => {
        // Create a natural-looking wave pattern
        const position = i / WAVEFORM_BAR_COUNT;
        const centerDistance = Math.abs(position - 0.5) * 2;

        // Base height varies by position (taller in center)
        const baseHeight = isActive ? 0.15 + (1 - centerDistance) * 0.3 : 0.08;

        // Audio-reactive height
        const audioFactor = isActive ? audioLevel * (1 - centerDistance * 0.5) : 0;

        // Add pseudo-random variation per bar for natural look
        const variation = Math.sin(i * 1.7 + Date.now() * 0.003) * 0.1;

        const height = Math.min(1, baseHeight + audioFactor + (isActive ? variation : 0));
        const heightPx = Math.max(3, height * 56);

        // Color: green when listening, blue when speaking, gray when idle
        const colorClass = isSpeaking
          ? 'bg-blue-400'
          : isActive
            ? 'bg-green-400'
            : 'bg-gray-600';

        return (
          <div
            key={i}
            className={`w-1 rounded-full transition-all ${colorClass}`}
            style={{
              height: `${heightPx}px`,
              transitionDuration: isActive ? '80ms' : '300ms',
              opacity: isActive ? 0.6 + height * 0.4 : 0.3,
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transcript Line
// ---------------------------------------------------------------------------

function TranscriptLine({ entry }: { entry: TranscriptEntry }) {
  const isUser = entry.role === 'user';
  return (
    <div className="flex gap-2">
      <span
        className={`text-xs font-medium shrink-0 mt-0.5 ${
          isUser ? 'text-green-400' : 'text-blue-400'
        }`}
      >
        {isUser ? 'You:' : 'Shadow:'}
      </span>
      <span className="text-sm text-gray-200">{entry.text}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons (inline SVG to avoid external dependencies)
// ---------------------------------------------------------------------------

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .88-.16 1.73-.46 2.5" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function MicLargeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
      <line x1="6" y1="8" x2="6" y2="8" />
      <line x1="10" y1="8" x2="10" y2="8" />
      <line x1="14" y1="8" x2="14" y2="8" />
      <line x1="18" y1="8" x2="18" y2="8" />
      <line x1="6" y1="12" x2="6" y2="12" />
      <line x1="10" y1="12" x2="10" y2="12" />
      <line x1="14" y1="12" x2="14" y2="12" />
      <line x1="18" y1="12" x2="18" y2="12" />
      <line x1="8" y1="16" x2="16" y2="16" />
    </svg>
  );
}
