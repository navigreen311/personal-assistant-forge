'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import QuickCaptureBar from '@/modules/capture/components/QuickCaptureBar';
import CaptureInbox from '@/modules/capture/components/CaptureInbox';
import CaptureMetricsDashboard from '@/modules/capture/components/CaptureMetricsDashboard';
import type {
  CaptureItem,
  CaptureSource,
  CaptureContentType,
  CaptureLatencyMetrics,
} from '@/modules/capture/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = 'inbox' | 'rules';

interface EntityOption {
  id: string;
  name: string;
}

interface CaptureStats {
  total: number;
  pending: number;
  routed: number;
  failed: number;
}

interface SlaStatus {
  voiceAvgMs: number;
  voiceMet: boolean;
  textAvgMs: number;
  textMet: boolean;
}

// ---------------------------------------------------------------------------
// Dynamic imports — Enhanced components with fallback to existing ones
// ---------------------------------------------------------------------------

const EnhancedQuickCaptureBar = dynamic(
  () =>
    import('@/modules/capture/components/EnhancedQuickCaptureBar').catch(() => {
      return {
        default: ({ onCapture }: any) => <QuickCaptureBar onCapture={onCapture} />,
      };
    }),
  { ssr: false },
);

const EnhancedCaptureTable = dynamic(
  () =>
    import('@/modules/capture/components/EnhancedCaptureTable').catch(() => {
      return {
        default: ({
          captures,
          onApproveRouting,
          onArchive,
          onReroute,
        }: any) => (
          <CaptureInbox
            captures={captures}
            onApproveRouting={onApproveRouting}
            onArchive={onArchive}
            onReroute={onReroute}
          />
        ),
      };
    }),
  { ssr: false },
);

const EnhancedCaptureStatsSidebar = dynamic(
  () =>
    import('@/modules/capture/components/EnhancedCaptureStatsSidebar').catch(
      () => {
        return {
          default: ({ metrics, captures }: any) => (
            <CaptureMetricsDashboard metrics={metrics} captures={captures} />
          ),
        };
      },
    ),
  { ssr: false },
);

const CaptureRulesTab = dynamic(
  () =>
    import('@/modules/capture/components/CaptureRulesTab').catch(() => {
      return {
        default: () => (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Routing Rules
            </h3>
            <p className="text-sm text-gray-500 text-center max-w-md">
              Routing rules will let you configure automatic capture routing
              based on source, content type, keywords, and more. Coming soon.
            </p>
          </div>
        ),
      };
    }),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VOICE_SLA_MS = 3000;
const TEXT_SLA_MS = 5000;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'rules', label: 'Rules' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SlaIndicator({
  label,
  targetMs,
  actualMs,
  met,
}: {
  label: string;
  targetMs: number;
  actualMs: number;
  met: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-400">&lt;{targetMs / 1000}s</span>
      {actualMs > 0 ? (
        <>
          {met ? (
            <svg
              className="w-3.5 h-3.5 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          )}
          <span className={met ? 'text-green-600' : 'text-red-600'}>
            {(actualMs / 1000).toFixed(1)}s
          </span>
        </>
      ) : (
        <span className="text-gray-300">--</span>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function CapturePage() {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [activeTab, setActiveTab] = useState<TabKey>('inbox');
  const [selectedEntity, setSelectedEntity] = useState('');
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [metrics, setMetrics] = useState<CaptureLatencyMetrics[]>([]);
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [loading, setLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchEntities = useCallback(async () => {
    try {
      const res = await fetch('/api/entities');
      const json = await res.json();
      if (json.data) {
        setEntities(
          json.data.map((e: { id: string; name: string }) => ({
            id: e.id,
            name: e.name,
          })),
        );
      }
    } catch {
      // Entities are optional for filter dropdown
    }
  }, []);

  const fetchCaptures = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedEntity) params.set('entityId', selectedEntity);

      const res = await fetch(`/api/capture?${params.toString()}`);
      const json = await res.json();

      if (json.success === false) {
        throw new Error(json.error?.message ?? 'Failed to load captures');
      }

      setCaptures(json.data ?? []);
    } catch {
      setCaptures([]);
    } finally {
      setLoading(false);
    }
  }, [selectedEntity]);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/capture/metrics');
      const json = await res.json();
      if (json.data) {
        setMetrics(json.data);
      }
    } catch {
      // Metrics API may not be ready
    }
  }, []);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  useEffect(() => {
    fetchCaptures();
  }, [fetchCaptures]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // ---------------------------------------------------------------------------
  // Computed stats
  // ---------------------------------------------------------------------------

  const stats: CaptureStats = useMemo(() => {
    const total = captures.length;
    const pending = captures.filter(
      (c) => c.status === 'PENDING' || c.status === 'PROCESSING',
    ).length;
    const routed = captures.filter((c) => c.status === 'ROUTED').length;
    const failed = captures.filter((c) => c.status === 'FAILED').length;
    return { total, pending, routed, failed };
  }, [captures]);

  // ---------------------------------------------------------------------------
  // SLA computation
  // ---------------------------------------------------------------------------

  const sla: SlaStatus = useMemo(() => {
    // Voice SLA: avg latency of captures from VOICE sources
    const voiceMetrics = metrics.filter((m) => m.source === 'VOICE');
    const voiceAvgMs =
      voiceMetrics.length > 0
        ? voiceMetrics.reduce((sum, m) => sum + m.totalMs, 0) /
          voiceMetrics.length
        : 0;
    const voiceMet = voiceAvgMs > 0 && voiceAvgMs < VOICE_SLA_MS;

    // Text SLA: avg latency of non-VOICE captures (TEXT content type or text-based sources)
    const textMetrics = metrics.filter((m) => m.source !== 'VOICE');
    const textAvgMs =
      textMetrics.length > 0
        ? textMetrics.reduce((sum, m) => sum + m.totalMs, 0) /
          textMetrics.length
        : 0;
    const textMet = textAvgMs > 0 && textAvgMs < TEXT_SLA_MS;

    return { voiceAvgMs, voiceMet, textAvgMs, textMet };
  }, [metrics]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleCapture = useCallback(
    async (params: {
      rawContent: string;
      source: CaptureSource;
      contentType: CaptureContentType;
    }) => {
      try {
        const response = await fetch('/api/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'current-user', // In production: from auth context
            entityId: selectedEntity || undefined,
            ...params,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            setCaptures((prev) => [result.data, ...prev]);
          }
        }
      } catch {
        // Error handling would show a toast in production
      }
    },
    [selectedEntity],
  );

  const handleApproveRouting = useCallback((id: string) => {
    setCaptures((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, status: 'ROUTED' as const, updatedAt: new Date() }
          : c,
      ),
    );
  }, []);

  const handleArchive = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setCaptures((prev) =>
      prev.map((c) =>
        idSet.has(c.id)
          ? { ...c, status: 'ARCHIVED' as const, updatedAt: new Date() }
          : c,
      ),
    );
  }, []);

  const handleReroute = useCallback((_id: string) => {
    // Would open a routing selection modal in production
  }, []);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-96 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-9 w-40 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-9 w-48 bg-gray-200 rounded-lg animate-pulse" />
          </div>
        </div>

        {/* Stats skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse"
            >
              <div className="h-4 w-20 bg-gray-200 rounded mb-2" />
              <div className="h-8 w-12 bg-gray-200 rounded" />
            </div>
          ))}
        </div>

        {/* Tab skeleton */}
        <div className="h-10 w-48 bg-gray-200 rounded animate-pulse" />

        {/* Content skeleton — two-column layout */}
        <div className="flex gap-6">
          <div className="flex-1 space-y-4">
            {/* Quick capture bar skeleton */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
              <div className="h-10 w-full bg-gray-200 rounded" />
            </div>
            {/* Table rows skeleton */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 bg-gray-200 rounded" />
                  <div className="h-4 w-16 bg-gray-200 rounded-full" />
                  <div className="h-4 flex-1 bg-gray-200 rounded" />
                  <div className="h-4 w-20 bg-gray-200 rounded-full" />
                  <div className="h-4 w-24 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
          {/* Sidebar skeleton */}
          <div className="hidden lg:block w-80 shrink-0 space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse h-48" />
            <div className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse h-32" />
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Page header                                                        */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Capture</h1>
          <p className="text-sm text-gray-500 mt-1">
            Universal capture point — grab anything from anywhere, AI routes it
            to the right place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Entity dropdown */}
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Entities</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>

          {/* Capture SLA indicators */}
          <div className="flex items-center gap-4 px-3 py-2 bg-white border border-gray-200 rounded-lg">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Capture SLA
            </span>
            <div className="w-px h-4 bg-gray-200" />
            <SlaIndicator
              label="Voice"
              targetMs={VOICE_SLA_MS}
              actualMs={sla.voiceAvgMs}
              met={sla.voiceMet}
            />
            <div className="w-px h-4 bg-gray-200" />
            <SlaIndicator
              label="Text"
              targetMs={TEXT_SLA_MS}
              actualMs={sla.textAvgMs}
              met={sla.textMet}
            />
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Stats bar                                                          */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Captures"
          value={stats.total}
          colorClass="text-gray-600"
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          colorClass="text-amber-600"
        />
        <StatCard
          label="Routed"
          value={stats.routed}
          colorClass="text-green-600"
        />
        <StatCard
          label="Failed"
          value={stats.failed}
          colorClass="text-red-600"
        />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Tab bar                                                            */}
      {/* ----------------------------------------------------------------- */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6" aria-label="Capture tabs">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count =
              tab.key === 'inbox' ? stats.pending : undefined;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`pb-3 text-sm transition-colors ${
                  isActive
                    ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span
                    className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs ${
                      isActive
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Tab content                                                        */}
      {/* ----------------------------------------------------------------- */}

      {/* ===== INBOX TAB ===== */}
      {activeTab === 'inbox' && (
        <div className="flex gap-6">
          {/* Left column: quick capture + table */}
          <div className="flex-1 space-y-4 min-w-0">
            <EnhancedQuickCaptureBar onCapture={handleCapture} />

            {captures.length === 0 ? (
              /* ----- Empty state ----- */
              <div className="flex flex-col items-center justify-center py-20 px-4 bg-white border border-gray-200 rounded-xl">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <svg
                    className="w-8 h-8 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Inbox is empty
                </h3>
                <p className="text-sm text-gray-500 text-center max-w-md mb-6">
                  Captured items will appear here. Use the capture bar above to
                  quickly grab text, voice notes, screenshots, or URLs. AI will
                  automatically route them to the right place.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    { icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z', label: 'Voice' },
                    { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', label: 'Text' },
                    { icon: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z', label: 'Screenshot' },
                    { icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1', label: 'URL' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d={item.icon}
                        />
                      </svg>
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EnhancedCaptureTable
                captures={captures}
                onApproveRouting={handleApproveRouting}
                onArchive={handleArchive}
                onReroute={handleReroute}
              />
            )}
          </div>

          {/* Right sidebar: stats/metrics */}
          <aside className="hidden lg:block w-80 shrink-0">
            <EnhancedCaptureStatsSidebar
              metrics={metrics}
              captures={captures}
            />
          </aside>
        </div>
      )}

      {/* ===== RULES TAB ===== */}
      {activeTab === 'rules' && <CaptureRulesTab />}
    </div>
  );
}
