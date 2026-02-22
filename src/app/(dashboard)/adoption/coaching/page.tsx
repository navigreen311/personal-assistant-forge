'use client';

import { useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Coaching tip data                                                  */
/* ------------------------------------------------------------------ */

interface CoachingTip {
  id: string;
  message: string;
  primaryAction: string;
  secondaryAction: string;
  dismissed: boolean;
}

interface CoachingHistoryEntry {
  date: string;
  tip: string;
  action: string;
  impact: string;
}

const INITIAL_TIPS: CoachingTip[] = [
  {
    id: 'tip-auto-triage',
    message:
      'You manually triaged 47 emails this week. AI could handle 38 (81%). Save ~45 min/week.',
    primaryAction: 'Enable auto-triage',
    secondaryAction: 'Tell me more',
    dismissed: false,
  },
  {
    id: 'tip-auto-send',
    message:
      'You approved 12/14 AI drafts without edits (86%). Enable auto-send for P2+ to save ~20 min/week.',
    primaryAction: 'Enable auto-send',
    secondaryAction: 'Not yet',
    dismissed: false,
  },
];

const COACHING_HISTORY: CoachingHistoryEntry[] = [
  {
    date: '2026-02-21',
    tip: 'Enable AI triage for newsletters',
    action: 'Enabled',
    impact: '+15 min/week',
  },
  {
    date: '2026-02-18',
    tip: 'Auto-archive read receipts',
    action: 'Enabled',
    impact: '+5 min/week',
  },
  {
    date: '2026-02-14',
    tip: 'Set up follow-up cadence for top 5 clients',
    action: 'Dismissed',
    impact: '--',
  },
  {
    date: '2026-02-10',
    tip: 'Connect calendar for scheduling automation',
    action: 'Enabled',
    impact: '+30 min/week',
  },
  {
    date: '2026-02-07',
    tip: 'Train AI on your email writing style',
    action: 'Enabled',
    impact: '+20 min/week',
  },
];

export default function CoachingPage() {
  const [tips, setTips] = useState<CoachingTip[]>(INITIAL_TIPS);

  const handleDismiss = (tipId: string) => {
    setTips((prev) => prev.filter((t) => t.id !== tipId));
  };

  const handlePrimary = (tipId: string) => {
    // In a real app this would trigger the action
    setTips((prev) => prev.filter((t) => t.id !== tipId));
  };

  const activeTips = tips.filter((t) => !t.dismissed);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">AI Coaching</h2>
        <p className="text-gray-500 mt-1">
          Personalized recommendations to get more value from your AI assistant.
        </p>
      </div>

      {/* This Week's Coaching */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">This Week&apos;s Coaching</h3>

        {activeTips.length > 0 ? (
          <div className="space-y-4">
            {activeTips.map((tip) => (
              <div
                key={tip.id}
                className="bg-white rounded-lg border border-gray-200 shadow-sm p-5"
              >
                <div className="flex items-start gap-3">
                  {/* Lightbulb icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
                      <svg
                        className="w-4.5 h-4.5 text-yellow-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                        />
                      </svg>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 leading-relaxed">{tip.message}</p>

                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => handlePrimary(tip.id)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors"
                      >
                        {tip.primaryAction}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismiss(tip.id)}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-md transition-colors"
                      >
                        {tip.secondaryAction}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismiss(tip.id)}
                        className="px-3 py-1.5 text-gray-400 hover:text-gray-600 text-xs font-medium transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500">All caught up! No pending coaching tips this week.</p>
          </div>
        )}
      </section>

      {/* Coaching History */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Coaching History</h3>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tip
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action Taken
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Impact
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {COACHING_HISTORY.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {entry.date}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{entry.tip}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          entry.action === 'Enabled'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {entry.impact}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
