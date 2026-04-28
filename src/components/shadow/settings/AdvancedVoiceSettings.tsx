'use client';

/**
 * AdvancedVoiceSettings — Voice & Phone → "Advanced Voice Settings" section.
 *
 * Powered by VisionAudioForge (VAF). This is a presentational + state-managed
 * component. Persistence is delegated to the parent (or to /api/shadow/vaf-config
 * when used standalone) via the onChange callback.
 *
 * Where the spec calls for the voiceprint enrollment subsection, we render a
 * <div data-vaf-voiceprint-slot /> placeholder. WS02 will replace that with
 * its <VoiceprintEnrollmentSection /> after WS04 is merged.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ---- Types --------------------------------------------------------------

export interface VafConfigShape {
  sttProvider: string;
  ttsProvider: string;
  audioEnhancement: boolean;
  noiseCancellation: boolean;
  echoSuppression: boolean;
  voiceprintEnrolled: boolean;
  voiceprintEnrolledAt: Date | string | null;
  voiceprintUseForAuth: boolean;
  sentimentOnVoiceforgeCalls: boolean;
  sentimentAlertThreshold: number;
  autoProcessMeetings: boolean;
  autoExtractActionItems: boolean;
  autoCreateTasks: boolean;
  documentAnalysisEnabled: boolean;
  screenVisionFallback: boolean;
  primaryLanguage: string;
  secondaryLanguage: string | null;
  autoDetectLanguage: boolean;
}

export type VafConfigPatch = Partial<VafConfigShape>;

interface AdvancedVoiceSettingsProps {
  /** Initial config — typically fetched from /api/shadow/vaf-config. */
  initialConfig?: Partial<VafConfigShape>;
  /**
   * Called every time a control changes. Parent persists. If omitted, the
   * component PATCHes /api/shadow/vaf-config itself.
   */
  onChange?: (patch: VafConfigPatch) => void | Promise<void>;
  /** Initial collapsed state. Defaults to expanded. */
  defaultCollapsed?: boolean;
  /** VAF service URL — used for the health check. Falls back to env. */
  vafServiceUrl?: string;
}

interface ServiceStatus {
  available: boolean;
  latency: { stt: number | null; tts: number | null; sentiment: number | null };
  message: string;
}

// ---- Defaults -----------------------------------------------------------

const DEFAULT_CONFIG: VafConfigShape = {
  sttProvider: 'vaf',
  ttsProvider: 'vaf',
  audioEnhancement: true,
  noiseCancellation: true,
  echoSuppression: true,
  voiceprintEnrolled: false,
  voiceprintEnrolledAt: null,
  voiceprintUseForAuth: false,
  sentimentOnVoiceforgeCalls: true,
  sentimentAlertThreshold: 0.8,
  autoProcessMeetings: false,
  autoExtractActionItems: true,
  autoCreateTasks: true,
  documentAnalysisEnabled: true,
  screenVisionFallback: false,
  primaryLanguage: 'en-US',
  secondaryLanguage: null,
  autoDetectLanguage: false,
};

const STT_PROVIDERS = [
  { value: 'vaf', label: 'VisionAudioForge' },
  { value: 'whisper', label: 'Whisper' },
  { value: 'browser', label: 'Browser (Web Speech API)' },
];

const TTS_PROVIDERS = [
  { value: 'vaf', label: 'VisionAudioForge' },
  { value: 'google', label: 'Google' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'browser', label: 'Browser (SpeechSynthesis)' },
];

const SENTIMENT_THRESHOLDS = [
  { value: 0.6, label: '0.6 — Sensitive (more alerts)' },
  { value: 0.7, label: '0.7' },
  { value: 0.8, label: '0.8 — Default' },
  { value: 0.9, label: '0.9 — Conservative (fewer alerts)' },
];

// 2-second timeout for the VAF health check, per spec acceptance gates.
const HEALTH_CHECK_TIMEOUT_MS = 2000;

// ---- Service-status hook -----------------------------------------------

/**
 * Pings the VAF service health endpoint and returns availability + latencies.
 * Fail-closed: any timeout / error / non-2xx response yields `available=false`.
 */
async function pingVafHealth(baseUrl: string): Promise<ServiceStatus> {
  const fail = (message: string): ServiceStatus => ({
    available: false,
    latency: { stt: null, tts: null, sentiment: null },
    message,
  });

  if (!baseUrl) return fail('VAF service URL not configured');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/health`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeoutId);

    if (!res.ok) return fail(`VAF unavailable (HTTP ${res.status})`);

    const data: {
      latency?: { stt?: number; tts?: number; sentiment?: number };
    } = await res.json().catch(() => ({}));

    return {
      available: true,
      latency: {
        stt: typeof data.latency?.stt === 'number' ? data.latency.stt : null,
        tts: typeof data.latency?.tts === 'number' ? data.latency.tts : null,
        sentiment:
          typeof data.latency?.sentiment === 'number' ? data.latency.sentiment : null,
      },
      message: 'VisionAudioForge connected',
    };
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    return fail(isAbort ? 'VAF health check timed out' : 'VAF unreachable');
  }
}

// ---- Component ----------------------------------------------------------

export default function AdvancedVoiceSettings({
  initialConfig,
  onChange,
  defaultCollapsed = false,
  vafServiceUrl,
}: AdvancedVoiceSettingsProps) {
  const [config, setConfig] = useState<VafConfigShape>(() => ({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  }));
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [status, setStatus] = useState<ServiceStatus | null>(null);

  // Resolve VAF base URL: prop → public env → empty (no health check).
  const baseUrl =
    vafServiceUrl ?? process.env.NEXT_PUBLIC_VAF_SERVICE_URL ?? '';

  // Re-sync local state when the parent supplies a new initialConfig
  // identity. The setState-in-effect pattern is acceptable here because
  // we explicitly diff the prop against the last seen identity so the
  // effect is idempotent and does not loop. (See React docs — "syncing
  // props to state" is the canonical case for this rule.)
  const lastInitialKey = useRef<string>(JSON.stringify(initialConfig ?? null));
  useEffect(() => {
    const key = JSON.stringify(initialConfig ?? null);
    if (key === lastInitialKey.current) return;
    lastInitialKey.current = key;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig((prev) => ({ ...prev, ...initialConfig }));
  }, [initialConfig]);

  // Health check on mount + every 30s.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const next = await pingVafHealth(baseUrl);
      if (!cancelled) setStatus(next);
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [baseUrl]);

  const apply = useCallback(
    async (patch: VafConfigPatch) => {
      setConfig((prev) => ({ ...prev, ...patch }));
      if (onChange) {
        await onChange(patch);
      } else {
        // Self-persist via API.
        try {
          await fetch('/api/shadow/vaf-config', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
        } catch (err) {
          console.warn('[AdvancedVoiceSettings] PATCH failed', err);
        }
      }
    },
    [onChange]
  );

  return (
    <section
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
      aria-labelledby="vaf-advanced-voice-heading"
      data-testid="advanced-voice-settings"
    >
      {/* Header — collapsible toggle */}
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls="vaf-advanced-voice-body"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded-t-lg"
      >
        <div>
          <h3
            id="vaf-advanced-voice-heading"
            className="text-sm font-semibold text-gray-900 dark:text-white"
          >
            Advanced Voice Settings
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Powered by VisionAudioForge
          </p>
        </div>
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-gray-500 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {!collapsed && (
        <div
          id="vaf-advanced-voice-body"
          className="px-6 pb-6 space-y-6 border-t border-gray-200 dark:border-gray-700 pt-6"
        >
          {/* Speech Recognition Provider */}
          <div>
            <label
              htmlFor="vaf-stt-provider"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Speech Recognition Provider
            </label>
            <select
              id="vaf-stt-provider"
              value={config.sttProvider}
              onChange={(e) => apply({ sttProvider: e.target.value })}
              className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {STT_PROVIDERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Voice Synthesis Provider */}
          <div>
            <label
              htmlFor="vaf-tts-provider"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Voice Synthesis Provider
            </label>
            <select
              id="vaf-tts-provider"
              value={config.ttsProvider}
              onChange={(e) => apply({ ttsProvider: e.target.value })}
              className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {TTS_PROVIDERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Audio Enhancement toggle */}
          <ToggleRow
            id="vaf-audio-enhancement"
            label="Audio Enhancement"
            description="Noise cancellation, echo removal, and quality boost on inbound audio."
            checked={config.audioEnhancement}
            onChange={(v) => apply({ audioEnhancement: v })}
          />

          {/* Auto-detect language toggle */}
          <ToggleRow
            id="vaf-auto-detect-language"
            label="Auto-detect Language"
            description="Shadow detects and responds in your spoken language."
            checked={config.autoDetectLanguage}
            onChange={(v) => apply({ autoDetectLanguage: v })}
          />

          {/* Voiceprint enrollment slot — owned by WS02. */}
          {/* TODO(ws02): Replace this slot with <VoiceprintEnrollmentSection />
              once WS02 is merged. The component will live at
              src/components/shadow/settings/VoiceprintEnrollmentSection.tsx. */}
          <div
            data-vaf-voiceprint-slot
            className="border border-dashed border-gray-300 dark:border-gray-600 rounded-md p-4 text-xs text-gray-500 dark:text-gray-400"
            role="note"
          >
            Voiceprint enrollment will appear here once VAF&rsquo;s biometric
            authentication module is enabled.
          </div>

          {/* Call Sentiment Analysis */}
          <div className="space-y-3">
            <ToggleRow
              id="vaf-sentiment-enabled"
              label="Call Sentiment Analysis"
              description="Monitor emotional tone during VoiceForge calls."
              checked={config.sentimentOnVoiceforgeCalls}
              onChange={(v) => apply({ sentimentOnVoiceforgeCalls: v })}
            />
            {config.sentimentOnVoiceforgeCalls && (
              <div className="ml-1">
                <label
                  htmlFor="vaf-sentiment-threshold"
                  className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
                >
                  Alert threshold (anger / hostility)
                </label>
                <select
                  id="vaf-sentiment-threshold"
                  value={config.sentimentAlertThreshold}
                  onChange={(e) =>
                    apply({ sentimentAlertThreshold: Number(e.target.value) })
                  }
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {SENTIMENT_THRESHOLDS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Meeting Intelligence */}
          <div className="space-y-3">
            <ToggleRow
              id="vaf-meeting-intelligence"
              label="Meeting Intelligence"
              description="Auto-transcribe and extract action items from meetings."
              checked={config.autoProcessMeetings}
              onChange={(v) => apply({ autoProcessMeetings: v })}
            />
            {config.autoProcessMeetings && (
              <label className="flex items-start gap-2 ml-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.autoCreateTasks}
                  onChange={(e) => apply({ autoCreateTasks: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  aria-label="Auto-create tasks from action items"
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  Auto-create tasks from action items
                </span>
              </label>
            )}
          </div>

          {/* Document Analysis */}
          <ToggleRow
            id="vaf-document-analysis"
            label="Document Analysis"
            description="Shadow can read and understand uploaded documents (PDFs, scans, images)."
            checked={config.documentAnalysisEnabled}
            onChange={(v) => apply({ documentAnalysisEnabled: v })}
          />

          {/* Service Status row */}
          <div
            data-testid="vaf-service-status"
            className="flex items-start gap-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3"
          >
            <span
              className="text-base leading-none"
              aria-hidden="true"
              role="presentation"
            >
              {status === null ? '…' : status.available ? '✅' : '❌'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Service Status:{' '}
                <span className="font-normal text-gray-600 dark:text-gray-400">
                  {status === null ? 'Checking…' : status.message}
                </span>
              </p>
              {status?.available && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Latency:{' '}
                  STT {status.latency.stt !== null ? `${status.latency.stt}ms` : '—'}
                  {' │ '}
                  TTS {status.latency.tts !== null ? `${status.latency.tts}ms` : '—'}
                  {' │ '}
                  Sentiment{' '}
                  {status.latency.sentiment !== null
                    ? `${status.latency.sentiment}ms`
                    : 'real-time'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ---- Sub-component ------------------------------------------------------

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <label
          htmlFor={id}
          className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
        >
          {label}
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      <button
        id={id}
        role="switch"
        type="button"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
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
