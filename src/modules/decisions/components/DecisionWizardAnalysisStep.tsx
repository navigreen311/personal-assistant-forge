'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalysisCriterion {
  id: string;
  name: string;
  weight: number;
  scores: Record<string, number>; // optionId -> score 1-10
}

interface DecisionWizardAnalysisStepProps {
  options: Array<{ id: string; name: string }>;
  criteria: AnalysisCriterion[];
  preMortem: Record<string, string[]>; // optionId -> failure scenarios
  proscons: Record<string, { pros: string[]; cons: string[] }>;
  onCriteriaChange: (criteria: AnalysisCriterion[]) => void;
  onPreMortemChange: (pm: Record<string, string[]>) => void;
  onProsConsChange: (pc: Record<string, { pros: string[]; cons: string[] }>) => void;
  onBack: () => void;
  onNext: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TabKey = 'matrix' | 'premortem' | 'proscons';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'matrix', label: 'Decision Matrix' },
  { key: 'premortem', label: 'Pre-Mortem' },
  { key: 'proscons', label: 'Pros/Cons' },
];

const DEFAULT_CRITERIA_NAMES = [
  'Cost / Budget',
  'Time to Implement',
  'Risk Level',
  'Strategic Alignment',
  'Scalability',
];

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function getCellColor(score: number): string {
  if (score >= 8) return 'bg-green-100 text-green-800';
  if (score >= 6) return 'bg-blue-100 text-blue-800';
  if (score >= 4) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function Stepper() {
  const steps = [
    { label: 'Context', done: true },
    { label: 'Options', done: true },
    { label: 'Analysis', active: true },
    { label: 'Review', done: false },
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
// Component
// ---------------------------------------------------------------------------

export default function DecisionWizardAnalysisStep({
  options,
  criteria,
  preMortem,
  proscons,
  onCriteriaChange,
  onPreMortemChange,
  onProsConsChange,
  onBack,
  onNext,
}: DecisionWizardAnalysisStepProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('matrix');

  // ---- Matrix helpers -----------------------------------------------------

  const handleSuggestCriteria = () => {
    const suggested: AnalysisCriterion[] = DEFAULT_CRITERIA_NAMES.map((name) => ({
      id: uid(),
      name,
      weight: 20,
      scores: Object.fromEntries(options.map((o) => [o.id, 5])),
    }));
    onCriteriaChange(suggested);
  };

  const handleAddCriterion = () => {
    onCriteriaChange([
      ...criteria,
      {
        id: uid(),
        name: '',
        weight: 0,
        scores: Object.fromEntries(options.map((o) => [o.id, 5])),
      },
    ]);
  };

  const handleRemoveCriterion = (id: string) => {
    onCriteriaChange(criteria.filter((c) => c.id !== id));
  };

  const handleCriterionField = (
    id: string,
    field: 'name' | 'weight',
    value: string | number,
  ) => {
    onCriteriaChange(
      criteria.map((c) =>
        c.id === id ? { ...c, [field]: field === 'weight' ? Number(value) : value } : c,
      ),
    );
  };

  const handleScore = (criterionId: string, optionId: string, score: number) => {
    onCriteriaChange(
      criteria.map((c) =>
        c.id === criterionId
          ? { ...c, scores: { ...c.scores, [optionId]: score } }
          : c,
      ),
    );
  };

  const computeWeightedScore = (optionId: string): number => {
    const totalWeight = criteria.reduce((acc, c) => acc + c.weight, 0);
    if (totalWeight === 0) return 0;
    return criteria.reduce(
      (acc, c) => acc + (c.weight * (c.scores[optionId] ?? 0)) / totalWeight,
      0,
    );
  };

  const weightedScores: Record<string, number> = Object.fromEntries(
    options.map((o) => [o.id, computeWeightedScore(o.id)]),
  );

  const highestOptionId = options.length
    ? options.reduce((best, o) =>
        (weightedScores[o.id] ?? 0) > (weightedScores[best.id] ?? 0) ? o : best,
      ).id
    : '';

  // ---- Pre-Mortem helpers -------------------------------------------------

  const handleGeneratePreMortem = (optionId: string) => {
    const defaults = [
      'Key assumptions turned out to be wrong',
      'Insufficient resources were allocated',
      'Market conditions changed unexpectedly',
      'Team lacked critical expertise',
      'Stakeholder buy-in was never achieved',
    ];
    onPreMortemChange({ ...preMortem, [optionId]: defaults });
  };

  const handleAddScenario = (optionId: string) => {
    const current = preMortem[optionId] ?? [];
    onPreMortemChange({ ...preMortem, [optionId]: [...current, ''] });
  };

  const handleScenarioChange = (optionId: string, index: number, value: string) => {
    const current = [...(preMortem[optionId] ?? [])];
    current[index] = value;
    onPreMortemChange({ ...preMortem, [optionId]: current });
  };

  const handleRemoveScenario = (optionId: string, index: number) => {
    const current = [...(preMortem[optionId] ?? [])];
    current.splice(index, 1);
    onPreMortemChange({ ...preMortem, [optionId]: current });
  };

  // ---- Pros/Cons helpers --------------------------------------------------

  const ensureProscons = (optionId: string) =>
    proscons[optionId] ?? { pros: [], cons: [] };

  const handleGenerateProscons = (optionId: string) => {
    const defaults = {
      pros: ['Aligns with long-term goals', 'Relatively low risk', 'Proven approach'],
      cons: ['Higher upfront cost', 'Longer implementation time', 'Requires training'],
    };
    onProsConsChange({ ...proscons, [optionId]: defaults });
  };

  const handleAddProCon = (optionId: string, type: 'pros' | 'cons') => {
    const current = ensureProscons(optionId);
    onProsConsChange({
      ...proscons,
      [optionId]: { ...current, [type]: [...current[type], ''] },
    });
  };

  const handleProConChange = (
    optionId: string,
    type: 'pros' | 'cons',
    index: number,
    value: string,
  ) => {
    const current = ensureProscons(optionId);
    const updated = [...current[type]];
    updated[index] = value;
    onProsConsChange({
      ...proscons,
      [optionId]: { ...current, [type]: updated },
    });
  };

  const handleRemoveProCon = (optionId: string, type: 'pros' | 'cons', index: number) => {
    const current = ensureProscons(optionId);
    const updated = [...current[type]];
    updated.splice(index, 1);
    onProsConsChange({
      ...proscons,
      [optionId]: { ...current, [type]: updated },
    });
  };

  // ---- Render -------------------------------------------------------------

  return (
    <div className="space-y-6">
      <Stepper />

      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ======== Decision Matrix Tab ======== */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Decision Matrix</h3>
            <button
              type="button"
              onClick={handleSuggestCriteria}
              className="rounded-md bg-blue-50 border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              AI: Suggest criteria
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">
                    Criterion
                  </th>
                  <th className="px-4 py-2 text-center font-medium text-gray-500">
                    Weight %
                  </th>
                  {options.map((opt) => (
                    <th
                      key={opt.id}
                      className="px-4 py-2 text-center font-medium text-gray-500"
                    >
                      {opt.name}
                    </th>
                  ))}
                  <th className="px-4 py-2 w-10" />
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {criteria.map((criterion) => (
                  <tr key={criterion.id}>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={criterion.name}
                        onChange={(e) =>
                          handleCriterionField(criterion.id, 'name', e.target.value)
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                        placeholder="Criterion name"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={criterion.weight}
                        onChange={(e) =>
                          handleCriterionField(criterion.id, 'weight', e.target.value)
                        }
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-center focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    {options.map((opt) => (
                      <td key={opt.id} className="px-4 py-2 text-center">
                        <select
                          value={criterion.scores[opt.id] ?? 5}
                          onChange={(e) =>
                            handleScore(criterion.id, opt.id, Number(e.target.value))
                          }
                          className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                        >
                          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                    <td className="px-4 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveCriterion(criterion.id)}
                        className="text-gray-400 hover:text-red-500 text-sm"
                        title="Remove criterion"
                      >
                        x
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-2 text-gray-900">Weighted Score</td>
                  <td className="px-4 py-2" />
                  {options.map((opt) => {
                    const ws = weightedScores[opt.id] ?? 0;
                    const isHighest = opt.id === highestOptionId && ws > 0;
                    return (
                      <td
                        key={opt.id}
                        className={`px-4 py-2 text-center ${
                          isHighest ? 'text-green-700' : 'text-gray-900'
                        }`}
                      >
                        <span
                          className={`inline-block rounded px-2 py-0.5 ${
                            isHighest ? getCellColor(ws) : ''
                          }`}
                        >
                          {ws.toFixed(1)}
                        </span>
                      </td>
                    );
                  })}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <button
            type="button"
            onClick={handleAddCriterion}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            + Add criterion
          </button>
        </div>
      )}

      {/* ======== Pre-Mortem Tab ======== */}
      {activeTab === 'premortem' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-gray-900">Pre-Mortem Analysis</h3>

          {options.map((opt) => {
            const scenarios = preMortem[opt.id] ?? [];
            return (
              <div
                key={opt.id}
                className="rounded-lg border border-gray-200 bg-white p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800">
                    Imagine <span className="text-blue-600">{opt.name}</span> failed.
                    What went wrong?
                  </h4>
                  <button
                    type="button"
                    onClick={() => handleGeneratePreMortem(opt.id)}
                    className="rounded-md bg-blue-50 border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
                  >
                    AI: Generate pre-mortem
                  </button>
                </div>

                <div className="space-y-2">
                  {scenarios.map((scenario, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-5 text-right shrink-0">
                        {idx + 1}.
                      </span>
                      <input
                        type="text"
                        value={scenario}
                        onChange={(e) =>
                          handleScenarioChange(opt.id, idx, e.target.value)
                        }
                        className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                        placeholder="Describe a failure scenario..."
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveScenario(opt.id, idx)}
                        className="text-gray-400 hover:text-red-500 text-sm"
                        title="Remove scenario"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleAddScenario(opt.id)}
                  className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  + Add scenario
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ======== Pros/Cons Tab ======== */}
      {activeTab === 'proscons' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-gray-900">Pros & Cons</h3>

          {options.map((opt) => {
            const pc = ensureProscons(opt.id);
            return (
              <div
                key={opt.id}
                className="rounded-lg border border-gray-200 bg-white p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800">{opt.name}</h4>
                  <button
                    type="button"
                    onClick={() => handleGenerateProscons(opt.id)}
                    className="rounded-md bg-blue-50 border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
                  >
                    AI: Generate pros/cons
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Pros column */}
                  <div>
                    <h5 className="text-xs font-semibold text-green-700 uppercase mb-2">
                      Pros
                    </h5>
                    <div className="space-y-2">
                      {pc.pros.map((pro, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-green-500 shrink-0">+</span>
                          <input
                            type="text"
                            value={pro}
                            onChange={(e) =>
                              handleProConChange(opt.id, 'pros', idx, e.target.value)
                            }
                            className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="Add a pro..."
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveProCon(opt.id, 'pros', idx)}
                            className="text-gray-400 hover:text-red-500 text-sm"
                            title="Remove"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddProCon(opt.id, 'pros')}
                      className="mt-2 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                    >
                      + Add
                    </button>
                  </div>

                  {/* Cons column */}
                  <div>
                    <h5 className="text-xs font-semibold text-red-700 uppercase mb-2">
                      Cons
                    </h5>
                    <div className="space-y-2">
                      {pc.cons.map((con, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-red-500 shrink-0">-</span>
                          <input
                            type="text"
                            value={con}
                            onChange={(e) =>
                              handleProConChange(opt.id, 'cons', idx, e.target.value)
                            }
                            className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="Add a con..."
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveProCon(opt.id, 'cons', idx)}
                            className="text-gray-400 hover:text-red-500 text-sm"
                            title="Remove"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddProCon(opt.id, 'cons')}
                      className="mt-2 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
          onClick={onNext}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
