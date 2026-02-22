'use client';

import React from 'react';
import type { OnboardingWizard } from '../types';

interface Props {
  wizard: OnboardingWizard;
  userName: string;
  onResumeStep: (stepOrder: number) => void;
}

export function CompletionScreen({ wizard, userName, onResumeStep }: Props) {
  const completedSteps = wizard.steps.filter((s) => s.status === 'COMPLETE');
  const skippedSteps = wizard.steps.filter((s) => s.status === 'SKIPPED');
  const totalCompleted = completedSteps.length;
  const totalSkipped = skippedSteps.length;

  // Derive configuration summary from step titles/categories
  const profileStep = wizard.steps.find((s) => s.order === 1);
  const entityStep = wizard.steps.find((s) => s.order === 2);
  const emailStep = wizard.steps.find((s) => s.order === 3);
  const calendarStep = wizard.steps.find((s) => s.order === 7);
  const voiceForgeStep = wizard.steps.find((s) => s.order === 8);
  const notificationsStep = wizard.steps.find((s) => s.order === 9);

  const displayName = userName && userName !== 'User' ? userName : 'Your Profile';

  function statusBadge(step: typeof profileStep) {
    if (!step) return null;
    if (step.status === 'COMPLETE') {
      return <span className="text-green-600 font-medium">Connected</span>;
    }
    if (step.status === 'SKIPPED') {
      return <span className="text-amber-500 font-medium">Skipped</span>;
    }
    return <span className="text-gray-400 font-medium">Pending</span>;
  }

  return (
    <div className="max-w-[800px] mx-auto p-8">
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="text-5xl mb-4">&#x2705;</div>
        <h1 className="text-3xl font-bold mb-2">Setup Complete!</h1>
        <p className="text-gray-500 text-lg">
          {totalSkipped > 0
            ? `${totalCompleted} of ${wizard.totalSteps} steps completed (${totalSkipped} skipped)`
            : `All ${wizard.totalSteps} steps completed`}
        </p>
      </div>

      {/* Configuration Summary */}
      <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Your Configuration
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">Profile</span>
            <span className="text-sm font-medium text-gray-800">{displayName}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">First Entity</span>
            <span className="text-sm font-medium text-gray-800">
              {entityStep?.status === 'COMPLETE' ? 'Created' : 'Not created'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">Email</span>
            <span className="text-sm">{statusBadge(emailStep)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">Calendar</span>
            <span className="text-sm">{statusBadge(calendarStep)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">VoiceForge</span>
            <span className="text-sm">{statusBadge(voiceForgeStep)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">Notifications</span>
            <span className="text-sm">{statusBadge(notificationsStep)}</span>
          </div>
        </div>
      </div>

      {/* Skipped items */}
      {skippedSteps.length > 0 && (
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-6 mb-8">
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-4">
            Incomplete Items (skipped during setup)
          </h2>
          <div className="flex flex-col gap-3">
            {skippedSteps.map((step) => (
              <div key={step.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">&#x2B1C;</span>
                  <span className="text-sm text-gray-700">{step.title}</span>
                </div>
                <button
                  onClick={() => onResumeStep(step.order)}
                  className="text-sm text-blue-500 hover:text-blue-700 font-medium cursor-pointer bg-transparent border-none hover:underline"
                >
                  Complete now
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick start */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Quick Start
        </h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors no-underline"
          >
            <span>&rarr;</span> Go to Dashboard
          </a>
          <a
            href="/adoption"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors no-underline"
          >
            <span>&rarr;</span> View Adoption Journey
          </a>
          <a
            href="/playbooks/inbox-zero"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors no-underline"
          >
            <span>&rarr;</span> Start &quot;Inbox Zero&quot; Playbook
          </a>
        </div>
      </div>
    </div>
  );
}
