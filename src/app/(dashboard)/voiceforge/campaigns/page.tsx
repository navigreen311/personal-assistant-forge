'use client';

import { useState, useEffect } from 'react';
import type { Campaign } from '@/modules/voiceforge/types';
import { CampaignCard } from '@/modules/voiceforge/components/CampaignCard';
import { CampaignStatsPanel } from '@/modules/voiceforge/components/CampaignStatsPanel';
import { CampaignControls } from '@/modules/voiceforge/components/CampaignControls';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const entityId = 'default';
    fetch(`/api/voice/campaigns?entityId=${entityId}`)
      .then((r) => r.json())
      .then((data) => {
        setCampaigns(data.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = async (action: 'start' | 'pause' | 'stop') => {
    if (!selected) return;
    try {
      const res = await fetch(`/api/voice/campaigns/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setSelected(data.data);
        setCampaigns((prev) =>
          prev.map((c) => (c.id === data.data.id ? data.data : c))
        );
      }
    } catch {
      // silently fail
    }
  };

  if (loading) {
    return <div className="p-6 text-gray-500">Loading campaigns...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Campaign Management</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Campaign List */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Campaigns</h2>
          {campaigns.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onClick={() => setSelected(c)}
            />
          ))}
          {campaigns.length === 0 && (
            <p className="text-sm text-gray-500">No campaigns created</p>
          )}
        </div>

        {/* Campaign Detail */}
        <div className="lg:col-span-2 space-y-4">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{selected.name}</h2>
                  <p className="text-sm text-gray-500">{selected.description}</p>
                </div>
                <CampaignControls campaign={selected} onAction={handleAction} />
              </div>

              {/* Progress */}
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Progress</span>
                  <span className="text-sm text-gray-500">
                    {selected.stats.totalCalled} / {selected.stats.totalTargeted}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full"
                    style={{
                      width: `${selected.stats.totalTargeted > 0
                        ? (selected.stats.totalCalled / selected.stats.totalTargeted) * 100
                        : 0}%`,
                    }}
                  />
                </div>
              </div>

              <CampaignStatsPanel stats={selected.stats} />
            </>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
              Select a campaign to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
