'use client';

import type { CampaignStats } from '@/modules/voiceforge/types';

export function CampaignStatsPanel({ stats }: { stats: CampaignStats }) {
  const items = [
    { label: 'Targeted', value: stats.totalTargeted },
    { label: 'Called', value: stats.totalCalled },
    { label: 'Connected', value: stats.totalConnected },
    { label: 'Voicemail', value: stats.totalVoicemail },
    { label: 'No Answer', value: stats.totalNoAnswer },
    { label: 'Interested', value: stats.totalInterested },
    { label: 'Not Interested', value: stats.totalNotInterested },
    { label: 'Avg Sentiment', value: stats.averageSentiment.toFixed(2) },
    { label: 'Avg Duration', value: `${Math.round(stats.averageDuration)}s` },
    { label: 'Conversion', value: `${(stats.conversionRate * 100).toFixed(1)}%` },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Campaign Statistics</h3>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <p className="text-lg font-bold text-gray-900">{item.value}</p>
            <p className="text-xs text-gray-500">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
