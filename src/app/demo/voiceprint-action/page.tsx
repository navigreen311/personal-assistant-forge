'use client';

// ============================================================================
// DEMO ONLY — Voiceprint action capture
// ----------------------------------------------------------------------------
// This page is a Storybook-style harness for QA + design review of the
// VoiceprintActionCapture modal. It is NOT a production flow:
//   - No real action is gated.
//   - No server-side risk classification is consulted.
//   - The fake "PIN fallback" view is illustrative only.
//
// We added this surface (instead of wiring into an existing PIN-gated UI)
// because at the time WS15 shipped, no end-user PIN-prompt component existed
// in the repo — the verify-pin route (`/api/shadow/auth/verify-pin`) is
// only consumed by the agent backend. As soon as a real PIN UI lands, the
// integration pattern is:
//
//   1. Call `gateActionWithVoiceprint` (server side).
//   2. If `requireVoiceprintCapture` → show <VoiceprintActionCapture />
//      first; on `onVerified` proceed without PIN, on `onFallback` fall
//      through to the existing PIN UI.
//
// That conditional path is exercised in the gate test file.
// ============================================================================

import { useState } from 'react';
import VoiceprintActionCapture, {
  type ActionRiskLevel,
} from '@/components/shadow/safety/VoiceprintActionCapture';

type DemoOutcome =
  | { kind: 'idle' }
  | { kind: 'verified'; confidence: number; antiSpoofPassed: boolean }
  | { kind: 'fallback' }
  | { kind: 'cancelled' };

export default function VoiceprintActionDemoPage() {
  const [open, setOpen] = useState(false);
  const [riskLevel, setRiskLevel] = useState<ActionRiskLevel>('medium');
  const [outcome, setOutcome] = useState<DemoOutcome>({ kind: 'idle' });

  return (
    <main className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-xl mx-auto">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Voiceprint Action Capture — Demo
        </h1>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
          This page is a QA harness. It exercises the modal that captures a
          voiceprint sample at action-time and posts to{' '}
          <code>/api/shadow/voiceprint/verify</code>. This is NOT a real
          gated action — see the file header for the production integration
          shape.
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Risk level (would normally come from the action classifier)
          </label>
          <select
            value={riskLevel}
            onChange={(e) => setRiskLevel(e.target.value as ActionRiskLevel)}
            className="w-full px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            data-testid="demo-risk-select"
          >
            <option value="low">Low</option>
            <option value="medium">Medium (voiceprint replaces PIN)</option>
            <option value="high">High (voiceprint replaces SMS, PIN still needed)</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setOutcome({ kind: 'idle' });
              setOpen(true);
            }}
            className="mt-3 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
            data-testid="demo-trigger-button"
          >
            Trigger gated action
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Last outcome
          </p>
          <pre
            className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words"
            data-testid="demo-outcome"
          >
            {JSON.stringify(outcome, null, 2)}
          </pre>
        </div>
      </div>

      <VoiceprintActionCapture
        open={open}
        riskLevel={riskLevel}
        actionDescription={`DEMO: Confirm sending $5,000 to Acme Corp (risk=${riskLevel})`}
        onVerified={(result) => {
          setOpen(false);
          setOutcome({
            kind: 'verified',
            confidence: result.confidence,
            antiSpoofPassed: result.antiSpoofPassed,
          });
        }}
        onFallback={() => {
          setOpen(false);
          setOutcome({ kind: 'fallback' });
        }}
        onCancel={() => {
          setOpen(false);
          setOutcome({ kind: 'cancelled' });
        }}
      />
    </main>
  );
}
