'use client';

import { useState, useMemo } from 'react';
import type { AnalysisCriterion } from './DecisionWizardAnalysisStep';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DecisionWizardReviewStepProps {
  context: {
    title: string;
    description: string;
    entityName?: string;
    type: string;
    urgency: string;
    deadline?: string;
  };
  options: Array<{
    id: string;
    name: string;
    description: string;
    riskLevel: string;
  }>;
  criteria: AnalysisCriterion[];
  onDecide: (optionId: string, rationale: string, reviewDate?: string) => void;
  onSaveDraft: () => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function Stepper() {
  const steps = [
    { label: 'Context', done: true },
    { label: 'Options', done: true },
    { label: 'Analysis', done: true },
    { label: 'Review', active: true },
  ];

  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          {i > 0 && <span className="text-gray-300">──</span>}
          <span
            className={`text-sm font-medium ${
              s.active
                ? 'text-blue-600'
                : s.done
                  ? 'text-green-600'
                  : 'text-gray-400'
            }`}
          >
            {s.done && !s.active ? '\u2713 ' : s.active ? '\u25CF ' : '\u25CB '}
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeWeightedScore(
  optionId: string,
  criteria: AnalysisCriterion[],
): number {
  const totalWeight = criteria.reduce((acc, c) => acc + c.weight, 0);
  if (totalWeight === 0) return 0;
  return criteria.reduce(
    (acc, c) => acc + (c.weight * (c.scores[optionId] ?? 0)) / totalWeight,
    0,
  );
}

function computeConfidence(criteria: AnalysisCriterion[], scores: Record<string, number>): number {
  if (criteria.length === 0) return 0;
  const values = Object.values(scores);
  if (values.length < 2) return 50;

  const sorted = [...values].sort((a, b) => b - a);
  const gap = sorted[0] - (sorted[1] ?? 0);
  const totalWeight = criteria.reduce((acc, c) => acc + c.weight, 0);
  const criteriaCompleteness = totalWeight > 0 ? Math.min(totalWeight / 100, 1) : 0;

  // Confidence = blend of score gap and criteria completeness
  const raw = (gap / 10) * 60 + criteriaCompleteness * 40;
  return Math.min(Math.round(raw), 99);
}

function generateReasons(
  recommendedId: string,
  criteria: AnalysisCriterion[],
  options: Array<{ id: string; name: string }>,
): string[] {
  if (criteria.length === 0) return ['Add criteria to see analysis'];

  // Top 3 criteria by contribution to the winning option
  const sorted = [...criteria]
    .map((c) => ({
      name: c.name,
      contribution: c.weight * (c.scores[recommendedId] ?? 0),
    }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  return sorted.map(
    (c) => `Strong performance on "${c.name}" (weighted contribution: ${c.contribution.toFixed(0)})`,
  );
}

const RISK_COLORS: Record<string, string> = {
  LOW: 'text-green-600',
  MEDIUM: 'text-yellow-600',
  HIGH: 'text-red-600',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DecisionWizardReviewStep({
  context,
  options,
  criteria,
  onDecide,
  onSaveDraft,
  onBack,
}: DecisionWizardReviewStepProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [rationale, setRationale] = useState('');
  const [reviewDate, setReviewDate] = useState('');

  // Compute weighted scores & recommendation
  const weightedScores = useMemo(
    () =>
      Object.fromEntries(
        options.map((o) => [o.id, computeWeightedScore(o.id, criteria)]),
      ),
    [options, criteria],
  );

  const recommended = useMemo(() => {
    if (options.length === 0) return null;
    return options.reduce((best, o) =>
      (weightedScores[o.id] ?? 0) > (weightedScores[best.id] ?? 0) ? o : best,
    );
  }, [options, weightedScores]);

  const confidence = useMemo(
    () => computeConfidence(criteria, weightedScores),
    [criteria, weightedScores],
  );

  const reasons = useMemo(
    () =>
      recommended
        ? generateReasons(recommended.id, criteria, options)
        : [],
    [recommended, criteria, options],
  );

  const canSubmit = selectedOptionId !== null && rationale.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit || !selectedOptionId) return;
    onDecide(selectedOptionId, rationale, reviewDate || undefined);
  };

  // ---- Render -------------------------------------------------------------

  return (
    <div className="space-y-6">
      <Stepper />

      {/* Context summary */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-lg font-semibold text-gray-900">{context.title}</h3>
        <p className="mt-1 text-sm text-gray-600">{context.description}</p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
          {context.entityName && (
            <span>
              <span className="font-medium">Entity:</span> {context.entityName}
            </span>
          )}
          <span>
            <span className="font-medium">Type:</span> {context.type}
          </span>
          <span>
            <span className="font-medium">Urgency:</span> {context.urgency}
          </span>
          {context.deadline && (
            <span>
              <span className="font-medium">Deadline:</span> {context.deadline}
            </span>
          )}
        </div>
      </div>

      {/* AI Recommendation */}
      {recommended && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-5">
          <p className="text-sm text-blue-700 font-medium mb-2">
            Based on your criteria and analysis:
          </p>
          <p className="text-base font-bold text-blue-900">
            Recommended: {recommended.name}
          </p>
          <div className="mt-1 flex gap-4 text-sm text-blue-700">
            <span>
              Weighted score:{' '}
              <span className="font-semibold">
                {(weightedScores[recommended.id] ?? 0).toFixed(1)}/10
              </span>
            </span>
            <span>
              Confidence:{' '}
              <span className="font-semibold">{confidence}%</span>
            </span>
          </div>
          {reasons.length > 0 && (
            <ul className="mt-3 space-y-1">
              {reasons.map((reason, i) => (
                <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                  <span className="shrink-0 text-blue-400">&bull;</span>
                  {reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Option buttons */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Choose an option</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {options.map((opt) => {
            const isRecommended = recommended?.id === opt.id;
            const isSelected = selectedOptionId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedOptionId(opt.id)}
                className={`rounded-lg border-2 p-4 text-left transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : isRecommended
                      ? 'border-blue-300 bg-white ring-2 ring-blue-100'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isRecommended && (
                    <span className="text-yellow-500 text-sm" title="Recommended">
                      &#9733;
                    </span>
                  )}
                  <span className="font-semibold text-gray-900">{opt.name}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{opt.description}</p>
                <div className="mt-2 flex gap-3 text-xs">
                  <span>
                    Score:{' '}
                    <span className="font-medium">
                      {(weightedScores[opt.id] ?? 0).toFixed(1)}
                    </span>
                  </span>
                  <span>
                    Risk:{' '}
                    <span
                      className={`font-medium ${RISK_COLORS[opt.riskLevel] ?? 'text-gray-600'}`}
                    >
                      {opt.riskLevel}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Save as draft */}
      <div>
        <button
          type="button"
          onClick={onSaveDraft}
          className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Save as draft
        </button>
      </div>

      {/* Rationale */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Why are you choosing this? <span className="text-red-500">*</span>
        </label>
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={4}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="Explain your rationale for this decision..."
          required
        />
      </div>

      {/* Review date */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          When to revisit this decision
        </label>
        <input
          type="date"
          value={reviewDate}
          onChange={(e) => setReviewDate(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          &larr; Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
            canSubmit
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-blue-300 cursor-not-allowed'
          }`}
        >
          Save Decision
        </button>
      </div>
    </div>
  );
}
