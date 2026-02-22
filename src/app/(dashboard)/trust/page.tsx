'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { TrustScoreDashboard } from '@/engines/trust-ui/components/TrustScoreDashboard';
import { PermissionsDashboard } from '@/engines/trust-ui/components/PermissionsDashboard';
import { ConsentReceiptList } from '@/engines/trust-ui/components/ConsentReceiptList';

type TrustTab = 'overview' | 'permissions' | 'consent' | 'memory';

const TABS: { id: TrustTab; label: string; href: string }[] = [
  { id: 'overview', label: 'Overview', href: '/trust' },
  { id: 'permissions', label: 'Permissions', href: '/trust/permissions' },
  { id: 'consent', label: 'Consent Log', href: '/trust/consent' },
  { id: 'memory', label: 'Memory', href: '/trust/memory' },
];

export default function TrustOverviewPage() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<TrustTab>('overview');

  const userId = session?.user?.id ?? '';

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600 dark:border-zinc-600 dark:border-t-blue-400" />
        <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
          Loading...
        </span>
      </div>
    );
  }

  if (!session?.user?.id) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 dark:border-yellow-900/50 dark:bg-yellow-900/20">
        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
          Please sign in to view trust and safety settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Trust &amp; Transparency
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Full visibility into what AI knows, decides, and does.
          You control every permission and can audit every action.
        </p>
      </div>

      {/* Tab Navigation */}
      <nav className="flex border-b border-zinc-200 dark:border-zinc-700">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              if (tab.id === 'overview') {
                setActiveTab('overview');
              } else {
                window.location.href = tab.href;
              }
            }}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
            )}
          </button>
        ))}
      </nav>

      {/* Overview Content */}
      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Trust Scores
          </h2>
          <TrustScoreDashboard userId={userId} />
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Permissions
          </h2>
          <PermissionsDashboard userId={userId} />
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Recent Consent Receipts
          </h2>
          <ConsentReceiptList userId={userId} />
        </section>
      </div>
    </div>
  );
}
