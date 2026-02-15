'use client';

import GoldenTestPanel from '@/modules/ai-quality/components/GoldenTestPanel';
import TestResultBadge from '@/modules/ai-quality/components/TestResultBadge';
import type { GoldenTestSuite, GoldenTestResult } from '@/modules/ai-quality/types';

const demoSuites: GoldenTestSuite[] = [
  {
    id: '1', name: 'Triage Classification', description: 'Tests for correct message priority classification',
    testCases: [
      { id: 'tc1', category: 'TRIAGE', input: { subject: 'Urgent: Server down' }, expectedOutput: { priority: 'P0' }, tags: ['urgent'], createdAt: new Date(), lastRun: new Date(), lastResult: 'PASS' },
      { id: 'tc2', category: 'TRIAGE', input: { subject: 'Weekly newsletter' }, expectedOutput: { priority: 'P2' }, tags: ['low'], createdAt: new Date(), lastRun: new Date(), lastResult: 'PASS' },
    ],
    passRate: 92, totalRuns: 15, lastRunDate: new Date('2026-02-14'),
  },
  {
    id: '2', name: 'Draft Quality', description: 'Tests for AI-generated email drafts',
    testCases: [
      { id: 'tc3', category: 'DRAFT', input: { context: 'follow up meeting' }, expectedOutput: { tone: 'PROFESSIONAL' }, tags: ['email'], createdAt: new Date(), lastRun: new Date(), lastResult: 'FAIL' },
    ],
    passRate: 78, totalRuns: 8, lastRunDate: new Date('2026-02-13'),
  },
];

const demoResults: GoldenTestResult[] = [
  { testCaseId: 'tc1', passed: true, actualOutput: { priority: 'P0' }, runDuration: 125, modelVersion: 'v2.1', timestamp: new Date() },
  { testCaseId: 'tc2', passed: true, actualOutput: { priority: 'P2' }, runDuration: 98, modelVersion: 'v2.1', timestamp: new Date() },
  { testCaseId: 'tc3', passed: false, actualOutput: { tone: 'CASUAL' }, deviation: 0.35, runDuration: 210, modelVersion: 'v2.1', timestamp: new Date() },
];

export default function TestsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Golden Test Management</h2>
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Create Suite
        </button>
      </div>

      <GoldenTestPanel suites={demoSuites} />

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 font-semibold text-gray-900">Recent Results</h3>
        <div className="space-y-3">
          {demoResults.map((result) => (
            <div key={result.testCaseId} className="flex items-center justify-between border-b border-gray-50 pb-2">
              <span className="text-sm text-gray-700">Test: {result.testCaseId}</span>
              <TestResultBadge result={result} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
