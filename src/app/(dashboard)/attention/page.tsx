'use client';

import React, { useState } from 'react';
import type { AttentionBudget, DNDConfig, OneThingNowState, NotificationBundle, PriorityRouting, NotificationLearning } from '@/modules/attention/types';
import { AttentionBudgetMeter } from '@/modules/attention/components/AttentionBudgetMeter';
import { DNDToggle } from '@/modules/attention/components/DNDToggle';
import { OneThingNowBanner } from '@/modules/attention/components/OneThingNowBanner';
import { NotificationDigest } from '@/modules/attention/components/NotificationDigest';
import { PriorityRoutingConfig } from '@/modules/attention/components/PriorityRoutingConfig';
import { NotificationLearningPanel } from '@/modules/attention/components/NotificationLearningPanel';

type Tab = 'overview' | 'notifications' | 'routing' | 'learning';

export default function AttentionPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [budget] = useState<AttentionBudget>({
    userId: 'current-user',
    dailyBudget: 20,
    usedToday: 5,
    remaining: 15,
    resetAt: new Date(new Date().setHours(24, 0, 0, 0)),
  });

  const [dndConfig, setDndConfig] = useState<DNDConfig>({
    userId: 'current-user',
    isActive: false,
    mode: 'MANUAL',
    vipBreakthroughEnabled: true,
    vipContactIds: [],
  });

  const [focusState] = useState<OneThingNowState>({
    userId: 'current-user',
    isActive: false,
    blockedNotifications: 0,
    sessionDuration: 0,
  });

  const [bundles] = useState<NotificationBundle[]>([]);

  const [routingConfig, setRoutingConfig] = useState<PriorityRouting[]>([
    { priority: 'P0', action: 'INTERRUPT', channels: ['push', 'sms'] },
    { priority: 'P1', action: 'NEXT_DIGEST', channels: ['email'] },
    { priority: 'P2', action: 'WEEKLY_REVIEW', channels: [] },
  ]);

  const [learning] = useState<NotificationLearning>({
    userId: 'current-user',
    patterns: [],
    suggestions: [],
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'routing', label: 'Priority Routing' },
    { key: 'learning', label: 'Insights' },
  ];

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
          <AttentionBudgetMeter budget={budget} />
          {focusState.isActive && <OneThingNowBanner state={focusState} />}
          <DNDToggle config={dndConfig} onChange={setDndConfig} />
        </div>
      )}

      {activeTab === 'notifications' && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Notification Digest</h2>
          {bundles.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
              No pending notifications. All caught up!
            </div>
          ) : (
            <NotificationDigest bundles={bundles} />
          )}
        </div>
      )}

      {activeTab === 'routing' && (
        <PriorityRoutingConfig config={routingConfig} onChange={setRoutingConfig} />
      )}

      {activeTab === 'learning' && (
        <NotificationLearningPanel learning={learning} />
      )}
    </div>
  );
}
