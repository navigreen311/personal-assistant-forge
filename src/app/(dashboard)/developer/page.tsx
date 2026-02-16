'use client';

import React, { useState } from 'react';
import type { PluginDefinition, WebhookConfig, CustomToolDefinition, PluginSecurityReview } from '@/modules/developer/types';
import { PluginRegistry } from '@/modules/developer/components/PluginRegistry';
import { WebhookManager } from '@/modules/developer/components/WebhookManager';
import { CustomToolEditor } from '@/modules/developer/components/CustomToolEditor';
import { SecurityReviewPanel } from '@/modules/developer/components/SecurityReviewPanel';

type Tab = 'plugins' | 'webhooks' | 'tools' | 'security';

export default function DeveloperPage() {
  const [activeTab, setActiveTab] = useState<Tab>('plugins');
  const [plugins] = useState<PluginDefinition[]>([]);
  const [webhooks] = useState<WebhookConfig[]>([]);
  const [selectedReview] = useState<PluginSecurityReview | null>(null);

  const handleSaveTool = (_tool: Omit<CustomToolDefinition, 'id'>) => {
    // Placeholder: would POST to /api/developer/tools
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'plugins', label: 'Plugins' },
    { key: 'webhooks', label: 'Webhooks' },
    { key: 'tools', label: 'Custom Tools' },
    { key: 'security', label: 'Security Reviews' },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>Developer Platform</h1>

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

      {activeTab === 'plugins' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <p style={{ color: '#6b7280' }}>Manage plugins and extensions for the platform.</p>
            <button style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              Register Plugin
            </button>
          </div>
          {plugins.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
              No plugins registered yet. Create your first plugin to get started.
            </div>
          ) : (
            <PluginRegistry plugins={plugins} />
          )}
        </div>
      )}

      {activeTab === 'webhooks' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <p style={{ color: '#6b7280' }}>Configure inbound and outbound webhooks.</p>
            <button style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              Create Webhook
            </button>
          </div>
          <WebhookManager webhooks={webhooks} />
        </div>
      )}

      {activeTab === 'tools' && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Create Custom Tool</h2>
          <CustomToolEditor onSave={handleSaveTool} />
        </div>
      )}

      {activeTab === 'security' && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Security Reviews</h2>
          {selectedReview ? (
            <SecurityReviewPanel review={selectedReview} />
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
              Select a plugin to view its security review status.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
