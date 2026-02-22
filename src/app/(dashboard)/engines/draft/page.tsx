'use client';

import { useState } from 'react';

const MOCK_STATS = { draftsToday: 23, approvalRate: 86, avgTimeS: 2.3, costPerDraft: 0.008 };
const MOCK_DRAFTS = [
  { time: '3 min ago', subject: 'RE: Q4 Budget Review', entity: 'Finance Team', tone: 'Formal', status: 'Approved' as const },
  { time: '8 min ago', subject: 'Meeting follow-up notes', entity: 'John Smith', tone: 'Casual', status: 'Approved' as const },
  { time: '15 min ago', subject: 'Contract amendment v3', entity: 'Legal Dept', tone: 'Formal', status: 'Edited' as const },
  { time: '22 min ago', subject: 'Welcome aboard!', entity: 'New Hire', tone: 'Adaptive', status: 'Approved' as const },
  { time: '30 min ago', subject: 'RE: Pricing proposal', entity: 'Vendor Corp', tone: 'Formal', status: 'Rejected' as const },
];

function StatCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
      {subtext && <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{subtext}</div>}
    </div>
  );
}

export default function DraftEnginePage() {
  const [model, setModel] = useState('claude-sonnet-4-5');
  const [defaultTone, setDefaultTone] = useState('Formal');
  const [autoSendThreshold, setAutoSendThreshold] = useState(90);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Drafts Today" value={String(MOCK_STATS.draftsToday)} />
        <StatCard label="Approval Rate" value={`${MOCK_STATS.approvalRate}%`} />
        <StatCard label="Avg Time" value={`${MOCK_STATS.avgTimeS}s`} />
        <StatCard label="Cost / Draft" value={`$${MOCK_STATS.costPerDraft.toFixed(4)}`} />
      </div>

      {/* Configuration */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
              <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
              <option value="claude-opus-4">Claude Opus 4</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Tone</label>
            <select
              value={defaultTone}
              onChange={(e) => setDefaultTone(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Formal">Formal</option>
              <option value="Casual">Casual</option>
              <option value="Adaptive">Adaptive</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Library</label>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">14</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">templates available</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Auto-Send Threshold: {autoSendThreshold}%
            </label>
            <input
              type="range"
              min={50}
              max={100}
              value={autoSendThreshold}
              onChange={(e) => setAutoSendThreshold(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Drafts above this confidence are auto-sent without review.</p>
          </div>
        </div>
      </div>

      {/* Review Rules */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Always Review</h2>
        <div className="space-y-2">
          {['P0 priority emails', 'Legal communications', 'Financial documents'].map((rule) => (
            <div key={rule} className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-900 rounded-md px-4 py-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-gray-700 dark:text-gray-300">{rule}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Drafts */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Drafts</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-zinc-700">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Time</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Subject</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Entity</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tone</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_DRAFTS.map((draft, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-zinc-700/50 hover:bg-gray-50 dark:hover:bg-zinc-700/30">
                  <td className="py-2 px-3 text-gray-400 dark:text-gray-500 whitespace-nowrap">{draft.time}</td>
                  <td className="py-2 px-3 text-gray-700 dark:text-gray-300 max-w-xs truncate">{draft.subject}</td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{draft.entity}</td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{draft.tone}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      draft.status === 'Approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      draft.status === 'Edited' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>{draft.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
