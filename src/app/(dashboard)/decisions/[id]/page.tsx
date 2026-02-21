'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
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

// Extended brief with request metadata stored in the document
interface DecisionDetail extends DecisionBrief {
  description?: string;
  context?: string;
  deadline?: string;
  stakeholders?: string[];
  constraints?: string[];
  blastRadius?: string;
  status?: string;
  entityId?: string;
  projectId?: string;
  linkedTasks?: { id: string; title: string }[];
}

type AnalysisTab = 'matrix' | 'premortem' | 'proscons' | 'effects';

// --- Helper: compute progress phase from brief data ---
function computePhase(brief: DecisionDetail, decided: boolean): number {
  // Phase 1: Info (always done if brief exists)
  // Phase 2: Options (done if options array has items)
  // Phase 3: Analysis (done if we have recommendation + confidence > 0)
  // Phase 4: Decision (done if user has chosen)
  if (decided) return 4;
  if (brief.recommendation && brief.confidenceScore > 0) return 3;
  if (brief.options.length > 0) return 2;
  return 1;
}

// --- Helper: format cost as $ indicators ---
function costIndicator(cost: number): string {
  if (cost <= 1000) return '$';
  if (cost <= 5000) return '$$';
  if (cost <= 15000) return '$$$';
  return '$$$$';
}

// --- Badge components ---
function BlastRadiusBadge({ radius }: { radius: string }) {
  const colors: Record<string, string> = {
    LOW: 'bg-green-100 text-green-800',
    MEDIUM: 'bg-yellow-100 text-yellow-800',
    HIGH: 'bg-orange-100 text-orange-800',
    CRITICAL: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[radius] ?? 'bg-gray-100 text-gray-700'}`}>
      {radius}
    </span>
  );
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    LOW: 'bg-green-100 text-green-700',
    MEDIUM: 'bg-yellow-100 text-yellow-700',
    HIGH: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[level] ?? 'bg-gray-100 text-gray-600'}`}>
      {level} Risk
    </span>
  );
}

function StrategyBadge({ strategy }: { strategy: string }) {
  const colors: Record<string, string> = {
    CONSERVATIVE: 'bg-blue-100 text-blue-700',
    MODERATE: 'bg-purple-100 text-purple-700',
    AGGRESSIVE: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[strategy] ?? 'bg-gray-100 text-gray-600'}`}>
      {strategy}
    </span>
  );
}

// --- Progress Stepper ---
function ProgressStepper({ currentPhase }: { currentPhase: number }) {
  const phases = ['Info', 'Options', 'Analysis', 'Decision'];
  return (
    <div className="flex items-center gap-1 mt-3">
      {phases.map((label, i) => {
        const step = i + 1;
        const completed = step <= currentPhase;
        return (
          <div key={label} className="flex items-center">
            {i > 0 && (
              <div className={`w-8 h-0.5 ${step <= currentPhase ? 'bg-blue-500' : 'bg-gray-300'}`} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-3 h-3 rounded-full border-2 ${
                  completed
                    ? 'bg-blue-500 border-blue-500'
                    : 'bg-white border-gray-300'
                }`}
              />
              <span className={`text-xs font-medium ${completed ? 'text-blue-700' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function DecisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  // Core data
  const [brief, setBrief] = useState<DecisionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Analysis state
  const [activeTab, setActiveTab] = useState<AnalysisTab>('matrix');
  const [matrixResult, setMatrixResult] = useState<MatrixResult | null>(null);
  const [matrixCriteria, setMatrixCriteria] = useState<MatrixCriterion[]>([]);
  const [matrixScores, setMatrixScores] = useState<MatrixScore[]>([]);
  const [preMortem, setPreMortem] = useState<PreMortemResult | null>(null);
  const [effectsTree, setEffectsTree] = useState<EffectsTree | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [preMortemLoading, setPreMortemLoading] = useState(false);

  // Decision state
  const [chosenOptionId, setChosenOptionId] = useState<string | null>(null);
  const [rationale, setRationale] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [decided, setDecided] = useState(false);
  const [decidedAt, setDecidedAt] = useState<string | null>(null);

  // --- Fetch decision brief ---
  useEffect(() => {
    const fetchBrief = async () => {
      try {
        const res = await fetch(`/api/decisions/${id}`);
        if (!res.ok) {
          setError(`Failed to load decision (${res.status})`);
          return;
        }
        const json = await res.json();
        if (json.success) {
          setBrief(json.data);
        } else {
          setError(json.error?.message ?? 'Failed to load decision');
        }
      } catch {
        setError('Network error loading decision');
      } finally {
        setLoading(false);
      }
    };
    fetchBrief();
  }, [id]);

  // --- Matrix handler ---
  const handleRunMatrix = async () => {
    if (!brief) return;
    setMatrixLoading(true);
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
    } finally {
      setMatrixLoading(false);
    }
  };

  // --- Pre-Mortem handler ---
  const handleRunPreMortem = async () => {
    if (!brief || brief.options.length === 0) return;
    setPreMortemLoading(true);
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
    } finally {
      setPreMortemLoading(false);
    }
  };

  // --- Effects tree builder ---
  const buildEffectsTree = () => {
    if (!brief) return;
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

  // --- Decision handlers ---
  const handleChooseOption = (optionId: string) => {
    setChosenOptionId(optionId);
  };

  const handleConfirmDecision = async () => {
    if (!brief || !chosenOptionId || !rationale.trim()) return;
    const chosenOption = brief.options.find((o) => o.id === chosenOptionId);
    try {
      await fetch('/api/decisions/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: brief.entityId || 'default-entity',
          decisionId: brief.id,
          title: brief.title,
          context: brief.recommendation,
          optionsConsidered: brief.options.map((o) => o.label),
          chosenOption: chosenOption?.label ?? '',
          rationale,
          expectedOutcomes: ['Successful implementation', 'On-budget delivery'],
          reviewDate: reviewDate
            ? new Date(reviewDate).toISOString()
            : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
      setDecided(true);
      setDecidedAt(new Date().toISOString());
    } catch {
      // silently handle
    }
  };

  const handleDefer = () => {
    setChosenOptionId(null);
    setRationale('');
  };

  const handleCancel = () => {
    setChosenOptionId(null);
    setRationale('');
    setReviewDate('');
  };

  // =========================================================================
  // Loading State
  // =========================================================================
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-4 w-40 bg-gray-200 rounded" />
          <div className="h-8 w-96 bg-gray-200 rounded" />
          <div className="h-4 w-64 bg-gray-200 rounded" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-48 bg-gray-200 rounded-lg" />
            <div className="h-48 bg-gray-200 rounded-lg" />
            <div className="h-48 bg-gray-200 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Error State
  // =========================================================================
  if (error || !brief) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Link
          href="/decisions"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-6"
        >
          &larr; Back to Decisions
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-600 font-medium">{error ?? 'Decision brief not found.'}</p>
          <Link
            href="/decisions"
            className="mt-4 inline-block text-sm text-blue-600 hover:underline"
          >
            Return to Decision Hub
          </Link>
        </div>
      </div>
    );
  }

  const currentPhase = computePhase(brief, decided);
  const recommendedOption = brief.options.find((o) => o.strategy === 'MODERATE') ?? brief.options[0];

  // =========================================================================
  // Render
  // =========================================================================
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* ================================================================= */}
      {/* 1. HEADER */}
      {/* ================================================================= */}
      <div>
        <Link
          href="/decisions"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-4"
        >
          &larr; Back to Decisions
        </Link>

        <h1 className="text-2xl font-bold text-gray-900">{brief.title}</h1>

        <div className="flex flex-wrap items-center gap-2 mt-2">
          {brief.entityId && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
              {brief.entityId}
            </span>
          )}
          {brief.blastRadius && <BlastRadiusBadge radius={brief.blastRadius} />}
          {brief.status && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              brief.status === 'ACTIVE' ? 'bg-blue-100 text-blue-700' :
              brief.status === 'DRAFT' ? 'bg-gray-100 text-gray-600' :
              'bg-gray-100 text-gray-500'
            }`}>
              {brief.status}
            </span>
          )}
          {brief.deadline && (
            <span className="text-xs text-gray-500">
              Due: {new Date(brief.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          <span className="text-xs text-gray-400">
            Confidence: {Math.round(brief.confidenceScore * 100)}%
          </span>
        </div>

        <ProgressStepper currentPhase={currentPhase} />
      </div>

      {/* ================================================================= */}
      {/* 2. CONTEXT SECTION */}
      {/* ================================================================= */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Context</h2>

        {brief.description && (
          <p className="text-sm text-gray-700 leading-relaxed">{brief.description}</p>
        )}

        {brief.recommendation && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">AI Recommendation:</span> {brief.recommendation}
            </p>
          </div>
        )}

        {brief.stakeholders && brief.stakeholders.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Stakeholders</h3>
            <div className="flex flex-wrap gap-2">
              {brief.stakeholders.map((s, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {brief.constraints && brief.constraints.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Constraints</h3>
            <ul className="space-y-1">
              {brief.constraints.map((c, i) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-1.5">
                  <span className="text-gray-400 shrink-0">-</span> {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {brief.projectId && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Linked Project</h3>
            <Link
              href={`/projects/${brief.projectId}`}
              className="text-sm text-blue-600 hover:underline"
            >
              {brief.projectId}
            </Link>
          </div>
        )}

        {brief.linkedTasks && brief.linkedTasks.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Linked Tasks</h3>
            <div className="flex flex-wrap gap-2">
              {brief.linkedTasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {task.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {brief.blindSpots.length > 0 && (
          <div className="rounded border border-yellow-200 bg-yellow-50 p-3">
            <h3 className="text-xs font-semibold text-yellow-700 uppercase mb-1">Blind Spots</h3>
            <ul className="space-y-1">
              {brief.blindSpots.map((spot, i) => (
                <li key={i} className="text-xs text-yellow-600 flex items-start gap-1.5">
                  <span className="shrink-0">!</span> {spot}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* 3. OPTIONS SECTION */}
      {/* ================================================================= */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Options</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {brief.options.map((option) => {
            const isRecommended = option.id === recommendedOption?.id;
            return (
              <div
                key={option.id}
                className={`rounded-lg border-2 bg-white p-5 transition-shadow hover:shadow-md ${
                  isRecommended
                    ? 'border-yellow-400 ring-1 ring-yellow-200'
                    : 'border-gray-200'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                    {option.label}
                  </h3>
                  {isRecommended && (
                    <span className="shrink-0 inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">
                      Recommended
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <StrategyBadge strategy={option.strategy} />
                  <RiskBadge level={option.riskLevel} />
                </div>

                {/* Description */}
                <p className="text-sm text-gray-600 mb-3 leading-relaxed">{option.description}</p>

                {/* Metrics row */}
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3 pb-3 border-b border-gray-100">
                  <div>
                    <span className="font-medium text-gray-700">Cost:</span>{' '}
                    <span className="font-semibold">{costIndicator(option.estimatedCost)}</span>
                    <span className="text-gray-400 ml-1">(${option.estimatedCost.toLocaleString()})</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">ROI Timeline:</span>{' '}
                    {option.estimatedTimeline}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Reversibility:</span>{' '}
                    {option.reversibility}
                  </div>
                </div>

                {/* Pros */}
                <div className="mb-2">
                  <h4 className="text-xs font-semibold text-green-700 uppercase mb-1">Pros</h4>
                  <ul className="space-y-0.5">
                    {option.pros.map((pro, i) => (
                      <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                        <span className="text-green-500 shrink-0">+</span> {pro}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Cons */}
                <div>
                  <h4 className="text-xs font-semibold text-red-700 uppercase mb-1">Cons</h4>
                  <ul className="space-y-0.5">
                    {option.cons.map((con, i) => (
                      <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                        <span className="text-red-500 shrink-0">-</span> {con}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action buttons below options */}
        <div className="flex gap-3 mt-4">
          <button
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            + Add custom option
          </button>
          <button
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            AI: Generate options
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 4. ANALYSIS SECTION (TABS) */}
      {/* ================================================================= */}
      <div className="rounded-lg border border-gray-200 bg-white">
        {/* Tab bar */}
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {([
              { key: 'matrix' as const, label: 'Decision Matrix' },
              { key: 'premortem' as const, label: 'Pre-Mortem' },
              { key: 'proscons' as const, label: 'Pros/Cons' },
              { key: 'effects' as const, label: 'Second-Order Effects' },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {/* Decision Matrix tab */}
          {activeTab === 'matrix' && (
            <div className="space-y-4">
              {!matrixResult ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-4">
                    Run the decision matrix to score each option against weighted criteria.
                  </p>
                  <button
                    onClick={handleRunMatrix}
                    disabled={matrixLoading}
                    className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {matrixLoading ? 'Running Analysis...' : 'Run Decision Matrix'}
                  </button>
                </div>
              ) : (
                <>
                  <DecisionMatrixTable
                    criteria={matrixCriteria}
                    scores={matrixScores}
                    result={matrixResult}
                  />
                  <SensitivityChart results={matrixResult.sensitivityAnalysis} />
                </>
              )}
            </div>
          )}

          {/* Pre-Mortem tab */}
          {activeTab === 'premortem' && (
            <div>
              {!preMortem ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-4">
                    Run a pre-mortem analysis to identify potential failure scenarios before deciding.
                  </p>
                  <button
                    onClick={handleRunPreMortem}
                    disabled={preMortemLoading}
                    className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {preMortemLoading ? 'Analyzing...' : 'Run Pre-Mortem Analysis'}
                  </button>
                </div>
              ) : (
                <PreMortemPanel result={preMortem} />
              )}
            </div>
          )}

          {/* Pros/Cons tab */}
          {activeTab === 'proscons' && (
            <div className="space-y-6">
              {brief.options.map((option) => (
                <div key={option.id} className="rounded-lg border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-semibold text-gray-900 text-sm">{option.label}</h3>
                    <StrategyBadge strategy={option.strategy} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Pros column */}
                    <div className="rounded-md bg-green-50 border border-green-200 p-4">
                      <h4 className="text-xs font-bold text-green-700 uppercase mb-2">Pros</h4>
                      <ul className="space-y-1.5">
                        {option.pros.map((pro, i) => (
                          <li key={i} className="text-sm text-green-800 flex items-start gap-1.5">
                            <span className="text-green-500 shrink-0 font-bold">+</span> {pro}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {/* Cons column */}
                    <div className="rounded-md bg-red-50 border border-red-200 p-4">
                      <h4 className="text-xs font-bold text-red-700 uppercase mb-2">Cons</h4>
                      <ul className="space-y-1.5">
                        {option.cons.map((con, i) => (
                          <li key={i} className="text-sm text-red-800 flex items-start gap-1.5">
                            <span className="text-red-500 shrink-0 font-bold">-</span> {con}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Second-Order Effects tab */}
          {activeTab === 'effects' && (
            <div>
              {!effectsTree ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-4">
                    View the cascading second-order effects across all options.
                  </p>
                  <button
                    onClick={buildEffectsTree}
                    className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Show Effects Tree
                  </button>
                </div>
              ) : (
                <EffectsTreeView tree={effectsTree} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* 5. DECISION SECTION */}
      {/* ================================================================= */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Decision</h2>

        {decided && chosenOptionId ? (
          // --- Decided state ---
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-green-300 bg-green-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green-600 text-lg">&#10003;</span>
                <h3 className="font-semibold text-green-800">
                  Decision Made: {brief.options.find((o) => o.id === chosenOptionId)?.label}
                </h3>
              </div>
              <p className="text-sm text-green-700 mb-2">
                <span className="font-medium">Rationale:</span> {rationale}
              </p>
              {decidedAt && (
                <p className="text-xs text-green-600">
                  Decided: {new Date(decidedAt).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
              {reviewDate && (
                <p className="text-xs text-green-600">
                  Review date: {new Date(reviewDate).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              )}
            </div>
          </div>
        ) : (
          // --- Not yet decided ---
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Choose an option to finalize this decision. A rationale is required.
            </p>

            {/* Option buttons */}
            <div className="flex flex-wrap gap-3">
              {brief.options.map((option, idx) => (
                <button
                  key={option.id}
                  onClick={() => handleChooseOption(option.id)}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    chosenOptionId === option.id
                      ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                      : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Choose Option {String.fromCharCode(65 + idx)}: {option.label}
                </button>
              ))}
            </div>

            {/* Rationale textarea */}
            {chosenOptionId && (
              <div className="space-y-3 pt-2">
                <div>
                  <label htmlFor="rationale" className="block text-sm font-medium text-gray-700 mb-1">
                    Rationale <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="rationale"
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                    rows={3}
                    placeholder="Explain why you chose this option..."
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="reviewDate" className="block text-sm font-medium text-gray-700 mb-1">
                    Review Date
                  </label>
                  <input
                    id="reviewDate"
                    type="date"
                    value={reviewDate}
                    onChange={(e) => setReviewDate(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              {chosenOptionId && (
                <button
                  onClick={handleConfirmDecision}
                  disabled={!rationale.trim()}
                  className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm Decision
                </button>
              )}
              <button
                onClick={handleDefer}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Defer
              </button>
              <button
                onClick={handleCancel}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
