'use client';

import { useState, useEffect } from 'react';

type VoiceActivityState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

interface VoiceActivityIndicatorProps {
  state: VoiceActivityState;
  label?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const STATE_CONFIG: Record<
  VoiceActivityState,
  { color: string; bgColor: string; ringColor: string; label: string; animate: boolean }
> = {
  idle: {
    color: 'text-gray-400',
    bgColor: 'bg-gray-100',
    ringColor: 'ring-gray-200',
    label: 'Ready',
    animate: false,
  },
  listening: {
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    ringColor: 'ring-blue-300',
    label: 'Listening...',
    animate: true,
  },
  processing: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    ringColor: 'ring-yellow-300',
    label: 'Processing...',
    animate: true,
  },
  speaking: {
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    ringColor: 'ring-green-300',
    label: 'Speaking...',
    animate: true,
  },
  error: {
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    ringColor: 'ring-red-300',
    label: 'Error',
    animate: false,
  },
};

const SIZE_CONFIG: Record<string, { container: string; icon: string; bars: string; text: string }> = {
  sm: { container: 'h-8 gap-1.5', icon: 'h-4 w-4', bars: 'h-4 gap-0.5', text: 'text-xs' },
  md: { container: 'h-10 gap-2', icon: 'h-5 w-5', bars: 'h-6 gap-0.5', text: 'text-sm' },
  lg: { container: 'h-14 gap-3', icon: 'h-7 w-7', bars: 'h-8 gap-1', text: 'text-base' },
};

export default function VoiceActivityIndicator({
  state,
  label,
  showLabel = true,
  size = 'md',
  className = '',
}: VoiceActivityIndicatorProps) {
  const config = STATE_CONFIG[state];
  const sizeConfig = SIZE_CONFIG[size];

  return (
    <div
      className={`relative inline-flex items-center ${sizeConfig.container} rounded-full ${config.bgColor} px-3 ring-1 ${config.ringColor} ${className}`}
    >
      {state === 'listening' ? (
        <AudioBars color={config.color} sizeClass={sizeConfig.bars} />
      ) : state === 'processing' ? (
        <SpinnerIcon className={`${sizeConfig.icon} ${config.color}`} />
      ) : state === 'speaking' ? (
        <SpeakingWave color={config.color} sizeClass={sizeConfig.bars} />
      ) : state === 'error' ? (
        <ErrorIcon className={`${sizeConfig.icon} ${config.color}`} />
      ) : (
        <MicIcon className={`${sizeConfig.icon} ${config.color}`} />
      )}

      {showLabel && (
        <span className={`${sizeConfig.text} font-medium ${config.color}`}>
          {label ?? config.label}
        </span>
      )}
    </div>
  );
}

// --- Compact variant for inline usage ---

interface CompactIndicatorProps {
  state: VoiceActivityState;
  className?: string;
}

export function CompactVoiceIndicator({ state, className = '' }: CompactIndicatorProps) {
  const config = STATE_CONFIG[state];

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`h-2 w-2 rounded-full ${
          state === 'idle'
            ? 'bg-gray-300'
            : state === 'listening'
            ? 'bg-blue-500 animate-pulse'
            : state === 'processing'
            ? 'bg-yellow-500 animate-pulse'
            : state === 'speaking'
            ? 'bg-green-500 animate-pulse'
            : 'bg-red-500'
        }`}
      />
      <span className={`text-xs ${config.color}`}>{config.label}</span>
    </span>
  );
}

// --- Audio level bars animation ---

function AudioBars({ color, sizeClass }: { color: string; sizeClass: string }) {
  const [levels, setLevels] = useState([0.3, 0.6, 0.8, 0.5, 0.4]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLevels((prev) =>
        prev.map(() => 0.2 + Math.random() * 0.8),
      );
    }, 150);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`flex items-end ${sizeClass}`}>
      {levels.map((level, i) => (
        <div
          key={i}
          className={`w-0.5 rounded-full transition-all duration-150 ${color.replace('text-', 'bg-')}`}
          style={{ height: `${level * 100}%` }}
        />
      ))}
    </div>
  );
}

// --- Speaking wave animation ---

function SpeakingWave({ color, sizeClass }: { color: string; sizeClass: string }) {
  const [levels, setLevels] = useState([0.5, 0.7, 0.9, 0.7, 0.5, 0.3, 0.5]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLevels((prev) => {
        const shifted = [...prev];
        shifted.push(shifted.shift()!);
        return shifted.map((v) => v + (Math.random() - 0.5) * 0.2);
      });
    }, 120);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`flex items-center ${sizeClass}`}>
      {levels.map((level, i) => (
        <div
          key={i}
          className={`w-0.5 rounded-full transition-all duration-100 ${color.replace('text-', 'bg-')}`}
          style={{ height: `${Math.max(0.1, Math.min(1, level)) * 100}%` }}
        />
      ))}
    </div>
  );
}

// --- SVG Icons ---

function MicIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

function SpinnerIcon({ className }: { className: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function ErrorIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
      />
    </svg>
  );
}
