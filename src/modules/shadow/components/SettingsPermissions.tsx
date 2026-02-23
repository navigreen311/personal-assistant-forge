'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export type AutonomyLevel = 'conservative' | 'balanced' | 'full';
export type PermissionLevel = 'NONE' | 'TAP' | 'CONFIRM' | 'PIN';
export type OverrideLevel = 'default' | 'ask_every_time' | 'confirm' | 'full_autonomy';

export interface ActionPermission {
  action: string;
  label: string;
  defaultLevel: PermissionLevel;
  override: OverrideLevel;
}

export interface PermissionsSettings {
  autonomyLevel: AutonomyLevel;
  actions: ActionPermission[];
}

const DEFAULT_ACTIONS: ActionPermission[] = [
  { action: 'navigate', label: 'Navigate', defaultLevel: 'NONE', override: 'default' },
  { action: 'read_data', label: 'Read Data', defaultLevel: 'NONE', override: 'default' },
  { action: 'create_task', label: 'Create Task', defaultLevel: 'TAP', override: 'default' },
  { action: 'draft_email', label: 'Draft Email', defaultLevel: 'TAP', override: 'default' },
  { action: 'send_email', label: 'Send Email', defaultLevel: 'CONFIRM', override: 'default' },
  { action: 'modify_calendar', label: 'Modify Calendar', defaultLevel: 'TAP', override: 'default' },
  { action: 'complete_task', label: 'Complete Task', defaultLevel: 'TAP', override: 'default' },
  { action: 'create_invoice', label: 'Create Invoice', defaultLevel: 'CONFIRM', override: 'default' },
  { action: 'send_invoice', label: 'Send Invoice', defaultLevel: 'PIN', override: 'default' },
  { action: 'trigger_workflow', label: 'Trigger Workflow', defaultLevel: 'CONFIRM', override: 'default' },
  { action: 'place_call', label: 'Place Call', defaultLevel: 'CONFIRM', override: 'default' },
  { action: 'bulk_email', label: 'Bulk Email', defaultLevel: 'PIN', override: 'default' },
  { action: 'declare_crisis', label: 'Declare Crisis', defaultLevel: 'PIN', override: 'default' },
  { action: 'make_payment', label: 'Make Payment', defaultLevel: 'PIN', override: 'default' },
  { action: 'delete_data', label: 'Delete Data', defaultLevel: 'PIN', override: 'default' },
];

const DEFAULT_PERMISSIONS: PermissionsSettings = {
  autonomyLevel: 'balanced',
  actions: DEFAULT_ACTIONS,
};

interface SettingsPermissionsProps {
  initialData?: Partial<PermissionsSettings>;
  onSave: (data: PermissionsSettings) => Promise<void>;
}

const LEVEL_BADGES: Record<PermissionLevel, { label: string; className: string }> = {
  NONE: {
    label: 'NONE',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  },
  TAP: {
    label: 'TAP',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  CONFIRM: {
    label: 'CONFIRM',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  PIN: {
    label: 'PIN',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  },
};

export default function SettingsPermissions({ initialData, onSave }: SettingsPermissionsProps) {
  const [settings, setSettings] = useState<PermissionsSettings>({
    ...DEFAULT_PERMISSIONS,
    ...initialData,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (initialData) {
      setSettings((prev) => ({
        ...prev,
        ...initialData,
        actions: initialData.actions?.length ? initialData.actions : prev.actions,
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

  const handleOverrideChange = (index: number, value: OverrideLevel) => {
    setSettings((prev) => ({
      ...prev,
      actions: prev.actions.map((a, i) =>
        i === index ? { ...a, override: value } : a
      ),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Overall Autonomy Level */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Overall Autonomy Level</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          This sets the default confirmation behavior for all actions. Individual overrides below take precedence.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            {
              id: 'conservative' as AutonomyLevel,
              label: 'Conservative',
              desc: 'Shadow asks before almost every action. Maximum control.',
              color: 'border-green-500 bg-green-50 dark:bg-green-900/10',
              selectedColor: 'ring-2 ring-green-500',
            },
            {
              id: 'balanced' as AutonomyLevel,
              label: 'Balanced',
              desc: 'Shadow handles routine tasks, confirms important ones.',
              color: 'border-blue-500 bg-blue-50 dark:bg-blue-900/10',
              selectedColor: 'ring-2 ring-blue-500',
            },
            {
              id: 'full' as AutonomyLevel,
              label: 'Full Autonomy',
              desc: 'Shadow acts freely. Only safety-critical actions require confirmation.',
              color: 'border-amber-500 bg-amber-50 dark:bg-amber-900/10',
              selectedColor: 'ring-2 ring-amber-500',
            },
          ]).map((option) => (
            <button
              key={option.id}
              onClick={() => setSettings({ ...settings, autonomyLevel: option.id })}
              className={`text-left p-4 rounded-lg border-2 transition-all ${
                settings.autonomyLevel === option.id
                  ? `${option.color} ${option.selectedColor}`
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    settings.autonomyLevel === option.id
                      ? 'border-blue-600'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {settings.autonomyLevel === option.id && (
                    <div className="w-2 h-2 rounded-full bg-blue-600" />
                  )}
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{option.label}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">{option.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Per-Action Matrix */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Per-Action Permissions</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Fine-tune the confirmation level required for each action type.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="pb-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Action</th>
                <th className="pb-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Level</th>
                <th className="pb-2 font-medium text-gray-500 dark:text-gray-400">Override</th>
              </tr>
            </thead>
            <tbody>
              {settings.actions.map((action, index) => {
                const badge = LEVEL_BADGES[action.defaultLevel];
                return (
                  <tr key={action.action} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-3 pr-4 text-gray-900 dark:text-white font-medium">{action.label}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-3">
                      <select
                        value={action.override}
                        onChange={(e) => handleOverrideChange(index, e.target.value as OverrideLevel)}
                        className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        <option value="default">Default</option>
                        <option value="ask_every_time">Ask Every Time</option>
                        <option value="confirm">Confirm</option>
                        <option value="full_autonomy">Full Autonomy</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Link to Trust & Safety */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <Link
          href="/trust"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        >
          View full Trust & Safety settings
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </Link>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {saving ? 'Saving...' : 'Save Permissions'}
        </button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400">Settings saved successfully</span>
        )}
      </div>
    </div>
  );
}
