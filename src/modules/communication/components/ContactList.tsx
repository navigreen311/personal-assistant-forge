'use client';

import { useState, useEffect } from 'react';
import type { Contact } from '@/shared/types';
import RelationshipBadge from './RelationshipBadge';

interface ContactListProps {
  entityId?: string;
  onSelectContact: (contact: Contact) => void;
}

export default function ContactList({ entityId, onSelectContact }: ContactListProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'score'>('name');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  useEffect(() => {
    const fetchContacts = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (entityId) params.set('entityId', entityId);
        if (tagFilter) params.set('tags', tagFilter);

        const res = await fetch(`/api/contacts?${params}`);
        if (res.ok) {
          const json = await res.json();
          setContacts(json.data ?? []);
          setTotal(json.meta?.total ?? 0);
        }
      } catch {
        // Silently handle fetch errors in list view
      } finally {
        setLoading(false);
      }
    };
    fetchContacts();
  }, [entityId, tagFilter, page]);

  const filtered = contacts
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === 'score') return b.relationshipScore - a.relationshipScore;
      return a.name.localeCompare(b.name);
    });

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
        />
        <input
          type="text"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          placeholder="Filter by tags"
          className="w-40 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'score')}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="name">Sort by Name</option>
          <option value="score">Sort by Score</option>
        </select>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}

      <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
        {filtered.map((contact) => (
          <li
            key={contact.id}
            onClick={() => onSelectContact(contact)}
            className="px-4 py-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">{contact.name}</p>
              <p className="text-xs text-gray-500">{contact.email ?? 'No email'}</p>
            </div>
            <RelationshipBadge score={contact.relationshipScore} />
          </li>
        ))}
        {filtered.length === 0 && !loading && (
          <li className="px-4 py-6 text-center text-sm text-gray-500">No contacts found.</li>
        )}
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
