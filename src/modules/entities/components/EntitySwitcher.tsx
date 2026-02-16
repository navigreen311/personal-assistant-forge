'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Entity, ProjectHealth } from '@/shared/types';
import { EntityHealthBadge } from './EntityHealthBadge';

interface EntitySwitcherProps {
  entities: (Entity & { health?: ProjectHealth })[];
  activeEntityId: string | null;
  onSwitch: (entityId: string) => void;
  isCommunicationContext?: boolean;
}

export function EntitySwitcher({
  entities,
  activeEntityId,
  onSwitch,
  isCommunicationContext = false,
}: EntitySwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const activeEntity = entities.find((e) => e.id === activeEntityId);

  const close = useCallback(() => {
    setIsOpen(false);
    setFocusIndex(-1);
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        close();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [close]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        setFocusIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusIndex((i) => Math.min(i + 1, entities.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusIndex >= 0 && focusIndex < entities.length) {
          onSwitch(entities[focusIndex].id);
          close();
        }
        break;
      case 'Escape':
        e.preventDefault();
        close();
        buttonRef.current?.focus();
        break;
    }
  }

  const accentColor = activeEntity?.brandKit?.primaryColor ?? '#6366f1';

  return (
    <div ref={dropdownRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50 transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: accentColor }}
        />
        <span className="truncate max-w-[160px]">
          {activeEntity?.name ?? 'Select Entity'}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isCommunicationContext && activeEntity && (
        <div className="mt-1 text-xs text-gray-500">
          Responding as <span className="font-medium">{activeEntity.name}</span>
        </div>
      )}

      {isOpen && (
        <div
          className="absolute top-full left-0 z-50 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg"
          role="listbox"
          aria-label="Select entity"
        >
          <ul className="max-h-64 overflow-y-auto py-1">
            {entities.map((entity, index) => (
              <li
                key={entity.id}
                role="option"
                aria-selected={entity.id === activeEntityId}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                  entity.id === activeEntityId
                    ? 'bg-indigo-50 text-indigo-700'
                    : focusIndex === index
                      ? 'bg-gray-100'
                      : 'hover:bg-gray-50'
                }`}
                onClick={() => {
                  onSwitch(entity.id);
                  close();
                }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: entity.brandKit?.primaryColor ?? '#94a3b8',
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{entity.name}</div>
                  <div className="text-xs text-gray-500">{entity.type}</div>
                </div>
                <EntityHealthBadge health={entity.health ?? 'GREEN'} size="sm" />
              </li>
            ))}
          </ul>
          <div className="border-t border-gray-200 px-3 py-2">
            <a
              href="/entities"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Manage Entities
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
