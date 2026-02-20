'use client';

import { useState, useCallback } from 'react';
import type { WakeWordConfig } from '@/modules/voice/types';

interface WakeWordSettingsProps {
  config: WakeWordConfig;
  onConfigChange: (config: WakeWordConfig) => void;
  isListening?: boolean;
  onToggleListening?: () => void;
}

const WAKE_WORD_PRESETS: { label: string; phrase: string }[] = [
  { label: 'Hey Forge', phrase: 'Hey Forge' },
  { label: 'OK Forge', phrase: 'OK Forge' },
  { label: 'Hey Assistant', phrase: 'Hey Assistant' },
  { label: 'Computer', phrase: 'Computer' },
];

const PROVIDER_OPTIONS: { value: WakeWordConfig['provider']; label: string; description: string }[] = [
  { value: 'browser', label: 'Browser', description: 'Web Speech API (no extra dependencies)' },
  { value: 'porcupine', label: 'Porcupine', description: 'Picovoice on-device engine (recommended)' },
  { value: 'custom', label: 'Custom ML', description: 'Custom TensorFlow.js/ONNX model' },
];

export default function WakeWordSettings({
  config,
  onConfigChange,
  isListening = false,
  onToggleListening,
}: WakeWordSettingsProps) {
  const [customPhrase, setCustomPhrase] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateConfig = useCallback(
    (updates: Partial<WakeWordConfig>) => {
      setError(null);
      const newConfig = { ...config, ...updates };

      if (newConfig.sensitivity < 0 || newConfig.sensitivity > 1) {
        setError('Sensitivity must be between 0 and 1.');
        return;
      }

      if (!newConfig.phrase.trim()) {
        setError('Wake word phrase cannot be empty.');
        return;
      }

      onConfigChange(newConfig);
    },
    [config, onConfigChange],
  );

  const handleCustomPhraseSubmit = () => {
    const trimmed = customPhrase.trim();
    if (trimmed.length < 2) {
      setError('Wake word phrase must be at least 2 characters.');
      return;
    }
    if (trimmed.length > 30) {
      setError('Wake word phrase must be 30 characters or fewer.');
      return;
    }
    updateConfig({ phrase: trimmed });
    setShowCustomInput(false);
    setCustomPhrase('');
  };

  const sensitivityLabel =
    config.sensitivity < 0.3
      ? 'Low'
      : config.sensitivity < 0.7
      ? 'Medium'
      : 'High';

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Wake Word Detection</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure how the assistant activates on voice
          </p>
        </div>
        <button
          type="button"
          onClick={() => updateConfig({ enabled: !config.enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            config.enabled ? 'bg-blue-600' : 'bg-gray-300'
          }`}
          role="switch"
          aria-checked={config.enabled}
          aria-label="Toggle wake word detection"
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              config.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className={`p-4 space-y-5 ${!config.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Error message */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Wake Word Selection */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">
            Wake Phrase
          </label>
          <div className="flex flex-wrap gap-2">
            {WAKE_WORD_PRESETS.map((preset) => (
              <button
                key={preset.phrase}
                type="button"
                onClick={() => updateConfig({ phrase: preset.phrase })}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  config.phrase === preset.phrase
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                &quot;{preset.label}&quot;
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowCustomInput(!showCustomInput)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                showCustomInput || !WAKE_WORD_PRESETS.some((p) => p.phrase === config.phrase)
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600'
              }`}
            >
              Custom...
            </button>
          </div>

          {showCustomInput && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder='e.g., "Hey Buddy"'
                value={customPhrase}
                onChange={(e) => setCustomPhrase(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCustomPhraseSubmit();
                }}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                maxLength={30}
              />
              <button
                type="button"
                onClick={handleCustomPhraseSubmit}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Set
              </button>
            </div>
          )}

          <p className="mt-2 text-xs text-gray-500">
            Current: <span className="font-medium text-gray-700">&quot;{config.phrase}&quot;</span>
          </p>
        </div>

        {/* Sensitivity Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">
              Sensitivity
            </label>
            <span className="text-xs font-medium text-gray-700">
              {sensitivityLabel} ({Math.round(config.sensitivity * 100)}%)
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(config.sensitivity * 100)}
            onChange={(e) => updateConfig({ sensitivity: parseInt(e.target.value) / 100 })}
            className="w-full h-2 rounded-full appearance-none bg-gray-200 accent-blue-600 cursor-pointer"
          />
          <div className="flex justify-between mt-1 text-xs text-gray-400">
            <span>Low (fewer false triggers)</span>
            <span>High (more responsive)</span>
          </div>
        </div>

        {/* Detection Provider */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">
            Detection Engine
          </label>
          <div className="space-y-2">
            {PROVIDER_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  config.provider === option.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="wake-word-provider"
                  value={option.value}
                  checked={config.provider === option.value}
                  onChange={() => updateConfig({ provider: option.value })}
                  className="mt-0.5 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">{option.label}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Listening Status */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isListening ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
                }`}
              />
              <span className="text-sm text-gray-700">
                {isListening ? 'Listening for wake word...' : 'Wake word detection paused'}
              </span>
            </div>
            {onToggleListening && (
              <button
                type="button"
                onClick={onToggleListening}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  isListening
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                {isListening ? 'Stop Listening' : 'Start Listening'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
