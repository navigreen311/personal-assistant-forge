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

export default function EntitiesListPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<EntityWithHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const fetchEntities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (typeFilter) params.set('type', typeFilter);

      const res = await fetch(`/api/entities?${params.toString()}`);
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Entities</h1>
        <button
          onClick={() => router.push('/entities/new')}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Create Entity
        </button>
      </div>

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
              onClick={() => router.push(`/entities/${entity.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
