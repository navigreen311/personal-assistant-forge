'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface VIPContactSearchProps {
  contacts: string[];
  keywords: string[];
  onAddContact: (contact: string) => void;
  onRemoveContact: (index: number) => void;
  onAddKeyword: (keyword: string) => void;
  onRemoveKeyword: (index: number) => void;
}

interface ContactResult {
  name: string;
  email: string;
}

export default function VIPContactSearch({
  contacts,
  keywords,
  onAddContact,
  onRemoveContact,
  onAddKeyword,
  onRemoveKeyword,
}: VIPContactSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ContactResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchContacts = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
        setShowDropdown(data.length > 0);
      } else {
        setSearchResults([]);
        setShowDropdown(false);
      }
    } catch {
      setSearchResults([]);
      setShowDropdown(false);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchContacts(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, fetchContacts]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectContact = (contact: ContactResult) => {
    const display = contact.name ? `${contact.name} (${contact.email})` : contact.email;
    onAddContact(display);
    setSearchQuery('');
    setShowDropdown(false);
    setSearchResults([]);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault();
      if (searchResults.length > 0) {
        handleSelectContact(searchResults[0]);
      } else {
        onAddContact(searchQuery.trim());
        setSearchQuery('');
        setShowDropdown(false);
      }
    }
  };

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim();
    if (trimmed) {
      onAddKeyword(trimmed);
      setNewKeyword('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Contact Search */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Search Contacts
        </label>
        <div ref={searchRef} className="relative max-w-sm">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => {
              if (searchResults.length > 0) setShowDropdown(true);
            }}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Search by name or email..."
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="animate-spin h-4 w-4 text-gray-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
              {searchResults.map((result, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectContact(result)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-900 dark:text-white"
                >
                  <span className="font-medium">{result.name}</span>
                  {result.email && (
                    <span className="ml-2 text-gray-500 dark:text-gray-400">{result.email}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Contact Chips */}
        <div className="flex flex-wrap gap-2 mt-3">
          {contacts.map((contact, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-full text-sm"
            >
              {contact}
              <button
                onClick={() => onRemoveContact(index)}
                className="ml-0.5 text-blue-400 hover:text-red-500 dark:hover:text-red-400"
                aria-label={`Remove ${contact}`}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* VIP Keywords */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          VIP Keywords
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          If any inbound email contains these keywords, Shadow treats it as VIP regardless of sender.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {keywords.map((keyword, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-full text-sm"
            >
              {keyword}
              <button
                onClick={() => onRemoveKeyword(index)}
                className="ml-0.5 text-amber-400 hover:text-red-500 dark:hover:text-red-400"
                aria-label={`Remove keyword ${keyword}`}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 max-w-sm">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddKeyword();
              }
            }}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="e.g. urgent, lawsuit, board meeting"
          />
          <button
            onClick={handleAddKeyword}
            disabled={!newKeyword.trim()}
            className="px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add
          </button>
        </div>
      </div>
    </div>
  );
}
