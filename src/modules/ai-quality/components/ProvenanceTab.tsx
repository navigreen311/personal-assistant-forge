'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';

interface AIDecision {
  id: string;
  timestamp: string;
  module: string;
  decision: string;
  inputs: string;
  model: string;
  confidence: number;
  cost: number;
  subject?: string;
  latencyMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  reasoningChain?: string[];
  rulesApplied?: string[];
  userOverride?: string | null;
}

interface AggregateStats {
  totalDecisions: number;
  avgConfidence: number;
  avgLatencyMs: number;
  totalCost: number;
  modelBreakdown: { model: string; percent: number }[];
}

interface Props {
  entityId?: string;
  period?: string;
}

const DEMO_DECISIONS: AIDecision[] = [
  {
    id: 'dec-001',
    timestamp: '2026-02-21T09:14:22Z',
    module: 'Triage',
    decision: 'Classified email as high-priority billing dispute',
    inputs:
      'Subject: Unexpected charge on invoice #4821. Body: I noticed a $340 charge that I do not recognise...',
    model: 'Claude Haiku 4.5',
    confidence: 0.94,
    cost: 0.0012,
    subject: 'Invoice #4821 dispute',
    latencyMs: 312,
    tokensIn: 420,
    tokensOut: 85,
    reasoningChain: [
      'Extracted key entities: invoice number, dollar amount, sender identity.',
      'Matched pattern to billing dispute category (0.91 confidence).',
      'Cross-referenced sender against VIP contact list - match found.',
      'Elevated priority to HIGH due to VIP status and financial nature.',
    ],
    rulesApplied: [
      'RULE-T1: Billing keywords map to billing-dispute',
      'RULE-P3: VIP sender triggers priority boost',
    ],
    userOverride: null,
  },
  {
    id: 'dec-002',
    timestamp: '2026-02-21T08:55:10Z',
    module: 'Drafting',
    decision: 'Generated apology response for shipping delay',
    inputs:
      'Context: Order #9917 delayed 3 days. Customer tone: frustrated. Previous interactions: 2 support tickets...',
    model: 'Claude Sonnet 4.5',
    confidence: 0.87,
    cost: 0.0048,
    subject: 'Order #9917 delay response',
    latencyMs: 1820,
    tokensIn: 1100,
    tokensOut: 340,
    reasoningChain: [
      'Identified customer sentiment as frustrated based on language analysis.',
      'Retrieved order history: 2 prior tickets, loyal customer segment.',
      'Selected apology-first template with compensation offer per policy.',
      'Adjusted tone to empathetic-professional based on brand voice guidelines.',
      'Included specific delay timeline and tracking link.',
    ],
    rulesApplied: [
      'RULE-D2: Frustrated sentiment triggers apology-first template',
      'RULE-D5: Delay > 2 days triggers compensation offer',
      'RULE-D8: Loyal customer triggers enhanced empathy tone',
    ],
    userOverride: 'Tone adjusted from empathetic-professional to casual-friendly by agent.',
  },
  {
    id: 'dec-003',
    timestamp: '2026-02-21T08:30:44Z',
    module: 'Classification',
    decision: 'Routed support ticket to engineering team',
    inputs:
      'Ticket: API returning 502 errors intermittently since 06:00 UTC. Affected endpoints: /api/v2/users...',
    model: 'Claude Haiku 4.5',
    confidence: 0.96,
    cost: 0.0009,
    subject: 'API 502 errors',
    latencyMs: 245,
    tokensIn: 380,
    tokensOut: 62,
    reasoningChain: [
      'Detected technical keywords: API, 502, endpoints.',
      'Classified as infrastructure/engineering issue with 0.96 confidence.',
      'Checked escalation rules: intermittent 502 matches load balancer pattern.',
      'Routed to engineering-infrastructure queue.',
    ],
    rulesApplied: [
      'RULE-C1: Technical keywords route to engineering',
      'RULE-C4: 5xx errors route to infrastructure sub-queue',
    ],
    userOverride: null,
  },
  {
    id: 'dec-004',
    timestamp: '2026-02-21T07:45:18Z',
    module: 'Prediction',
    decision: 'Forecasted 23% churn risk for account Acme Corp',
    inputs:
      'Usage data: 40% drop in API calls last 30 days. Support tickets: 5 unresolved. Contract renewal: 45 days...',
    model: 'Claude Opus 4',
    confidence: 0.78,
    cost: 0.0195,
    subject: 'Acme Corp churn risk',
    latencyMs: 4200,
    tokensIn: 2800,
    tokensOut: 620,
    reasoningChain: [
      'Aggregated usage metrics: 40% decline in API calls over 30 days.',
      'Identified 5 unresolved support tickets - above threshold of 3.',
      'Contract renewal in 45 days - within critical window.',
      'Weighted factors: usage (0.35), support (0.25), renewal (0.20), history (0.20).',
      'Composite churn probability: 23% - flagged as at-risk.',
    ],
    rulesApplied: [
      'RULE-P1: Usage decline > 30% signals churn',
      'RULE-P2: Unresolved tickets > 3 flags support burden',
      'RULE-P5: Renewal < 60 days + churn signals escalate to CSM',
    ],
    userOverride: null,
  },
  {
    id: 'dec-005',
    timestamp: '2026-02-21T07:12:05Z',
    module: 'Extraction',
    decision: 'Extracted 12 action items from meeting transcript',
    inputs:
      'Meeting transcript: Q1 planning review, 45 min, 6 participants. Topics: roadmap, hiring, budget...',
    model: 'Claude Sonnet 4.5',
    confidence: 0.91,
    cost: 0.0067,
    subject: 'Q1 planning review action items',
    latencyMs: 2100,
    tokensIn: 3200,
    tokensOut: 480,
    reasoningChain: [
      'Parsed 45-minute transcript into speaker-segmented blocks.',
      'Identified action-oriented language patterns.',
      'Extracted 12 candidate action items with assigned owners.',
      'Cross-referenced with existing task backlog to avoid duplicates.',
      'Assigned priority levels based on stated urgency and deadlines.',
    ],
    rulesApplied: [
      'RULE-E1: Action verb + deadline yields action item',
      'RULE-E3: Named person + commitment assigns owner',
      'RULE-E5: Duplicate detection against active tasks',
    ],
    userOverride: null,
  },
  {
    id: 'dec-006',
    timestamp: '2026-02-20T16:30:00Z',
    module: 'Triage',
    decision: 'Marked newsletter as low-priority, auto-archived',
    inputs:
      'Subject: Weekly Tech Digest #204. Sender: newsletter@techdigest.io...',
    model: 'Claude Haiku 4.5',
    confidence: 0.99,
    cost: 0.0004,
    subject: 'Weekly Tech Digest newsletter',
    latencyMs: 142,
    tokensIn: 280,
    tokensOut: 35,
    reasoningChain: [
      'Identified sender as known newsletter source.',
      'Content matches newsletter pattern with 0.99 confidence.',
      'No action-required indicators found.',
      'Applied auto-archive rule for low-priority newsletters.',
    ],
    rulesApplied: [
      'RULE-T5: Known newsletter sender yields low priority',
      'RULE-T7: Low priority + no action yields auto-archive',
    ],
    userOverride: null,
  },
];

const DEMO_STATS: AggregateStats = {
  totalDecisions: 1247,
  avgConfidence: 0.91,
  avgLatencyMs: 680,
  totalCost: 8.42,
  modelBreakdown: [
    { model: 'Haiku', percent: 62 },
    { model: 'Sonnet', percent: 28 },
    { model: 'Opus', percent: 10 },
  ],
};

function confidenceColor(c: number): string {
  if (c >= 0.9) return 'text-green-600';
  if (c >= 0.7) return 'text-yellow-600';
  return 'text-red-600';
}

function confidenceBg(c: number): string {
  if (c >= 0.9) return 'bg-green-50';
  if (c >= 0.7) return 'bg-yellow-50';
  return 'bg-red-50';
}

function moduleBadgeColor(mod: string): string {
  const colors: Record<string, string> = {
    Triage: 'bg-blue-100 text-blue-700',
    Drafting: 'bg-green-100 text-green-700',
    Classification: 'bg-purple-100 text-purple-700',
    Prediction: 'bg-orange-100 text-orange-700',
    Extraction: 'bg-pink-100 text-pink-700',
  };
  return colors[mod] ?? 'bg-gray-100 text-gray-700';
}

function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function modelBarColor(model: string): string {
  if (model === 'Haiku') return 'bg-blue-500';
  if (model === 'Sonnet') return 'bg-indigo-500';
  if (model === 'Opus') return 'bg-purple-600';
  return 'bg-gray-400';
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse border-b border-gray-50">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="py-3 px-3"><div className="h-4 rounded bg-gray-200 w-full" /></td>
      ))}
    </tr>
  );
}

function SkeletonStatCard() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-4">
      <div className="h-3 w-20 rounded bg-gray-200 mb-2" />
      <div className="h-7 w-16 rounded bg-gray-200" />
    </div>
  );
}

const MODULES = ['All', 'Triage', 'Drafting', 'Classification', 'Prediction', 'Extraction'];
const ACTORS = ['All', 'AI', 'Human'];
const PAGE_SIZE = 5;

export default function ProvenanceTab({ entityId, period }: Props) {
  const [decisions, setDecisions] = useState<AIDecision[]>([]);
  const [stats, setStats] = useState<AggregateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('All');
  const [actorFilter, setActorFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      if (period) params.set('period', period);
      const res = await fetch(`/api/analytics/overrides?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const fetched = json?.data?.decisions ?? json?.decisions ?? null;
        const fetchedStats = json?.data?.stats ?? json?.stats ?? null;
        setDecisions(Array.isArray(fetched) && fetched.length > 0 ? fetched : DEMO_DECISIONS);
        setStats(fetchedStats && typeof fetchedStats === 'object' ? fetchedStats : DEMO_STATS);
      } else { setDecisions(DEMO_DECISIONS); setStats(DEMO_STATS); }
    } catch { setDecisions(DEMO_DECISIONS); setStats(DEMO_STATS); } finally { setLoading(false); }
  }, [entityId, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = decisions.filter((d) => {
    if (search) {
      const lower = search.toLowerCase();
      const matches = d?.decision?.toLowerCase()?.includes(lower) || d?.module?.toLowerCase()?.includes(lower) || d?.inputs?.toLowerCase()?.includes(lower) || d?.model?.toLowerCase()?.includes(lower) || d?.subject?.toLowerCase()?.includes(lower);
      if (!matches) return false;
    }
    if (moduleFilter !== 'All' && d?.module !== moduleFilter) return false;
    if (actorFilter === 'Human' && !d?.userOverride) return false;
    if (actorFilter === 'AI' && d?.userOverride) return false;
    if (dateFrom && new Date(d?.timestamp) < new Date(dateFrom)) return false;
    if (dateTo) { const to = new Date(dateTo); to.setHours(23,59,59,999); if (new Date(d?.timestamp) > to) return false; }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = page * PAGE_SIZE < filtered.length;

  function handleRowClick(id: string) { setExpandedId((prev) => (prev === id ? null : id)); }

  async function handleCopyAuditTrail(d: AIDecision) {
    const lines = [
      '== AI Audit Trail ==', 'Decision ID: ' + (d?.id ?? ''), 'Time: ' + (d?.timestamp ?? ''),
      'Module: ' + (d?.module ?? ''), 'Subject: ' + (d?.subject ?? 'N/A'), 'Decision: ' + (d?.decision ?? ''),
      'Model: ' + (d?.model ?? ''), 'Confidence: ' + ((d?.confidence ?? 0) * 100).toFixed(1) + '%',
      'Latency: ' + (d?.latencyMs ?? 'N/A') + 'ms',
      'Tokens: ' + (d?.tokensIn ?? 0) + ' in / ' + (d?.tokensOut ?? 0) + ' out',
      'Cost: $' + (d?.cost?.toFixed(4) ?? '0.0000'),
      '', '== Input ==', d?.inputs ?? '', '', '== Reasoning Chain ==',
      ...(d?.reasoningChain?.map((st, i) => (i + 1) + '. ' + st) ?? ['None']),
      '', '== Rules Applied ==', ...(d?.rulesApplied ?? ['None']),
      '', '== User Override ==', d?.userOverride ?? 'None',
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); setCopyFeedback(d.id); setTimeout(() => setCopyFeedback(null), 2000); } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">AI Provenance &amp; Audit Trail</h2>
        <p className="text-sm text-gray-500">Full transparency into every AI decision.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input type="text" placeholder="Search decisions..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm flex-1 min-w-[180px]" />
        <select value={moduleFilter} onChange={(e) => { setModuleFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          {MODULES.map((m) => (<option key={m} value={m}>{m === 'All' ? 'All Modules' : m}</option>))}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm" title="From date" />
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm" title="To date" />
        <select value={actorFilter} onChange={(e) => { setActorFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          {ACTORS.map((a) => (<option key={a} value={a}>{a === 'All' ? 'All Actors' : a}</option>))}
        </select>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="px-6 py-4 border-b border-gray-100"><h3 className="font-semibold text-gray-900">Recent AI Decisions</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Module</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Decision</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Inputs</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Confidence</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>{[1,2,3,4,5].map(i => <SkeletonRow key={i} />)}</>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-12 text-center text-gray-400">No AI decisions found matching your filters.</td></tr>
              ) : (
                paginated.map((d) => (
                  <Fragment key={d?.id}>
                    <tr onClick={() => handleRowClick(d?.id)} className={'border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50 ' + (expandedId === d?.id ? 'bg-blue-50' : '')}>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{formatTime(d?.timestamp)}</td>
                      <td className="px-3 py-3"><span className={'inline-block rounded px-2 py-0.5 text-xs font-medium ' + moduleBadgeColor(d?.module)}>{d?.module}</span></td>
                      <td className="px-3 py-3 text-gray-900 font-medium max-w-[240px]">{d?.decision}</td>
                      <td className="px-3 py-3 text-gray-500 max-w-[200px]">{truncate(d?.inputs ?? '', 60)}</td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{d?.model}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap"><span className={'inline-block rounded px-2 py-0.5 text-xs font-semibold ' + confidenceColor(d?.confidence ?? 0) + ' ' + confidenceBg(d?.confidence ?? 0)}>{((d?.confidence ?? 0) * 100).toFixed(0)}%</span></td>
                      <td className="px-3 py-3 text-right text-gray-600 whitespace-nowrap">${d?.cost?.toFixed(4)}</td>
                    </tr>
                    {expandedId === d?.id && (
                      <tr>
                        <td colSpan={7} className="bg-gray-50 px-6 py-5">
                          <div className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <p className="text-xs font-medium uppercase text-gray-400 mb-1">Full Input</p>
                                <p className="text-sm text-gray-700 bg-white rounded p-3 border border-gray-100">{d?.inputs}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase text-gray-400 mb-1">Subject</p>
                                <p className="text-sm text-gray-700 bg-white rounded p-3 border border-gray-100">{d?.subject ?? 'N/A'}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase text-gray-400 mb-2">Decision Metrics</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                                <div className="bg-white rounded p-3 border border-gray-100 text-center"><p className="text-xs text-gray-400">Decision</p><p className="text-sm font-medium text-gray-900 mt-0.5">{truncate(d?.decision ?? '', 30)}</p></div>
                                <div className="bg-white rounded p-3 border border-gray-100 text-center"><p className="text-xs text-gray-400">Model</p><p className="text-sm font-medium text-gray-900 mt-0.5">{d?.model}</p></div>
                                <div className="bg-white rounded p-3 border border-gray-100 text-center"><p className="text-xs text-gray-400">Confidence</p><p className={'text-sm font-bold mt-0.5 ' + confidenceColor(d?.confidence ?? 0)}>{((d?.confidence ?? 0) * 100).toFixed(1)}%</p></div>
                                <div className="bg-white rounded p-3 border border-gray-100 text-center"><p className="text-xs text-gray-400">Latency</p><p className="text-sm font-medium text-gray-900 mt-0.5">{d?.latencyMs ?? 'N/A'}ms</p></div>
                                <div className="bg-white rounded p-3 border border-gray-100 text-center"><p className="text-xs text-gray-400">Tokens</p><p className="text-sm font-medium text-gray-900 mt-0.5">{d?.tokensIn ?? 0} in / {d?.tokensOut ?? 0} out</p></div>
                                <div className="bg-white rounded p-3 border border-gray-100 text-center"><p className="text-xs text-gray-400">Cost</p><p className="text-sm font-medium text-gray-900 mt-0.5">${d?.cost?.toFixed(4)}</p></div>
                              </div>
                            </div>
                            {d?.reasoningChain && d.reasoningChain.length > 0 && (
                              <div>
                                <p className="text-xs font-medium uppercase text-gray-400 mb-2">Reasoning Chain</p>
                                <ol className="space-y-2">
                                  {d.reasoningChain.map((step, i) => (
                                    <li key={i} className="flex items-start gap-3 bg-white rounded p-3 border border-gray-100">
                                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{i + 1}</span>
                                      <span className="text-sm text-gray-700">{step}</span>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )}
                            {d?.rulesApplied && d.rulesApplied.length > 0 && (
                              <div>
                                <p className="text-xs font-medium uppercase text-gray-400 mb-2">Rules Applied</p>
                                <ul className="space-y-1">
                                  {d.rulesApplied.map((rule, i) => (
                                    <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                                      {rule}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-medium uppercase text-gray-400 mb-1">User Override</p>
                              <p className={'text-sm ' + (d?.userOverride ? 'text-amber-700 bg-amber-50 border border-amber-200 rounded p-2' : 'text-gray-400')}>{d?.userOverride ?? 'None'}</p>
                            </div>
                            <div className="flex items-center gap-3 pt-2">
                              <button onClick={(e) => { e.stopPropagation(); handleCopyAuditTrail(d); }} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">{copyFeedback === d?.id ? 'Copied!' : 'Copy Audit Trail'}</button>
                              <button onClick={(e) => e.stopPropagation()} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Export</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Showing {Math.min(paginated.length, filtered.length)} of {filtered.length} decisions</p>
            <div className="flex items-center gap-2">
              {page > 1 && (<button onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Previous</button>)}
              {hasMore && (<button onClick={() => setPage((p) => p + 1)} className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">Load More</button>)}
              {totalPages > 1 && <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 font-semibold text-gray-900">Aggregate Stats</h3>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[1,2,3,4].map(i => <SkeletonStatCard key={i} />)}</div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center"><p className="text-xs text-gray-400">Total Decisions (week)</p><p className="text-2xl font-bold text-gray-900 mt-1">{stats?.totalDecisions?.toLocaleString()}</p></div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center"><p className="text-xs text-gray-400">Avg Confidence</p><p className={'text-2xl font-bold mt-1 ' + confidenceColor(stats?.avgConfidence ?? 0)}>{((stats?.avgConfidence ?? 0) * 100).toFixed(1)}%</p></div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center"><p className="text-xs text-gray-400">Avg Latency</p><p className="text-2xl font-bold text-gray-900 mt-1">{stats?.avgLatencyMs?.toLocaleString()}ms</p></div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center"><p className="text-xs text-gray-400">Total Cost</p><p className="text-2xl font-bold text-gray-900 mt-1">${stats?.totalCost?.toFixed(2)}</p></div>
            </div>
            {stats?.modelBreakdown && stats.modelBreakdown.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase text-gray-400 mb-3">Models Used</p>
                <div className="space-y-2">
                  {stats.modelBreakdown.map((m) => (
                    <div key={m?.model} className="flex items-center gap-3">
                      <span className="w-16 text-sm font-medium text-gray-700">{m?.model}</span>
                      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={'h-full rounded-full transition-all ' + modelBarColor(m?.model)} style={{ width: (m?.percent ?? 0) + '%' }} />
                      </div>
                      <span className="w-10 text-right text-sm font-medium text-gray-600">{m?.percent}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400">No aggregate statistics available.</p>
        )}
      </div>
    </div>
  );
}
