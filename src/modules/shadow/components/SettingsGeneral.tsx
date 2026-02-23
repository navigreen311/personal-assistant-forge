'use client';

import { useState, useEffect } from 'react';

export interface GeneralSettings {
  name: string;
  tone: string;
  verbosity: number;
  proactivityLevel: number;
  floatingBubble: boolean;
  defaultInputMode: 'text' | 'voice';
  autoSpeakResponses: boolean;
  wakeWordEnabled: boolean;
  wakeWord: string;
  keyboardShortcut: string;
  sidekickMode: boolean;
}

const DEFAULT_GENERAL: GeneralSettings = {
  name: 'Shadow',
  tone: 'professional-friendly',
  verbosity: 3,
  proactivityLevel: 3,
  floatingBubble: true,
  defaultInputMode: 'text',
  autoSpeakResponses: false,
  wakeWordEnabled: false,
  wakeWord: 'Hey Shadow',
  keyboardShortcut: 'Ctrl+Shift+S',
  sidekickMode: false,
};

interface SettingsGeneralProps {
  initialData?: Partial<GeneralSettings>;
  onSave: (data: GeneralSettings) => Promise<void>;
}

export default function SettingsGeneral({ initialData, onSave }: SettingsGeneralProps) {
  const [settings, setSettings] = useState<GeneralSettings>({
    ...DEFAULT_GENERAL,
    ...initialData,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (initialData) {
      setSettings((prev) => ({ ...prev, ...initialData }));
    }
  }, [initialData]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await onSave(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const verbosityLabels = ['', 'Concise', 'Brief', 'Balanced', 'Detailed', 'Verbose'];
  const proactivityLabels = ['', 'Reactive', 'Mostly Reactive', 'Balanced', 'Mostly Proactive', 'Proactive'];

  return (
    <div className="space-y-6">
      {/* Assistant Name */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Identity</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Assistant Name
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              The name your assistant responds to.
            </p>
            <input
              type="text"
              value={settings.name}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
              className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Shadow"
            />
          </div>

          {/* Tone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tone
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              How your assistant communicates with you.
            </p>
            <select
              value={settings.tone}
              onChange={(e) => setSettings({ ...settings, tone: e.target.value })}
              className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="professional-friendly">Professional-Friendly</option>
              <option value="casual">Casual</option>
            </select>
          </div>
        </div>
      </div>

      {/* Behavior */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Behavior</h3>
        <div className="space-y-6">
          {/* Verbosity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Verbosity
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              How detailed responses should be.
            </p>
            <div className="flex items-center gap-3 max-w-xs">
              <span className="text-xs text-gray-500 dark:text-gray-400 w-16">Concise</span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={settings.verbosity}
                onChange={(e) => setSettings({ ...settings, verbosity: Number(e.target.value) })}
                className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 w-16 text-right">Detailed</span>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Level {settings.verbosity}: {verbosityLabels[settings.verbosity]}
            </p>
          </div>

          {/* Proactivity Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Proactivity Level
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              How actively Shadow anticipates your needs.
            </p>
            <div className="flex items-center gap-3 max-w-xs">
              <span className="text-xs text-gray-500 dark:text-gray-400 w-16">Reactive</span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={settings.proactivityLevel}
                onChange={(e) => setSettings({ ...settings, proactivityLevel: Number(e.target.value) })}
                className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 w-16 text-right">Proactive</span>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Level {settings.proactivityLevel}: {proactivityLabels[settings.proactivityLevel]}
            </p>
          </div>
        </div>
      </div>

      {/* Interface */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Interface</h3>
        <div className="space-y-4">
          {/* Floating Bubble */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Floating Bubble</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Show the Shadow companion bubble on all pages.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.floatingBubble}
                onChange={(e) => setSettings({ ...settings, floatingBubble: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>

          {/* Default Input Mode */}
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Default Input Mode</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Choose how you primarily interact with Shadow.
            </p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="inputMode"
                  value="text"
                  checked={settings.defaultInputMode === 'text'}
                  onChange={() => setSettings({ ...settings, defaultInputMode: 'text' })}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Text</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="inputMode"
                  value="voice"
                  checked={settings.defaultInputMode === 'voice'}
                  onChange={() => setSettings({ ...settings, defaultInputMode: 'voice' })}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Voice</span>
              </label>
            </div>
          </div>

          {/* Auto-speak Responses */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-speak Responses</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Automatically read out assistant responses using text-to-speech.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoSpeakResponses}
                onChange={(e) => setSettings({ ...settings, autoSpeakResponses: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>

          {/* Wake Word */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Wake Word</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Activate Shadow by speaking a wake phrase.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.wakeWordEnabled}
                onChange={(e) => setSettings({ ...settings, wakeWordEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>
          {settings.wakeWordEnabled && (
            <div className="ml-4">
              <input
                type="text"
                value={settings.wakeWord}
                onChange={(e) => setSettings({ ...settings, wakeWord: e.target.value })}
                className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Hey Shadow"
              />
            </div>
          )}

          {/* Keyboard Shortcut */}
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Keyboard Shortcut</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Quick-open Shadow from anywhere.
            </p>
            <div className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md">
              <kbd className="px-1.5 py-0.5 text-xs font-mono font-semibold text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 rounded">
                {settings.keyboardShortcut}
              </kbd>
            </div>
          </div>

          {/* Sidekick Mode */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Sidekick Mode</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Shadow proactively observes your workflow and offers contextual suggestions.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.sidekickMode}
                onChange={(e) => setSettings({ ...settings, sidekickMode: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {saving ? 'Saving...' : 'Save General Settings'}
        </button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400">Settings saved successfully</span>
        )}
      </div>
    </div>
  );
}
