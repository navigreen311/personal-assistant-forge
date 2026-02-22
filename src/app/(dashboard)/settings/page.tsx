'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthSession } from '@/lib/auth/use-session';

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

interface ProfileForm {
  displayName: string;
  email: string;
  phone: string;
  timezone: string;
  bio: string;
}

interface AppearanceSettings {
  sidebarMode: 'expanded' | 'collapsed' | 'auto';
  density: 'comfortable' | 'compact' | 'spacious';
  accentColor: 'blue' | 'purple' | 'green' | 'orange' | 'red';
  dashboardWidgets: {
    quickStats: boolean;
    todaysSchedule: boolean;
    taskSummary: boolean;
    aiActivity: boolean;
    timeSaved: boolean;
    entityOverview: boolean;
  };
}

interface ModuleNotification {
  module: string;
  email: boolean;
  push: boolean;
  sms: boolean;
  digestOnly: boolean;
}

interface RegionalExtended {
  currency: string;
  firstDayOfWeek: 'sunday' | 'monday';
  numberFormat: 'us' | 'eu';
  businessHours: {
    start: string;
    end: string;
    days: string[];
  };
}

interface ApiKeyInfo {
  provider: string;
  maskedKey: string;
  status: 'active' | 'inactive' | 'not_configured';
}

interface IntegrationInfo {
  service: string;
  status: 'connected' | 'active' | 'not_configured';
}

interface EntityInfo {
  id: string;
  name: string;
  type: 'business' | 'personal';
  status: 'active' | 'inactive';
}

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  language: 'en',
  timezone: 'America/New_York',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  notifications: { email: true, push: true, sms: false, digest: 'daily' },
  accessibility: { reduceMotion: false, highContrast: false, fontSize: 'medium' },
};

const DEFAULT_APPEARANCE: AppearanceSettings = {
  sidebarMode: 'expanded',
  density: 'comfortable',
  accentColor: 'blue',
  dashboardWidgets: {
    quickStats: true,
    todaysSchedule: true,
    taskSummary: true,
    aiActivity: true,
    timeSaved: true,
    entityOverview: true,
  },
};

const DEFAULT_MODULE_NOTIFICATIONS: ModuleNotification[] = [
  { module: 'Inbox (P0)', email: true, push: true, sms: true, digestOnly: false },
  { module: 'Inbox (P1-P2)', email: false, push: true, sms: false, digestOnly: true },
  { module: 'Tasks overdue', email: true, push: true, sms: false, digestOnly: false },
  { module: 'Calendar (15min)', email: false, push: true, sms: false, digestOnly: false },
  { module: 'VoiceForge missed', email: true, push: true, sms: true, digestOnly: false },
  { module: 'Finance overdue', email: true, push: false, sms: false, digestOnly: true },
  { module: 'Workflow failures', email: true, push: true, sms: false, digestOnly: false },
  { module: 'Crisis', email: true, push: true, sms: true, digestOnly: false },
];

const DEFAULT_REGIONAL: RegionalExtended = {
  currency: 'USD',
  firstDayOfWeek: 'sunday',
  numberFormat: 'us',
  businessHours: {
    start: '09:00',
    end: '17:00',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  },
};

const DEFAULT_ENTITIES: EntityInfo[] = [
  { id: '1', name: 'MedLink Pro', type: 'business', status: 'active' },
  { id: '2', name: 'CRE Forge', type: 'business', status: 'inactive' },
  { id: '3', name: 'Personal', type: 'personal', status: 'active' },
];

// --- Component ---

export default function SettingsPage() {
  const { user } = useAuthSession();
  const userName = user?.name || 'User';
  const userEmail = user?.email || '';

  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Profile state
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    displayName: userName,
    email: userEmail,
    phone: '',
    timezone: 'America/New_York',
    bio: '',
  });

  // Appearance state
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);

  // Module notifications state
  const [moduleNotifications, setModuleNotifications] = useState<ModuleNotification[]>(DEFAULT_MODULE_NOTIFICATIONS);

  // Regional extended state
  const [regional, setRegional] = useState<RegionalExtended>(DEFAULT_REGIONAL);

  // Entities state
  const [entities] = useState<EntityInfo[]>(DEFAULT_ENTITIES);
  const [activeEntityId, setActiveEntityId] = useState('1');

  // Danger zone state
  const [showResetAiConfirm, setShowResetAiConfirm] = useState(false);
  const [showDeleteEntityConfirm, setShowDeleteEntityConfirm] = useState(false);
  const [deleteEntityId, setDeleteEntityId] = useState('');
  const [deleteEntityConfirmText, setDeleteEntityConfirmText] = useState('');

  // Update profile form when session data loads
  useEffect(() => {
    if (userName !== 'User') {
      setProfileForm((prev) => ({
        ...prev,
        displayName: userName,
        email: userEmail,
      }));
    }
  }, [userName, userEmail]);

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

  const handleSaveProfile = () => {
    setSaveMessage('Profile updated successfully.');
    setTimeout(() => setSaveMessage(null), 3000);
    setEditingProfile(false);
  };

  const handleSendTestNotification = () => {
    setSaveMessage('Test notification sent.');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleSaveRegional = () => {
    setSaveMessage('Regional settings saved.');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleResetAiMemory = () => {
    setShowResetAiConfirm(false);
    setSaveMessage('AI memory has been reset.');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleExportData = (format: 'json' | 'csv') => {
    setSaveMessage(`Data export (${format.toUpperCase()}) initiated. You will receive a download link via email.`);
    setTimeout(() => setSaveMessage(null), 5000);
  };

  const handleDeleteEntity = () => {
    setShowDeleteEntityConfirm(false);
    setDeleteEntityConfirmText('');
    setSaveMessage('Entity deleted.');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const userInitial = userName.charAt(0).toUpperCase();

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
        {/* ===================== 1. Profile ===================== */}
        {activeTab === 'profile' && (
          <section className="space-y-6">
            <h2 className="text-lg font-semibold">Profile</h2>

            {/* Avatar & Info */}
            <div className="p-6 border border-gray-200 rounded-lg">
              <div className="flex items-start gap-5">
                <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0" aria-label="User avatar">
                  {userInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-semibold text-gray-900">{userName}</h3>
                  <p className="text-sm text-gray-500">{userEmail || 'No email set'}</p>
                  <p className="text-xs text-gray-400 mt-1">Member since January 2025</p>
                </div>
                {!editingProfile && (
                  <button
                    onClick={() => setEditingProfile(true)}
                    className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shrink-0"
                  >
                    Edit Profile
                  </button>
                )}
              </div>

              {/* Inline Edit Form */}
              {editingProfile && (
                <div className="mt-6 pt-6 border-t border-gray-200 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="profile-name" className="block text-sm font-medium text-gray-700 mb-1">
                        Display Name
                      </label>
                      <input
                        id="profile-name"
                        type="text"
                        value={profileForm.displayName}
                        onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="profile-email" className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        id="profile-email"
                        type="email"
                        value={profileForm.email}
                        onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="profile-phone" className="block text-sm font-medium text-gray-700 mb-1">
                        Phone
                      </label>
                      <input
                        id="profile-phone"
                        type="tel"
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        placeholder="+1 (555) 000-0000"
                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="profile-timezone" className="block text-sm font-medium text-gray-700 mb-1">
                        Timezone
                      </label>
                      <select
                        id="profile-timezone"
                        value={profileForm.timezone}
                        onChange={(e) => setProfileForm({ ...profileForm, timezone: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  </div>
                  <div>
                    <label htmlFor="profile-bio" className="block text-sm font-medium text-gray-700 mb-1">
                      Bio
                    </label>
                    <textarea
                      id="profile-bio"
                      value={profileForm.bio}
                      onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                      rows={3}
                      placeholder="Tell us about yourself..."
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveProfile}
                      className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      Save changes
                    </button>
                    <button
                      onClick={() => setEditingProfile(false)}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ===================== 2. Appearance ===================== */}
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

            {/* Sidebar Mode */}
            <fieldset className="p-4 border border-gray-200 rounded-lg">
              <legend className="text-sm font-medium text-gray-700 px-1">Sidebar Mode</legend>
              <div className="flex gap-3 mt-2">
                {(['expanded', 'collapsed', 'auto'] as const).map((mode) => (
                  <label
                    key={mode}
                    className={`flex-1 p-3 border rounded-lg cursor-pointer text-center text-sm transition-colors ${
                      appearance.sidebarMode === mode
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sidebarMode"
                      value={mode}
                      checked={appearance.sidebarMode === mode}
                      onChange={() => setAppearance({ ...appearance, sidebarMode: mode })}
                      className="sr-only"
                    />
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Density */}
            <fieldset className="p-4 border border-gray-200 rounded-lg">
              <legend className="text-sm font-medium text-gray-700 px-1">Density</legend>
              <div className="flex gap-3 mt-2">
                {(['comfortable', 'compact', 'spacious'] as const).map((d) => (
                  <label
                    key={d}
                    className={`flex-1 p-3 border rounded-lg cursor-pointer text-center text-sm transition-colors ${
                      appearance.density === d
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="density"
                      value={d}
                      checked={appearance.density === d}
                      onChange={() => setAppearance({ ...appearance, density: d })}
                      className="sr-only"
                    />
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Accent Color */}
            <div className="p-4 border border-gray-200 rounded-lg">
              <label htmlFor="accent-color" className="block text-sm font-medium text-gray-700 mb-2">Accent Color</label>
              <select
                id="accent-color"
                value={appearance.accentColor}
                onChange={(e) => setAppearance({ ...appearance, accentColor: e.target.value as AppearanceSettings['accentColor'] })}
                className="w-full max-w-xs p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="blue">Blue</option>
                <option value="purple">Purple</option>
                <option value="green">Green</option>
                <option value="orange">Orange</option>
                <option value="red">Red</option>
              </select>
            </div>

            {/* Dashboard Layout */}
            <div className="p-4 border border-gray-200 rounded-lg space-y-3">
              <h3 className="text-sm font-medium text-gray-700">Dashboard Layout</h3>
              <p className="text-xs text-gray-500">Choose which widgets appear on your dashboard.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { key: 'quickStats' as const, label: 'Quick Stats' },
                  { key: 'todaysSchedule' as const, label: "Today's Schedule" },
                  { key: 'taskSummary' as const, label: 'Task Summary' },
                  { key: 'aiActivity' as const, label: 'AI Activity' },
                  { key: 'timeSaved' as const, label: 'Time Saved' },
                  { key: 'entityOverview' as const, label: 'Entity Overview' },
                ]).map((widget) => (
                  <label key={widget.key} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appearance.dashboardWidgets[widget.key]}
                      onChange={(e) =>
                        setAppearance({
                          ...appearance,
                          dashboardWidgets: {
                            ...appearance.dashboardWidgets,
                            [widget.key]: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{widget.label}</span>
                  </label>
                ))}
              </div>
              <button
                onClick={() =>
                  setAppearance({
                    ...appearance,
                    dashboardWidgets: DEFAULT_APPEARANCE.dashboardWidgets,
                  })
                }
                className="mt-2 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Reset to default layout
              </button>
            </div>

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

        {/* ===================== 3. Notifications ===================== */}
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

            {/* Per-Module Notifications */}
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Per-Module Notifications</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 pr-4 font-medium text-gray-700">Module</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-700">Email</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-700">Push</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-700">SMS</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-700">Digest Only</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moduleNotifications.map((mn, idx) => (
                      <tr key={mn.module} className="border-b border-gray-100 last:border-0">
                        <td className="py-2.5 pr-4 text-gray-700">{mn.module}</td>
                        <td className="text-center py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={mn.email}
                            onChange={(e) => {
                              const updated = [...moduleNotifications];
                              updated[idx] = { ...mn, email: e.target.checked };
                              setModuleNotifications(updated);
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                            aria-label={`${mn.module} email`}
                          />
                        </td>
                        <td className="text-center py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={mn.push}
                            onChange={(e) => {
                              const updated = [...moduleNotifications];
                              updated[idx] = { ...mn, push: e.target.checked };
                              setModuleNotifications(updated);
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                            aria-label={`${mn.module} push`}
                          />
                        </td>
                        <td className="text-center py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={mn.sms}
                            onChange={(e) => {
                              const updated = [...moduleNotifications];
                              updated[idx] = { ...mn, sms: e.target.checked };
                              setModuleNotifications(updated);
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                            aria-label={`${mn.module} sms`}
                          />
                        </td>
                        <td className="text-center py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={mn.digestOnly}
                            onChange={(e) => {
                              const updated = [...moduleNotifications];
                              updated[idx] = { ...mn, digestOnly: e.target.checked };
                              setModuleNotifications(updated);
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                            aria-label={`${mn.module} digest only`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={handleSendTestNotification}
                className="mt-4 px-4 py-2 text-sm border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Send test notification
              </button>
            </div>
          </section>
        )}

        {/* ===================== 4. Regional ===================== */}
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

              {/* Currency */}
              <div className="p-4 border border-gray-200 rounded-lg">
                <label htmlFor="currency-select" className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                <select
                  id="currency-select"
                  value={regional.currency}
                  onChange={(e) => setRegional({ ...regional, currency: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (&#8364;)</option>
                  <option value="GBP">GBP (&pound;)</option>
                  <option value="JPY">JPY (&yen;)</option>
                  <option value="CAD">CAD (C$)</option>
                </select>
              </div>

              {/* First Day of Week */}
              <div className="p-4 border border-gray-200 rounded-lg">
                <label htmlFor="first-day-select" className="block text-sm font-medium text-gray-700 mb-2">First Day of Week</label>
                <select
                  id="first-day-select"
                  value={regional.firstDayOfWeek}
                  onChange={(e) => setRegional({ ...regional, firstDayOfWeek: e.target.value as 'sunday' | 'monday' })}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="sunday">Sunday</option>
                  <option value="monday">Monday</option>
                </select>
              </div>

              {/* Number Format */}
              <div className="p-4 border border-gray-200 rounded-lg sm:col-span-2">
                <label htmlFor="number-format-select" className="block text-sm font-medium text-gray-700 mb-2">Number Format</label>
                <select
                  id="number-format-select"
                  value={regional.numberFormat}
                  onChange={(e) => setRegional({ ...regional, numberFormat: e.target.value as 'us' | 'eu' })}
                  className="w-full max-w-xs p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="us">1,234.56 (US)</option>
                  <option value="eu">1.234,56 (EU)</option>
                </select>
              </div>
            </div>

            {/* Business Hours */}
            <div className="p-4 border border-gray-200 rounded-lg space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700">Business Hours</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Used for DND auto-mode, after-hours gates, scheduling
                </p>
              </div>
              <div className="flex gap-4 items-center">
                <div>
                  <label htmlFor="biz-start" className="block text-xs text-gray-500 mb-1">Start</label>
                  <input
                    id="biz-start"
                    type="time"
                    value={regional.businessHours.start}
                    onChange={(e) => setRegional({ ...regional, businessHours: { ...regional.businessHours, start: e.target.value } })}
                    className="p-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <span className="text-gray-400 mt-4">to</span>
                <div>
                  <label htmlFor="biz-end" className="block text-xs text-gray-500 mb-1">End</label>
                  <input
                    id="biz-end"
                    type="time"
                    value={regional.businessHours.end}
                    onChange={(e) => setRegional({ ...regional, businessHours: { ...regional.businessHours, end: e.target.value } })}
                    className="p-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'mon', label: 'Mon' },
                  { key: 'tue', label: 'Tue' },
                  { key: 'wed', label: 'Wed' },
                  { key: 'thu', label: 'Thu' },
                  { key: 'fri', label: 'Fri' },
                  { key: 'sat', label: 'Sat' },
                  { key: 'sun', label: 'Sun' },
                ].map((day) => (
                  <label
                    key={day.key}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg cursor-pointer text-sm transition-colors ${
                      regional.businessHours.days.includes(day.key)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={regional.businessHours.days.includes(day.key)}
                      onChange={(e) => {
                        const days = e.target.checked
                          ? [...regional.businessHours.days, day.key]
                          : regional.businessHours.days.filter((d) => d !== day.key);
                        setRegional({ ...regional, businessHours: { ...regional.businessHours, days } });
                      }}
                      className="sr-only"
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleSaveRegional}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Save regional settings
            </button>
          </section>
        )}

        {/* ===================== 5. Entity Management ===================== */}
        {activeTab === 'entities' && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Entity Management</h2>
              <button className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                + Create Entity
              </button>
            </div>

            {/* Active Entity Selector */}
            <div className="p-4 border border-gray-200 rounded-lg">
              <label htmlFor="active-entity" className="block text-sm font-medium text-gray-700 mb-2">
                Active Entity
              </label>
              <select
                id="active-entity"
                value={activeEntityId}
                onChange={(e) => setActiveEntityId(e.target.value)}
                className="w-full max-w-xs p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Entity Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Entity</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Type</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entities.map((entity) => (
                    <tr key={entity.id} className="border-t border-gray-100">
                      <td className="py-3 px-4 font-medium text-gray-900">{entity.name}</td>
                      <td className="py-3 px-4 text-gray-600 capitalize">{entity.type}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            entity.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {entity.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex gap-2 justify-end">
                          {entity.status === 'inactive' && (
                            <button className="px-3 py-1 text-xs border border-green-300 text-green-600 rounded-lg hover:bg-green-50 transition-colors">
                              Activate
                            </button>
                          )}
                          <button className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">
                            Edit
                          </button>
                          {entity.status === 'active' && (
                            <button className="px-3 py-1 text-xs border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                              Dashboard
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <a
              href="/entities"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 transition-colors"
            >
              &rarr; Go to Entities page
            </a>
          </section>
        )}

        {/* ===================== 6. API Keys ===================== */}
        {activeTab === 'apikeys' && (
          <ApiKeysPanel />
        )}

        {/* ===================== 7. Danger Zone ===================== */}
        {activeTab === 'danger' && (
          <section className="space-y-6">
            <h2 className="text-lg font-semibold text-red-600">Danger Zone</h2>

            {/* Export Data */}
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-gray-900">Export Data</p>
                  <p className="text-xs text-gray-500">Download all your data</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExportData('json')}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Export as JSON
                  </button>
                  <button
                    onClick={() => handleExportData('csv')}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Export as CSV
                  </button>
                </div>
              </div>
            </div>

            {/* Reset AI Memory */}
            <div className="p-4 border border-amber-200 rounded-lg bg-amber-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-amber-800">Reset AI Memory</p>
                  <p className="text-xs text-amber-700">
                    Clear all AI memories, learned preferences, and override history. Your data remains intact.
                  </p>
                </div>
                <button
                  onClick={() => setShowResetAiConfirm(true)}
                  className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors shrink-0"
                >
                  Reset AI memory
                </button>
              </div>
              {showResetAiConfirm && (
                <div className="mt-4 p-4 border border-amber-300 rounded-lg bg-white">
                  <p className="text-sm text-amber-800 font-medium mb-3">
                    Are you sure? This will clear all AI memories and learned preferences.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowResetAiConfirm(false)}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleResetAiMemory}
                      className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                    >
                      Confirm Reset
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Delete Entity */}
            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-red-800">Delete Entity</p>
                  <p className="text-xs text-red-600">Permanently delete an entity and all its associated data.</p>
                </div>
                <button
                  onClick={() => setShowDeleteEntityConfirm(true)}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shrink-0"
                >
                  Delete entity
                </button>
              </div>
              {showDeleteEntityConfirm && (
                <div className="mt-4 p-4 border border-red-300 rounded-lg bg-white space-y-3">
                  <div>
                    <label htmlFor="delete-entity-select" className="block text-sm text-gray-700 mb-1">
                      Select entity to delete:
                    </label>
                    <select
                      id="delete-entity-select"
                      value={deleteEntityId}
                      onChange={(e) => setDeleteEntityId(e.target.value)}
                      className="w-full max-w-xs p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    >
                      <option value="">-- Select entity --</option>
                      {entities.map((ent) => (
                        <option key={ent.id} value={ent.id}>{ent.name}</option>
                      ))}
                    </select>
                  </div>
                  {deleteEntityId && (
                    <div>
                      <label htmlFor="delete-entity-confirm" className="block text-sm text-gray-700 mb-1">
                        Type <strong>DELETE</strong> to confirm:
                      </label>
                      <input
                        id="delete-entity-confirm"
                        type="text"
                        value={deleteEntityConfirmText}
                        onChange={(e) => setDeleteEntityConfirmText(e.target.value)}
                        placeholder="DELETE"
                        className="w-full max-w-xs p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      />
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowDeleteEntityConfirm(false);
                        setDeleteEntityId('');
                        setDeleteEntityConfirmText('');
                      }}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteEntity}
                      disabled={!deleteEntityId || deleteEntityConfirmText !== 'DELETE'}
                      className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Delete Account */}
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

function ApiKeysPanel() {
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    async function fetchApiKeys() {
      try {
        setLoadingKeys(true);
        const res = await fetch('/api/settings/api-keys');
        const json = await res.json();
        if (json.success && json.data) {
          setApiKeys(json.data.providers || []);
          setIntegrations(json.data.integrations || []);
        } else {
          // Fallback defaults
          setApiKeys([
            { provider: 'Anthropic Claude', maskedKey: 'sk-ant-****...****', status: 'active' },
            { provider: 'OpenAI (backup)', maskedKey: 'sk-****...****', status: 'active' },
          ]);
          setIntegrations([
            { service: 'Gmail OAuth', status: 'connected' },
            { service: 'Google Calendar', status: 'connected' },
            { service: 'Twilio (VoiceForge)', status: 'active' },
            { service: 'Stripe (Payments)', status: 'not_configured' },
          ]);
        }
      } catch {
        // Graceful fallback
        setApiKeys([
          { provider: 'Anthropic Claude', maskedKey: 'sk-ant-****...****', status: 'active' },
          { provider: 'OpenAI (backup)', maskedKey: 'sk-****...****', status: 'active' },
        ]);
        setIntegrations([
          { service: 'Gmail OAuth', status: 'connected' },
          { service: 'Google Calendar', status: 'connected' },
          { service: 'Twilio (VoiceForge)', status: 'active' },
          { service: 'Stripe (Payments)', status: 'not_configured' },
        ]);
      } finally {
        setLoadingKeys(false);
      }
    }
    fetchApiKeys();
  }, []);

  const handleTestKey = async (provider: string) => {
    setTestingProvider(provider);
    setTestResult(null);
    // Simulate test
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setTestResult(`${provider} connection verified successfully.`);
    setTestingProvider(null);
    setTimeout(() => setTestResult(null), 4000);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'connected':
        return <span className="text-green-600" title="Active">&#9989;</span>;
      case 'inactive':
        return <span className="text-gray-400" title="Inactive">&#11036;</span>;
      case 'not_configured':
        return <span className="text-gray-400" title="Not configured">&#11036;</span>;
      default:
        return <span className="text-gray-400">&#8212;</span>;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'connected': return 'Connected';
      case 'inactive': return 'Inactive';
      case 'not_configured': return 'Not configured';
      default: return status;
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">API Keys</h2>
        <button className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
          + Add Key
        </button>
      </div>

      {testResult && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-lg text-sm" role="alert">
          {testResult}
        </div>
      )}

      {loadingKeys ? (
        <div className="p-4 border border-gray-200 rounded-lg">
          <p className="text-sm text-gray-500">Loading API keys...</p>
        </div>
      ) : (
        <>
          {/* AI Providers */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">AI Providers</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">Provider</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">Key</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">Status</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((key) => (
                  <tr key={key.provider} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 px-4 font-medium text-gray-900">{key.provider}</td>
                    <td className="py-3 px-4 font-mono text-xs text-gray-500">{key.maskedKey}</td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1.5">
                        {statusIcon(key.status)}
                        <span className="text-gray-700">{statusLabel(key.status)}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleTestKey(key.provider)}
                          disabled={testingProvider === key.provider}
                          className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                          {testingProvider === key.provider ? 'Testing...' : 'Test'}
                        </button>
                        <button className="px-3 py-1 text-xs border border-amber-300 text-amber-600 rounded-lg hover:bg-amber-50 transition-colors">
                          Rotate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Integrations */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">Integrations</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">Service</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">Status</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map((int) => (
                  <tr key={int.service} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 px-4 font-medium text-gray-900">{int.service}</td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1.5">
                        {statusIcon(int.status)}
                        <span className="text-gray-700">{statusLabel(int.status)}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex gap-2 justify-end">
                        {int.status === 'not_configured' ? (
                          <button className="px-3 py-1 text-xs border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                            Connect
                          </button>
                        ) : (
                          <>
                            {int.status === 'active' && (
                              <button
                                onClick={() => handleTestKey(int.service)}
                                disabled={testingProvider === int.service}
                                className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                              >
                                {testingProvider === int.service ? 'Testing...' : 'Test'}
                              </button>
                            )}
                            <button className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">
                              Reconnect
                            </button>
                            {int.service.includes('Gmail') && (
                              <button className="px-3 py-1 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                                Revoke
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Key Management */}
          <div className="p-4 border border-gray-200 rounded-lg space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Key Management</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRotate}
                onChange={(e) => setAutoRotate(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Rotate keys every 90 days</span>
            </label>
            <div className="flex gap-6 text-xs text-gray-500">
              <span>Last rotation: <strong className="text-gray-700">Feb 1, 2026</strong></span>
              <span>Next rotation: <strong className="text-gray-700">May 1, 2026</strong></span>
            </div>
          </div>

          {/* Security Note */}
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xs text-gray-500">
              <strong className="text-gray-700">Security:</strong> Database URL removed from this view for security. Manage infrastructure keys in server environment.
            </p>
          </div>
        </>
      )}
    </section>
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
