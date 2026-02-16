'use client';

import type { Campaign } from '@/modules/voiceforge/types';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  STOPPED: 'bg-red-100 text-red-700',
};

export function CampaignCard({ campaign, onClick }: { campaign: Campaign; onClick?: () => void }) {
  const progress = campaign.stats.totalTargeted > 0
    ? Math.round((campaign.stats.totalCalled / campaign.stats.totalTargeted) * 100)
    : 0;

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900 truncate">{campaign.name}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[campaign.status] ?? ''}`}>
          {campaign.status}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3 truncate">{campaign.description}</p>
      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
        <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${progress}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
        <div><span className="font-medium">{campaign.stats.totalCalled}</span> called</div>
        <div><span className="font-medium">{campaign.stats.totalConnected}</span> connected</div>
        <div><span className="font-medium">{(campaign.stats.conversionRate * 100).toFixed(1)}%</span> conversion</div>
      </div>
    </div>
  );
}
