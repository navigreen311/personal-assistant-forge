'use client';

import { useState, useEffect } from 'react';
import TrustedDevicesList, { TrustedDevice } from './TrustedDevicesList';
import AudioQualitySettings from './AudioQualitySettings';
import AdvancedVoiceSettings from '@/components/shadow/settings/AdvancedVoiceSettings';

export interface VoicePhoneSettings {
  voicePersona: string;
  speechSpeed: number;
  language: string;
  secondaryLanguage: string;
  shadowPhoneNumber: string;
  userPhoneNumbers: string[];
  inboundCalls: boolean;
  outboundCalls: boolean;
  voicemail: boolean;
  autoRecording: boolean;
  autoTranscribe: boolean;
  carplayBluetooth: boolean;
  smsCompanion: boolean;
  callSummary: boolean;
  noiseCancellation: boolean;
  echoSuppression: boolean;
  autoSwitchOnPoorConnection: boolean;
  vadSensitivity: string;
}

const DEFAULT_VOICE_PHONE: VoicePhoneSettings = {
  voicePersona: 'default',
  speechSpeed: 1.0,
  language: 'en-US',
  secondaryLanguage: '',
  shadowPhoneNumber: '+1 (555) 0100-SHADOW',
  userPhoneNumbers: [],
  inboundCalls: true,
  outboundCalls: false,
  voicemail: true,
  autoRecording: false,
  autoTranscribe: true,
  carplayBluetooth: false,
  smsCompanion: true,
  callSummary: true,
  noiseCancellation: true,
  echoSuppression: true,
  autoSwitchOnPoorConnection: true,
  vadSensitivity: 'normal',
};

const VOICE_PERSONA_OPTIONS = [
  { value: 'default', label: 'Default (current voice)' },
  { value: 'professional-male', label: 'Professional Male' },
  { value: 'professional-female', label: 'Professional Female' },
  { value: 'warm-male', label: 'Warm Male' },
  { value: 'warm-female', label: 'Warm Female' },
  { value: 'authoritative', label: 'Authoritative' },
  { value: 'calm', label: 'Calm & Reassuring' },
  { value: 'custom', label: 'Custom...' },
];

const LANGUAGE_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-AU', label: 'English (Australian)' },
  { value: 'es', label: 'Spanish' },
  { value: 'es-MX', label: 'Spanish (Mexico)' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
];

interface SettingsVoicePhoneProps {
  initialData?: Partial<VoicePhoneSettings>;
  onSave: (data: VoicePhoneSettings) => Promise<void>;
}

export default function SettingsVoicePhone({ initialData, onSave }: SettingsVoicePhoneProps) {
  const [settings, setSettings] = useState<VoicePhoneSettings>({
    ...DEFAULT_VOICE_PHONE,
    ...initialData,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);
  const [previewingPersona, setPreviewingPersona] = useState(false);
  const [copied, setCopied] = useState(false);

  // Trusted devices state (converted from userPhoneNumbers)
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>(() => {
    const phones = initialData?.userPhoneNumbers ?? DEFAULT_VOICE_PHONE.userPhoneNumbers;
    return phones.map((phone, i) => ({
      id: `device-${i}-${Date.now()}`,
      phoneNumber: phone,
      label: 'Mobile',
      isPrimary: i === 0,
      dateAdded: new Date().toLocaleDateString(),
    }));
  });

  useEffect(() => {
    if (initialData) {
      setSettings((prev) => ({ ...prev, ...initialData }));
      if (initialData.userPhoneNumbers) {
        setTrustedDevices(
          initialData.userPhoneNumbers.map((phone, i) => ({
            id: `device-${i}-${Date.now()}`,
            phoneNumber: phone,
            label: 'Mobile',
            isPrimary: i === 0,
            dateAdded: new Date().toLocaleDateString(),
          }))
        );
      }
    }
  }, [initialData]);

  // Keep userPhoneNumbers in sync with trusted devices
  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      userPhoneNumbers: trustedDevices.map((d) => d.phoneNumber),
    }));
  }, [trustedDevices]);

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

  const handleTestVoice = () => {
    setTestingVoice(true);
    setTimeout(() => {
      setTestingVoice(false);
    }, 2000);
  };

  const handlePreviewPersona = () => {
    setPreviewingPersona(true);
    setTimeout(() => {
      setPreviewingPersona(false);
    }, 2000);
  };

  const handleCopyNumber = async () => {
    try {
      await navigator.clipboard.writeText(settings.shadowPhoneNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = settings.shadowPhoneNumber;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadVCard = () => {
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Shadow (PAF)',
      'N:Shadow;(PAF);;;',
      `TEL;TYPE=VOICE:${settings.shadowPhoneNumber}`,
      'NOTE:Shadow Personal Assistant - PersonalAssistantForge',
      'END:VCARD',
    ].join('\n');

    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Shadow-PAF.vcf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAddDevice = (device: Omit<TrustedDevice, 'id' | 'dateAdded'>) => {
    const newDevice: TrustedDevice = {
      ...device,
      id: `device-${Date.now()}`,
      dateAdded: new Date().toLocaleDateString(),
    };
    // If the new device is primary, unset others
    if (device.isPrimary) {
      setTrustedDevices((prev) => [
        ...prev.map((d) => ({ ...d, isPrimary: false })),
        newDevice,
      ]);
    } else {
      setTrustedDevices((prev) => [...prev, newDevice]);
    }
  };

  const handleRemoveDevice = (id: string) => {
    setTrustedDevices((prev) => prev.filter((d) => d.id !== id));
  };

  const handleEditDevice = (id: string, updates: Partial<TrustedDevice>) => {
    setTrustedDevices((prev) => {
      let updated = prev.map((d) => (d.id === id ? { ...d, ...updates } : d));
      // If setting a new primary, unset others
      if (updates.isPrimary) {
        updated = updated.map((d) => (d.id === id ? d : { ...d, isPrimary: false }));
      }
      return updated;
    });
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
            <div className="flex items-center gap-2">
              <select
                value={settings.voicePersona}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'custom') {
                    // Navigate to VoiceForge persona builder
                    window.location.href = '/voiceforge';
                    return;
                  }
                  setSettings({ ...settings, voicePersona: value });
                }}
                className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {VOICE_PERSONA_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {settings.voicePersona !== 'custom' && (
                <button
                  onClick={handlePreviewPersona}
                  disabled={previewingPersona}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  {previewingPersona ? 'Playing...' : 'Preview'}
                </button>
              )}
            </div>
            {settings.voicePersona && settings.voicePersona !== 'custom' && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                This persona will be used for all voice interactions and phone calls. Entity profiles can override this.
              </p>
            )}
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

          {/* Primary Language */}
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
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Secondary Language */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Secondary Language
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Shadow can understand both languages. Responds in whichever you speak.
            </p>
            <select
              value={settings.secondaryLanguage}
              onChange={(e) => setSettings({ ...settings, secondaryLanguage: e.target.value })}
              className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">None</option>
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
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
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md">
                <span className="text-sm font-mono text-gray-900 dark:text-white">
                  {settings.shadowPhoneNumber}
                </span>
              </div>
              <button
                onClick={handleCopyNumber}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {copied ? (
                  <>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
              <button
                onClick={handleDownloadVCard}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                Add to contacts
              </button>
            </div>
          </div>

          {/* Trusted Devices (replaces simple phone number list) */}
          <TrustedDevicesList
            devices={trustedDevices}
            onAdd={handleAddDevice}
            onRemove={handleRemoveDevice}
            onEdit={handleEditDevice}
          />
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

          {/* CarPlay / Bluetooth */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">CarPlay / Bluetooth</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Enable hands-free Shadow calls via CarPlay, Android Auto, or Bluetooth devices.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.carplayBluetooth}
                onChange={(e) => setSettings({ ...settings, carplayBluetooth: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>

          {/* SMS Companion */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">SMS Companion</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Send supporting SMS during phone calls (links, confirmations, summaries).
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.smsCompanion}
                onChange={(e) => setSettings({ ...settings, smsCompanion: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>

          {/* Call Summary */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Call Summary</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Automatically send SMS summary after each phone call ends.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.callSummary}
                onChange={(e) => setSettings({ ...settings, callSummary: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>
        </div>
      </div>

      {/* Audio Quality */}
      <AudioQualitySettings
        noiseCancellation={settings.noiseCancellation}
        echoSuppression={settings.echoSuppression}
        autoSwitchOnPoorConnection={settings.autoSwitchOnPoorConnection}
        vadSensitivity={settings.vadSensitivity}
        onChange={(updates) => setSettings((prev) => ({ ...prev, ...updates }))}
      />

      {/* Advanced Voice Settings (Powered by VisionAudioForge)
       *
       * Self-fetches its current state from /api/shadow/vaf-config and
       * self-PATCHes on changes — keeps it independent of this form's
       * Save button. Rendered as a collapsible section near the bottom
       * so the panel doesn't dominate the page on first load.
       */}
      <AdvancedVoiceSettings defaultCollapsed />

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
