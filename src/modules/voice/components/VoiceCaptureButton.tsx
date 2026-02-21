'use client';

import { useState, useCallback, useRef } from 'react';

type VoiceButtonState = 'idle' | 'listening' | 'processing' | 'error';

interface VoiceCaptureButtonProps {
  onTranscript?: (transcript: string) => void;
  onError?: (error: string) => void;
}

export default function VoiceCaptureButton({
  onTranscript,
  onError: _onError,
}: VoiceCaptureButtonProps) {
  const [state, setState] = useState<VoiceButtonState>('idle');
  const [interimText, setInterimText] = useState('');
  const _animationFrame = useRef<number | null>(null);

  const handleStart = useCallback(() => {
    setState('listening');
    setInterimText('Listening...');

    // In production: start STT session via sttService.startSession()
    // and begin streaming audio chunks from the microphone.
    // navigator.mediaDevices.getUserMedia({ audio: true })
  }, []);

  const handleStop = useCallback(() => {
    setState('processing');
    setInterimText('Processing...');

    // Simulate processing delay
    setTimeout(() => {
      const transcript = interimText === 'Listening...' ? '' : interimText;
      setState('idle');
      setInterimText('');
      onTranscript?.(transcript);
    }, 500);
  }, [interimText, onTranscript]);

  const handleClick = useCallback(() => {
    if (state === 'idle') {
      handleStart();
    } else if (state === 'listening') {
      handleStop();
    } else if (state === 'error') {
      setState('idle');
      setInterimText('');
    }
  }, [state, handleStart, handleStop]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Interim transcript overlay */}
      {interimText && (
        <div className="max-w-xs rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {interimText}
        </div>
      )}

      {/* Microphone button */}
      <button
        type="button"
        onClick={handleClick}
        className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${getButtonStyles(state)}`}
        aria-label={getAriaLabel(state)}
      >
        {state === 'processing' ? (
          <SpinnerIcon />
        ) : (
          <MicIcon isActive={state === 'listening'} isError={state === 'error'} />
        )}

        {/* Pulsing ring for listening state */}
        {state === 'listening' && (
          <span className="absolute h-14 w-14 animate-ping rounded-full bg-blue-400 opacity-30" />
        )}
      </button>
    </div>
  );
}

function getButtonStyles(state: VoiceButtonState): string {
  switch (state) {
    case 'idle':
      return 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500';
    case 'listening':
      return 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-400';
    case 'processing':
      return 'bg-gray-500 text-white cursor-wait';
    case 'error':
      return 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500';
  }
}

function getAriaLabel(state: VoiceButtonState): string {
  switch (state) {
    case 'idle':
      return 'Start voice capture';
    case 'listening':
      return 'Stop voice capture';
    case 'processing':
      return 'Processing voice input';
    case 'error':
      return 'Voice capture error — click to retry';
  }
}

function MicIcon({ isActive, isError }: { isActive: boolean; isError: boolean }) {
  const color = isError ? 'text-white' : isActive ? 'text-white' : 'text-white';
  return (
    <svg
      className={`h-6 w-6 ${color}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 1a4 4 0 00-4 4v6a4 4 0 008 0V5a4 4 0 00-4-4z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="h-6 w-6 animate-spin text-white"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
