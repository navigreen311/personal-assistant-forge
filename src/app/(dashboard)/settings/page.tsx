'use client';

import React, { useState } from 'react';
import type { OrgPolicy, DLPRule, SSOConfig } from '@/modules/admin/types';

type Tab = 'policies' | 'dlp' | 'sso' | 'ediscovery';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('policies');
  const [policies] = useState<OrgPolicy[]>([]);
  const [dlpRules] = useState<DLPRule[]>([]);
  const [ssoConfig] = useState<SSOConfig>({ entityId: '', provider: 'NONE', isEnabled: false });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'policies', label: 'Org Policies' },
    { key: 'dlp', label: 'DLP Rules' },
    { key: 'sso', label: 'SSO Configuration' },
    { key: 'ediscovery', label: 'eDiscovery' },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>Admin Settings</h1>

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

      {activeTab === 'policies' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Organization Policies</h2>
            <button style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              Add Policy
            </button>
          </div>
          {policies.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No policies configured.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {policies.map((policy) => (
                <div key={policy.id} style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{policy.name}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{policy.type}</div>
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: '12px', fontSize: '12px', alignSelf: 'center',
                    backgroundColor: policy.isActive ? '#dcfce7' : '#fee2e2',
                    color: policy.isActive ? '#166534' : '#991b1b',
                  }}>
                    {policy.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'dlp' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Data Loss Prevention Rules</h2>
            <button style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              Add Rule
            </button>
          </div>
          {dlpRules.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No DLP rules configured.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {dlpRules.map((rule) => (
                <div key={rule.id} style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{rule.name}</span>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>{rule.action} | {rule.scope}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px', fontFamily: 'monospace' }}>
                    Pattern: {rule.pattern}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'sso' && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>SSO Configuration</h2>
          <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span>Provider: <strong>{ssoConfig.provider}</strong></span>
              <span style={{
                padding: '2px 8px', borderRadius: '12px', fontSize: '12px',
                backgroundColor: ssoConfig.isEnabled ? '#dcfce7' : '#f3f4f6',
                color: ssoConfig.isEnabled ? '#166534' : '#6b7280',
              }}>
                {ssoConfig.isEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            {ssoConfig.issuerUrl && <div style={{ fontSize: '14px', color: '#6b7280' }}>Issuer: {ssoConfig.issuerUrl}</div>}
            <button style={{ marginTop: '12px', padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              Configure SSO
            </button>
          </div>
        </div>
      )}

      {activeTab === 'ediscovery' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>eDiscovery Exports</h2>
            <button style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              New Export Request
            </button>
          </div>
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
            No export requests yet.
          </div>
        </div>
      )}
    </div>
  );
}
