'use client';

import { useState, useCallback } from 'react';
import type { STTConfig } from '@/modules/voice/types';

type STTStatus = 'idle' | 'starting' | 'active' | 'stopping' | 'error';

interface STTControlsProps {
  config: STTConfig;
  onConfigChange: (config: STTConfig) => void;
  onStart?: () => void;
  onStop?: () => void;
  status?: STTStatus;
  currentTranscript?: string;
  confidence?: number;
  errorMessage?: string;
}

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-AU', label: 'English (Australia)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'es-MX', label: 'Spanish (Mexico)' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'it-IT', label: 'Italian' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'ko-KR', label: 'Korean' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'ar-SA', label: 'Arabic' },
];

const PROVIDER_OPTIONS: { value: STTConfig['provider']; label: string; description: string }[] = [
  { value: 'browser', label: 'Browser', description: 'Built-in Web Speech API' },
  { value: 'whisper', label: 'Whisper', description: 'OpenAI Whisper (high accuracy)' },
  { value: 'deepgram', label: 'Deepgram', description: 'Real-time streaming STT' },
  { value: 'assemblyai', label: 'AssemblyAI', description: 'AI-powered transcription' },
];

export default function STTControls({
  config,
  onConfigChange,
  onStart,
  onStop,
  status = 'idle',
  currentTranscript,
  confidence,
  errorMessage,
}: STTControlsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateConfig = useCallback(
    (updates: Partial<STTConfig>) => {
      onConfigChange({ ...config, ...updates });
    },
    [config, onConfigChange],
  );

  const isActive = status === 'active' || status === 'starting';
  const isTransitioning = status === 'starting' || status === 'stopping';

  const handleToggle = () => {
    if (isActive) {
      onStop?.();
    } else {
      onStart?.();
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Speech-to-Text</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Provider: {PROVIDER_OPTIONS.find((p) => p.value === config.provider)?.label ?? config.provider}
            </p>
          </div>
          <StatusBadge status={status} />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Error message */}
        {status === 'error' && errorMessage && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
            <svg className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Main control: Start/Stop + Language */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggle}
            disabled={isTransitioning}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isActive
                ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
                : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
            } ${isTransitioning ? 'opacity-60 cursor-wait' : ''}`}
          >
            {isActive ? (
              <>
                <StopIcon />
                {status === 'stopping' ? 'Stopping...' : 'Stop'}
              </>
            ) : (
              <>
                <MicIcon />
                {status === 'starting' ? 'Starting...' : 'Start'}
              </>
            )}
          </button>

          <select
            value={config.language}
            onChange={(e) => updateConfig({ language: e.target.value })}
            disabled={isActive}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {LANGUAGE_OPTIONS.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* Live transcript preview */}
        {isActive && currentTranscript && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-500">Live Transcript</span>
              {confidence !== undefined && (
                <ConfidenceDisplay value={confidence} />
              )}
            </div>
            <p className="text-sm text-gray-800 italic">{currentTranscript}</p>
          </div>
        )}

        {/* Quick toggles */}
        <div className="grid grid-cols-2 gap-3">
          <ToggleOption
            label="Punctuation"
            description="Auto-add punctuation"
            checked={config.enablePunctuation}
            onChange={(checked) => updateConfig({ enablePunctuation: checked })}
            disabled={isActive}
          />
          <ToggleOption
            label="Speaker Labels"
            description="Identify speakers"
            checked={config.enableSpeakerDiarization}
            onChange={(checked) => updateConfig({ enableSpeakerDiarization: checked })}
            disabled={isActive}
          />
          <ToggleOption
            label="Interim Results"
            description="Show text while speaking"
            checked={config.interimResults}
            onChange={(checked) => updateConfig({ interimResults: checked })}
            disabled={isActive}
          />
        </div>

        {/* Advanced settings toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg
            className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Advanced Settings
        </button>

        {/* Advanced panel */}
        {showAdvanced && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                STT Provider
              </label>
              <div className="space-y-1.5">
                {PROVIDER_OPTIONS.map((provider) => (
                  <label
                    key={provider.value}
                    className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition-colors ${
                      config.provider === provider.value
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    } ${isActive ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <input
                      type="radio"
                      name="stt-provider"
                      value={provider.value}
                      checked={config.provider === provider.value}
                      onChange={() => updateConfig({ provider: provider.value })}
                      disabled={isActive}
                      className="h-3.5 w-3.5 border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-xs font-medium text-gray-900">{provider.label}</span>
                      <span className="ml-1.5 text-xs text-gray-500">{provider.description}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {(config.provider === 'whisper' || config.provider === 'deepgram') && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Model
                </label>
                <select
                  value={config.model ?? ''}
                  onChange={(e) => updateConfig({ model: e.target.value || undefined })}
                  disabled={isActive}
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                >
                  {config.provider === 'whisper' ? (
                    <>
                      <option value="">Default</option>
                      <option value="tiny">Tiny (fastest)</option>
                      <option value="base">Base</option>
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large (most accurate)</option>
                    </>
                  ) : (
                    <>
                      <option value="">Default</option>
                      <option value="nova-2">Nova 2</option>
                      <option value="enhanced">Enhanced</option>
                      <option value="base">Base</option>
                    </>
                  )}
                </select>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: STTStatus }) {
  const styles: Record<STTStatus, string> = {
    idle: 'bg-gray-100 text-gray-600',
    starting: 'bg-yellow-100 text-yellow-700',
    active: 'bg-green-100 text-green-700',
    stopping: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700',
  };

  const labels: Record<STTStatus, string> = {
    idle: 'Idle',
    starting: 'Starting',
    active: 'Active',
    stopping: 'Stopping',
    error: 'Error',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {(status === 'active' || status === 'starting') && (
        <span className={`h-1.5 w-1.5 rounded-full ${status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500 animate-pulse'}`} />
      )}
      {labels[status]}
    </span>
  );
}

function ToggleOption({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-2.5 ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <div>
        <p className="text-xs font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-300'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function ConfidenceDisplay({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full ${
            pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-mono ${color}`}>{pct}%</span>
    </div>
  );
}

function MicIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a4 4 0 00-4 4v6a4 4 0 008 0V5a4 4 0 00-4-4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}
