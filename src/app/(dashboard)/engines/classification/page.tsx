'use client';

import { useState } from 'react';

const MOCK_STATS = { classifiedToday: 156, accuracy: 94, avgSpeedMs: 120, costPerItem: 0.0005 };
const MOCK_TAXONOMY = [
  { id: '1', category: 'Inquiry', subcategories: ['General', 'Pricing', 'Technical', 'Support'], count: 52 },
  { id: '2', category: 'Action Required', subcategories: ['Approval', 'Review', 'Signature', 'Payment'], count: 38 },
  { id: '3', category: 'Informational', subcategories: ['Update', 'Report', 'Newsletter', 'Announcement'], count: 31 },
  { id: '4', category: 'Urgent', subcategories: ['Escalation', 'Outage', 'Compliance', 'Legal'], count: 18 },
  { id: '5', category: 'Personal', subcategories: ['Social', 'Scheduling', 'Thank You'], count: 17 },
];
const MOCK_RECENT = [
  { time: '1 min ago', input: 'Can you send the latest pricing sheet?', entity: 'Client A', intent: 'Inquiry', topic: 'Pricing', confidence: 96 },
  { time: '4 min ago', input: 'Please approve the attached PO', entity: 'Procurement', intent: 'Action Required', topic: 'Approval', confidence: 91 },
  { time: '7 min ago', input: 'Monthly analytics report for Jan', entity: 'Analytics', intent: 'Informational', topic: 'Report', confidence: 98 },
  { time: '11 min ago', input: 'URGENT: compliance deadline tomorrow', entity: 'Legal Team', intent: 'Urgent', topic: 'Compliance', confidence: 99 },
  { time: '14 min ago', input: 'Thanks for the quick turnaround!', entity: 'Partner B', intent: 'Personal', topic: 'Thank You', confidence: 87 },
];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}

export default function ClassificationEnginePage() {
  const [model, setModel] = useState('claude-haiku-4-5');
  const [entityThreshold, setEntityThreshold] = useState(80);
  const [intentSensitivity, setIntentSensitivity] = useState(75);
  const [topicDepth, setTopicDepth] = useState(2);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Classified Today" value={String(MOCK_STATS.classifiedToday)} />
        <StatCard label="Accuracy" value={`${MOCK_STATS.accuracy}%`} />
        <StatCard label="Avg Speed" value={`${MOCK_STATS.avgSpeedMs}ms`} />
        <StatCard label="Cost / Item" value={`$${MOCK_STATS.costPerItem.toFixed(4)}`} />
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Entity Threshold: {entityThreshold}%
            </label>
            <input
              type="range"
              min={50}
              max={100}
              value={entityThreshold}
              onChange={(e) => setEntityThreshold(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Intent Sensitivity: {intentSensitivity}%
            </label>
            <input
              type="range"
              min={50}
              max={100}
              value={intentSensitivity}
              onChange={(e) => setIntentSensitivity(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Topic Tagging Depth: {topicDepth}
            </label>
            <input
              type="range"
              min={1}
              max={5}
              value={topicDepth}
              onChange={(e) => setTopicDepth(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Number of hierarchical levels for topic classification.</p>
          </div>
        </div>
      </div>

      {/* Custom Taxonomy */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Custom Taxonomy</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-zinc-700">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Category</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Subcategories</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Count</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_TAXONOMY.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 dark:border-zinc-700/50 hover:bg-gray-50 dark:hover:bg-zinc-700/30">
                  <td className="py-2 px-3 text-gray-900 dark:text-gray-100 font-medium">{item.category}</td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1">
                      {item.subcategories.map((sub) => (
                        <span key={sub} className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-400">{sub}</span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Classifications */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Classifications</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-zinc-700">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Time</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Input</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Entity</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Intent</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Topic</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_RECENT.map((item, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-zinc-700/50 hover:bg-gray-50 dark:hover:bg-zinc-700/30">
                  <td className="py-2 px-3 text-gray-400 dark:text-gray-500 whitespace-nowrap">{item.time}</td>
                  <td className="py-2 px-3 text-gray-700 dark:text-gray-300 max-w-xs truncate">{item.input}</td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{item.entity}</td>
                  <td className="py-2 px-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{item.intent}</span>
                  </td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{item.topic}</td>
                  <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{item.confidence}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
