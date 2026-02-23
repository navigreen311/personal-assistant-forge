'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export type AutonomyLevel = 'conservative' | 'balanced' | 'full';
export type PermissionLevel = 'NONE' | 'TAP' | 'CONFIRM' | 'PIN';
export type OverrideLevel = 'default' | 'none' | 'tap' | 'confirm_phrase' | 'pin' | 'disabled';

export interface ActionPermission {
  action: string;
  label: string;
  defaultLevel: PermissionLevel;
  override: OverrideLevel;
  reversible: boolean;
  blastRadius: string;
}

export interface PermissionsSettings {
  autonomyLevel: AutonomyLevel;
  actions: ActionPermission[];
}

const DEFAULT_ACTIONS: ActionPermission[] = [
  { action: 'navigate', label: 'Navigate', defaultLevel: 'NONE', override: 'default', reversible: true, blastRadius: 'self' },
  { action: 'read_data', label: 'Read Data', defaultLevel: 'NONE', override: 'default', reversible: true, blastRadius: 'self' },
  { action: 'classify_email', label: 'Classify/Triage Email', defaultLevel: 'NONE', override: 'default', reversible: true, blastRadius: 'self' },
  { action: 'search_knowledge', label: 'Search Knowledge', defaultLevel: 'NONE', override: 'default', reversible: true, blastRadius: 'self' },
  { action: 'create_task', label: 'Create Task', defaultLevel: 'NONE', override: 'default', reversible: true, blastRadius: 'self' },
  { action: 'draft_email', label: 'Draft Email', defaultLevel: 'NONE', override: 'default', reversible: true, blastRadius: 'self' },
  { action: 'modify_calendar', label: 'Modify Calendar', defaultLevel: 'TAP', override: 'default', reversible: true, blastRadius: 'self' },
  { action: 'complete_task', label: 'Complete Task', defaultLevel: 'TAP', override: 'default', reversible: true, blastRadius: 'self' },
  { action: 'create_invoice', label: 'Create Invoice', defaultLevel: 'TAP', override: 'default', reversible: true, blastRadius: 'entity' },
  { action: 'send_email', label: 'Send Email', defaultLevel: 'CONFIRM', override: 'default', reversible: false, blastRadius: 'external' },
  { action: 'send_invoice', label: 'Send Invoice', defaultLevel: 'CONFIRM', override: 'default', reversible: false, blastRadius: 'external' },
  { action: 'trigger_workflow', label: 'Trigger Workflow', defaultLevel: 'CONFIRM', override: 'default', reversible: false, blastRadius: 'entity' },
  { action: 'place_call', label: 'Place Call', defaultLevel: 'CONFIRM', override: 'default', reversible: false, blastRadius: 'external' },
  { action: 'bulk_email', label: 'Bulk Email', defaultLevel: 'PIN', override: 'default', reversible: false, blastRadius: 'external' },
  { action: 'declare_crisis', label: 'Declare Crisis', defaultLevel: 'PIN', override: 'default', reversible: false, blastRadius: 'entity' },
  { action: 'delete_data', label: 'Delete Data', defaultLevel: 'PIN', override: 'default', reversible: false, blastRadius: 'entity' },
  { action: 'activate_phone_tree', label: 'Activate Phone Tree', defaultLevel: 'PIN', override: 'default', reversible: false, blastRadius: 'external' },
  { action: 'make_payment', label: 'Make Payment', defaultLevel: 'PIN', override: 'default', reversible: false, blastRadius: 'external' },
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

const BLAST_RADIUS_STYLES: Record<string, { label: string; className: string }> = {
  self: { label: 'Self', className: 'text-gray-500 dark:text-gray-400' },
  entity: { label: 'Entity', className: 'text-blue-600 dark:text-blue-400' },
  external: { label: 'External', className: 'text-amber-600 dark:text-amber-400' },
  public: { label: 'Public', className: 'text-red-600 dark:text-red-400' },
};

function computeLevelForAutonomy(action: ActionPermission, level: AutonomyLevel): PermissionLevel {
  const base = action.defaultLevel;
  if (level === 'balanced') return base;
  if (level === 'conservative') {
    if (base === 'NONE') return 'TAP';
    return base;
  }
  // full
  if (base === 'PIN') return 'PIN';
  if (base === 'TAP') return 'NONE';
  if (base === 'CONFIRM') return 'TAP';
  return base;
}

interface PreviewChange {
  label: string;
  from: PermissionLevel;
  to: PermissionLevel;
}

function getAutonomyPreviewChanges(
  actions: ActionPermission[],
  currentLevel: AutonomyLevel,
  newLevel: AutonomyLevel
): PreviewChange[] {
  const changes: PreviewChange[] = [];
  for (const action of actions) {
    const currentComputed = computeLevelForAutonomy(action, currentLevel);
    const newComputed = computeLevelForAutonomy(action, newLevel);
    if (currentComputed !== newComputed) {
      changes.push({ label: action.label, from: currentComputed, to: newComputed });
    }
  }
  return changes;
}

export default function SettingsPermissions({ initialData, onSave }: SettingsPermissionsProps) {
  const [settings, setSettings] = useState<PermissionsSettings>({
    ...DEFAULT_PERMISSIONS,
    ...initialData,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingAutonomyLevel, setPendingAutonomyLevel] = useState<AutonomyLevel | null>(null);

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

  const handleResetAllOverrides = () => {
    setSettings((prev) => ({
      ...prev,
      actions: prev.actions.map((a) => ({ ...a, override: 'default' as OverrideLevel })),
    }));
  };

  const handleAutonomyClick = (level: AutonomyLevel) => {
    if (level === settings.autonomyLevel) {
      setPendingAutonomyLevel(null);
      return;
    }
    setPendingAutonomyLevel(level);
  };

  const handleApplyAutonomy = () => {
    if (pendingAutonomyLevel) {
      setSettings({ ...settings, autonomyLevel: pendingAutonomyLevel });
      setPendingAutonomyLevel(null);
    }
  };

  const handleCancelAutonomy = () => {
    setPendingAutonomyLevel(null);
  };

  const previewChanges = pendingAutonomyLevel
    ? getAutonomyPreviewChanges(DEFAULT_ACTIONS, settings.autonomyLevel, pendingAutonomyLevel)
    : [];

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
              onClick={() => handleAutonomyClick(option.id)}
              className={`text-left p-4 rounded-lg border-2 transition-all ${
                settings.autonomyLevel === option.id
                  ? `${option.color} ${option.selectedColor}`
                  : pendingAutonomyLevel === option.id
                    ? `${option.color} border-dashed opacity-80`
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

        {/* Autonomy Level Effect Preview */}
        {pendingAutonomyLevel && (
          <div className="mt-4 border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
              Preview: Switching to &ldquo;{pendingAutonomyLevel === 'conservative' ? 'Conservative' : pendingAutonomyLevel === 'balanced' ? 'Balanced' : 'Full Autonomy'}&rdquo;
            </h4>
            {previewChanges.length > 0 ? (
              <>
                <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
                  The following action levels will change:
                </p>
                <ul className="space-y-1 mb-3">
                  {previewChanges.map((change) => (
                    <li key={change.label} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{change.label}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${LEVEL_BADGES[change.from].className}`}>
                        {change.from}
                      </span>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-gray-400">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${LEVEL_BADGES[change.to].className}`}>
                        {change.to}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
                No action levels will change with this selection.
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={handleApplyAutonomy}
                className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              >
                Apply
              </button>
              <button
                onClick={handleCancelAutonomy}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
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
                <th className="pb-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Reversible</th>
                <th className="pb-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Blast Radius</th>
                <th className="pb-2 font-medium text-gray-500 dark:text-gray-400">Override</th>
              </tr>
            </thead>
            <tbody>
              {settings.actions.map((action, index) => {
                const badge = LEVEL_BADGES[action.defaultLevel];
                const blastStyle = BLAST_RADIUS_STYLES[action.blastRadius] || BLAST_RADIUS_STYLES.self;
                const hasOverride = action.override !== 'default';
                return (
                  <tr
                    key={action.action}
                    className={`border-b border-gray-100 dark:border-gray-700/50 ${
                      hasOverride ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''
                    }`}
                  >
                    <td className="py-3 pr-4 text-gray-900 dark:text-white font-medium">{action.label}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {action.reversible ? (
                        <span className="inline-flex items-center text-green-600 dark:text-green-400" title="Yes">
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-red-500 dark:text-red-400" title="No">
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-medium ${blastStyle.className}`}>
                        {blastStyle.label}
                      </span>
                    </td>
                    <td className="py-3">
                      <select
                        value={action.override}
                        onChange={(e) => handleOverrideChange(index, e.target.value as OverrideLevel)}
                        className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        <option value="default">Default</option>
                        <option value="none">None (trust Shadow)</option>
                        <option value="tap">Tap (verbal yes)</option>
                        <option value="confirm_phrase">Confirm phrase</option>
                        <option value="pin">PIN required</option>
                        <option value="disabled">Disabled (blocked)</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Reset all overrides link */}
        <div className="mt-3">
          <button
            onClick={handleResetAllOverrides}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline transition-colors"
          >
            Reset all to defaults
          </button>
        </div>
      </div>

      {/* Entity-Specific Overrides Notice */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex gap-3">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              These are global permissions. Individual entities can have stricter thresholds (e.g., MedLink may require PIN at $200 instead of $500 for HIPAA compliance).
            </p>
            <Link
              href="/entities"
              className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              Manage entity profiles
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
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
          {saving ? 'Saving...' : 'Save Permission Settings'}
        </button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400">Settings saved successfully</span>
        )}
      </div>
    </div>
  );
}
