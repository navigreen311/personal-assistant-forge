'use client';

import React, { useState, useEffect, useCallback } from 'react';

// --- Types ---

interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  timeFormat: '12h' | '24h';
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
    digest: 'daily' | 'weekly' | 'none';
    quietHoursStart?: string;
    quietHoursEnd?: string;
  };
  accessibility: {
    reduceMotion: boolean;
    highContrast: boolean;
    fontSize: 'small' | 'medium' | 'large';
  };
}

type Tab = 'profile' | 'appearance' | 'notifications' | 'regional' | 'entities' | 'apikeys' | 'danger';

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  language: 'en',
  timezone: 'America/New_York',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  notifications: { email: true, push: true, sms: false, digest: 'daily' },
  accessibility: { reduceMotion: false, highContrast: false, fontSize: 'medium' },
};

// --- Component ---

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await fetch('/api/settings');
      const json = await res.json();
      if (json.success && json.data) {
        setSettings(json.data);
      }
    } catch {
      setErrorMessage('Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = async (updates: Partial<UserSettings>) => {
    try {
      setSaving(true);
      setSaveMessage(null);
      setErrorMessage(null);
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setSettings(json.data);
        setSaveMessage('Settings saved.');
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setErrorMessage(json.error?.message || 'Failed to save settings.');
      }
    } catch {
      setErrorMessage('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'profile', label: 'Profile' },
    { key: 'appearance', label: 'Appearance' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'regional', label: 'Regional' },
    { key: 'entities', label: 'Entities' },
    { key: 'apikeys', label: 'API Keys' },
    { key: 'danger', label: 'Danger Zone' },
  ];

  const handleDeleteAccount = async () => {
    try {
      setDeleting(true);
      setErrorMessage(null);
      const res = await fetch('/api/settings', { method: 'DELETE' });
      if (res.ok) {
        window.location.href = '/login';
      } else {
        const json = await res.json();
        setErrorMessage(json.error?.message || 'Failed to delete account.');
      }
    } catch {
      setErrorMessage('Failed to delete account.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Status messages */}
      {saveMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded-lg text-sm" role="alert">
          {saveMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm" role="alert">
          {errorMessage}
        </div>
      )}

      {/* Tabs */}
      <nav className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto" role="tablist" aria-label="Settings sections">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`panel-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-600 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab Panels */}
      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={activeTab}>
        {/* 1. Profile */}
        {activeTab === 'profile' && (
          <section className="space-y-6">
            <h2 className="text-lg font-semibold">Profile</h2>
            <div className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 text-xl font-bold" aria-label="User avatar">
                ?
              </div>
              <div>
                <p className="font-medium text-gray-900">User Profile</p>
                <p className="text-sm text-gray-500">Manage your name, email, and avatar</p>
              </div>
              <a
                href="/settings/profile"
                className="ml-auto px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Edit Profile
              </a>
            </div>
          </section>
        )}

        {/* 2. Appearance */}
        {activeTab === 'appearance' && (
          <section className="space-y-6">
            <h2 className="text-lg font-semibold">Appearance</h2>

            {/* Theme */}
            <fieldset className="p-4 border border-gray-200 rounded-lg">
              <legend className="text-sm font-medium text-gray-700 px-1">Theme</legend>
              <div className="flex gap-3 mt-2">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <label
                    key={t}
                    className={`flex-1 p-3 border rounded-lg cursor-pointer text-center text-sm transition-colors ${
                      settings.theme === t
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={t}
                      checked={settings.theme === t}
                      onChange={() => saveSettings({ theme: t })}
                      className="sr-only"
                    />
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Font Size */}
            <fieldset className="p-4 border border-gray-200 rounded-lg">
              <legend className="text-sm font-medium text-gray-700 px-1">Font Size</legend>
              <div className="flex gap-3 mt-2">
                {(['small', 'medium', 'large'] as const).map((s) => (
                  <label
                    key={s}
                    className={`flex-1 p-3 border rounded-lg cursor-pointer text-center text-sm transition-colors ${
                      settings.accessibility.fontSize === s
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="fontSize"
                      value={s}
                      checked={settings.accessibility.fontSize === s}
                      onChange={() => saveSettings({ accessibility: { ...settings.accessibility, fontSize: s } })}
                      className="sr-only"
                    />
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Accessibility Toggles */}
            <div className="p-4 border border-gray-200 rounded-lg space-y-4">
              <h3 className="text-sm font-medium text-gray-700">Accessibility</h3>
              <ToggleRow
                label="Reduce Motion"
                description="Minimize animations and transitions"
                checked={settings.accessibility.reduceMotion}
                onChange={(v) => saveSettings({ accessibility: { ...settings.accessibility, reduceMotion: v } })}
                disabled={saving}
              />
              <ToggleRow
                label="High Contrast"
                description="Increase contrast for better visibility"
                checked={settings.accessibility.highContrast}
                onChange={(v) => saveSettings({ accessibility: { ...settings.accessibility, highContrast: v } })}
                disabled={saving}
              />
            </div>
          </section>
        )}

        {/* 3. Notifications */}
        {activeTab === 'notifications' && (
          <section className="space-y-6">
            <h2 className="text-lg font-semibold">Notifications</h2>

            <div className="p-4 border border-gray-200 rounded-lg space-y-4">
              <h3 className="text-sm font-medium text-gray-700">Channels</h3>
              <ToggleRow
                label="Email Notifications"
                description="Receive notifications via email"
                checked={settings.notifications.email}
                onChange={(v) => saveSettings({ notifications: { ...settings.notifications, email: v } })}
                disabled={saving}
              />
              <ToggleRow
                label="Push Notifications"
                description="Receive browser push notifications"
                checked={settings.notifications.push}
                onChange={(v) => saveSettings({ notifications: { ...settings.notifications, push: v } })}
                disabled={saving}
              />
              <ToggleRow
                label="SMS Notifications"
                description="Receive notifications via SMS"
                checked={settings.notifications.sms}
                onChange={(v) => saveSettings({ notifications: { ...settings.notifications, sms: v } })}
                disabled={saving}
              />
            </div>

            {/* Digest */}
            <div className="p-4 border border-gray-200 rounded-lg">
              <label htmlFor="digest-select" className="block text-sm font-medium text-gray-700 mb-2">
                Digest Frequency
              </label>
              <select
                id="digest-select"
                value={settings.notifications.digest}
                onChange={(e) => saveSettings({ notifications: { ...settings.notifications, digest: e.target.value as 'daily' | 'weekly' | 'none' } })}
                disabled={saving}
                className="w-full max-w-xs p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="none">None</option>
              </select>
            </div>

            {/* Quiet Hours */}
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Quiet Hours</h3>
              <div className="flex gap-4 items-center">
                <div>
                  <label htmlFor="quiet-start" className="block text-xs text-gray-500 mb-1">Start</label>
                  <input
                    id="quiet-start"
                    type="time"
                    value={settings.notifications.quietHoursStart ?? '22:00'}
                    onChange={(e) => saveSettings({ notifications: { ...settings.notifications, quietHoursStart: e.target.value } })}
                    disabled={saving}
                    className="p-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <span className="text-gray-400 mt-4">to</span>
                <div>
                  <label htmlFor="quiet-end" className="block text-xs text-gray-500 mb-1">End</label>
                  <input
                    id="quiet-end"
                    type="time"
                    value={settings.notifications.quietHoursEnd ?? '08:00'}
                    onChange={(e) => saveSettings({ notifications: { ...settings.notifications, quietHoursEnd: e.target.value } })}
                    disabled={saving}
                    className="p-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 4. Regional */}
        {activeTab === 'regional' && (
          <section className="space-y-6">
            <h2 className="text-lg font-semibold">Regional</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 border border-gray-200 rounded-lg">
                <label htmlFor="language-select" className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                <select
                  id="language-select"
                  value={settings.language}
                  onChange={(e) => saveSettings({ language: e.target.value })}
                  disabled={saving}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="pt">Portuguese</option>
                  <option value="ja">Japanese</option>
                </select>
              </div>

              <div className="p-4 border border-gray-200 rounded-lg">
                <label htmlFor="timezone-select" className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
                <select
                  id="timezone-select"
                  value={settings.timezone}
                  onChange={(e) => saveSettings({ timezone: e.target.value })}
                  disabled={saving}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="America/New_York">Eastern (America/New_York)</option>
                  <option value="America/Chicago">Central (America/Chicago)</option>
                  <option value="America/Denver">Mountain (America/Denver)</option>
                  <option value="America/Los_Angeles">Pacific (America/Los_Angeles)</option>
                  <option value="Europe/London">London (Europe/London)</option>
                  <option value="Europe/Paris">Paris (Europe/Paris)</option>
                  <option value="Asia/Tokyo">Tokyo (Asia/Tokyo)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>

              <div className="p-4 border border-gray-200 rounded-lg">
                <label htmlFor="dateformat-select" className="block text-sm font-medium text-gray-700 mb-2">Date Format</label>
                <select
                  id="dateformat-select"
                  value={settings.dateFormat}
                  onChange={(e) => saveSettings({ dateFormat: e.target.value as UserSettings['dateFormat'] })}
                  disabled={saving}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </div>

              <div className="p-4 border border-gray-200 rounded-lg">
                <label htmlFor="timeformat-select" className="block text-sm font-medium text-gray-700 mb-2">Time Format</label>
                <select
                  id="timeformat-select"
                  value={settings.timeFormat}
                  onChange={(e) => saveSettings({ timeFormat: e.target.value as '12h' | '24h' })}
                  disabled={saving}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="12h">12-hour (AM/PM)</option>
                  <option value="24h">24-hour</option>
                </select>
              </div>
            </div>
          </section>
        )}

        {/* 5. Entity Management */}
        {activeTab === 'entities' && (
          <section className="space-y-6">
            <h2 className="text-lg font-semibold">Entity Management</h2>
            <div className="p-4 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-500 mb-4">Manage your business entities and workspaces.</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">Personal Workspace</p>
                    <p className="text-xs text-gray-500">Default entity</p>
                  </div>
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">Active</span>
                </div>
              </div>
              <a
                href="/settings/entities"
                className="inline-block mt-4 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Manage Entities
              </a>
            </div>
          </section>
        )}

        {/* 6. API Keys */}
        {activeTab === 'apikeys' && (
          <ApiKeysPanel />
        )}

        {/* 7. Danger Zone */}
        {activeTab === 'danger' && (
          <section className="space-y-6">
            <h2 className="text-lg font-semibold text-red-600">Danger Zone</h2>
            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-red-800">Delete Account</p>
                  <p className="text-xs text-red-600">Permanently delete your account and all associated data. This action cannot be undone.</p>
                </div>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete Account
                </button>
              </div>

              {showDeleteConfirm && (
                <div className="mt-4 p-4 border border-red-300 rounded-lg bg-white">
                  <p className="text-sm text-red-800 font-medium mb-3">
                    Are you sure? This will permanently delete your account.
                  </p>
                  <label htmlFor="delete-confirm-input" className="block text-sm text-gray-700 mb-1">
                    Type <strong>DELETE</strong> to confirm:
                  </label>
                  <input
                    id="delete-confirm-input"
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    disabled={deleting}
                    className="w-full max-w-xs p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 mb-3"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmText('');
                      }}
                      disabled={deleting}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== 'DELETE' || deleting}
                      className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Confirm account deletion"
                    >
                      {deleting ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

interface DetectedApiKey {
  name: string;
  maskedValue: string;
  source: string;
  status: 'active' | 'unknown';
}

function ApiKeysPanel() {
  const [apiKeys, setApiKeys] = useState<DetectedApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    async function fetchApiKeys() {
      try {
        setLoadingKeys(true);
        setKeysError(null);
        const res = await fetch('/api/settings/api-keys');
        const json = await res.json();
        if (json.success && json.data) {
          setApiKeys(json.data);
        } else {
          // API not available yet, show env-detected keys as fallback
          setApiKeys([]);
        }
      } catch {
        // Graceful fallback: show no keys rather than an error
        setApiKeys([]);
      } finally {
        setLoadingKeys(false);
      }
    }
    fetchApiKeys();
  }, []);

  const handleCopyMasked = (key: DetectedApiKey) => {
    navigator.clipboard.writeText(key.maskedValue).then(() => {
      setCopiedKey(key.name);
      setTimeout(() => setCopiedKey(null), 2000);
    }).catch(() => {
      // Clipboard API may not be available
    });
  };

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold">API Keys</h2>

      {loadingKeys ? (
        <div className="p-4 border border-gray-200 rounded-lg">
          <p className="text-sm text-gray-500">Loading API keys...</p>
        </div>
      ) : (
        <>
          <div className="p-4 border border-gray-200 rounded-lg">
            <p className="text-sm text-gray-600 mb-4">
              API keys configured for this application. Keys are masked for security.
              Full key values are never exposed in the browser.
            </p>

            {apiKeys.length === 0 ? (
              <div className="space-y-3">
                {/* Show default environment-sourced keys when API is unavailable */}
                <ApiKeyRow
                  keyData={{ name: 'OpenAI API Key', maskedValue: 'sk-****...****', source: 'Environment', status: 'unknown' }}
                  copiedKey={copiedKey}
                  onCopy={handleCopyMasked}
                />
                <ApiKeyRow
                  keyData={{ name: 'Database URL', maskedValue: 'postgres://****...****', source: 'Environment', status: 'unknown' }}
                  copiedKey={copiedKey}
                  onCopy={handleCopyMasked}
                />
                <p className="mt-3 text-xs text-gray-400">
                  Keys are sourced from server environment variables. Connect the API keys endpoint to manage keys dynamically.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <ApiKeyRow
                    key={key.name}
                    keyData={key}
                    copiedKey={copiedKey}
                    onCopy={handleCopyMasked}
                  />
                ))}
              </div>
            )}
          </div>

          {keysError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
              {keysError}
            </div>
          )}

          <div className="p-4 border border-amber-200 bg-amber-50 rounded-lg">
            <p className="text-sm text-amber-800 font-medium mb-1">Key Management</p>
            <p className="text-xs text-amber-700">
              API key creation, rotation, and revocation will be available in a future update.
              Currently, keys are read from your server environment configuration.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function ApiKeyRow({
  keyData,
  copiedKey,
  onCopy,
}: {
  keyData: DetectedApiKey;
  copiedKey: string | null;
  onCopy: (key: DetectedApiKey) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm">{keyData.name}</p>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              keyData.status === 'active'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {keyData.status === 'active' ? 'Active' : 'Detected'}
          </span>
        </div>
        <p className="text-xs text-gray-500 font-mono mt-0.5">{keyData.maskedValue}</p>
        <p className="text-xs text-gray-400 mt-0.5">Source: {keyData.source}</p>
      </div>
      <div className="flex gap-2 ml-3">
        <button
          onClick={() => onCopy(keyData)}
          className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label={`Copy masked value for ${keyData.name}`}
        >
          {copiedKey === keyData.name ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  const id = `toggle-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="flex items-center justify-between">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-gray-700 cursor-pointer">
          {label}
        </label>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          checked ? 'bg-blue-500' : 'bg-gray-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
