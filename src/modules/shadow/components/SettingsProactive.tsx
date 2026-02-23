'use client';

import { useState, useEffect } from 'react';

export interface ProactiveSettings {
  briefingEnabled: boolean;
  briefingTime: string;
  briefingChannel: string;
  briefingContent: string[];
  endOfDayEnabled: boolean;
  endOfDayTime: string;
  endOfDayChannel: string;
  callTriggers: Array<{
    name: string;
    label: string;
    locked?: boolean;
    lockedValue?: string;
    value: string;
  }>;
  callWindowStart: string;
  callWindowEnd: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  cooldownMinutes: number;
  maxCallsPerDay: number;
  maxCallsPerHour: number;
  vipContacts: string[];
  digestEnabled: boolean;
  digestTime: string;
}

const BRIEFING_CONTENT_OPTIONS = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'finance', label: 'Finance' },
  { id: 'energy', label: 'Energy' },
  { id: 'recommendations', label: 'Recommendations' },
];

const DEFAULT_CALL_TRIGGERS = [
  { name: 'p0_urgent', label: 'P0 Urgent Task', locked: true, lockedValue: 'call', value: 'call' },
  { name: 'crisis', label: 'Crisis Declaration', locked: true, lockedValue: 'call', value: 'call' },
  { name: 'workflow_blocked', label: 'Workflow Blocked', locked: false, value: 'push' },
  { name: 'overdue_task', label: 'Overdue Task', locked: false, value: 'push' },
  { name: 'vip_email', label: 'VIP Email', locked: false, value: 'push' },
];

const DEFAULT_PROACTIVE: ProactiveSettings = {
  briefingEnabled: true,
  briefingTime: '08:00',
  briefingChannel: 'in_app',
  briefingContent: ['calendar', 'inbox', 'tasks'],
  endOfDayEnabled: false,
  endOfDayTime: '17:00',
  endOfDayChannel: 'in_app',
  callTriggers: DEFAULT_CALL_TRIGGERS,
  callWindowStart: '09:00',
  callWindowEnd: '18:00',
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  cooldownMinutes: 60,
  maxCallsPerDay: 5,
  maxCallsPerHour: 2,
  vipContacts: [],
  digestEnabled: false,
  digestTime: '18:00',
};

interface SettingsProactiveProps {
  initialData?: Partial<ProactiveSettings>;
  onSave: (data: ProactiveSettings) => Promise<void>;
}

export default function SettingsProactive({ initialData, onSave }: SettingsProactiveProps) {
  const [settings, setSettings] = useState<ProactiveSettings>({
    ...DEFAULT_PROACTIVE,
    ...initialData,
  });
  const [newVipContact, setNewVipContact] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (initialData) {
      setSettings((prev) => ({
        ...prev,
        ...initialData,
        callTriggers: initialData.callTriggers?.length
          ? initialData.callTriggers
          : prev.callTriggers,
      }));
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

  const handleContentToggle = (contentId: string) => {
    setSettings((prev) => ({
      ...prev,
      briefingContent: prev.briefingContent.includes(contentId)
        ? prev.briefingContent.filter((c) => c !== contentId)
        : [...prev.briefingContent, contentId],
    }));
  };

  const handleTriggerChange = (index: number, value: string) => {
    setSettings((prev) => ({
      ...prev,
      callTriggers: prev.callTriggers.map((t, i) =>
        i === index ? { ...t, value } : t
      ),
    }));
  };

  const handleAddVipContact = () => {
    const trimmed = newVipContact.trim();
    if (trimmed && !settings.vipContacts.includes(trimmed)) {
      setSettings({
        ...settings,
        vipContacts: [...settings.vipContacts, trimmed],
      });
      setNewVipContact('');
    }
  };

  const handleRemoveVipContact = (index: number) => {
    setSettings({
      ...settings,
      vipContacts: settings.vipContacts.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-6">
      {/* Morning Briefing */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Morning Briefing</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Enabled</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Receive a daily morning briefing from Shadow.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.briefingEnabled}
                onChange={(e) => setSettings({ ...settings, briefingEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>

          {settings.briefingEnabled && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time</label>
                  <input
                    type="time"
                    value={settings.briefingTime}
                    onChange={(e) => setSettings({ ...settings, briefingTime: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Channel</label>
                  <select
                    value={settings.briefingChannel}
                    onChange={(e) => setSettings({ ...settings, briefingChannel: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="in_app">In-App</option>
                    <option value="phone_call">Phone Call</option>
                    <option value="push">Push Notification</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Content</label>
                <div className="flex flex-wrap gap-2">
                  {BRIEFING_CONTENT_OPTIONS.map((opt) => (
                    <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.briefingContent.includes(opt.id)}
                        onChange={() => handleContentToggle(opt.id)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* End-of-Day Summary */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">End-of-Day Summary</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Enabled</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Receive a daily end-of-day summary from Shadow.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.endOfDayEnabled}
                onChange={(e) => setSettings({ ...settings, endOfDayEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>

          {settings.endOfDayEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time</label>
                <input
                  type="time"
                  value={settings.endOfDayTime}
                  onChange={(e) => setSettings({ ...settings, endOfDayTime: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Channel</label>
                <select
                  value={settings.endOfDayChannel}
                  onChange={(e) => setSettings({ ...settings, endOfDayChannel: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="in_app">In-App</option>
                  <option value="phone_call">Phone Call</option>
                  <option value="push">Push Notification</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Proactive Call Triggers */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Proactive Call Triggers</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Configure when Shadow should proactively reach out to you.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="pb-2 font-medium text-gray-500 dark:text-gray-400">Trigger</th>
                <th className="pb-2 font-medium text-gray-500 dark:text-gray-400">Default</th>
                <th className="pb-2 font-medium text-gray-500 dark:text-gray-400">Your Setting</th>
              </tr>
            </thead>
            <tbody>
              {settings.callTriggers.map((trigger, index) => (
                <tr key={trigger.name} className="border-b border-gray-100 dark:border-gray-700/50">
                  <td className="py-3 text-gray-900 dark:text-white">{trigger.label}</td>
                  <td className="py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      trigger.locked
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {trigger.locked ? 'Call (locked)' : 'Push'}
                    </span>
                  </td>
                  <td className="py-3">
                    {trigger.locked ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                        Call (locked)
                      </span>
                    ) : (
                      <select
                        value={trigger.value}
                        onChange={(e) => handleTriggerChange(index, e.target.value)}
                        className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        <option value="call">Call</option>
                        <option value="push">Push</option>
                        <option value="sms">SMS</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Time Windows */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Time Windows</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Call Window Start</label>
              <input
                type="time"
                value={settings.callWindowStart}
                onChange={(e) => setSettings({ ...settings, callWindowStart: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Call Window End</label>
              <input
                type="time"
                value={settings.callWindowEnd}
                onChange={(e) => setSettings({ ...settings, callWindowEnd: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quiet Hours Start</label>
              <input
                type="time"
                value={settings.quietHoursStart}
                onChange={(e) => setSettings({ ...settings, quietHoursStart: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quiet Hours End</label>
              <input
                type="time"
                value={settings.quietHoursEnd}
                onChange={(e) => setSettings({ ...settings, quietHoursEnd: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Anti-Spam */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Anti-Spam Controls</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Min Time Between Calls (min)
            </label>
            <input
              type="number"
              min={1}
              value={settings.cooldownMinutes}
              onChange={(e) => setSettings({ ...settings, cooldownMinutes: Math.max(1, Number(e.target.value)) })}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Max Calls / Day
            </label>
            <input
              type="number"
              min={1}
              value={settings.maxCallsPerDay}
              onChange={(e) => setSettings({ ...settings, maxCallsPerDay: Math.max(1, Number(e.target.value)) })}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Max Calls / Hour
            </label>
            <input
              type="number"
              min={1}
              value={settings.maxCallsPerHour}
              onChange={(e) => setSettings({ ...settings, maxCallsPerHour: Math.max(1, Number(e.target.value)) })}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* VIP Contacts */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">VIP Contacts</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Contacts that always break through quiet hours and trigger immediate notifications.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {settings.vipContacts.map((contact, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-full text-sm"
            >
              {contact}
              <button
                onClick={() => handleRemoveVipContact(index)}
                className="ml-0.5 text-blue-400 hover:text-red-500 dark:hover:text-red-400"
                aria-label={`Remove ${contact}`}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 max-w-sm">
          <input
            type="text"
            value={newVipContact}
            onChange={(e) => setNewVipContact(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddVipContact()}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Contact name or email"
          />
          <button
            onClick={handleAddVipContact}
            disabled={!newVipContact.trim()}
            className="px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Digest Call */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Digest Call</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Enabled</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Shadow calls you with a digest of pending items.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.digestEnabled}
                onChange={(e) => setSettings({ ...settings, digestEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
          </div>
          {settings.digestEnabled && (
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Digest Time</label>
              <input
                type="time"
                value={settings.digestTime}
                onChange={(e) => setSettings({ ...settings, digestTime: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {saving ? 'Saving...' : 'Save Proactive Settings'}
        </button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400">Settings saved successfully</span>
        )}
      </div>
    </div>
  );
}
