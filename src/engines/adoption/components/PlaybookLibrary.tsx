'use client';

import { useState } from 'react';
import type { Playbook } from '../types';
import PlaybookCard from './PlaybookCard';

interface Props {
  playbooks: Playbook[];
}

export default function PlaybookLibrary({ playbooks }: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = [...new Set(playbooks.map(pb => pb.category))];
  const filtered = activeCategory
    ? playbooks.filter(pb => pb.category === activeCategory)
    : playbooks;

  const handleActivate = async (id: string) => {
    try {
      const { activatePlaybook } = await import('../playbook-service');
      await activatePlaybook('current-user', id);
    } catch {
      // Handle error silently
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setActiveCategory(null)}
          className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
            activeCategory === null
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors capitalize ${
              activeCategory === cat
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((playbook) => (
          <PlaybookCard
            key={playbook.id}
            playbook={playbook}
            onActivate={handleActivate}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-gray-500 py-8">No playbooks found for this category.</p>
      )}
    </div>
  );
}
