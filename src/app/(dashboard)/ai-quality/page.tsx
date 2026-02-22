'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PeriodKey = 'this_week' | 'this_month' | 'this_quarter' | 'this_year';
type TabKey = 'scorecard' | 'golden_tests' | 'overrides' | 'bias' | 'provenance';

interface TabDef {
  key: TabKey;
  label: string;
}

interface EntityOption {
  id: string;
  name: string;
  type: string;
}

const TABS: TabDef[] = [
  { key: 'scorecard', label: 'Scorecard' },
  { key: 'golden_tests', label: 'Golden Tests' },
  { key: 'overrides', label: 'Overrides' },
  { key: 'bias', label: 'Bias' },
  { key: 'provenance', label: 'Provenance' },
];

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'this_year', label: 'This Year' },
];

// ---------------------------------------------------------------------------
// Dynamic Imports with Graceful Fallbacks
// ---------------------------------------------------------------------------

const EnhancedScorecardTab: any = dynamic(
  () =>
    import('@/modules/ai-quality/components/EnhancedScorecardTab').catch(
      () => import('@/modules/ai-quality/components/AccuracyScorecardCard')
    ) as any,
  {
    ssr: false,
    loading: () => <TabLoadingSkeleton label="Scorecard" />,
  }
);

const EnhancedGoldenTestsTab: any = dynamic(
  () =>
    import('@/modules/ai-quality/components/EnhancedGoldenTestsTab').catch(
      () => import('@/modules/ai-quality/components/GoldenTestPanel')
    ) as any,
  {
    ssr: false,
    loading: () => <TabLoadingSkeleton label="Golden Tests" />,
  }
);

const EnhancedOverridesTab: any = dynamic(
  () =>
    import('@/modules/ai-quality/components/EnhancedOverridesTab').catch(
      () => import('@/modules/ai-quality/components/OverrideAnalysisPanel')
    ) as any,
  {
    ssr: false,
    loading: () => <TabLoadingSkeleton label="Overrides" />,
  }
);

const BiasTab: any = dynamic(
  () =>
    import('@/modules/ai-quality/components/BiasTab').catch(
      () => import('@/modules/ai-quality/components/BiasReportCard')
    ) as any,
  {
    ssr: false,
    loading: () => <TabLoadingSkeleton label="Bias" />,
  }
);

const ProvenanceTab: any = dynamic(
  () =>
    import('@/modules/ai-quality/components/ProvenanceTab').catch(
      () => import('@/modules/ai-quality/components/ProvenanceViewer')
    ) as any,
  {
    ssr: false,
    loading: () => <TabLoadingSkeleton label="Provenance" />,
  }
);

// ---------------------------------------------------------------------------
// Loading Skeleton Components
// ---------------------------------------------------------------------------

function TabLoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
      <div className="h-5 w-36 rounded bg-gray-200 mb-4" />
      <div className="space-y-3">
        <div className="h-4 w-full rounded bg-gray-100" />
        <div className="h-4 w-5/6 rounded bg-gray-100" />
        <div className="h-4 w-4/6 rounded bg-gray-100" />
      </div>
      <p className="sr-only">Loading {label}...</p>
    </div>
  );
}

function PageLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-40 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-72 rounded bg-gray-100" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-40 rounded-lg bg-gray-200" />
          <div className="h-10 w-40 rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="flex gap-1 border-b border-gray-200 pb-px">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 w-28 rounded-t bg-gray-100" />
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="h-48 rounded-lg bg-gray-100" />
        <div className="h-48 rounded-lg bg-gray-100" />
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="col-span-2 h-64 rounded-lg bg-gray-100" />
        <div className="h-64 rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error Boundary Wrapper
// ---------------------------------------------------------------------------

function SafeTabRender({
  children,
  tabName,
}: {
  children: React.ReactNode;
  tabName: string;
}) {
  try {
    return <>{children}</>;
  } catch {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="text-sm font-medium text-red-800">
          Something went wrong rendering the {tabName} tab.
        </p>
        <p className="mt-1 text-sm text-red-600">
          Please try refreshing the page. If this issue persists, contact support.
        </p>
      </div>
    );
  }
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function AIQualityPage() {
  // -- State ------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<TabKey>('scorecard');
  const [entityId, setEntityId] = useState<string>('all');
  const [period, setPeriod] = useState<PeriodKey>('this_month');
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  // -- Fetch entities on mount ------------------------------------------------
  useEffect(() => {
    async function fetchEntities() {
      try {
        const res = await fetch('/api/entities').catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          const entityList: EntityOption[] = (data.data ?? []).map(
            (e: { id: string; name: string; type?: string }) => ({
              id: e.id,
              name: e.name,
              type: e.type ?? 'Unknown',
            })
          );
          setEntities(entityList);
        }
      } catch (err) {
        console.error('Failed to fetch entities:', err);
      } finally {
        setPageLoading(false);
      }
    }
    fetchEntities();
  }, []);

  // -- Loading state ----------------------------------------------------------
  if (pageLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Quality</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor and improve AI accuracy, fairness, and transparency.
          </p>
        </div>
        <PageLoadingSkeleton />
      </div>
    );
  }

  // -- Tab content renderer ---------------------------------------------------
  function renderTab() {
    switch (activeTab) {
      case 'scorecard':
        return (
          <SafeTabRender tabName="Scorecard">
            <EnhancedScorecardTab entityId={entityId} period={period} />
          </SafeTabRender>
        );
      case 'golden_tests':
        return (
          <SafeTabRender tabName="Golden Tests">
            <EnhancedGoldenTestsTab entityId={entityId} period={period} />
          </SafeTabRender>
        );
      case 'overrides':
        return (
          <SafeTabRender tabName="Overrides">
            <EnhancedOverridesTab entityId={entityId} period={period} />
          </SafeTabRender>
        );
      case 'bias':
        return (
          <SafeTabRender tabName="Bias">
            <BiasTab entityId={entityId} period={period} />
          </SafeTabRender>
        );
      case 'provenance':
        return (
          <SafeTabRender tabName="Provenance">
            <ProvenanceTab entityId={entityId} period={period} />
          </SafeTabRender>
        );
      default:
        return (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <p className="text-sm text-gray-400">Select a tab to view AI quality data.</p>
          </div>
        );
    }
  }

  // -- Render -----------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Quality</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor and improve AI accuracy, fairness, and transparency.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Entity Filter */}
          <select
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Entities</option>
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.name}
              </option>
            ))}
          </select>

          {/* Period Filter */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKey)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="AI Quality tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[300px]">{renderTab()}</div>
    </div>
  );
}
