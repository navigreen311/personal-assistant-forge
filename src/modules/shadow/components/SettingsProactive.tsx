'use client';

import { useState, useEffect } from 'react';
import VIPContactSearch from './VIPContactSearch';
import EscalationProtocol from './EscalationProtocol';
import AdaptiveChannelNotice from './AdaptiveChannelNotice';

export interface ProactiveSettings {
  briefingEnabled: boolean;
  briefingTime: string;
  briefingChannel: string;
  briefingContent: string[];
  briefingEntityScope: string;
  briefingLength: string;
  endOfDayEnabled: boolean;
  endOfDayTime: string;
  endOfDayChannel: string;
  endOfDayContent: string[];
  callTriggers: Array<{
    name: string;
    label: string;
    locked?: boolean;
    lockedValue?: string;
    value: string;
    talkThrough: boolean;
  }>;
  callWindowStart: string;
  callWindowEnd: string;
  activeDays: string[];
  quietHoursStart: string;
  quietHoursEnd: string;
  emergencyOverride: boolean;
  cooldownMinutes: number;
  maxCallsPerDay: number;
  maxCallsPerHour: number;
  vipContacts: string[];
  vipKeywords: string[];
  digestEnabled: boolean;
  digestTime: string;
  digestMinItems: number;
  escalationAttempts: number;
  escalationWaitMinutes: number;
  escalationFinalFallback: string;
  phoneTreeContacts: string[];
}

const BRIEFING_CONTENT_OPTIONS = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'finance', label: 'Finance' },
  { id: 'energy', label: 'Energy' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'delegations', label: 'Delegations' },
  { id: 'workflows', label: 'Workflows' },
];

const EOD_CONTENT_OPTIONS = [
  { id: 'day_recap', label: 'Day recap (meetings attended, tasks completed)', defaultChecked: true },
  { id: 'unfinished', label: 'Unfinished items (carried to tomorrow)', defaultChecked: true },
  { id: 'delegated', label: 'Delegated task updates', defaultChecked: true },
  { id: 'financial', label: 'Financial summary', defaultChecked: false },
  { id: 'time_saved', label: 'Time saved today', defaultChecked: false },
  { id: 'coaching', label: 'Coaching tip for tomorrow', defaultChecked: false },
];

const DEFAULT_CALL_TRIGGERS = [
  { name: 'p0_urgent', label: 'P0 Urgent Task', locked: true, lockedValue: 'call', value: 'call', talkThrough: false },
  { name: 'crisis', label: 'Crisis Declaration', locked: true, lockedValue: 'call', value: 'call', talkThrough: false },
  { name: 'workflow_blocked', label: 'Workflow Blocked', locked: false, value: 'push', talkThrough: false },
  { name: 'overdue_task', label: 'Overdue Task', locked: false, value: 'push', talkThrough: false },
  { name: 'vip_email', label: 'VIP Email', locked: false, value: 'push', talkThrough: false },
  { name: 'morning_briefing', label: 'Morning Briefing', locked: false, value: 'in_app', talkThrough: false },
  { name: 'eod_summary', label: 'End-of-Day Summary', locked: false, value: 'disabled', talkThrough: false },
  { name: 'delegation_overdue', label: 'Delegation Overdue', locked: false, value: 'push', talkThrough: false },
  { name: 'finance_alert', label: 'Finance Alert', locked: false, value: 'push', talkThrough: false },
  { name: 'security_alert', label: 'Security Alert', locked: false, value: 'call', talkThrough: false },
];

const DEFAULT_EOD_CONTENT = EOD_CONTENT_OPTIONS
  .filter((opt) => opt.defaultChecked)
  .map((opt) => opt.id);

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_ACTIVE_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const DEFAULT_PROACTIVE: ProactiveSettings = {
  briefingEnabled: true,
  briefingTime: '08:00',
  briefingChannel: 'in_app',
  briefingContent: ['calendar', 'inbox', 'tasks'],
  briefingEntityScope: 'all',
  briefingLength: 'standard',
  endOfDayEnabled: false,
  endOfDayTime: '17:00',
  endOfDayChannel: 'in_app',
  endOfDayContent: DEFAULT_EOD_CONTENT,
  callTriggers: DEFAULT_CALL_TRIGGERS,
  callWindowStart: '09:00',
  callWindowEnd: '18:00',
  activeDays: DEFAULT_ACTIVE_DAYS,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  emergencyOverride: true,
  cooldownMinutes: 60,
  maxCallsPerDay: 5,
  maxCallsPerHour: 2,
  vipContacts: [],
  vipKeywords: [],
  digestEnabled: false,
  digestTime: '18:00',
  digestMinItems: 3,
  escalationAttempts: 3,
  escalationWaitMinutes: 15,
  escalationFinalFallback: 'sms',
  phoneTreeContacts: [],
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

  const handleEodContentToggle = (contentId: string) => {
    setSettings((prev) => ({
      ...prev,
      endOfDayContent: prev.endOfDayContent.includes(contentId)
        ? prev.endOfDayContent.filter((c) => c !== contentId)
        : [...prev.endOfDayContent, contentId],
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

  const handleTriggerTalkThroughToggle = (index: number) => {
    setSettings((prev) => ({
      ...prev,
      callTriggers: prev.callTriggers.map((t, i) =>
        i === index ? { ...t, talkThrough: !t.talkThrough } : t
      ),
    }));
  };

  const handleActiveDayToggle = (day: string) => {
    setSettings((prev) => ({
      ...prev,
      activeDays: prev.activeDays.includes(day)
        ? prev.activeDays.filter((d) => d !== day)
        : [...prev.activeDays, day],
    }));
  };

  const handleAddVipContact = (contact: string) => {
    if (!settings.vipContacts.includes(contact)) {
      setSettings({
        ...settings,
        vipContacts: [...settings.vipContacts, contact],
      });
    }
  };

  const handleRemoveVipContact = (index: number) => {
    setSettings({
      ...settings,
      vipContacts: settings.vipContacts.filter((_, i) => i !== index),
    });
  };

  const handleAddVipKeyword = (keyword: string) => {
    if (!settings.vipKeywords.includes(keyword)) {
      setSettings({
        ...settings,
        vipKeywords: [...settings.vipKeywords, keyword],
      });
    }
  };

  const handleRemoveVipKeyword = (index: number) => {
    setSettings({
      ...settings,
      vipKeywords: settings.vipKeywords.filter((_, i) => i !== index),
    });
  };

  const handleAddPhoneTreeContact = (contact: string) => {
    if (!settings.phoneTreeContacts.includes(contact)) {
      setSettings({
        ...settings,
        phoneTreeContacts: [...settings.phoneTreeContacts, contact],
      });
    }
  };

  const handleRemovePhoneTreeContact = (index: number) => {
    setSettings({
      ...settings,
      phoneTreeContacts: settings.phoneTreeContacts.filter((_, i) => i !== index),
    });
  };

  const handleEscalationChange = (updates: Record<string, unknown>) => {
    const mapped: Partial<ProactiveSettings> = {};
    if ('attempts' in updates) mapped.escalationAttempts = updates.attempts as number;
    if ('waitMinutes' in updates) mapped.escalationWaitMinutes = updates.waitMinutes as number;
    if ('finalFallback' in updates) mapped.escalationFinalFallback = updates.finalFallback as string;
    setSettings((prev) => ({ ...prev, ...mapped }));
  };

  const handleResetAdaptiveLearning = () => {
    // Placeholder: would call API to reset adaptive learning data
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

              {/* Entity Summary */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Include entity summary:
                </label>
                <select
                  value={settings.briefingEntityScope}
                  onChange={(e) => setSettings({ ...settings, briefingEntityScope: e.target.value })}
                  className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="all">All entities</option>
                  <option value="active">Active entity only</option>
                  <option value="select">Select...</option>
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Choose which entities to include in the briefing.
                </p>
              </div>

              {/* Briefing Length */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Briefing length:
                </label>
                <select
                  value={settings.briefingLength}
                  onChange={(e) => setSettings({ ...settings, briefingLength: e.target.value })}
                  className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="standard">Standard</option>
                  <option value="brief">Brief (2 min)</option>
                  <option value="detailed">Detailed (5 min)</option>
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Controls how much detail Shadow covers in the briefing.
                </p>
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
            <>
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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Content</label>
                <div className="space-y-2">
                  {EOD_CONTENT_OPTIONS.map((opt) => (
                    <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.endOfDayContent.includes(opt.id)}
                        onChange={() => handleEodContentToggle(opt.id)}
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
                <th className="pb-2 font-medium text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    Talk Through
                    <span className="relative group">
                      <svg className="w-3.5 h-3.5 text-gray-400 cursor-help" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 text-xs text-white bg-gray-900 dark:bg-gray-600 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                        When enabled, notifications for this trigger include a &quot;Talk me through this&quot; button.
                      </span>
                    </span>
                  </span>
                </th>
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
                      {trigger.locked ? 'Call (locked)' : trigger.value === 'call' ? 'Call' : trigger.value === 'push' ? 'Push' : trigger.value === 'in_app' ? 'In-App' : trigger.value === 'sms' ? 'SMS' : 'Disabled'}
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
                        <option value="in_app">In-App</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    )}
                  </td>
                  <td className="py-3 text-center">
                    {trigger.locked ? (
                      <span className="text-xs text-gray-400">--</span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={trigger.talkThrough}
                        onChange={() => handleTriggerTalkThroughToggle(index)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600"
                      />
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
          {/* Call Window */}
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

          {/* Active Days */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Active Days</label>
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS.map((day) => (
                <label key={day} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.activeDays.includes(day)}
                    onChange={() => handleActiveDayToggle(day)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{day}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Shadow will only make proactive calls on these days.
            </p>
          </div>

          {/* Quiet Hours */}
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

          {/* Emergency Override */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Emergency Override</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                P0 + Crisis notifications can bypass quiet hours and active days.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.emergencyOverride}
                onChange={(e) => setSettings({ ...settings, emergencyOverride: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
            </label>
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
        <VIPContactSearch
          contacts={settings.vipContacts}
          keywords={settings.vipKeywords}
          onAddContact={handleAddVipContact}
          onRemoveContact={handleRemoveVipContact}
          onAddKeyword={handleAddVipKeyword}
          onRemoveKeyword={handleRemoveVipKeyword}
        />
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
            <>
              <div className="max-w-xs">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Digest Time</label>
                <input
                  type="time"
                  value={settings.digestTime}
                  onChange={(e) => setSettings({ ...settings, digestTime: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div className="max-w-xs">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Min Items to Trigger:
                </label>
                <input
                  type="number"
                  min={1}
                  value={settings.digestMinItems}
                  onChange={(e) => setSettings({ ...settings, digestMinItems: Math.max(1, Number(e.target.value)) })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  When enabled, Shadow batches non-urgent items and calls once at the scheduled time instead of multiple separate notifications. Items with deadlines &lt; 4 hours or P0 priority are excluded.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Escalation Protocol */}
      <EscalationProtocol
        attempts={settings.escalationAttempts}
        waitMinutes={settings.escalationWaitMinutes}
        finalFallback={settings.escalationFinalFallback}
        phoneTreeContacts={settings.phoneTreeContacts}
        onChange={handleEscalationChange}
        onAddPhoneTreeContact={handleAddPhoneTreeContact}
        onRemovePhoneTreeContact={handleRemovePhoneTreeContact}
      />

      {/* Adaptive Channel Notice */}
      <AdaptiveChannelNotice onReset={handleResetAdaptiveLearning} />

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
