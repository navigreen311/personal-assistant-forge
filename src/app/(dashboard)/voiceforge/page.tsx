'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { Campaign, ManagedNumber, VoicePersona } from '@/modules/voiceforge/types';
import type { Call, Entity } from '@/shared/types';
import { OutcomeBadge } from '@/modules/voiceforge/components/OutcomeBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = 'dashboard' | 'calls' | 'campaigns' | 'scripts' | 'personas' | 'numbers' | 'settings';

interface VoiceStats {
  totalCalls: number;
  todayCalls: number;
  connectRate: number;
  activeCampaigns: number;
  phoneNumbers: number;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'calls', label: 'Calls' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'scripts', label: 'Scripts' },
  { key: 'personas', label: 'Personas' },
  { key: 'numbers', label: 'Numbers' },
  { key: 'settings', label: 'Settings' },
];

// ---------------------------------------------------------------------------
// Dynamic imports for subpages and modals
// ---------------------------------------------------------------------------

const CallsPage = dynamic(
  () => import('@/app/(dashboard)/voiceforge/calls/page'),
  { ssr: false, loading: () => <TabPlaceholder label="Calls" /> },
);

const CampaignsPage = dynamic(
  () => import('@/app/(dashboard)/voiceforge/campaigns/page'),
  { ssr: false, loading: () => <TabPlaceholder label="Campaigns" /> },
);

const ScriptsPage = dynamic(
  () => import('@/app/(dashboard)/voiceforge/scripts/page'),
  { ssr: false, loading: () => <TabPlaceholder label="Scripts" /> },
);

const PersonasPage = dynamic(
  () => import('@/app/(dashboard)/voiceforge/personas/page'),
  { ssr: false, loading: () => <TabPlaceholder label="Personas" /> },
);

const PlaceCallModal = dynamic(
  () => import('@/modules/voiceforge/components/PlaceCallModal'),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function TabPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sm text-gray-400">Loading {label}...</p>
    </div>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{label}</h3>
      <p className="text-sm text-gray-500">Coming soon.</p>
    </div>
  );
}

function timeAgo(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function VoiceForgePage() {
  // Data state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [numbers, setNumbers] = useState<ManagedNumber[]>([]);
  const [personas, setPersonas] = useState<VoicePersona[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [showPlaceCall, setShowPlaceCall] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchEntities = useCallback(async () => {
    try {
      const res = await fetch('/api/entities');
      const json = await res.json();
      if (json.data) setEntities(json.data);
    } catch {
      // Entities are optional for filter dropdown
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const entityParam = selectedEntityId ? `entityId=${selectedEntityId}` : 'entityId=default';
    try {
      const [campaignRes, callRes, numberRes, personaRes] = await Promise.all([
        fetch(`/api/voice/campaigns?${entityParam}`).then((r) => r.json()).catch(() => ({ data: [] })),
        fetch(`/api/voice/calls?${entityParam}&limit=5`).then((r) => r.json()).catch(() => ({ data: [] })),
        fetch(`/api/voice/numbers?${entityParam}`).then((r) => r.json()).catch(() => ({ data: [] })),
        fetch(`/api/voice/persona?${entityParam}`).then((r) => r.json()).catch(() => ({ data: [] })),
      ]);
      setCampaigns(campaignRes.data ?? []);
      setCalls(callRes.data ?? []);
      setNumbers(numberRes.data ?? []);
      setPersonas(personaRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [selectedEntityId]);

  useEffect(() => { fetchEntities(); }, [fetchEntities]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Computed stats
  // ---------------------------------------------------------------------------

  const stats: VoiceStats = useMemo(() => {
    const totalCalls = calls.length;
    const today = new Date().toDateString();
    const todayCalls = calls.filter((c) => new Date(c.createdAt).toDateString() === today).length;
    const connected = calls.filter((c) => c.outcome === 'CONNECTED' || c.outcome === 'INTERESTED').length;
    const connectRate = totalCalls > 0 ? Math.round((connected / totalCalls) * 100) : 0;
    const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE').length;
    const phoneNumbers = numbers.length;
    return { totalCalls, todayCalls, connectRate, activeCampaigns, phoneNumbers };
  }, [calls, campaigns, numbers]);

  // ---------------------------------------------------------------------------
  // Loading skeleton
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-56 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-96 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-32 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-10 w-36 bg-gray-200 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
              <div className="h-4 w-20 bg-gray-200 rounded mb-2" />
              <div className="h-8 w-12 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
        <div className="h-10 w-full bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white border border-gray-200 rounded-lg p-4 h-40" />
          ))}
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
      {/* Page Header                                                        */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">VoiceForge AI Engine</h1>
          <p className="text-sm text-gray-500 mt-1">
            AI-powered calling: outbound campaigns, inbound screening, and voice-first operations.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Entity dropdown */}
          <select
            value={selectedEntityId}
            onChange={(e) => setSelectedEntityId(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Entities</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>{entity.name}</option>
            ))}
          </select>

          {/* Place Call button */}
          <button
            onClick={() => setShowPlaceCall(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            + Place Call
          </button>

          {/* New Campaign button */}
          <Link
            href="/voiceforge/campaigns"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            + New Campaign
          </Link>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Stats Bar (5 cards)                                                */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Total Calls</p>
          <p className="text-2xl font-bold text-gray-600 mt-1">{stats.totalCalls}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Today Calls</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.todayCalls}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Connect Rate</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.connectRate}%</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Active Campaigns</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.activeCampaigns}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Phone Numbers</p>
          <p className="text-2xl font-bold text-gray-600 mt-1">{stats.phoneNumbers}</p>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Navigation Tabs                                                    */}
      {/* ----------------------------------------------------------------- */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap pb-3 px-1 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700 hover:border-b-2 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Tab Content                                                        */}
      {/* ----------------------------------------------------------------- */}
      {activeTab === 'dashboard' && (
        <DashboardTab
          campaigns={campaigns}
          calls={calls}
          numbers={numbers}
          personas={personas}
          entities={entities}
          onPlaceCall={() => setShowPlaceCall(true)}
        />
      )}

      {activeTab === 'calls' && <CallsPage />}
      {activeTab === 'campaigns' && <CampaignsPage />}
      {activeTab === 'scripts' && <ScriptsPage />}
      {activeTab === 'personas' && <PersonasPage />}
      {activeTab === 'numbers' && <ComingSoon label="Numbers" />}
      {activeTab === 'settings' && <ComingSoon label="Settings" />}

      {/* ----------------------------------------------------------------- */}
      {/* Place Call Modal                                                   */}
      {/* ----------------------------------------------------------------- */}
      {showPlaceCall && (
        <PlaceCallModal
          isOpen={showPlaceCall}
          onClose={() => setShowPlaceCall(false)}
          onCallPlaced={() => {
            setShowPlaceCall(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Dashboard Tab
// ===========================================================================

function DashboardTab({
  campaigns,
  calls,
  numbers,
  personas,
  entities,
  onPlaceCall,
}: {
  campaigns: Campaign[];
  calls: Call[];
  numbers: ManagedNumber[];
  personas: VoicePersona[];
  entities: Entity[];
  onPlaceCall: () => void;
}) {
  const entityName = (entityId: string) => {
    const e = entities.find((ent) => ent.id === entityId);
    return e?.name ?? entityId;
  };

  return (
    <div className="space-y-8">
      {/* ----- Active Campaigns ----- */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Active Campaigns</h2>
        {campaigns.filter((c) => c.status === 'ACTIVE' || c.status === 'PAUSED' || c.status === 'DRAFT').length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {campaigns
              .filter((c) => c.status === 'ACTIVE' || c.status === 'PAUSED' || c.status === 'DRAFT')
              .map((campaign) => {
                const progress = campaign.stats.totalTargeted > 0
                  ? Math.round((campaign.stats.totalCalled / campaign.stats.totalTargeted) * 100)
                  : 0;
                const connectRate = campaign.stats.totalCalled > 0
                  ? Math.round((campaign.stats.totalConnected / campaign.stats.totalCalled) * 100)
                  : 0;

                const statusStyle =
                  campaign.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                  campaign.status === 'PAUSED' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-700';

                const statusLabel =
                  campaign.status === 'ACTIVE' ? 'Live' :
                  campaign.status === 'PAUSED' ? 'Paused' :
                  'Draft';

                return (
                  <div key={campaign.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {entityName(campaign.entityId)}
                        </span>
                        <h3 className="text-sm font-semibold text-gray-900 truncate">{campaign.name}</h3>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle}`}>
                        {statusLabel}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">
                          {campaign.stats.totalCalled}/{campaign.stats.totalTargeted} contacted
                        </span>
                        <span className="text-xs font-medium text-gray-700">{progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-xs text-gray-600 mb-3">
                      <span>Connect: <span className="font-medium">{connectRate}%</span></span>
                      <span>Started: <span className="font-medium">{new Date(campaign.createdAt).toLocaleDateString()}</span></span>
                      <span>Interested: <span className="font-medium text-green-600">{campaign.stats.totalInterested}</span></span>
                      <span>Callback: <span className="font-medium text-blue-600">{campaign.stats.totalNoAnswer}</span></span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      {campaign.status === 'ACTIVE' && (
                        <button className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
                          Pause
                        </button>
                      )}
                      {campaign.status === 'PAUSED' && (
                        <button className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
                          Resume
                        </button>
                      )}
                      <Link
                        href={`/voiceforge/campaigns`}
                        className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        View
                      </Link>
                      <button className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                        Stats
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-sm text-gray-500">
              No active campaigns.{' '}
              <Link href="/voiceforge/campaigns" className="text-blue-600 hover:underline font-medium">
                + Start a Campaign
              </Link>{' '}
              to begin outreach.
            </p>
          </div>
        )}
      </section>

      {/* ----- Recent Calls ----- */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Recent Calls</h2>
          <Link href="/voiceforge/calls" className="text-sm text-blue-600 hover:underline font-medium">
            View all &rarr;
          </Link>
        </div>
        {calls.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Direction</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Outcome</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {calls.slice(0, 5).map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${call.direction === 'INBOUND' ? 'text-blue-600' : 'text-purple-600'}`}>
                        {call.direction === 'OUTBOUND' ? '\u2192 Out' : '\u2190 In'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{call.contactId ?? 'Unknown'}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {entityName(call.entityId)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{formatDuration(call.duration)}</td>
                    <td className="px-4 py-3">
                      {call.outcome ? <OutcomeBadge outcome={call.outcome} /> : <span className="text-xs text-gray-400">--</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(call.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {call.recordingUrl && (
                          <button className="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="Play recording">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                        <button className="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="View summary">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-sm text-gray-500">
              No recent calls.{' '}
              <button onClick={onPlaceCall} className="text-blue-600 hover:underline font-medium">
                + Place Your First Call
              </button>{' '}
              to get started.
            </p>
          </div>
        )}
      </section>

      {/* ----- Phone Numbers ----- */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Phone Numbers</h2>
          <button className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Provision New Number
          </button>
        </div>
        {numbers.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Number</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Inbound</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {numbers.map((num) => (
                  <tr key={num.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-gray-900">{num.phoneNumber}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {entityName(num.entityId)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${num.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <span className="text-xs text-gray-700">{num.status}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`relative w-9 h-5 rounded-full transition-colors ${num.inboundConfigId ? 'bg-blue-600' : 'bg-gray-300'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${num.inboundConfigId ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-sm text-gray-500">
              No numbers provisioned.{' '}
              <button className="text-blue-600 hover:underline font-medium">
                + Add a Phone Number
              </button>{' '}
              to enable calling.
            </p>
          </div>
        )}
      </section>

      {/* ----- Personas ----- */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Personas</h2>
          <Link href="/voiceforge/personas" className="text-sm text-blue-600 hover:underline font-medium">
            Manage &rarr;
          </Link>
        </div>
        {personas.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {personas.map((p) => (
              <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-lg">&#x1F399;</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{p.name}</h3>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {entityName(p.entityId)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{p.description}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-3">
                  <span>{p.voiceConfig.provider}</span>
                  <span className="text-gray-300">|</span>
                  <span>{p.voiceConfig.language}</span>
                  {p.voiceConfig.accent && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span>{p.voiceConfig.accent}</span>
                    </>
                  )}
                  <span className="text-gray-300">|</span>
                  <span>Speed: {p.voiceConfig.speed}x</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                    Preview
                  </button>
                  <Link
                    href="/voiceforge/personas"
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))}
            {/* Add new persona card */}
            <Link
              href="/voiceforge/personas"
              className="flex flex-col items-center justify-center bg-white rounded-lg border-2 border-dashed border-gray-300 p-6 hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer min-h-[160px]"
            >
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-500">+ New Persona</span>
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-sm text-gray-500">
              No personas created.{' '}
              <Link href="/voiceforge/personas" className="text-blue-600 hover:underline font-medium">
                + Create a Persona
              </Link>{' '}
              to give your AI a voice.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
