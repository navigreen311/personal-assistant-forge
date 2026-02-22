'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import TimeSavedCounter from '@/engines/adoption/components/TimeSavedCounter';

/* ------------------------------------------------------------------ */
/*  5-Level Delegation Journey                                        */
/* ------------------------------------------------------------------ */

interface Milestone {
  label: string;
  done: boolean;
}

interface DelegationLevel {
  level: number;
  name: string;
  description: string;
  progress: number;
  milestones: Milestone[];
}

const JOURNEY_LEVELS: DelegationLevel[] = [
  {
    level: 1,
    name: 'OBSERVER',
    description: 'AI watches and learns your patterns',
    progress: 20,
    milestones: [
      { label: 'Connected email', done: true },
      { label: 'Created first entity', done: true },
      { label: 'Approved 10 AI triage classifications', done: false },
      { label: 'Rated 5 AI draft suggestions', done: false },
    ],
  },
  {
    level: 2,
    name: 'ASSISTANT',
    description: 'AI handles routine tasks with your approval',
    progress: 0,
    milestones: [
      { label: 'Enable auto-triage for inbox', done: false },
      { label: 'Set up first workflow', done: false },
      { label: 'Delegate first task to AI', done: false },
      { label: 'Configure follow-up cadences', done: false },
    ],
  },
  {
    level: 3,
    name: 'PARTNER',
    description: 'AI acts independently on low-risk tasks',
    progress: 0,
    milestones: [
      { label: 'Enable auto-send for P2+ email replies', done: false },
      { label: 'Auto-create tasks from emails', done: false },
      { label: 'Auto-schedule routine meetings', done: false },
    ],
  },
  {
    level: 4,
    name: 'OPERATOR',
    description: 'AI runs workflows end-to-end',
    progress: 0,
    milestones: [
      { label: 'Build and activate 3 autonomous workflows', done: false },
      { label: 'AI handles VoiceForge calls independently', done: false },
      { label: 'AI manages delegation and follow-ups', done: false },
    ],
  },
  {
    level: 5,
    name: 'EXECUTIVE',
    description: 'AI is your chief of staff',
    progress: 0,
    milestones: [
      { label: 'AI handles full inbox zero', done: false },
      { label: 'AI manages all entity operations', done: false },
      { label: 'Weekly CFO pack auto-generated', done: false },
      { label: 'Crisis response automated', done: false },
    ],
  },
];

const CURRENT_LEVEL = 1;

const LEVEL_COLORS: Record<number, { bg: string; bar: string; badge: string; border: string }> = {
  1: { bg: 'bg-blue-50', bar: 'bg-blue-500', badge: 'bg-blue-100 text-blue-800', border: 'border-blue-300' },
  2: { bg: 'bg-emerald-50', bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-300' },
  3: { bg: 'bg-violet-50', bar: 'bg-violet-500', badge: 'bg-violet-100 text-violet-800', border: 'border-violet-300' },
  4: { bg: 'bg-amber-50', bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800', border: 'border-amber-300' },
  5: { bg: 'bg-rose-50', bar: 'bg-rose-500', badge: 'bg-rose-100 text-rose-800', border: 'border-rose-300' },
};

export default function AdoptionJourneyPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? 'demo-user';

  const [expandedLevel, setExpandedLevel] = useState<number>(CURRENT_LEVEL);

  return (
    <div className="space-y-6">
      {/* Top: Time Saved Counter */}
      <TimeSavedCounter userId={userId} />

      {/* Journey header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Delegation Journey</h2>
        <p className="text-gray-500 mt-1">
          Progress through 5 levels to fully delegate to your AI chief of staff.
        </p>
      </div>

      {/* Level cards */}
      <div className="space-y-4">
        {JOURNEY_LEVELS.map((lvl) => {
          const isCurrent = lvl.level === CURRENT_LEVEL;
          const isFuture = lvl.level > CURRENT_LEVEL;
          const isExpanded = expandedLevel === lvl.level;
          const colors = LEVEL_COLORS[lvl.level];

          return (
            <div
              key={lvl.level}
              className={`rounded-lg border shadow-sm transition-all ${
                isCurrent
                  ? `${colors.border} ${colors.bg} border-2`
                  : isFuture
                    ? 'border-gray-200 bg-gray-50 opacity-60'
                    : 'border-gray-200 bg-white'
              }`}
            >
              {/* Card header -- always visible */}
              <button
                type="button"
                onClick={() => setExpandedLevel(isExpanded ? -1 : lvl.level)}
                className="w-full flex items-center justify-between px-6 py-4 text-left"
              >
                <div className="flex items-center gap-4">
                  {/* Level number circle */}
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                      isCurrent
                        ? `${colors.bar} text-white`
                        : isFuture
                          ? 'bg-gray-200 text-gray-500'
                          : 'bg-green-500 text-white'
                    }`}
                  >
                    {lvl.level}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{lvl.name}</span>
                      {isCurrent && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                          Current Level
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{lvl.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Progress percentage */}
                  <span className="text-sm font-medium text-gray-600">{lvl.progress}%</span>

                  {/* Expand/collapse chevron */}
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Progress bar */}
              <div className="px-6 pb-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`${colors.bar} h-2 rounded-full transition-all duration-500`}
                    style={{ width: `${lvl.progress}%` }}
                  />
                </div>
              </div>

              {/* Expanded: milestone checklist */}
              {isExpanded && (
                <div className="px-6 pb-5 pt-2">
                  <ul className="space-y-2">
                    {lvl.milestones.map((m, idx) => (
                      <li key={idx} className="flex items-center gap-3 text-sm">
                        {m.done ? (
                          <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <span className="w-5 h-5 flex-shrink-0 rounded-full border-2 border-gray-300" />
                        )}
                        <span className={m.done ? 'text-gray-500 line-through' : 'text-gray-700'}>
                          {m.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
