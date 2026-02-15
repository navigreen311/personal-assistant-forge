'use client';

import { useState, useEffect, useCallback } from 'react';
import DecisionBriefCard from '@/modules/decisions/components/DecisionBriefCard';
import NewDecisionForm from '@/modules/decisions/components/NewDecisionForm';
import type { DecisionBrief } from '@/modules/decisions/types';
import type { BlastRadius } from '@/shared/types';

type SortField = 'date' | 'confidence' | 'blastRadius';

const BLAST_ORDER: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export default function DecisionHubPage() {
  const [briefs, setBriefs] = useState<(DecisionBrief & { blastRadius?: BlastRadius })[]>([]);
  const [entityFilter, setEntityFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('date');
  const [showNewForm, setShowNewForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchBriefs = useCallback(async () => {
    if (!entityFilter) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/decisions?entityId=${encodeURIComponent(entityFilter)}&page=1&pageSize=50`
      );
      const json = await res.json();
      if (json.success) {
        setBriefs(json.data ?? []);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [entityFilter]);

  useEffect(() => {
    fetchBriefs();
  }, [fetchBriefs]);

  const sorted = [...briefs].sort((a, b) => {
    if (sortBy === 'confidence') return b.confidenceScore - a.confidenceScore;
    if (sortBy === 'blastRadius') {
      return (BLAST_ORDER[b.blastRadius ?? 'LOW'] ?? 0) - (BLAST_ORDER[a.blastRadius ?? 'LOW'] ?? 0);
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const handleCreate = async (data: {
    entityId: string;
    title: string;
    description: string;
    context: string;
    deadline?: string;
    stakeholders: string[];
    constraints: string[];
    blastRadius: BlastRadius;
  }) => {
    try {
      const res = await fetch('/api/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          deadline: data.deadline ? new Date(data.deadline).toISOString() : undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowNewForm(false);
        setEntityFilter(data.entityId);
        fetchBriefs();
      }
    } catch {
      // silently handle
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Decision Support</h1>
        <button
          onClick={() => setShowNewForm(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Decision
        </button>
      </div>

      {showNewForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
          <NewDecisionForm
            onSubmit={handleCreate}
            onCancel={() => setShowNewForm(false)}
            entityId={entityFilter || undefined}
          />
        </div>
      )}

      <div className="flex gap-4 mb-6">
        <input
          type="text"
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          placeholder="Filter by Entity ID..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortField)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="date">Sort by Date</option>
          <option value="confidence">Sort by Confidence</option>
          <option value="blastRadius">Sort by Blast Radius</option>
        </select>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}

      {!loading && sorted.length === 0 && entityFilter && (
        <p className="text-sm text-gray-500">No decision briefs found for this entity.</p>
      )}

      {!loading && !entityFilter && (
        <p className="text-sm text-gray-500">Enter an Entity ID to view decision briefs.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((brief) => (
          <DecisionBriefCard
            key={brief.id}
            brief={brief}
            blastRadius={brief.blastRadius}
            onClick={() => {
              window.location.href = `/decisions/${brief.id}`;
            }}
          />
        ))}
      </div>
    </div>
  );
}
