'use client';

import { useState, useEffect, useCallback } from 'react';
import LearningItemCard from '@/modules/knowledge/components/LearningItemCard';
import ReviewCard from '@/modules/knowledge/components/ReviewCard';
import type { LearningItem } from '@/modules/knowledge/types';

const ENTITY_ID = 'default-entity';

export default function LearningTrackerPage() {
  const [items, setItems] = useState<LearningItem[]>([]);
  const [dueForReview, setDueForReview] = useState<LearningItem[]>([]);
  const [activeTab, setActiveTab] = useState<string>('ALL');

  const loadItems = useCallback(async () => {
    const res = await fetch(`/api/knowledge/learning?entityId=${ENTITY_ID}`);
    const data = await res.json();
    if (data.success) setItems(data.data);
  }, []);

  const loadReviews = useCallback(async () => {
    const res = await fetch(`/api/knowledge/learning/review?entityId=${ENTITY_ID}`);
    const data = await res.json();
    if (data.success) setDueForReview(data.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching data on mount is intentional
    loadItems();
    loadReviews();
  }, [loadItems, loadReviews]);

  async function handleReview(id: string, quality: number) {
    await fetch(`/api/knowledge/learning/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress: quality >= 3 ? 100 : 50 }),
    });
    loadItems();
    loadReviews();
  }

  const filtered = activeTab === 'ALL' ? items : items.filter((i) => i.status === activeTab);

  const stats = {
    total: items.length,
    queued: items.filter((i) => i.status === 'QUEUED').length,
    inProgress: items.filter((i) => i.status === 'IN_PROGRESS').length,
    completed: items.filter((i) => i.status === 'COMPLETED').length,
  };

  const tabs = [
    { key: 'ALL', label: `All (${stats.total})` },
    { key: 'QUEUED', label: `Queued (${stats.queued})` },
    { key: 'IN_PROGRESS', label: `In Progress (${stats.inProgress})` },
    { key: 'COMPLETED', label: `Completed (${stats.completed})` },
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Learning Tracker</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-500">Total</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-500">{stats.queued}</p>
          <p className="text-sm text-gray-500">Queued</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
          <p className="text-sm text-gray-500">In Progress</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
          <p className="text-sm text-gray-500">Completed</p>
        </div>
      </div>

      {/* Due for Review */}
      {dueForReview.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Due for Review</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {dueForReview.map((item) => (
              <ReviewCard key={item.id} item={item} onReview={handleReview} />
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">No learning items in this category</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <LearningItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
