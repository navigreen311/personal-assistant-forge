'use client';

import React, { useEffect, useState } from 'react';
import type { AttentionBudget, DNDConfig, OneThingNowState, NotificationBundle, PriorityRouting, NotificationLearning } from '@/modules/attention/types';
import { AttentionBudgetMeter } from '@/modules/attention/components/AttentionBudgetMeter';
import { DNDToggle } from '@/modules/attention/components/DNDToggle';
import { OneThingNowBanner } from '@/modules/attention/components/OneThingNowBanner';
import { NotificationDigest } from '@/modules/attention/components/NotificationDigest';
import { PriorityRoutingConfig } from '@/modules/attention/components/PriorityRoutingConfig';
import { NotificationLearningPanel } from '@/modules/attention/components/NotificationLearningPanel';

type Tab = 'overview' | 'notifications' | 'routing' | 'learning';

// Fallback demo data for attention budget if API fetch fails
const demoBudget: AttentionBudget = {
  userId: 'current-user',
  dailyBudget: 20,
  usedToday: 5,
  remaining: 15,
  resetAt: new Date(new Date().setHours(24, 0, 0, 0)),
};

const demoDndConfig: DNDConfig = {
  userId: 'current-user',
  isActive: false,
  mode: 'MANUAL',
  vipBreakthroughEnabled: true,
  vipContactIds: [],
};

const demoFocusState: OneThingNowState = {
  userId: 'current-user',
  isActive: false,
  blockedNotifications: 0,
  sessionDuration: 0,
};

const demoBundles: NotificationBundle[] = [];

const demoRoutingConfig: PriorityRouting[] = [
  { priority: 'P0', action: 'INTERRUPT', channels: ['push', 'sms'] },
  { priority: 'P1', action: 'NEXT_DIGEST', channels: ['email'] },
  { priority: 'P2', action: 'WEEKLY_REVIEW', channels: [] },
];

const demoLearning: NotificationLearning = {
  userId: 'current-user',
  patterns: [],
  suggestions: [],
};

export default function AttentionPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [budget, setBudget] = useState<AttentionBudget | null>(null);
  const [dndConfig, setDndConfig] = useState<DNDConfig | null>(null);
  const [focusState, setFocusState] = useState<OneThingNowState | null>(null);
  const [bundles, setBundles] = useState<NotificationBundle[] | null>(null);
  const [routingConfig, setRoutingConfig] = useState<PriorityRouting[] | null>(null);
  const [learning, setLearning] = useState<NotificationLearning | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const results = await Promise.allSettled([
          fetch('/api/attention/budget').then((r) => r.json()),
          fetch('/api/attention/notifications').then((r) => r.json()),
          fetch('/api/attention/dnd').then((r) => r.json()),
        ]);

        if (results[0].status === 'fulfilled' && results[0].value?.data) {
          const budgetData = results[0].value.data;
          setBudget(budgetData.budget ?? budgetData);
          if (budgetData.focusState) {
            setFocusState(budgetData.focusState);
          }
          if (budgetData.routing) {
            setRoutingConfig(budgetData.routing);
          }
          if (budgetData.learning) {
            setLearning(budgetData.learning);
          }
        }
        if (results[1].status === 'fulfilled' && results[1].value?.data) {
          setBundles(results[1].value.data);
        }
        if (results[2].status === 'fulfilled' && results[2].value?.data) {
          setDndConfig(results[2].value.data);
        }
      } catch {
        setError('Failed to load attention data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Fallback to demo data for sections that fail to load
  const budgetData: AttentionBudget = budget ?? demoBudget;
  const dndData: DNDConfig = dndConfig ?? demoDndConfig;
  const focusData: OneThingNowState = focusState ?? demoFocusState;
  const bundlesData: NotificationBundle[] = bundles ?? demoBundles;
  const routingData: PriorityRouting[] = routingConfig ?? demoRoutingConfig;
  const learningData: NotificationLearning = learning ?? demoLearning;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'routing', label: 'Priority Routing' },
    { key: 'learning', label: 'Insights' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading attention data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>Attention Governor</h1>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #e5e7eb' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer', backgroundColor: 'transparent',
              fontWeight: activeTab === tab.key ? 600 : 400,
              borderBottom: activeTab === tab.key ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === tab.key ? '#3b82f6' : '#6b7280',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <AttentionBudgetMeter budget={budgetData} />
          {focusData.isActive && <OneThingNowBanner state={focusData} />}
          <DNDToggle config={dndData} onChange={(newConfig) => setDndConfig(newConfig)} />
        </div>
      )}

      {activeTab === 'notifications' && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Notification Digest</h2>
          {bundlesData.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
              No pending notifications. All caught up!
            </div>
          ) : (
            <NotificationDigest bundles={bundlesData} />
          )}
        </div>
      )}

      {activeTab === 'routing' && (
        <PriorityRoutingConfig config={routingData} onChange={(newConfig) => setRoutingConfig(newConfig)} />
      )}

      {activeTab === 'learning' && (
        <NotificationLearningPanel learning={learningData} />
      )}
    </div>
  );
}
