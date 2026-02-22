'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Entity, ProjectHealth } from '@/shared/types';
import { EntityCard } from '@/modules/entities/components/EntityCard';

interface EntityWithHealth extends Entity {
  health?: ProjectHealth;
  metrics?: {
    openTasks: number;
    pendingMessages: number;
    upcomingEvents: number;
  };
}

interface StatsData {
  total: number;
  business: number;
  personal: number;
  activeProjects: number;
}

function computeStats(entities: EntityWithHealth[]): StatsData {
  const total = entities.length;
  const personal = entities.filter(
    (e) => e.type === 'Personal'
  ).length;
  const business = entities.filter(
    (e) => e.type !== 'Personal'
  ).length;
  const activeProjects = entities.filter(
    (e) => e.metrics && e.metrics.openTasks > 0
  ).length;
  return { total, business, personal, activeProjects };
}

export default function EntitiesListPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<EntityWithHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [activeEntityId, setActiveEntityId] = useState<string | undefined>();
  const [authError, setAuthError] = useState(false);

  const fetchEntities = useCallback(async () => {
    setLoading(true);
    setAuthError(false);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (typeFilter) params.set('type', typeFilter);

      const res = await fetch(`/api/entities?${params.toString()}`);

      if (res.status === 401) {
        setAuthError(true);
        setEntities([]);
        return;
      }

      const json = await res.json();
      if (json.success) {
        setEntities(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  // Fetch the active entity ID from session if available
  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const session = await res.json();
          if (session?.user?.activeEntityId) {
            setActiveEntityId(session.user.activeEntityId);
          }
        }
      } catch {
        // Session fetch is optional, ignore errors
      }
    }
    fetchSession();
  }, []);

  async function handleSetActive(entityId: string) {
    try {
      const res = await fetch('/api/auth/switch-entity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId }),
      });
      const json = await res.json();
      if (json.success) {
        setActiveEntityId(entityId);
      }
    } catch {
      // Silently handle switch errors
    }
  }

  const stats = computeStats(entities);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Entities</h1>
        <button
          onClick={() => router.push('/entities/new')}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Create Entity
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Your businesses, projects, and life areas. Each entity gets its own compliance rules, brand kit, contacts, and AI tone.
      </p>

      {/* Stats Cards */}
      {!loading && !authError && entities.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-4">
          <StatCard label="Total Entities" value={stats.total} />
          <StatCard label="Business" value={stats.business} accent="indigo" />
          <StatCard label="Personal" value={stats.personal} accent="emerald" />
          <StatCard label="Active Projects" value={stats.activeProjects} accent="amber" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-6 sm:flex-row">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entities..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All Types</option>
          <option value="Personal">Personal</option>
          <option value="LLC">LLC</option>
          <option value="Corporation">Corporation</option>
          <option value="Trust">Trust</option>
          <option value="Partnership">Partnership</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-xl border border-gray-200 bg-gray-100"
            />
          ))}
        </div>
      ) : authError ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16">
          <svg className="h-12 w-12 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            Authentication Required
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Please sign in to view and manage your entities.
          </p>
          <button
            onClick={() => router.push('/auth/signin')}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Sign In
          </button>
        </div>
      ) : entities.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16">
          <div className="text-4xl mb-3">
            <svg className="h-12 w-12 text-gray-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            No entities yet
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Create your first entity to get started managing your businesses and projects.
          </p>
          <button
            onClick={() => router.push('/entities/new')}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create Entity
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entities.map((entity) => (
            <EntityCard
              key={entity.id}
              entity={entity}
              health={entity.health}
              metrics={entity.metrics}
              activeEntityId={activeEntityId}
              onSetActive={handleSetActive}
              onClick={() => router.push(`/entities/${entity.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'indigo' | 'emerald' | 'amber';
}) {
  const accentColors = {
    indigo: 'border-indigo-200 bg-indigo-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    amber: 'border-amber-200 bg-amber-50',
  };
  const valueColors = {
    indigo: 'text-indigo-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
  };

  const borderBg = accent ? accentColors[accent] : 'border-gray-200 bg-white';
  const valueColor = accent ? valueColors[accent] : 'text-gray-900';

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${borderBg}`}>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}
