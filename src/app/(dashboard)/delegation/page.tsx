'use client';

import React, { useState } from 'react';
import type { DelegationTask, DelegationInboxItem, DelegationScore } from '@/modules/delegation/types';

type Tab = 'inbox' | 'active' | 'scoreboard';

export default function DelegationPage() {
  const [activeTab, setActiveTab] = useState<Tab>('inbox');
  const [inbox] = useState<DelegationInboxItem[]>([]);
  const [delegations] = useState<DelegationTask[]>([]);
  const [scoreboard] = useState<DelegationScore[]>([]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'inbox', label: 'Delegation Inbox' },
    { key: 'active', label: 'Active Delegations' },
    { key: 'scoreboard', label: 'Scoreboard' },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>Delegation</h1>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #e5e7eb' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer',
              backgroundColor: 'transparent', fontWeight: activeTab === tab.key ? 600 : 400,
              borderBottom: activeTab === tab.key ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === tab.key ? '#3b82f6' : '#6b7280',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'inbox' && (
        <div>
          <p style={{ color: '#6b7280', marginBottom: '16px' }}>
            Tasks that can be delegated to free up your focus time.
          </p>
          {inbox.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
              No delegation suggestions at this time.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {inbox.map((item) => (
                <div key={item.taskId} style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600 }}>{item.taskTitle}</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: '12px', fontSize: '12px',
                      backgroundColor: item.priority === 'HIGH' ? '#fee2e2' : item.priority === 'MEDIUM' ? '#fef3c7' : '#dbeafe',
                    }}>
                      {item.priority}
                    </span>
                  </div>
                  <p style={{ fontSize: '14px', color: '#6b7280' }}>{item.reason}</p>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>
                    Est. time saved: {item.estimatedTimeSavedMinutes}min | Confidence: {Math.round(item.confidence * 100)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'active' && (
        <div>
          {delegations.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
              No active delegations.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {delegations.map((d) => (
                <div key={d.id} style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600 }}>Task: {d.taskId}</span>
                    <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', backgroundColor: '#f3f4f6' }}>
                      {d.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>
                    Delegated to: {d.delegatedTo}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    {d.approvalChain.map((step) => (
                      <span key={step.order} style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '11px',
                        backgroundColor: step.status === 'APPROVED' ? '#dcfce7' : step.status === 'REJECTED' ? '#fee2e2' : '#f3f4f6',
                      }}>
                        {step.role}: {step.status}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'scoreboard' && (
        <div>
          {scoreboard.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
              No delegation scores yet.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '12px' }}>Delegate</th>
                  <th style={{ textAlign: 'right', padding: '12px' }}>Score</th>
                  <th style={{ textAlign: 'right', padding: '12px' }}>Tasks</th>
                  <th style={{ textAlign: 'left', padding: '12px' }}>Best Category</th>
                </tr>
              </thead>
              <tbody>
                {scoreboard.map((score) => (
                  <tr key={score.delegateeId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px' }}>{score.delegateeName || score.delegateeId}</td>
                    <td style={{ textAlign: 'right', padding: '12px', fontWeight: 600 }}>{score.overallScore}</td>
                    <td style={{ textAlign: 'right', padding: '12px' }}>{score.totalTasksDelegated}</td>
                    <td style={{ padding: '12px' }}>{score.bestCategory}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
