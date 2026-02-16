'use client';

import { useState, useEffect, useCallback } from 'react';
import SOPCard from '@/modules/knowledge/components/SOPCard';
import SOPDetailView from '@/modules/knowledge/components/SOPDetailView';
import SOPForm from '@/modules/knowledge/components/SOPForm';
import type { SOP } from '@/modules/knowledge/types';

const ENTITY_ID = 'default-entity';

export default function SOPLibraryPage() {
  const [sops, setSOPs] = useState<SOP[]>([]);
  const [selectedSOP, setSelectedSOP] = useState<SOP | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchTag, setSearchTag] = useState('');

  const loadSOPs = useCallback(async () => {
    const params = new URLSearchParams({ entityId: ENTITY_ID });
    if (filterStatus) params.set('status', filterStatus);
    if (searchTag.trim()) params.set('tags', searchTag.trim());

    const res = await fetch(`/api/knowledge/sops?${params}`);
    const data = await res.json();
    if (data.success) setSOPs(data.data);
  }, [filterStatus, searchTag]);

  useEffect(() => {
    loadSOPs();
  }, [loadSOPs]);

  if (selectedSOP) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <SOPDetailView sop={selectedSOP} onBack={() => setSelectedSOP(null)} />
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <SOPForm
          entityId={ENTITY_ID}
          onCreated={() => {
            setShowForm(false);
            loadSOPs();
          }}
          onCancel={() => setShowForm(false)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">SOP Library</h1>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          Create SOP
        </button>
      </div>

      <div className="flex gap-3 items-center">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <input
          type="text"
          value={searchTag}
          onChange={(e) => setSearchTag(e.target.value)}
          placeholder="Filter by tag..."
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      {sops.length === 0 ? (
        <p className="text-sm text-gray-500">No SOPs yet. Create one to get started!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sops.map((sop) => (
            <SOPCard key={sop.id} sop={sop} onClick={setSelectedSOP} />
          ))}
        </div>
      )}
    </div>
  );
}
