'use client';

import type { ResearchReport } from '@/modules/decisions/types';

interface ResearchReportPanelProps {
  report: ResearchReport;
}

export default function ResearchReportPanel({ report }: ResearchReportPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-700">Research Report</h4>
        <p className="mt-1 text-xs text-gray-500">
          Query: &quot;{report.query}&quot; | Confidence: {Math.round(report.confidenceScore * 100)}%
        </p>
      </div>

      <div className="rounded bg-gray-50 p-3">
        <h5 className="text-xs font-semibold text-gray-500 uppercase mb-1">Summary</h5>
        <p className="text-sm text-gray-700">{report.summary}</p>
      </div>

      {report.findings.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">Findings</h5>
          <div className="space-y-2">
            {report.findings.map((finding, i) => (
              <div key={i} className="rounded border border-gray-200 p-3">
                <p className="text-sm font-medium text-gray-900">{finding.claim}</p>
                <p className="mt-1 text-xs text-gray-500">{finding.evidence}</p>
                <span className="mt-1 inline-block text-xs text-gray-400">
                  Confidence: {Math.round(finding.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.sources.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">Sources</h5>
          <div className="space-y-1">
            {report.sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center justify-between rounded bg-gray-50 px-3 py-2"
              >
                <div>
                  <span className="text-sm text-gray-900">{source.title}</span>
                  <span className="ml-2 text-xs text-gray-400">[{source.type}]</span>
                </div>
                <span className="text-xs text-gray-500">
                  Credibility: {Math.round(source.credibilityScore * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.gaps.length > 0 && (
        <div className="rounded border border-yellow-200 bg-yellow-50 p-3">
          <h5 className="text-xs font-semibold text-yellow-700 uppercase mb-1">
            Information Gaps
          </h5>
          <ul className="space-y-1">
            {report.gaps.map((gap, i) => (
              <li key={i} className="text-xs text-yellow-600">
                - {gap}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
