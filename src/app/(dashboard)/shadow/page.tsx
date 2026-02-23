'use client';

import { useState, useEffect, useCallback } from 'react';
import SettingsGeneral from '@/modules/shadow/components/SettingsGeneral';
import SettingsVoicePhone from '@/modules/shadow/components/SettingsVoicePhone';
import SettingsProactive from '@/modules/shadow/components/SettingsProactive';
import SettingsSafety from '@/modules/shadow/components/SettingsSafety';
import SettingsPermissions from '@/modules/shadow/components/SettingsPermissions';
import SettingsHistory from '@/modules/shadow/components/SettingsHistory';
import type { GeneralSettings } from '@/modules/shadow/components/SettingsGeneral';
import type { VoicePhoneSettings } from '@/modules/shadow/components/SettingsVoicePhone';
import type { ProactiveSettings } from '@/modules/shadow/components/SettingsProactive';
import type { SafetySettings } from '@/modules/shadow/components/SettingsSafety';
import type { PermissionsSettings } from '@/modules/shadow/components/SettingsPermissions';

type TabId = 'general' | 'voicePhone' | 'proactive' | 'safety' | 'permissions' | 'history';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  {
    id: 'general',
    label: 'General',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      </svg>
    ),
  },
  {
    id: 'voicePhone',
    label: 'Voice & Phone',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
  },
  {
    id: 'proactive',
    label: 'Proactive',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    id: 'safety',
    label: 'Safety',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: 'permissions',
    label: 'Permissions',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: 'History',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 4v6h6" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        <polyline points="12 7 12 12 16 14" />
      </svg>
    ),
  },
];

interface ShadowConfig {
  general?: Partial<GeneralSettings>;
  voicePhone?: Partial<VoicePhoneSettings>;
  proactive?: Partial<ProactiveSettings>;
  safety?: Partial<SafetySettings>;
  permissions?: Partial<PermissionsSettings>;
}

export default function ShadowSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [config, setConfig] = useState<ShadowConfig>({});
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/shadow/config');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setConfig(json.data);
        }
      }
    } catch {
      // Silently fail on config load — tabs will use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveSection = async (section: string, data: unknown) => {
    const res = await fetch('/api/shadow/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [section]: data }),
    });
    if (!res.ok) {
      throw new Error('Failed to save settings');
    }
    const json = await res.json();
    if (json.success && json.data) {
      setConfig((prev) => ({ ...prev, ...json.data }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading Shadow settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-gray-900 dark:bg-gray-700 rounded-lg">
            <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a7 7 0 0 1 7 7c0 3-2 5.5-4 7l-1 4H10l-1-4c-2-1.5-4-4-4-7a7 7 0 0 1 7-7z" />
              <line x1="10" y1="22" x2="14" y2="22" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Shadow Settings</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configure your AI voice assistant preferences, permissions, and behavior.
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-1 overflow-x-auto scrollbar-thin pb-px -mb-px" aria-label="Shadow settings tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div role="tabpanel" id={`tabpanel-${activeTab}`}>
        {activeTab === 'general' && (
          <SettingsGeneral
            initialData={config.general}
            onSave={(data) => saveSection('general', data)}
          />
        )}
        {activeTab === 'voicePhone' && (
          <SettingsVoicePhone
            initialData={config.voicePhone}
            onSave={(data) => saveSection('voicePhone', data)}
          />
        )}
        {activeTab === 'proactive' && (
          <SettingsProactive
            initialData={config.proactive}
            onSave={(data) => saveSection('proactive', data)}
          />
        )}
        {activeTab === 'safety' && (
          <SettingsSafety
            initialData={config.safety}
            onSave={(data) => saveSection('safety', data)}
          />
        )}
        {activeTab === 'permissions' && (
          <SettingsPermissions
            initialData={config.permissions}
            onSave={(data) => saveSection('permissions', data)}
          />
        )}
        {activeTab === 'history' && (
          <SettingsHistory />
        )}
      </div>
    </div>
  );
}
