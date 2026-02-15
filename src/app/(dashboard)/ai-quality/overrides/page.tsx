'use client';

import OverrideAnalysisPanel from '@/modules/ai-quality/components/OverrideAnalysisPanel';
import type { OverrideAnalysis } from '@/modules/ai-quality/types';

const demoAnalysis: OverrideAnalysis = {
  totalOverrides: 47,
  overrideRate: 0.085,
  trend: 'IMPROVING',
  byReason: {
    INCORRECT: 15,
    WRONG_TONE: 12,
    PREFERENCE: 10,
    INCOMPLETE: 7,
    OTHER: 3,
  },
  topPatterns: [
    { pattern: 'INCORRECT', count: 15, suggestedFix: 'Review training data and model prompts for factual accuracy.' },
    { pattern: 'WRONG_TONE', count: 12, suggestedFix: 'Update tone guidelines in the user/entity preferences.' },
    { pattern: 'PREFERENCE', count: 10, suggestedFix: 'Record user preference patterns for personalization.' },
    { pattern: 'INCOMPLETE', count: 7, suggestedFix: 'Expand prompt context and add more detailed instructions.' },
  ],
};

export default function OverridesPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Override Analysis</h2>
      <OverrideAnalysisPanel analysis={demoAnalysis} />

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 font-semibold text-gray-900">Improvement Actions</h3>
        <div className="space-y-3">
          {demoAnalysis.topPatterns.map((p) => (
            <div key={p.pattern} className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
              <span className="shrink-0 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {p.pattern}
              </span>
              <div>
                <p className="text-sm text-gray-700">{p.suggestedFix}</p>
                <p className="mt-1 text-xs text-gray-400">{p.count} occurrences</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
