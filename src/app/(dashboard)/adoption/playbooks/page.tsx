'use client';

import { useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Playbook data                                                      */
/* ------------------------------------------------------------------ */

interface PlaybookStep {
  label: string;
}

interface PlaybookItem {
  id: string;
  icon: string;
  title: string;
  level: string;
  levelColor: string;
  setupTime: string;
  weeklyImpact: string;
  steps: PlaybookStep[];
}

const PLAYBOOKS: PlaybookItem[] = [
  {
    id: 'inbox-zero',
    icon: '\u2709\uFE0F',
    title: 'Achieve Inbox Zero in 1 Week',
    level: 'Assistant',
    levelColor: 'bg-emerald-100 text-emerald-800',
    setupTime: '15 min',
    weeklyImpact: '2h/week',
    steps: [
      { label: 'Connect your email account' },
      { label: 'Review AI triage rules for 3 days' },
      { label: 'Enable auto-triage for low-priority emails' },
      { label: 'Set up auto-archive rules' },
      { label: 'Enable daily inbox digest' },
    ],
  },
  {
    id: 'client-followups',
    icon: '\uD83D\uDD04',
    title: 'Automate Client Follow-ups',
    level: 'Partner',
    levelColor: 'bg-violet-100 text-violet-800',
    setupTime: '20 min',
    weeklyImpact: '3h/week',
    steps: [
      { label: 'Define follow-up cadence templates' },
      { label: 'Map client entities to cadences' },
      { label: 'Enable AI-drafted follow-up emails' },
      { label: 'Set approval rules (auto-send for P2+)' },
      { label: 'Review weekly follow-up report' },
    ],
  },
  {
    id: 'cfo-pack',
    icon: '\uD83D\uDCCA',
    title: 'Weekly CFO Pack on Autopilot',
    level: 'Operator',
    levelColor: 'bg-amber-100 text-amber-800',
    setupTime: '30 min',
    weeklyImpact: '4h/week',
    steps: [
      { label: 'Connect financial data sources' },
      { label: 'Configure KPI thresholds' },
      { label: 'Set report template and recipients' },
      { label: 'Enable auto-generation every Friday' },
      { label: 'Set up anomaly alerts' },
    ],
  },
  {
    id: 'voiceforge',
    icon: '\uD83C\uDFA4',
    title: 'Full VoiceForge Delegation',
    level: 'Operator',
    levelColor: 'bg-amber-100 text-amber-800',
    setupTime: '45 min',
    weeklyImpact: '5h/week',
    steps: [
      { label: 'Train AI on your voice profile' },
      { label: 'Configure call scripts and personas' },
      { label: 'Run 5 supervised test calls' },
      { label: 'Enable autonomous outbound calls' },
      { label: 'Set up call summary and action item extraction' },
    ],
  },
];

export default function PlaybooksPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Playbook Library</h2>
        <p className="text-gray-500 mt-1">
          Pre-built automation recipes to accelerate your delegation journey.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {PLAYBOOKS.map((pb) => {
          const isExpanded = expandedId === pb.id;

          return (
            <div
              key={pb.id}
              className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col"
            >
              {/* Card header */}
              <div className="p-6 flex-1">
                <div className="flex items-start gap-4">
                  <span className="text-3xl">{pb.icon}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-lg leading-tight">{pb.title}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pb.levelColor}`}>
                        {pb.level}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {pb.setupTime} setup
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        Saves {pb.weeklyImpact}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Steps preview / full list */}
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : pb.id)}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                  >
                    {isExpanded ? 'Hide steps' : `Preview ${pb.steps.length} steps`}
                    <svg
                      className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <ol className="mt-3 space-y-2">
                      {pb.steps.map((step, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium mt-0.5">
                            {idx + 1}
                          </span>
                          {step.label}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>

              {/* Card footer */}
              <div className="px-6 pb-6">
                <button
                  type="button"
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Start Playbook
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
