'use client';

import { useState, useEffect, useCallback } from 'react';

interface VoiceForgeSettingsTabProps {
  entityId?: string;
}

interface VoiceForgeSettings {
  // Compliance
  consentMode: 'one-party' | 'two-party' | 'auto-detect';
  aiDisclosureScript: string;
  recordingPolicy: 'always' | 'ask-consent' | 'never';
  // Call Limits
  maxOutboundPerHour: number;
  maxConcurrentCalls: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  blockedNumbersCount: number;
  // Voicemail
  defaultVoicemailScript: string;
  trackCallbackRequests: boolean;
  // Integrations
  telephonyProvider: string;
  telephonyConnected: boolean;
  callRecordingStorage: string;
  crmSync: boolean;
  autoCreateTasks: boolean;
}

const DEFAULT_SETTINGS: VoiceForgeSettings = {
  consentMode: 'auto-detect',
  aiDisclosureScript:
    'Hello, this is an AI assistant calling on behalf of your account representative. This call may be recorded for quality and compliance purposes. Would you like to continue?',
  recordingPolicy: 'ask-consent',
  maxOutboundPerHour: 30,
  maxConcurrentCalls: 5,
  quietHoursStart: '20:00',
  quietHoursEnd: '08:00',
  blockedNumbersCount: 0,
  defaultVoicemailScript:
    'Hello, this is a message from your account representative. We were unable to reach you. Please call us back at your earliest convenience. Thank you.',
  trackCallbackRequests: true,
  telephonyProvider: 'Twilio',
  telephonyConnected: true,
  callRecordingStorage: 'default',
  crmSync: true,
  autoCreateTasks: false,
};

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        <div className="h-4 bg-gray-100 rounded w-full" />
        <div className="h-4 bg-gray-100 rounded w-2/3" />
        <div className="h-10 bg-gray-100 rounded w-full" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
      </div>
    </div>
  );
}

export default function VoiceForgeSettingsTab({ entityId }: VoiceForgeSettingsTabProps) {
  const [settings, setSettings] = useState<VoiceForgeSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fetch settings on mount / when entityId changes
  useEffect(() => {
    let cancelled = false;

    async function fetchSettings() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (entityId) params.set('entityId', entityId);
        const res = await fetch(`/api/voice/settings?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();
        if (!cancelled) {
          setSettings({ ...DEFAULT_SETTINGS, ...data });
        }
      } catch {
        // Use defaults on error - settings page still usable
        if (!cancelled) {
          setSettings(DEFAULT_SETTINGS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSettings();
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const update = useCallback(
    <K extends keyof VoiceForgeSettings>(key: K, value: VoiceForgeSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/voice/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, entityId }),
      });
      if (!res.ok) throw new Error('Save failed');
      setToast({ type: 'success', message: 'Settings saved successfully.' });
    } catch {
      setToast({ type: 'error', message: 'Failed to save settings. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  // ---------- Loading skeleton ----------
  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  // ---------- Time options for quiet-hours selects ----------
  const timeOptions: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of ['00', '30']) {
      timeOptions.push(`${String(h).padStart(2, '0')}:${m}`);
    }
  }

  const formatTime = (t: string) => {
    const [hStr, mStr] = t.split(':');
    const h = parseInt(hStr, 10);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}:${mStr} ${suffix}`;
  };

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {toast && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium transition-opacity duration-300 ${
            toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* ================================================================
          SECTION 1 - COMPLIANCE
          ================================================================ */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Compliance</h3>

        {/* Consent mode */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Default Consent Mode
          </label>
          <div className="space-y-2">
            {([
              { value: 'one-party', label: 'One-party', desc: 'Only one party needs to consent to recording' },
              { value: 'two-party', label: 'Two-party', desc: 'All parties must consent to recording' },
              { value: 'auto-detect', label: 'Auto-detect by state', desc: 'Automatically apply the correct consent law based on caller/callee jurisdiction' },
            ] as const).map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  settings.consentMode === opt.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="consent-mode"
                  value={opt.value}
                  checked={settings.consentMode === opt.value}
                  onChange={() => update('consentMode', opt.value)}
                  className="mt-0.5 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* AI disclosure script */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            AI Disclosure Script
          </label>
          <p className="text-xs text-gray-500 mb-2">
            This text is spoken by the AI at the start of every call to disclose its non-human identity.
          </p>
          <textarea
            value={settings.aiDisclosureScript}
            onChange={(e) => update('aiDisclosureScript', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Recording policy */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Recording Policy
          </label>
          <div className="space-y-2">
            {([
              { value: 'always', label: 'Always record' },
              { value: 'ask-consent', label: 'Ask consent before recording' },
              { value: 'never', label: 'Never record' },
            ] as const).map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  settings.recordingPolicy === opt.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="recording-policy"
                  value={opt.value}
                  checked={settings.recordingPolicy === opt.value}
                  onChange={() => update('recordingPolicy', opt.value)}
                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-900">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-400 italic">Per-entity override available</p>
      </div>

      {/* ================================================================
          SECTION 2 - CALL LIMITS
          ================================================================ */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Call Limits</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
          {/* Max outbound per hour */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Outbound Calls per Hour
            </label>
            <p className="text-xs text-gray-500 mb-2">Limit per entity to prevent over-dialing.</p>
            <input
              type="number"
              min={1}
              max={500}
              value={settings.maxOutboundPerHour}
              onChange={(e) => update('maxOutboundPerHour', Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Max concurrent */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Concurrent Calls
            </label>
            <p className="text-xs text-gray-500 mb-2">Maximum simultaneous active calls.</p>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.maxConcurrentCalls}
              onChange={(e) => update('maxConcurrentCalls', Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Quiet hours */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Quiet Hours</label>
          <p className="text-xs text-gray-500 mb-2">
            No outbound calls will be placed during this window.
          </p>
          <div className="flex items-center gap-3">
            <select
              value={settings.quietHoursStart}
              onChange={(e) => update('quietHoursStart', e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {timeOptions.map((t) => (
                <option key={`qs-${t}`} value={t}>
                  {formatTime(t)}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-500">to</span>
            <select
              value={settings.quietHoursEnd}
              onChange={(e) => update('quietHoursEnd', e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {timeOptions.map((t) => (
                <option key={`qe-${t}`} value={t}>
                  {formatTime(t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Blocked numbers */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div>
            <span className="text-sm font-medium text-gray-700">Blocked Numbers</span>
            <p className="text-xs text-gray-500 mt-0.5">
              {settings.blockedNumbersCount} number{settings.blockedNumbersCount !== 1 ? 's' : ''} currently blocked
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Manage
          </button>
        </div>
      </div>

      {/* ================================================================
          SECTION 3 - VOICEMAIL
          ================================================================ */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Voicemail</h3>

        {/* Default voicemail script */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Default Voicemail Script
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Message left when a call goes to voicemail. Supports variable substitution.
          </p>
          <textarea
            value={settings.defaultVoicemailScript}
            onChange={(e) => update('defaultVoicemailScript', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Callback tracking */}
        <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 cursor-pointer hover:bg-gray-100 transition-colors">
          <input
            type="checkbox"
            checked={settings.trackCallbackRequests}
            onChange={(e) => update('trackCallbackRequests', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-900">Track callback requests from voicemails</span>
            <p className="text-xs text-gray-500 mt-0.5">
              Automatically detect and log when a voicemail recipient calls back.
            </p>
          </div>
        </label>
      </div>

      {/* ================================================================
          SECTION 4 - INTEGRATIONS
          ================================================================ */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Integrations</h3>

        {/* Telephony provider */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Telephony Provider
          </label>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-900">{settings.telephonyProvider}</span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  settings.telephonyConnected
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {settings.telephonyConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Configure
            </button>
          </div>
        </div>

        {/* Call recording storage */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Call Recording Storage
          </label>
          <p className="text-xs text-gray-500 mb-2">
            S3 bucket path or &quot;default&quot; for built-in storage.
          </p>
          <input
            type="text"
            value={settings.callRecordingStorage}
            onChange={(e) => update('callRecordingStorage', e.target.value)}
            placeholder="s3://my-bucket/recordings or default"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* CRM sync */}
        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 cursor-pointer hover:bg-gray-100 transition-colors">
            <input
              type="checkbox"
              checked={settings.crmSync}
              onChange={(e) => update('crmSync', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Auto-update contacts after calls</span>
              <p className="text-xs text-gray-500 mt-0.5">
                Sync extracted contact information and call outcomes to your CRM automatically.
              </p>
            </div>
          </label>

          {/* Task creation */}
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 cursor-pointer hover:bg-gray-100 transition-colors">
            <input
              type="checkbox"
              checked={settings.autoCreateTasks}
              onChange={(e) => update('autoCreateTasks', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Auto-create tasks from action items</span>
              <p className="text-xs text-gray-500 mt-0.5">
                Automatically create tasks in your task manager from action items identified during calls.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* ================================================================
          SAVE BUTTON
          ================================================================ */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
