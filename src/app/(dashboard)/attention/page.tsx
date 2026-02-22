'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AttentionBudgetMeter } from '@/modules/attention/components/AttentionBudgetMeter';
import { DNDToggle } from '@/modules/attention/components/DNDToggle';
import { NotificationDigest } from '@/modules/attention/components/NotificationDigest';
import { PriorityRoutingConfig } from '@/modules/attention/components/PriorityRoutingConfig';
import { NotificationLearningPanel } from '@/modules/attention/components/NotificationLearningPanel';

// ---------------------------------------------------------------------------
// Dynamic imports with inline fallbacks
// ---------------------------------------------------------------------------

const EnhancedOverviewTab: any = dynamic(
  () =>
    import('@/modules/attention/components/EnhancedOverviewTab').catch(
      () => ({
        default: ({ budget, dnd }: any) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {budget && <AttentionBudgetMeter budget={budget} />}
            {dnd && (
              <DNDToggle config={dnd} onChange={() => {}} />
            )}
            {!budget && !dnd && (
              <p style={{ color: '#9ca3af' }}>No overview data available.</p>
            )}
          </div>
        ),
      }),
    ) as any,
  { ssr: false },
);

const NotificationsTab: any = dynamic(
  () =>
    import('@/modules/attention/components/NotificationsTab').catch(
      () => ({
        default: (props: any) => (
          <NotificationDigest {...props} />
        ),
      }),
    ) as any,
  { ssr: false },
);

const PriorityRoutingTab: any = dynamic(
  () =>
    import('@/modules/attention/components/PriorityRoutingTab').catch(
      () => ({
        default: (props: any) => (
          <PriorityRoutingConfig {...props} />
        ),
      }),
    ) as any,
  { ssr: false },
);

const InsightsTab: any = dynamic(
  () =>
    import('@/modules/attention/components/InsightsTab').catch(
      () => ({
        default: (props: any) => (
          <NotificationLearningPanel {...props} />
        ),
      }),
    ) as any,
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'overview' | 'notifications' | 'routing' | 'insights';

interface BudgetData {
  dailyBudget?: number;
  usedToday?: number;
  remaining?: number;
  [key: string]: any;
}

interface DNDData {
  isActive?: boolean;
  mode?: string;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AttentionPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [dnd, setDnd] = useState<DNDData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // For future use - entity scoping
  const entityId: string | undefined = undefined;
  const period = 'daily';

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const [budgetRes, dndRes] = await Promise.allSettled([
          fetch('/api/attention/budget').then((r) => r.json()),
          fetch('/api/attention/dnd').then((r) => r.json()),
        ]);

        if (budgetRes.status === 'fulfilled' && budgetRes.value?.data) {
          setBudget(budgetRes.value.data?.budget ?? budgetRes.value.data);
        }

        if (dndRes.status === 'fulfilled' && dndRes.value?.data) {
          setDnd(dndRes.value.data);
        }
      } catch {
        setError('Failed to load attention data. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'routing', label: 'Priority Routing' },
    { key: 'insights', label: 'Insights' },
  ];

  // ------- Loading skeleton -------
  if (loading) {
    return (
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div
          style={{
            height: '28px',
            width: '220px',
            backgroundColor: '#e5e7eb',
            borderRadius: '6px',
            marginBottom: '8px',
          }}
        />
        <div
          style={{
            height: '16px',
            width: '360px',
            backgroundColor: '#f3f4f6',
            borderRadius: '4px',
            marginBottom: '24px',
          }}
        />
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
          Attention Governor
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
          <p style={{ fontWeight: 600, marginBottom: '8px' }}>Something went wrong</p>
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
      {/* Header */}
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>
        Attention Governor
      </h1>
      <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
        Protect your focus. Control when and how you&apos;re interrupted.
      </p>

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
      {activeTab === 'overview' && (
        <EnhancedOverviewTab
          budget={budget}
          dnd={dnd}
          entityId={entityId}
          period={period}
        />
      )}

      {activeTab === 'notifications' && (
        <NotificationsTab entityId={entityId} period={period} />
      )}

      {activeTab === 'routing' && (
        <PriorityRoutingTab entityId={entityId} period={period} />
      )}

      {activeTab === 'insights' && (
        <InsightsTab entityId={entityId} period={period} />
      )}
    </div>
  );
}
