'use client';

import { useState, useEffect } from 'react';

export interface SafetySettings {
  voicePinSet: boolean;
  newPin: string;
  confirmPin: string;
  requirePinForFinancial: boolean;
  requirePinForExternal: boolean;
  requirePinForCrisis: boolean;
  blastRadiusThreshold: string;
  financialThreshold: number;
  alwaysAnnounceAffectedCount: boolean;
  alwaysAnnounceCost: boolean;
  alwaysAnnounceIrreversibility: boolean;
}

const DEFAULT_SAFETY: SafetySettings = {
  voicePinSet: false,
  newPin: '',
  confirmPin: '',
  requirePinForFinancial: true,
  requirePinForExternal: false,
  requirePinForCrisis: true,
  blastRadiusThreshold: 'entity',
  financialThreshold: 500,
  alwaysAnnounceAffectedCount: true,
  alwaysAnnounceCost: true,
  alwaysAnnounceIrreversibility: true,
};

interface SettingsSafetyProps {
  initialData?: Partial<SafetySettings>;
  onSave: (data: SafetySettings) => Promise<void>;
}

export default function SettingsSafety({ initialData, onSave }: SettingsSafetyProps) {
  const [settings, setSettings] = useState<SafetySettings>({
    ...DEFAULT_SAFETY,
    ...initialData,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    if (initialData) {
      setSettings((prev) => ({ ...prev, ...initialData }));
    }
  }, [initialData]);

  const handleSave = async () => {
    // Validate PIN if the user is trying to set/change it
    if (settings.newPin || settings.confirmPin) {
      if (settings.newPin.length < 4 || settings.newPin.length > 6) {
        setPinError('PIN must be 4-6 digits');
        return;
      }
      if (!/^\d+$/.test(settings.newPin)) {
        setPinError('PIN must contain only digits');
        return;
      }
      if (settings.newPin !== settings.confirmPin) {
        setPinError('PINs do not match');
        return;
      }
    }
    setPinError('');
    setSaving(true);
    setSaved(false);
    try {
      await onSave(settings);
      setSaved(true);
      // Clear PIN fields after successful save
      setSettings((prev) => ({ ...prev, newPin: '', confirmPin: '', voicePinSet: prev.newPin ? true : prev.voicePinSet }));
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Voice PIN */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Voice PIN</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Your voice PIN is required for high-risk actions. It adds an extra layer of security to phone interactions.
        </p>

        <div className="space-y-4">
          {/* PIN Status */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Current Status:</span>
            {settings.voicePinSet ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                PIN Set
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Not Set
              </span>
            )}
          </div>

          {/* Set/Change PIN */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {settings.voicePinSet ? 'Change PIN' : 'Set PIN'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={settings.newPin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setSettings({ ...settings, newPin: val });
                    setPinError('');
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="New PIN (4-6 digits)"
                />
              </div>
              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={settings.confirmPin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setSettings({ ...settings, confirmPin: val });
                    setPinError('');
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Confirm PIN"
                />
              </div>
            </div>
            {pinError && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{pinError}</p>
            )}
          </div>
        </div>
      </div>

      {/* PIN-Required Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">PIN-Required Actions</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Select which types of actions require your voice PIN for confirmation.
        </p>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.requirePinForFinancial}
              onChange={(e) => setSettings({ ...settings, requirePinForFinancial: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Financial Actions</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Payments, invoicing, financial transfers.
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.requirePinForExternal}
              onChange={(e) => setSettings({ ...settings, requirePinForExternal: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">External Communications</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Sending emails, making calls, SMS to external contacts.
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.requirePinForCrisis}
              onChange={(e) => setSettings({ ...settings, requirePinForCrisis: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Crisis Declarations</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Declaring a crisis or activating emergency protocols.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Auto-Require PIN Thresholds */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Auto-Require PIN Thresholds</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Actions exceeding these thresholds will automatically require your PIN, regardless of other settings.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Blast Radius Threshold
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Actions affecting this scope or greater will require PIN.
            </p>
            <select
              value={settings.blastRadiusThreshold}
              onChange={(e) => setSettings({ ...settings, blastRadiusThreshold: e.target.value })}
              className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="self">Self (most restrictive)</option>
              <option value="entity">Entity</option>
              <option value="external">External (least restrictive)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Financial Threshold ($)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Actions involving amounts above this value require PIN.
            </p>
            <div className="flex items-center gap-2 max-w-xs">
              <span className="text-sm text-gray-500 dark:text-gray-400">$</span>
              <input
                type="number"
                min={0}
                step={50}
                value={settings.financialThreshold}
                onChange={(e) => setSettings({ ...settings, financialThreshold: Math.max(0, Number(e.target.value)) })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Always Announce */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Always Announce</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Shadow will always verbally announce these details before executing high-impact actions.
        </p>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Affected Count</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Announce how many people or records will be affected.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.alwaysAnnounceAffectedCount}
                onChange={(e) => setSettings({ ...settings, alwaysAnnounceAffectedCount: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Cost</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Announce the financial cost of the action.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.alwaysAnnounceCost}
                onChange={(e) => setSettings({ ...settings, alwaysAnnounceCost: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Irreversibility</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Warn when an action cannot be undone.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.alwaysAnnounceIrreversibility}
                onChange={(e) => setSettings({ ...settings, alwaysAnnounceIrreversibility: e.target.checked })}
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
          {saving ? 'Saving...' : 'Save Safety Settings'}
        </button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400">Settings saved successfully</span>
        )}
      </div>
    </div>
  );
}
