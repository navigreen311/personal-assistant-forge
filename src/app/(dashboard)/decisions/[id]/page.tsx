'use client';

import { useState, useEffect, use } from 'react';
import OptionComparisonPanel from '@/modules/decisions/components/OptionComparisonPanel';
import DecisionMatrixTable from '@/modules/decisions/components/DecisionMatrixTable';
import SensitivityChart from '@/modules/decisions/components/SensitivityChart';
import PreMortemPanel from '@/modules/decisions/components/PreMortemPanel';
import EffectsTreeView from '@/modules/decisions/components/EffectsTreeView';
import type {
  DecisionBrief,
  MatrixResult,
  MatrixCriterion,
  MatrixScore,
  PreMortemResult,
  EffectsTree,
} from '@/modules/decisions/types';

export default function DecisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [brief, setBrief] = useState<DecisionBrief | null>(null);
  const [matrixResult, setMatrixResult] = useState<MatrixResult | null>(null);
  const [matrixCriteria, setMatrixCriteria] = useState<MatrixCriterion[]>([]);
  const [matrixScores, setMatrixScores] = useState<MatrixScore[]>([]);
  const [preMortem, setPreMortem] = useState<PreMortemResult | null>(null);
  const [effectsTree, setEffectsTree] = useState<EffectsTree | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBrief = async () => {
      try {
        const res = await fetch(`/api/decisions/${id}`);
        const json = await res.json();
        if (json.success) {
          setBrief(json.data);
        }
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    };
    fetchBrief();
  }, [id]);

  const handleRunMatrix = async () => {
    if (!brief) return;
    const criteria: MatrixCriterion[] = [
      { id: 'cost', name: 'Cost', weight: 0.3 },
      { id: 'risk', name: 'Risk', weight: 0.3 },
      { id: 'impact', name: 'Impact', weight: 0.25 },
      { id: 'speed', name: 'Speed', weight: 0.15 },
    ];
    const scores: MatrixScore[] = brief.options.flatMap((opt) => [
      { criterionId: 'cost', optionId: opt.id, score: opt.strategy === 'CONSERVATIVE' ? 8 : opt.strategy === 'MODERATE' ? 6 : 3, rationale: 'Cost estimate' },
      { criterionId: 'risk', optionId: opt.id, score: opt.strategy === 'CONSERVATIVE' ? 9 : opt.strategy === 'MODERATE' ? 6 : 3, rationale: 'Risk assessment' },
      { criterionId: 'impact', optionId: opt.id, score: opt.strategy === 'CONSERVATIVE' ? 4 : opt.strategy === 'MODERATE' ? 7 : 9, rationale: 'Impact potential' },
      { criterionId: 'speed', optionId: opt.id, score: opt.strategy === 'CONSERVATIVE' ? 3 : opt.strategy === 'MODERATE' ? 6 : 9, rationale: 'Timeline' },
    ]);

    try {
      const res = await fetch(`/api/decisions/${id}/matrix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria, scores }),
      });
      const json = await res.json();
      if (json.success) {
        setMatrixCriteria(criteria);
        setMatrixScores(scores);
        setMatrixResult(json.data);
      }
    } catch {
      // silently handle
    }
  };

  const handleRunPreMortem = async () => {
    if (!brief || brief.options.length === 0) return;
    try {
      const res = await fetch(`/api/decisions/${id}/pre-mortem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chosenOptionId: brief.options[1]?.id ?? brief.options[0].id,
          timeHorizon: '90_DAYS',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setPreMortem(json.data);
      }
    } catch {
      // silently handle
    }
  };

  const handleShowEffects = () => {
    if (!brief) return;
    // Build a client-side tree from the first option's effects
    const effects = brief.options.flatMap((o) => o.secondOrderEffects ?? []);
    const positive = effects.filter((e) => e.sentiment === 'POSITIVE').length;
    const negative = effects.filter((e) => e.sentiment === 'NEGATIVE').length;
    const total = effects.length || 1;
    setEffectsTree({
      rootAction: brief.title,
      effects,
      totalPositive: positive,
      totalNegative: negative,
      netSentiment: Math.round(((positive - negative) / total) * 100) / 100,
    });
  };

  const handleLogToJournal = async () => {
    if (!brief) return;
    const body = {
      entityId: 'default-entity',
      decisionId: brief.id,
      title: brief.title,
      context: brief.recommendation,
      optionsConsidered: brief.options.map((o) => o.label),
      chosenOption: brief.options[1]?.label ?? brief.options[0]?.label ?? '',
      rationale: brief.recommendation,
      expectedOutcomes: ['Successful implementation', 'On-budget delivery'],
      reviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    };

    try {
      await fetch('/api/decisions/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      alert('Logged to journal');
    } catch {
      // silently handle
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-gray-500">Loading decision brief...</p>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-red-500">Decision brief not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{brief.title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Confidence: {Math.round(brief.confidenceScore * 100)}% | Created:{' '}
          {new Date(brief.createdAt).toLocaleDateString()}
        </p>
      </div>

      {brief.blindSpots.length > 0 && (
        <div className="rounded border border-yellow-200 bg-yellow-50 p-3">
          <h3 className="text-xs font-semibold text-yellow-700 uppercase mb-1">Blind Spots</h3>
          <ul className="space-y-1">
            {brief.blindSpots.map((spot, i) => (
              <li key={i} className="text-xs text-yellow-600">- {spot}</li>
            ))}
          </ul>
        </div>
      )}

      <OptionComparisonPanel
        options={brief.options}
        recommendation={brief.recommendation}
      />

      <div className="flex gap-3">
        <button
          onClick={handleRunMatrix}
          className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          Run Matrix
        </button>
        <button
          onClick={handleRunPreMortem}
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Run Pre-Mortem
        </button>
        <button
          onClick={handleShowEffects}
          className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Show Effects
        </button>
        <button
          onClick={handleLogToJournal}
          className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Log to Journal
        </button>
      </div>

      {matrixResult && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Decision Matrix</h2>
          <DecisionMatrixTable
            criteria={matrixCriteria}
            scores={matrixScores}
            result={matrixResult}
          />
          <SensitivityChart results={matrixResult.sensitivityAnalysis} />
        </div>
      )}

      {preMortem && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <PreMortemPanel result={preMortem} />
        </div>
      )}

      {effectsTree && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <EffectsTreeView tree={effectsTree} />
        </div>
      )}
    </div>
  );
}
