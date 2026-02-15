'use client';

import BiasReportCard from '@/modules/ai-quality/components/BiasReportCard';
import type { BiasReport } from '@/modules/ai-quality/types';

const demoReport: BiasReport = {
  entityId: 'demo',
  period: '2026-02',
  overallBiasScore: 0.18,
  dimensions: [
    {
      name: 'entity_bias', score: 0.12,
      description: 'Task completion rates are consistent across entities.',
      affectedGroups: [
        { group: 'Acme LLC', deviation: 0.05 },
        { group: 'Personal', deviation: -0.05 },
      ],
    },
    {
      name: 'contact_bias', score: 0.22,
      description: 'Minor variance in response quality by contact.',
      affectedGroups: [
        { group: 'VIP Contacts', deviation: 0.08 },
        { group: 'General', deviation: -0.04 },
      ],
    },
    {
      name: 'channel_bias', score: 0.15,
      description: 'Accuracy is consistent across channels.',
      affectedGroups: [
        { group: 'EMAIL', deviation: 0.03 },
        { group: 'SLACK', deviation: -0.02 },
        { group: 'SMS', deviation: -0.01 },
      ],
    },
    {
      name: 'time_bias', score: 0.25,
      description: 'Slight performance dip in late afternoon hours.',
      affectedGroups: [
        { group: '9:00-12:00', deviation: 0.05 },
        { group: '13:00-17:00', deviation: -0.08 },
        { group: '17:00-21:00', deviation: 0.03 },
      ],
    },
  ],
  alerts: [],
};

export default function BiasPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Bias Detection Report</h2>

      <BiasReportCard report={demoReport} />

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 font-semibold text-gray-900">Affected Groups Detail</h3>
        {demoReport.dimensions.map((dim) => (
          <div key={dim.name} className="mb-4">
            <p className="mb-2 text-sm font-medium text-gray-700">
              {dim.name.replace('_', ' ')}
            </p>
            <div className="space-y-1">
              {dim.affectedGroups.map((g) => (
                <div key={g.group} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{g.group}</span>
                  <span
                    className={`font-medium ${
                      Math.abs(g.deviation) > 0.05
                        ? 'text-yellow-600'
                        : 'text-green-600'
                    }`}
                  >
                    {g.deviation > 0 ? '+' : ''}
                    {(g.deviation * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
