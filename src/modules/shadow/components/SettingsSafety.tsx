'use client';

import { useState, useEffect } from 'react';
import AntifraudNotice from './AntifraudNotice';
import SafetyTrustedDevices from './SafetyTrustedDevices';
import SecurityEventsLog from './SecurityEventsLog';

export interface SafetySettings {
  voicePinSet: boolean;
  newPin: string;
  confirmPin: string;
  requirePinForFinancial: boolean;
  requirePinForExternal: boolean;
  requirePinForCrisis: boolean;
  requirePinForDataDeletion: boolean;
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
  requirePinForDataDeletion: true,
  blastRadiusThreshold: 'entity',
  financialThreshold: 500,
  alwaysAnnounceAffectedCount: true,
  alwaysAnnounceCost: true,
  alwaysAnnounceIrreversibility: true,
};

const BLAST_RADIUS_DESCRIPTIONS: Record<string, string> = {
  self: 'Any action that modifies your data will require PIN.',
  entity:
    "Any action that affects an entity's data (invoices, workflows, contacts) will require PIN.",
  external: 'Any action that contacts people outside PAF will require PIN.',
  public: 'Only actions with public-facing impact require PIN.',
};

interface SettingsSafetyProps {
  initialData?: Partial<SafetySettings>;
  onSave: (data: SafetySettings) => Promise<void>;
}

function getPinStrength(pin: string): { label: string; color: string; width: string } | null {
  if (pin.length === 0) return null;
  if (pin.length < 4) return null;
  if (pin.length === 4)
    return { label: 'Weak', color: 'bg-red-500', width: 'w-1/3' };
  if (pin.length === 5)
    return { label: 'Medium', color: 'bg-yellow-500', width: 'w-2/3' };
  return { label: 'Strong', color: 'bg-green-500', width: 'w-full' };
}

export default function SettingsSafety({ initialData, onSave }: SettingsSafetyProps) {
  const [settings, setSettings] = useState<SafetySettings>({
    ...DEFAULT_SAFETY,
    ...initialData,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pinError, setPinError] = useState('');

  // New state for PIN management
  const [showPinForm, setShowPinForm] = useState(!initialData?.voicePinSet);
  const [pinSetDate, setPinSetDate] = useState<string>(
    (initialData as Record<string, unknown>)?.pinSetDate as string ?? ''
  );
  const [settingPin, setSettingPin] = useState(false);
  const [removingPin, setRemovingPin] = useState(false);
  const [pinSuccess, setPinSuccess] = useState('');

  useEffect(() => {
    if (initialData) {
      setSettings((prev) => ({ ...prev, ...initialData }));
      if (initialData.voicePinSet !== undefined) {
        setShowPinForm(!initialData.voicePinSet);
      }
      if ((initialData as Record<string, unknown>)?.pinSetDate) {
        setPinSetDate((initialData as Record<string, unknown>).pinSetDate as string);
      }
    }
  }, [initialData]);

  // Validate PIN fields
  const validatePin = (): boolean => {
    if (settings.newPin.length < 4 || settings.newPin.length > 6) {
      setPinError('PIN must be 4-6 digits');
      return false;
    }
    if (!/^\d+$/.test(settings.newPin)) {
      setPinError('PIN must contain only digits');
      return false;
    }
    if (settings.newPin !== settings.confirmPin) {
      setPinError('PINs do not match');
      return false;
    }
    return true;
  };

  // Set/Change PIN handler (separate from general Save)
  const handleSetPin = async () => {
    if (!validatePin()) return;
    setPinError('');
    setPinSuccess('');
    setSettingPin(true);
    try {
      const res = await fetch('/api/shadow/config/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: settings.newPin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? 'Failed to set PIN');
      }
      const now = new Date().toISOString();
      setPinSetDate(now);
      setSettings((prev) => ({
        ...prev,
        voicePinSet: true,
        newPin: '',
        confirmPin: '',
      }));
      setShowPinForm(false);
      setPinSuccess('PIN set successfully.');
      setTimeout(() => setPinSuccess(''), 3000);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Failed to set PIN');
    } finally {
      setSettingPin(false);
    }
  };

  // Remove PIN handler
  const handleRemovePin = async () => {
    setPinError('');
    setPinSuccess('');
    setRemovingPin(true);
    try {
      const res = await fetch('/api/shadow/config/pin', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? 'Failed to remove PIN');
      }
      setSettings((prev) => ({
        ...prev,
        voicePinSet: false,
        newPin: '',
        confirmPin: '',
      }));
      setPinSetDate('');
      setShowPinForm(true);
      setPinSuccess('PIN removed.');
      setTimeout(() => setPinSuccess(''), 3000);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Failed to remove PIN');
    } finally {
      setRemovingPin(false);
    }
  };

  // General save (non-PIN settings)
  const handleSave = async () => {
    setPinError('');
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

  const pinStrength = getPinStrength(settings.newPin);

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
                Active
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
            {settings.voicePinSet && pinSetDate && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Set on {new Date(pinSetDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>

          {/* When PIN is set: show Change / Remove buttons */}
          {settings.voicePinSet && !showPinForm && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowPinForm(true)}
                className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Change PIN
              </button>
              <button
                onClick={handleRemovePin}
                disabled={removingPin}
                className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                {removingPin ? 'Removing...' : 'Remove PIN'}
              </button>
            </div>
          )}

          {/* Remove PIN warning */}
          {settings.voicePinSet && !showPinForm && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Removing your PIN will disable all PIN-required actions. They will fall back to CONFIRM level.
            </p>
          )}

          {/* Set/Change PIN form */}
          {showPinForm && (
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

              {/* PIN Strength Indicator */}
              {settings.newPin.length >= 4 && pinStrength && (
                <div className="mt-3 max-w-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">PIN Strength:</span>
                    <span
                      className={`text-xs font-medium ${
                        pinStrength.label === 'Weak'
                          ? 'text-red-600 dark:text-red-400'
                          : pinStrength.label === 'Medium'
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-green-600 dark:text-green-400'
                      }`}
                    >
                      {pinStrength.label}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${pinStrength.color} ${pinStrength.width}`}
                    />
                  </div>
                  {pinStrength.label !== 'Strong' && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Use 6 digits for stronger security.
                    </p>
                  )}
                </div>
              )}

              {pinError && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-2">{pinError}</p>
              )}

              {/* Set/Change PIN button */}
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={handleSetPin}
                  disabled={settingPin}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {settingPin
                    ? 'Setting PIN...'
                    : settings.voicePinSet
                      ? 'Change PIN'
                      : 'Set PIN'}
                </button>
                {settings.voicePinSet && (
                  <button
                    onClick={() => {
                      setShowPinForm(false);
                      setSettings((prev) => ({ ...prev, newPin: '', confirmPin: '' }));
                      setPinError('');
                    }}
                    className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {/* PIN inline success message */}
          {pinSuccess && (
            <p className="text-xs text-green-600 dark:text-green-400">{pinSuccess}</p>
          )}
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

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.requirePinForDataDeletion}
              onChange={(e) => setSettings({ ...settings, requirePinForDataDeletion: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Data Deletion</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Deleting records, clearing history, removing entities.
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
              <option value="self">Self (most permissive)</option>
              <option value="entity">Entity (default)</option>
              <option value="external">External</option>
              <option value="public">Public (most restrictive)</option>
            </select>
            {/* Dynamic helper text based on selected blast radius */}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {BLAST_RADIUS_DESCRIPTIONS[settings.blastRadiusThreshold] ?? ''}
            </p>
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

      {/* Anti-Fraud Protections */}
      <AntifraudNotice />

      {/* Trusted Devices */}
      <SafetyTrustedDevices />

      {/* Recent Security Events */}
      <SecurityEventsLog />

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
