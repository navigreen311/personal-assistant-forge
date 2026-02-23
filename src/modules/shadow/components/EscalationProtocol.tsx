'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface EscalationProtocolProps {
  attempts: number;
  waitMinutes: number;
  finalFallback: string;
  phoneTreeContacts: string[];
  onChange: (updates: Partial<EscalationProtocolProps>) => void;
  onAddPhoneTreeContact: (contact: string) => void;
  onRemovePhoneTreeContact: (index: number) => void;
}

interface ContactResult {
  name: string;
  email: string;
}

export default function EscalationProtocol({
  attempts,
  waitMinutes,
  finalFallback,
  phoneTreeContacts,
  onChange,
  onAddPhoneTreeContact,
  onRemovePhoneTreeContact,
}: EscalationProtocolProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ContactResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
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
    onAddPhoneTreeContact(display);
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
        onAddPhoneTreeContact(searchQuery.trim());
        setSearchQuery('');
        setShowDropdown(false);
      }
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Escalation Protocol</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        If Shadow can&apos;t reach you after all attempts, it contacts these people for crisis items only.
      </p>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Escalation Attempts
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={attempts}
              onChange={(e) => onChange({ attempts: Math.max(1, Number(e.target.value)) })}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Wait Between Attempts (min)
            </label>
            <input
              type="number"
              min={1}
              max={120}
              value={waitMinutes}
              onChange={(e) => onChange({ waitMinutes: Math.max(1, Number(e.target.value)) })}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Final Fallback
            </label>
            <select
              value={finalFallback}
              onChange={(e) => onChange({ finalFallback: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="sms">SMS with action links</option>
              <option value="phone_tree">Phone tree</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>

        {/* Phone Tree Contacts */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Phone Tree Contacts
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            If Shadow can&apos;t reach you after all attempts, it contacts these people for crisis items only.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {phoneTreeContacts.map((contact, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-full text-sm"
              >
                {contact}
                <button
                  onClick={() => onRemovePhoneTreeContact(index)}
                  className="ml-0.5 text-purple-400 hover:text-red-500 dark:hover:text-red-400"
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
              placeholder="Search contacts to add..."
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
                    className="w-full px-3 py-2 text-left text-sm hover:bg-purple-50 dark:hover:bg-purple-900/30 text-gray-900 dark:text-white"
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
        </div>
      </div>
    </div>
  );
}
