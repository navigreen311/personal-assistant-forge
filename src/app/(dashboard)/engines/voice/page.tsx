'use client';

import { useState } from 'react';

const MOCK_STATS = { callsToday: 8, avgDurationMin: 4.2, qualityScore: 4.7, latencyMs: 230 };
const MOCK_SCRIPTS = [
  { id: '1', name: 'Appointment Confirmation', status: 'Active', usageCount: 34 },
  { id: '2', name: 'Follow-up Call', status: 'Active', usageCount: 21 },
  { id: '3', name: 'Survey Collection', status: 'Draft', usageCount: 0 },
  { id: '4', name: 'Emergency Escalation', status: 'Active', usageCount: 8 },
];
const MOCK_CALLS = [
  { time: '5 min ago', type: 'Outbound', duration: '3:45', quality: 4.8, outcome: 'Appointment Booked' },
  { time: '20 min ago', type: 'Inbound', duration: '2:12', quality: 4.9, outcome: 'Info Provided' },
  { time: '45 min ago', type: 'Outbound', duration: '5:30', quality: 4.5, outcome: 'Follow-up Scheduled' },
  { time: '1 hr ago', type: 'Outbound', duration: '4:15', quality: 4.6, outcome: 'Voicemail Left' },
  { time: '2 hr ago', type: 'Inbound', duration: '6:20', quality: 4.3, outcome: 'Escalated to Human' },
];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}

export default function VoiceEnginePage() {
  const [persona, setPersona] = useState('professional');
  const [quality, setQuality] = useState('high');
  const [language, setLanguage] = useState('en-US');

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Calls Today" value={String(MOCK_STATS.callsToday)} />
        <StatCard label="Avg Duration" value={`${MOCK_STATS.avgDurationMin}min`} />
        <StatCard label="Quality Score" value={`${MOCK_STATS.qualityScore}/5`} />
        <StatCard label="Latency" value={`${MOCK_STATS.latencyMs}ms`} />
      </div>

      {/* Configuration */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Active Persona</label>
            <select
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="professional">Professional Assistant</option>
              <option value="friendly">Friendly Helper</option>
              <option value="concise">Concise Operator</option>
              <option value="empathetic">Empathetic Support</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Voice Quality</label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="high">High</option>
              <option value="standard">Standard</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="es-ES">Spanish</option>
              <option value="fr-FR">French</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Call Routing</label>
            <div className="space-y-1">
              {['Business hours: AI handles all', 'After hours: Voicemail + AI summary', 'VIP callers: Immediate human transfer'].map((rule, i) => (
                <div key={i} className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {rule}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Script Management */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Script Management</h2>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors">
            + New Script
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {MOCK_SCRIPTS.map((script) => (
            <div key={script.id} className="flex items-center justify-between bg-gray-50 dark:bg-zinc-900 rounded-md px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{script.name}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500">{script.usageCount} uses</div>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                script.status === 'Active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                'bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-gray-400'
              }`}>{script.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Calls */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Calls</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-zinc-700">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Time</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Type</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Duration</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Quality</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_CALLS.map((call, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-zinc-700/50 hover:bg-gray-50 dark:hover:bg-zinc-700/30">
                  <td className="py-2 px-3 text-gray-400 dark:text-gray-500 whitespace-nowrap">{call.time}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      call.type === 'Inbound' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                    }`}>{call.type}</span>
                  </td>
                  <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{call.duration}</td>
                  <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{call.quality}/5</td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{call.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
