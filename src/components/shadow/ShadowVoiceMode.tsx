'use client';

// Lightweight browser-native voice mode for Shadow.
//
// This is a FALLBACK to the full ShadowVoice overlay, which uses
// MediaRecorder → /api/shadow/voice for server-side STT. ShadowVoiceMode
// is useful when no server STT provider is configured, or for a quick
// demo path.

import { useEffect, useRef, useState } from 'react';
import {
  ShadowSTT,
  isBrowserSttSupported,
  type TranscriptHandler,
} from '@/lib/shadow/voice/stt';
import { ShadowTTS, isBrowserTtsSupported } from '@/lib/shadow/voice/tts';

type Status = 'idle' | 'listening' | 'thinking' | 'speaking';

interface Props {
  onSendMessage: (text: string) => Promise<string>;
  onClose: () => void;
}

export function ShadowVoiceMode({ onSendMessage, onClose }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const sttRef = useRef<ShadowSTT | null>(null);
  const ttsRef = useRef<ShadowTTS | null>(null);
  const sttSupported = isBrowserSttSupported();
  const ttsSupported = isBrowserTtsSupported();

  useEffect(() => {
    if (!ttsSupported) return;
    ttsRef.current = new ShadowTTS({
      onStart: () => setStatus('speaking'),
      onEnd: () => setStatus('idle'),
    });
    return () => {
      sttRef.current?.stop();
      ttsRef.current?.stop();
    };
  }, [ttsSupported]);

  if (!sttSupported) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        <p className="mb-2">Browser speech recognition isn&apos;t available.</p>
        <button
          onClick={onClose}
          className="text-xs text-indigo-600 hover:underline"
        >
          Switch to text
        </button>
      </div>
    );
  }

  const stopListening = async (finalText?: string) => {
    sttRef.current?.stop();
    sttRef.current = null;
    const text = (finalText ?? transcript).trim();
    if (!text) {
      setStatus('idle');
      return;
    }
    setStatus('thinking');
    try {
      const response = await onSendMessage(text);
      if (ttsSupported && response) {
        ttsRef.current?.speak(response);
      } else {
        setStatus('idle');
      }
    } catch {
      setStatus('idle');
    }
  };

  const startListening = () => {
    // Barge-in on any active speech.
    ttsRef.current?.stop();
    setTranscript('');
    setStatus('listening');

    const handleTranscript: TranscriptHandler = (text, isFinal) => {
      setTranscript(text);
      if (isFinal) void stopListening(text);
    };
    sttRef.current = new ShadowSTT(handleTranscript);
    sttRef.current.start();
  };

  const isListening = status === 'listening';

  return (
    <div className="flex flex-col items-center justify-center p-6 gap-4">
      <div className="w-full h-16 flex items-center justify-center">
        {status === 'listening' && (
          <div className="flex gap-1 items-center h-full">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="w-1 bg-indigo-500 rounded-full animate-pulse"
                style={{
                  height: `${20 + Math.random() * 40}px`,
                  animationDelay: `${i * 50}ms`,
                  animationDuration: `${300 + Math.random() * 400}ms`,
                }}
              />
            ))}
          </div>
        )}
        {status === 'speaking' && (
          <div className="flex gap-1 items-center h-full">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="w-1 bg-green-500 rounded-full animate-pulse"
                style={{
                  height: `${15 + Math.random() * 30}px`,
                  animationDelay: `${i * 60}ms`,
                  animationDuration: `${400 + Math.random() * 300}ms`,
                }}
              />
            ))}
          </div>
        )}
        {status === 'thinking' && (
          <p className="text-sm text-gray-400 animate-pulse">Shadow is thinking…</p>
        )}
        {status === 'idle' && (
          <p className="text-sm text-gray-400">Tap the mic to speak</p>
        )}
      </div>

      {transcript && (
        <p className="text-sm text-gray-600 dark:text-gray-300 text-center italic max-w-xs">
          &ldquo;{transcript}&rdquo;
        </p>
      )}

      <button
        onClick={isListening ? () => void stopListening() : startListening}
        className={`w-16 h-16 rounded-full flex items-center justify-center transition-all text-white shadow-lg ${
          isListening ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-700'
        }`}
        aria-label={isListening ? 'Stop recording' : 'Start recording'}
      >
        <span aria-hidden="true" className="text-2xl">
          {isListening ? '⏹' : '🎤'}
        </span>
      </button>

      <button
        onClick={onClose}
        className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
      >
        💬 Switch to text
      </button>
    </div>
  );
}
