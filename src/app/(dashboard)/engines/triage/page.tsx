'use client';

import { useState } from 'react';

const MOCK_STATS = { processedToday: 47, accuracy: 92, avgSpeedMs: 180, costPerItem: 0.001 };
const MOCK_RULES = [
  { id: '1', condition: 'sender contains "hcqc.nv.gov"', action: 'P0 always' },
  { id: '2', condition: 'subject contains "invoice"', action: 'Route to Finance' },
  { id: '3', condition: 'from VIP list', action: 'P1 minimum' },
];
const MOCK_CLASSIFICATIONS = [
  { time: '2 min ago', input: 'RE: Compliance update Q4', entity: 'HCQC Nevada', priority: 'P0', confidence: 97, override: false },
  { time: '5 min ago', input: 'Invoice #4021 attached', entity: 'Vendor Corp', priority: 'P2', confidence: 88, override: false },
  { time: '12 min ago', input: 'Quick question about meeting', entity: 'John Smith', priority: 'P3', confidence: 74, override: true },
  { time: '18 min ago', input: 'URGENT: Server outage alert', entity: 'Monitoring', priority: 'P0', confidence: 99, override: false },
  { time: '25 min ago', input: 'Newsletter - Weekly digest', entity: 'Marketing', priority: 'P4', confidence: 95, override: false },
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

export default function TriageEnginePage() {
  const [model, setModel] = useState('claude-haiku-4-5');
  const [threshold, setThreshold] = useState(70);
  const [rules, setRules] = useState(MOCK_RULES);
  const [newCondition, setNewCondition] = useState('');
  const [newAction, setNewAction] = useState('');

  const handleAddRule = () => {
    if (!newCondition.trim() || !newAction.trim()) return;
    setRules([...rules, { id: String(rules.length + 1), condition: newCondition, action: newAction }]);
    setNewCondition('');
    setNewAction('');
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Processed Today" value={String(MOCK_STATS.processedToday)} />
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
              Confidence Threshold: {threshold}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Below this threshold items are routed to human review.</p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority Levels</label>
            <div className="flex gap-2">
              {['P0', 'P1', 'P2', 'P3', 'P4'].map((p) => (
                <span key={p} className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-gray-300">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Custom Rules */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Custom Rules</h2>
        <div className="space-y-2 mb-4">
          {rules.map((rule, i) => (
            <div key={rule.id} className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-900 rounded-md px-4 py-2 text-sm">
              <span className="text-gray-400 dark:text-gray-500 font-mono text-xs w-6">{i + 1}.</span>
              <span className="text-gray-600 dark:text-gray-300 flex-1">IF {rule.condition}</span>
              <span className="text-gray-400 dark:text-gray-500">&rarr;</span>
              <span className="text-blue-600 dark:text-blue-400 font-medium">{rule.action}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Condition (e.g., sender contains ...)"
            value={newCondition}
            onChange={(e) => setNewCondition(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Action (e.g., P0 always)"
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAddRule}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
          >
            + Add Rule
          </button>
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
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Priority</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Confidence</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Override?</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_CLASSIFICATIONS.map((item, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-zinc-700/50 hover:bg-gray-50 dark:hover:bg-zinc-700/30">
                  <td className="py-2 px-3 text-gray-400 dark:text-gray-500 whitespace-nowrap">{item.time}</td>
                  <td className="py-2 px-3 text-gray-700 dark:text-gray-300 max-w-xs truncate">{item.input}</td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{item.entity}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      item.priority === 'P0' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      item.priority === 'P1' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                      item.priority === 'P2' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      'bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-gray-400'
                    }`}>{item.priority}</span>
                  </td>
                  <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{item.confidence}%</td>
                  <td className="py-2 px-3">
                    {item.override ? (
                      <span className="text-amber-500 text-xs font-medium">Yes</span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 text-xs">No</span>
                    )}
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
