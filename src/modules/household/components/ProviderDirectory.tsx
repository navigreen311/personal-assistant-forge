'use client';

import { useState } from 'react';
import type { ServiceProvider } from '../types';

export default function ProviderDirectory({ providers }: { providers: ServiceProvider[] }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const categories = ['all', ...new Set(providers.map(p => p.category))];
  const filtered = providers
    .filter(p => categoryFilter === 'all' || p.category === categoryFilter)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Service Providers</h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search providers..."
          className="flex-1 border rounded-md px-3 py-2 text-sm"
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm"
        >
          {categories.map(c => (
            <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        {filtered.map(provider => (
          <div key={provider.id} className="border rounded-lg p-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{provider.name}</div>
                <div className="text-xs text-gray-500">{provider.category}</div>
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className={i < Math.round(provider.rating) ? 'text-yellow-400' : 'text-gray-200'}>
                    ★
                  </span>
                ))}
              </div>
            </div>
            {(provider.phone || provider.email) && (
              <div className="mt-2 text-sm text-gray-600">
                {provider.phone && <span>{provider.phone}</span>}
                {provider.phone && provider.email && <span className="mx-2">|</span>}
                {provider.email && <span>{provider.email}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
