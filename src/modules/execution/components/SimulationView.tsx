'use client';

import { useMemo } from 'react';
import type { BlastRadius } from '@/shared/types';
import type { SimulationResult, SimulatedEffect } from '@/modules/execution/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SimulationViewProps {
  result: SimulationResult;
  onExecute?: () => void;
  onCancel?: () => void;
  onModify?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EFFECT_TYPE_ICONS: Record<SimulatedEffect['type'], string> = {
  CREATE: '+',
  UPDATE: '~',
  DELETE: 'x',
  SEND: '>',
  NOTIFY: '!',
};

const EFFECT_TYPE_COLORS: Record<SimulatedEffect['type'], string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  SEND: 'bg-purple-100 text-purple-700',
  NOTIFY: 'bg-amber-100 text-amber-700',
};

const BLAST_RADIUS_METER: Record<BlastRadius, { width: string; color: string; label: string }> = {
  LOW: { width: 'w-1/4', color: 'bg-green-500', label: 'Low' },
  MEDIUM: { width: 'w-1/2', color: 'bg-yellow-500', label: 'Medium' },
  HIGH: { width: 'w-3/4', color: 'bg-orange-500', label: 'High' },
  CRITICAL: { width: 'w-full', color: 'bg-red-500', label: 'Critical' },
};

const RECOMMENDATION_STYLES: Record<
  SimulationResult['recommendation'],
  { bg: string; text: string; label: string }
> = {
  SAFE_TO_EXECUTE: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    label: 'Safe to Execute',
  },
  REVIEW_RECOMMENDED: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    label: 'Review Recommended',
  },
  HIGH_RISK: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    label: 'High Risk',
  },
  BLOCKED: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    label: 'Blocked',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SimulationView({
  result,
  onExecute,
  onCancel,
  onModify,
}: SimulationViewProps) {
  const blastMeter = BLAST_RADIUS_METER[result.blastRadius];
  const recStyle = RECOMMENDATION_STYLES[result.recommendation];

  const isBlocked = result.recommendation === 'BLOCKED';

  const formattedCost = useMemo(() => {
    if (result.estimatedCost <= 0) return 'Free';
    return `$${result.estimatedCost.toFixed(4)}`;
  }, [result.estimatedCost]);

  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
      {/* ---- Header ---- */}
      <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Simulation Results
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              {result.request.actionType} on {result.request.target}
            </p>
          </div>

          {/* Recommendation badge */}
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${recStyle.bg} ${recStyle.text}`}
          >
            {recStyle.label}
          </span>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {/* ---- What would happen ---- */}
        <Section title="What would happen" count={result.wouldDo.length}>
          {result.wouldDo.length === 0 ? (
            <p className="text-sm text-gray-400">No primary effects.</p>
          ) : (
            <ul className="space-y-2">
              {result.wouldDo.map((effect, idx) => (
                <EffectItem key={idx} effect={effect} />
              ))}
            </ul>
          )}
        </Section>

        {/* ---- Side effects ---- */}
        {result.sideEffects.length > 0 && (
          <Section title="Side effects" count={result.sideEffects.length}>
            <ul className="space-y-2">
              {result.sideEffects.map((effect, idx) => (
                <EffectItem key={idx} effect={effect} />
              ))}
            </ul>
          </Section>
        )}

        {/* ---- Warnings ---- */}
        {result.warnings.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-amber-700">
              Warnings ({result.warnings.length})
            </h4>
            <ul className="space-y-1">
              {result.warnings.map((warning, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                >
                  <span className="mt-0.5 shrink-0 text-amber-500">&#9888;</span>
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ---- Blast radius meter ---- */}
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-700">
            Blast Radius
          </h4>
          <div className="flex items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all ${blastMeter.width} ${blastMeter.color}`}
              />
            </div>
            <span
              className={`text-sm font-semibold ${
                result.blastRadius === 'LOW'
                  ? 'text-green-600'
                  : result.blastRadius === 'MEDIUM'
                    ? 'text-yellow-600'
                    : result.blastRadius === 'HIGH'
                      ? 'text-orange-600'
                      : 'text-red-600'
              }`}
            >
              {blastMeter.label}
            </span>
          </div>
        </div>

        {/* ---- Cost estimate ---- */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <span className="text-sm font-medium text-gray-600">
            Estimated Cost
          </span>
          <span className="text-lg font-semibold text-gray-900">
            {formattedCost}
          </span>
        </div>

        {/* ---- Reversibility ---- */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <span className="text-sm font-medium text-gray-600">
            Reversibility
          </span>
          {result.reversible ? (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-600">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              Fully reversible
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-600">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              Contains irreversible effects
            </span>
          )}
        </div>
      </div>

      {/* ---- Footer actions ---- */}
      <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        )}

        {onModify && (
          <button
            onClick={onModify}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Modify Parameters
          </button>
        )}

        {onExecute && (
          <button
            onClick={onExecute}
            disabled={isBlocked}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm ${
              isBlocked
                ? 'cursor-not-allowed bg-gray-400'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Execute for Real
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-gray-700">
        {title}{' '}
        <span className="ml-1 font-normal text-gray-400">({count})</span>
      </h4>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

function EffectItem({ effect }: { effect: SimulatedEffect }) {
  const iconStyle = EFFECT_TYPE_COLORS[effect.type];

  return (
    <li className="flex items-start gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
      {/* Type icon */}
      <span
        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold ${iconStyle}`}
      >
        {EFFECT_TYPE_ICONS[effect.type]}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">
            {effect.model}
          </span>
          <span className="text-xs text-gray-400">{effect.type}</span>
        </div>
        <p className="mt-0.5 text-sm text-gray-600">{effect.description}</p>
      </div>

      {/* Reversibility indicator */}
      <span
        className={`mt-0.5 shrink-0 text-xs font-medium ${
          effect.reversible ? 'text-green-600' : 'text-red-500'
        }`}
        title={effect.reversible ? 'Reversible' : 'Irreversible'}
      >
        {effect.reversible ? 'REV' : 'IRREV'}
      </span>
    </li>
  );
}
