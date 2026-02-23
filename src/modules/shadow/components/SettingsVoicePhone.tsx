'use client';

import { useState, useEffect } from 'react';

export interface VoicePhoneSettings {
  voicePersona: string;
  speechSpeed: number;
  language: string;
  shadowPhoneNumber: string;
  userPhoneNumbers: string[];
  inboundCalls: boolean;
  outboundCalls: boolean;
  voicemail: boolean;
  autoRecording: boolean;
  autoTranscribe: boolean;
}

const DEFAULT_VOICE_PHONE: VoicePhoneSettings = {
  voicePersona: 'default',
  speechSpeed: 1.0,
  language: 'en',
  shadowPhoneNumber: '+1 (555) 0100-SHADOW',
  userPhoneNumbers: [],
  inboundCalls: true,
  outboundCalls: false,
  voicemail: true,
  autoRecording: false,
  autoTranscribe: true,
};

interface SettingsVoicePhoneProps {
  initialData?: Partial<VoicePhoneSettings>;
  onSave: (data: VoicePhoneSettings) => Promise<void>;
}

export default function SettingsVoicePhone({ initialData, onSave }: SettingsVoicePhoneProps) {
  const [settings, setSettings] = useState<VoicePhoneSettings>({
    ...DEFAULT_VOICE_PHONE,
    ...initialData,
  });
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);

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

  const handleAddPhoneNumber = () => {
    const trimmed = newPhoneNumber.trim();
    if (trimmed && !settings.userPhoneNumbers.includes(trimmed)) {
      setSettings({
        ...settings,
        userPhoneNumbers: [...settings.userPhoneNumbers, trimmed],
      });
      setNewPhoneNumber('');
    }
  };

  const handleRemovePhoneNumber = (index: number) => {
    setSettings({
      ...settings,
      userPhoneNumbers: settings.userPhoneNumbers.filter((_, i) => i !== index),
    });
  };

  const handleTestVoice = () => {
    setTestingVoice(true);
    // Simulate voice test with a short delay
    setTimeout(() => {
      setTestingVoice(false);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Voice Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Voice Settings</h3>
        <div className="space-y-4">
          {/* Voice Persona */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Voice Persona
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Choose the voice style for Shadow&apos;s spoken responses.
            </p>
            <select
              value={settings.voicePersona}
              onChange={(e) => setSettings({ ...settings, voicePersona: e.target.value })}
              className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="default">Default</option>
              <option value="professional">Professional</option>
              <option value="warm">Warm</option>
              <option value="energetic">Energetic</option>
              <option value="calm">Calm</option>
              <option value="authoritative">Authoritative</option>
            </select>
          </div>

          {/* Speech Speed */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Speech Speed
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Adjust the speed of spoken responses.
            </p>
            <div className="flex items-center gap-3 max-w-sm">
              <span className="text-xs text-gray-500 dark:text-gray-400 w-10">0.5x</span>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={settings.speechSpeed}
                onChange={(e) => setSettings({ ...settings, speechSpeed: Number(e.target.value) })}
                className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">2.0x</span>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Current: {settings.speechSpeed.toFixed(1)}x
            </p>
          </div>

          {/* Language */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Language
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Primary language for voice interactions.
            </p>
            <select
              value={settings.language}
              onChange={(e) => setSettings({ ...settings, language: e.target.value })}
              className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
            </select>
          </div>

          {/* Test Voice */}
          <div>
            <button
              onClick={handleTestVoice}
              disabled={testingVoice}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              {testingVoice ? 'Playing...' : 'Test Voice'}
            </button>
            {testingVoice && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Playing sample audio with current voice settings...
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Phone Numbers */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Phone Numbers</h3>
        <div className="space-y-4">
          {/* Shadow's Phone Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Shadow&apos;s Phone Number
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              The number Shadow uses for calls and SMS.
            </p>
            <div className="inline-flex items-center px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md">
              <span className="text-sm font-mono text-gray-900 dark:text-white">
                {settings.shadowPhoneNumber}
              </span>
            </div>
          </div>

          {/* Your Phone Numbers */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Your Phone Numbers
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Numbers that Shadow can call you on or accept calls from.
            </p>
            <div className="space-y-2">
              {settings.userPhoneNumbers.map((phone, index) => (
                <div key={index} className="inline-flex items-center gap-2 mr-2">
                  <span className="inline-flex items-center px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-mono text-gray-900 dark:text-white">
                    {phone}
                    <button
                      onClick={() => handleRemovePhoneNumber(index)}
                      className="ml-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      aria-label={`Remove ${phone}`}
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2 max-w-sm">
                <input
                  type="tel"
                  value={newPhoneNumber}
                  onChange={(e) => setNewPhoneNumber(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPhoneNumber()}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="+1 (555) 123-4567"
                />
                <button
                  onClick={handleAddPhoneNumber}
                  disabled={!newPhoneNumber.trim()}
                  className="px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + Add
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Call Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Call Settings</h3>
        <div className="space-y-4">
          {/* Inbound Calls */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Inbound Calls</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Allow Shadow to receive incoming phone calls.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.inboundCalls}
                onChange={(e) => setSettings({ ...settings, inboundCalls: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>

          {/* Outbound Calls */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Outbound Calls</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Allow Shadow to make phone calls on your behalf.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.outboundCalls}
                onChange={(e) => setSettings({ ...settings, outboundCalls: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>

          {/* Voicemail */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Voicemail</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Shadow answers and transcribes voicemails.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.voicemail}
                onChange={(e) => setSettings({ ...settings, voicemail: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>

          {/* Auto Recording */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-Recording</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Automatically record all voice sessions.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoRecording}
                onChange={(e) => setSettings({ ...settings, autoRecording: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>

          {/* Auto Transcribe */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-Transcribe</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Automatically generate transcripts for all calls.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoTranscribe}
                onChange={(e) => setSettings({ ...settings, autoTranscribe: e.target.checked })}
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
          {saving ? 'Saving...' : 'Save Voice & Phone Settings'}
        </button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400">Settings saved successfully</span>
        )}
      </div>
    </div>
  );
}
