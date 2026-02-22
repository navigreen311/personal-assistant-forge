'use client';

import React, { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'active' | 'playbooks' | 'history' | 'configuration';

interface EntityOption {
  id: string;
  name: string;
  type: string;
}

interface CrisisStats {
  activeCrises: number;
  daysSinceLastCrisis: number;
  playbooksCount: number;
  dmsStatus: string;
}

// ---------------------------------------------------------------------------
// Fallback components
// ---------------------------------------------------------------------------

function TabLoadingSkeleton() {
  return (
    <div style={{ padding: '24px' }}>
      <div
        style={{
          height: '200px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ color: '#9ca3af', fontSize: '14px' }}>Loading...</p>
      </div>
    </div>
  );
}

function ActiveFallback() {
  return (
    <div
      style={{
        padding: '24px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        textAlign: 'center',
      }}
    >
      <p style={{ color: '#6b7280', fontWeight: 600, marginBottom: '4px' }}>
        Active Crises
      </p>
      <p style={{ color: '#9ca3af', fontSize: '14px' }}>
        Enhanced active crisis view is not available. Showing placeholder.
      </p>
    </div>
  );
}

function PlaybooksFallback() {
  return (
    <div
      style={{
        padding: '24px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        textAlign: 'center',
      }}
    >
      <p style={{ color: '#6b7280', fontWeight: 600, marginBottom: '4px' }}>
        Crisis Playbooks
      </p>
      <p style={{ color: '#9ca3af', fontSize: '14px' }}>
        Playbook management is not available. Showing placeholder.
      </p>
    </div>
  );
}

function HistoryFallback() {
  return (
    <div
      style={{
        padding: '24px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        textAlign: 'center',
      }}
    >
      <p style={{ color: '#6b7280', fontWeight: 600, marginBottom: '4px' }}>
        Crisis History
      </p>
      <p style={{ color: '#9ca3af', fontSize: '14px' }}>
        Crisis history view is not available. Showing placeholder.
      </p>
    </div>
  );
}

function ConfigFallback() {
  return (
    <div
      style={{
        padding: '24px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        textAlign: 'center',
      }}
    >
      <p style={{ color: '#6b7280', fontWeight: 600, marginBottom: '4px' }}>
        Crisis Configuration
      </p>
      <p style={{ color: '#9ca3af', fontSize: '14px' }}>
        Configuration panel is not available. Showing placeholder.
      </p>
    </div>
  );
}

function ModalFallback() {
  return null;
}

// ---------------------------------------------------------------------------
// Dynamic imports with catch fallbacks
// ---------------------------------------------------------------------------

const EnhancedActiveTab: any = dynamic(
  () =>
    import('@/modules/crisis/components/EnhancedActiveTab').catch(() => ({
      default: ActiveFallback,
    })) as any,
  { ssr: false, loading: () => <TabLoadingSkeleton /> },
);

const CrisisPlaybooksTab: any = dynamic(
  () =>
    import('@/modules/crisis/components/CrisisPlaybooksTab').catch(() => ({
      default: PlaybooksFallback,
    })) as any,
  { ssr: false, loading: () => <TabLoadingSkeleton /> },
);

const CrisisHistoryTab: any = dynamic(
  () =>
    import('@/modules/crisis/components/CrisisHistoryTab').catch(() => ({
      default: HistoryFallback,
    })) as any,
  { ssr: false, loading: () => <TabLoadingSkeleton /> },
);

const CrisisConfigTab: any = dynamic(
  () =>
    import('@/modules/crisis/components/CrisisConfigTab').catch(() => ({
      default: ConfigFallback,
    })) as any,
  { ssr: false, loading: () => <TabLoadingSkeleton /> },
);

const DeclareCrisisModal: any = dynamic(
  () =>
    import('@/modules/crisis/components/DeclareCrisisModal').catch(() => ({
      default: ModalFallback,
    })) as any,
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Stats default
// ---------------------------------------------------------------------------

const DEFAULT_STATS: CrisisStats = {
  activeCrises: 0,
  daysSinceLastCrisis: 0,
  playbooksCount: 0,
  dmsStatus: 'Unknown',
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function CrisisPage() {
  const [activeTab, setActiveTab] = useState<Tab>('active');
  const [stats, setStats] = useState<CrisisStats>(DEFAULT_STATS);
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [showDeclareModal, setShowDeclareModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Fetch stats from /api/crisis ----
  const fetchStats = useCallback(async (entityId: string) => {
    try {
      const params = entityId ? `?entityId=${entityId}` : '';
      const res = await fetch(`/api/crisis${params}`).catch(() => null);

      if (!res || !res.ok) {
        setStats(DEFAULT_STATS);
        return;
      }

      const json = await res.json().catch(() => null);
      const crises: any[] = json?.data ?? [];

      // BUG FIX: Derive active count from actual API data, not hardcoded values.
      // The old page fell back to sample demo data when the API returned an empty
      // array, which caused the alert banner to always show an active crisis even
      // when none existed. Now we use zero-defaults and only count real records.
      const activeStatuses = ['DETECTED', 'ACKNOWLEDGED', 'IN_PROGRESS'];
      const activeCrises = Array.isArray(crises)
        ? crises.filter((c: any) => c && activeStatuses.includes(c.status)).length
        : 0;

      // Compute days since last crisis
      let daysSinceLastCrisis = 0;
      if (Array.isArray(crises) && crises.length > 0) {
        const resolvedCrises = crises
          .filter((c: any) => c?.resolvedAt)
          .map((c: any) => new Date(c.resolvedAt).getTime())
          .filter((t: number) => !isNaN(t));

        if (resolvedCrises.length > 0) {
          const mostRecent = Math.max(...resolvedCrises);
          daysSinceLastCrisis = Math.floor(
            (Date.now() - mostRecent) / (1000 * 60 * 60 * 24),
          );
        }
      }

      // Fetch playbooks count
      let playbooksCount = 0;
      try {
        const pbRes = await fetch('/api/crisis/playbooks').catch(() => null);
        if (pbRes && pbRes.ok) {
          const pbJson = await pbRes.json().catch(() => null);
          const pbData = pbJson?.data;
          playbooksCount = Array.isArray(pbData) ? pbData.length : 0;
        }
      } catch {
        // Keep default
      }

      // Fetch DMS status
      let dmsStatus = 'Unknown';
      try {
        const dmsRes = await fetch('/api/crisis/dms').catch(() => null);
        if (dmsRes && dmsRes.ok) {
          const dmsJson = await dmsRes.json().catch(() => null);
          const dmsData = dmsJson?.data;
          if (dmsData) {
            dmsStatus = dmsData.isEnabled ? 'Active' : 'Disabled';
          }
        }
      } catch {
        // Keep default
      }

      setStats({
        activeCrises,
        daysSinceLastCrisis,
        playbooksCount,
        dmsStatus,
      });
    } catch {
      setStats(DEFAULT_STATS);
    }
  }, []);

  // ---- Fetch entities ----
  useEffect(() => {
    async function init() {
      setLoading(true);
      setError(null);

      try {
        // Fetch entities for filter
        try {
          const res = await fetch('/api/entities').catch(() => null);
          if (res && res.ok) {
            const data = await res.json().catch(() => null);
            const entityList: EntityOption[] = (data?.data ?? []).map(
              (e: any) => ({
                id: e?.id ?? '',
                name: e?.name ?? 'Unknown',
                type: e?.type ?? '',
              }),
            );
            setEntities(entityList);
          }
        } catch {
          // Entities are optional
        }

        // Fetch stats
        await fetchStats('');
      } catch {
        setError('Failed to load crisis data. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [fetchStats]);

  // ---- Refetch stats when entity changes ----
  useEffect(() => {
    if (!loading) {
      fetchStats(selectedEntityId);
    }
  }, [selectedEntityId, loading, fetchStats]);

  // ---- Refresh handler for child tabs ----
  const handleRefresh = useCallback(() => {
    fetchStats(selectedEntityId);
  }, [fetchStats, selectedEntityId]);

  // ---- Entity ID prop ----
  const entityIdProp = selectedEntityId || undefined;

  // ---- Tab definitions ----
  const tabs: { key: Tab; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'playbooks', label: 'Playbooks' },
    { key: 'history', label: 'History' },
    { key: 'configuration', label: 'Configuration' },
  ];

  // ------- Loading skeleton -------
  if (loading) {
    return (
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div
          style={{
            height: '28px',
            width: '260px',
            backgroundColor: '#e5e7eb',
            borderRadius: '6px',
            marginBottom: '8px',
          }}
        />
        <div
          style={{
            height: '16px',
            width: '420px',
            backgroundColor: '#f3f4f6',
            borderRadius: '4px',
            marginBottom: '24px',
          }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: '80px',
                backgroundColor: '#f3f4f6',
                borderRadius: '8px',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: '36px',
                width: '120px',
                backgroundColor: '#f3f4f6',
                borderRadius: '6px',
              }}
            />
          ))}
        </div>
        <div
          style={{
            height: '200px',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
          }}
        />
      </div>
    );
  }

  // ------- Error state -------
  if (error) {
    return (
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
          Crisis Management
        </h1>
        <div
          style={{
            padding: '24px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#dc2626',
            textAlign: 'center',
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: '8px' }}>
            Something went wrong
          </p>
          <p style={{ fontSize: '14px' }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              backgroundColor: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ------- Main render -------
  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '4px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>
            Crisis Management
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '0' }}>
            Detect, escalate, and resolve crises with automated playbooks.
          </p>
        </div>

        <button
          onClick={() => setShowDeclareModal(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: '#dc2626',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            transition: 'background-color 0.15s',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          onMouseEnter={(e) =>
            ((e.target as HTMLElement).style.backgroundColor = '#b91c1c')
          }
          onMouseLeave={(e) =>
            ((e.target as HTMLElement).style.backgroundColor = '#dc2626')
          }
        >
          🚨 Declare Crisis
        </button>
      </div>

      {/* Entity filter */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '16px',
          marginBottom: '20px',
        }}
      >
        <label
          htmlFor="crisis-entity-select"
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#374151',
            whiteSpace: 'nowrap',
          }}
        >
          Entity:
        </label>
        <select
          id="crisis-entity-select"
          value={selectedEntityId}
          onChange={(e) => setSelectedEntityId(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            backgroundColor: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            minWidth: '180px',
            outline: 'none',
          }}
        >
          <option value="">All Entities</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
              {entity.type ? ` (${entity.type})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {/* Active Crises */}
        <div
          style={{
            padding: '16px',
            borderRadius: '8px',
            border: `1px solid ${stats.activeCrises > 0 ? '#fecaca' : '#e5e7eb'}`,
            backgroundColor: stats.activeCrises > 0 ? '#fef2f2' : '#fff',
          }}
        >
          <p
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: stats.activeCrises > 0 ? '#dc2626' : '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '4px',
            }}
          >
            Active Crises
          </p>
          <p
            style={{
              fontSize: '28px',
              fontWeight: 700,
              color: stats.activeCrises > 0 ? '#dc2626' : '#111827',
            }}
          >
            {stats.activeCrises}
          </p>
        </div>

        {/* Days Since Last Crisis */}
        <div
          style={{
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            backgroundColor: '#fff',
          }}
        >
          <p
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '4px',
            }}
          >
            Days Since Last Crisis
          </p>
          <p style={{ fontSize: '28px', fontWeight: 700, color: '#111827' }}>
            {stats.daysSinceLastCrisis}
          </p>
        </div>

        {/* Playbooks */}
        <div
          style={{
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            backgroundColor: '#fff',
          }}
        >
          <p
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '4px',
            }}
          >
            Playbooks
          </p>
          <p style={{ fontSize: '28px', fontWeight: 700, color: '#111827' }}>
            {stats.playbooksCount}
          </p>
        </div>

        {/* Dead Man Switch */}
        <div
          style={{
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            backgroundColor: '#fff',
          }}
        >
          <p
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '4px',
            }}
          >
            Dead Man Switch
          </p>
          <p
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color:
                stats.dmsStatus === 'Active'
                  ? '#16a34a'
                  : stats.dmsStatus === 'Disabled'
                    ? '#9ca3af'
                    : '#6b7280',
            }}
          >
            {stats.dmsStatus}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '24px',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 20px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              fontWeight: activeTab === tab.key ? 600 : 400,
              borderBottom:
                activeTab === tab.key
                  ? '2px solid #3b82f6'
                  : '2px solid transparent',
              color: activeTab === tab.key ? '#3b82f6' : '#6b7280',
              fontSize: '14px',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'active' && (
        <EnhancedActiveTab
          entityId={entityIdProp}
          onRefresh={handleRefresh}
        />
      )}

      {activeTab === 'playbooks' && (
        <CrisisPlaybooksTab
          entityId={entityIdProp}
          onRefresh={handleRefresh}
        />
      )}

      {activeTab === 'history' && (
        <CrisisHistoryTab
          entityId={entityIdProp}
          onRefresh={handleRefresh}
        />
      )}

      {activeTab === 'configuration' && (
        <CrisisConfigTab
          entityId={entityIdProp}
          onRefresh={handleRefresh}
        />
      )}

      {/* Declare Crisis Modal */}
      {showDeclareModal && (
        <DeclareCrisisModal
          entityId={entityIdProp}
          onClose={() => setShowDeclareModal(false)}
          onSuccess={() => {
            setShowDeclareModal(false);
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}
