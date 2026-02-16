'use client';

import CallAnalyticsPanel from '@/modules/analytics/components/CallAnalyticsPanel';
import type { CallAnalytics } from '@/modules/analytics/types';

const demoAnalytics: CallAnalytics = {
  entityId: 'demo',
  period: '2026-02',
  totalCalls: 156,
  connectRate: 68,
  averageDuration: 420,
  sentimentAverage: 0.45,
  outcomeDistribution: {
    CONNECTED: 106,
    VOICEMAIL: 25,
    NO_ANSWER: 15,
    CALLBACK_REQUESTED: 10,
  },
  roiPerCallType: [
    { callType: 'OUTBOUND', averageRevenue: 125, averageCost: 42, roi: 198 },
    { callType: 'INBOUND', averageRevenue: 85, averageCost: 35, roi: 143 },
  ],
  insights: [],
};

export default function CallsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Call Analytics</h2>

      <CallAnalyticsPanel analytics={demoAnalytics} />

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 font-semibold text-gray-900">Outcome Distribution</h3>
        <div className="space-y-2">
          {Object.entries(demoAnalytics.outcomeDistribution).map(
            ([outcome, count]) => (
              <div key={outcome} className="flex items-center gap-3">
                <span className="w-40 text-sm text-gray-600">{outcome}</span>
                <div className="h-3 flex-1 rounded-full bg-gray-100">
                  <div
                    className="h-3 rounded-full bg-blue-500"
                    style={{
                      width: `${(count / demoAnalytics.totalCalls) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-12 text-right text-sm font-medium">
                  {count}
                </span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
