'use client';

import type { BiasReport } from '../types';

interface Props {
  report: BiasReport;
}

export default function BiasReportCard({ report }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Bias Report</h3>
        <div className="text-right">
          <p
            className={`text-2xl font-bold ${
              report.overallBiasScore < 0.3
                ? 'text-green-600'
                : report.overallBiasScore < 0.6
                  ? 'text-yellow-600'
                  : 'text-red-600'
            }`}
          >
            {(report.overallBiasScore * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-gray-400">Bias Score</p>
        </div>
      </div>

      <div className="space-y-3">
        {report.dimensions.map((dim) => (
          <div key={dim.name}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">
                {dim.name.replace('_', ' ')}
              </span>
              <span
                className={`font-medium ${
                  dim.score < 0.3
                    ? 'text-green-600'
                    : dim.score < 0.6
                      ? 'text-yellow-600'
                      : 'text-red-600'
                }`}
              >
                {(dim.score * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${dim.score * 100}%`,
                  backgroundColor:
                    dim.score < 0.3
                      ? '#22c55e'
                      : dim.score < 0.6
                        ? '#eab308'
                        : '#ef4444',
                }}
              />
            </div>
            <p className="mt-0.5 text-xs text-gray-400">{dim.description}</p>
          </div>
        ))}
      </div>

      {report.alerts.length > 0 && (
        <div className="mt-4 space-y-1">
          {report.alerts.map((alert, i) => (
            <p key={i} className="text-sm text-red-600">
              {alert}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
