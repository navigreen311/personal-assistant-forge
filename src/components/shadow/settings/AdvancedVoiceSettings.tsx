'use client';

/**
 * AdvancedVoiceSettings — Voice & Phone → "Advanced Voice Settings" section.
 *
 * Powered by VisionAudioForge (VAF). This is a presentational + state-managed
 * component. Persistence is delegated to the parent (or to /api/shadow/vaf-config
 * when used standalone) via the onChange callback.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import VoiceprintEnrollmentSection from '@/components/shadow/safety/VoiceprintEnrollmentSection';
import { VAFTextToSpeech, type VAFVoice } from '@/lib/vaf/tts-client';

// ---- Types --------------------------------------------------------------

export interface VafConfigShape {
  sttProvider: string;
  ttsProvider: string;
  /** Selected VAF voice ID (e.g. 'professional-female'). */
  voicePersona?: string;
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

/**
 * Static fallback list shown when the VAF voices endpoint is unreachable
 * (offline dev, VAF down, or unauthenticated). Mirrors the persona names
 * the rest of the app already uses so the dropdown is never empty.
 */
const STATIC_VOICE_FALLBACK: { id: string; name: string }[] = [
  { id: 'default', name: 'Default' },
  { id: 'professional-female', name: 'Professional (female)' },
  { id: 'professional-male', name: 'Professional (male)' },
  { id: 'warm-female', name: 'Warm (female)' },
];

// Module-level voice cache. 60s TTL — VAF voice catalogues change rarely
// and re-fetching on every settings panel mount is wasteful (and noisy in
// the audit log).
const VOICES_TTL_MS = 60_000;
let voiceCache: { fetchedAt: number; voices: VAFVoice[] } | null = null;
let voiceCacheInflight: Promise<VAFVoice[]> | null = null;

async function loadVoicesCached(): Promise<VAFVoice[]> {
  const now = Date.now();
  if (voiceCache && now - voiceCache.fetchedAt < VOICES_TTL_MS) {
    return voiceCache.voices;
  }
  if (voiceCacheInflight) return voiceCacheInflight;

  voiceCacheInflight = (async () => {
    try {
      const tts = new VAFTextToSpeech();
      const voices = await tts.getVoices();
      voiceCache = { fetchedAt: Date.now(), voices };
      return voices;
    } finally {
      voiceCacheInflight = null;
    }
  })();
  return voiceCacheInflight;
}

/**
 * Test-only escape hatch: clears the module-level voice cache so each
 * jest test starts from a clean slate. Not exported in production
 * surfaces; safe to import from test code.
 */
export function __resetVoiceCacheForTests() {
  voiceCache = null;
  voiceCacheInflight = null;
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

    // Accept either `latency` (legacy) or `latencies` (post-WS10/WS11
    // health endpoint shape). Whichever the server emits, the dropdown
    // displays real numbers — never hard-coded values.
    const data: {
      latency?: { stt?: number; tts?: number; sentiment?: number };
      latencies?: { stt?: number; tts?: number; sentiment?: number };
    } = await res.json().catch(() => ({}));
    const lat = data.latencies ?? data.latency ?? {};

    return {
      available: true,
      latency: {
        stt: typeof lat.stt === 'number' ? lat.stt : null,
        tts: typeof lat.tts === 'number' ? lat.tts : null,
        sentiment: typeof lat.sentiment === 'number' ? lat.sentiment : null,
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
  const [voices, setVoices] = useState<{ id: string; name: string }[]>(
    STATIC_VOICE_FALLBACK
  );

  // Populate the Shadow Voice dropdown from VAF on mount. Cached at the
  // module level for 60s so re-mounting the panel (e.g. tab switching)
  // does not re-fetch. On VAF failure we keep the static fallback list
  // so the dropdown is never blank.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetched = await loadVoicesCached();
        if (cancelled) return;
        if (Array.isArray(fetched) && fetched.length > 0) {
          setVoices(
            fetched.map((v) => ({
              id: v.id,
              name: v.name || v.id,
            }))
          );
        }
      } catch {
        // Keep STATIC_VOICE_FALLBACK; surfaced in service-status row.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

          {/* Shadow Voice persona dropdown — populated live from VAF */}
          <div>
            <label
              htmlFor="vaf-voice-persona"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Shadow Voice
            </label>
            <select
              id="vaf-voice-persona"
              data-testid="vaf-voice-persona"
              value={config.voicePersona ?? voices[0]?.id ?? 'default'}
              onChange={(e) => apply({ voicePersona: e.target.value })}
              className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
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

          <VoiceprintEnrollmentSection
            initialEnrolled={config.voiceprintEnrolled}
            onEnrollmentChange={(enrolled) =>
              apply({
                voiceprintEnrolled: enrolled,
                voiceprintEnrolledAt: enrolled ? new Date().toISOString() : null,
              })
            }
          />
          <ToggleRow
            id="vaf-voiceprint-use-for-auth"
            label="Use voiceprint for auth"
            description="Reduce PIN prompts on medium-risk actions when your voiceprint matches. PIN is still required for high-risk actions."
            checked={config.voiceprintUseForAuth}
            onChange={(v) => apply({ voiceprintUseForAuth: v })}
            disabled={!config.voiceprintEnrolled}
          />

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
  disabled = false,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
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
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed ${
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
