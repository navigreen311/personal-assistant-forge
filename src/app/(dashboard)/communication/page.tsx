'use client';

import DraftComposer from '@/modules/communication/components/DraftComposer';
import BroadcastComposer from '@/modules/communication/components/BroadcastComposer';
import { useState, useEffect } from 'react';

type Tab = 'drafting' | 'broadcast' | 'cadence' | 'relationships';

interface OverdueFollowUp {
  contactId: string;
  contactName: string;
  frequency: string;
  daysOverdue: number;
}

interface ContactAttention {
  contactId: string;
  name: string;
  score: number;
  reason: string;
}

interface BroadcastHistoryItem {
  id: string;
  subject: string;
  totalSent: number;
  sentAt: string;
}

export default function CommunicationPage() {
  const [activeTab, setActiveTab] = useState<Tab>('drafting');
  const [overdueFollowUps, setOverdueFollowUps] = useState<OverdueFollowUp[]>([]);
  const [contactsNeedingAttention, setContactsNeedingAttention] = useState<ContactAttention[]>([]);
  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [cadenceRes, attentionRes, historyRes] = await Promise.all([
          fetch('/api/communication/cadence/overdue').catch(() => null),
          fetch('/api/communication/relationships/attention').catch(() => null),
          fetch('/api/communication/broadcast/history').catch(() => null),
        ]);

        if (cadenceRes?.ok) {
          const data = await cadenceRes.json();
          setOverdueFollowUps(data.data ?? []);
        }
        if (attentionRes?.ok) {
          const data = await attentionRes.json();
          setContactsNeedingAttention(data.data ?? []);
        }
        if (historyRes?.ok) {
          const data = await historyRes.json();
          setBroadcastHistory(data.data ?? []);
        }
      } catch (err) {
        console.error('Failed to fetch communication data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'drafting', label: 'Draft Composer' },
    { key: 'broadcast', label: 'Broadcast' },
    { key: 'cadence', label: 'Cadence' },
    { key: 'relationships', label: 'Relationships' },
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Communication Hub</h1>
        <p className="text-sm text-gray-500 mt-1">Draft messages, manage broadcasts, and control your communication tone.</p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'drafting' && <DraftComposer />}

      {activeTab === 'broadcast' && (
        <div className="space-y-6">
          <BroadcastComposer />
          {broadcastHistory.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Broadcast History</h3>
              <div className="divide-y divide-gray-100">
                {broadcastHistory.map((item) => (
                  <div key={item.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.subject}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(item.sentAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-sm text-gray-600">{item.totalSent} sent</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'cadence' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Overdue Follow-Ups</h3>
          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : overdueFollowUps.length === 0 ? (
            <p className="text-sm text-gray-500">No overdue follow-ups. You&apos;re on track!</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {overdueFollowUps.map((item) => (
                <div key={item.contactId} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.contactName}</p>
                    <p className="text-xs text-gray-500">
                      {item.frequency} cadence &middot; {item.daysOverdue} days overdue
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                    Overdue
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'relationships' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Contacts Needing Attention</h3>
          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : contactsNeedingAttention.length === 0 ? (
            <p className="text-sm text-gray-500">All relationships are healthy.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {contactsNeedingAttention.map((item) => (
                <div key={item.contactId} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.reason}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      item.score < 30
                        ? 'bg-red-100 text-red-700'
                        : item.score < 50
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-700'
                    }`}>
                      Score: {item.score}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
