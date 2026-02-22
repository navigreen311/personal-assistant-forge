'use client';

import { useState, useEffect } from 'react';
import CaptureTypeSelector from './CaptureTypeSelector';
import type { CaptureType } from '@/modules/knowledge/types';

interface EntityOption {
  id: string;
  name: string;
  type: string;
}

interface QuickCaptureBarProps {
  entityId: string;
  onCaptured?: () => void;
  entities?: EntityOption[];
  onEntityChange?: (entityId: string) => void;
}

export default function QuickCaptureBar({ entityId, onCaptured, entities, onEntityChange }: QuickCaptureBarProps) {
  const [content, setContent] = useState('');
  const [type, setType] = useState<CaptureType>('NOTE');
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState(entityId);

  useEffect(() => {
    setSelectedEntityId(entityId);
  }, [entityId]);

  function handleEntitySelect(newId: string) {
    setSelectedEntityId(newId);
    onEntityChange?.(newId);
  }

  function parseTags(): string[] {
    return tagInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  async function handleCapture() {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const tags = parseTags();
      await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: selectedEntityId,
          type,
          content,
          source: 'manual',
          tags: tags.length > 0 ? tags : undefined,
        }),
      });
      setContent('');
      setTagInput('');
      onCaptured?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 space-y-3">
      {/* Entity selector row */}
      {entities && entities.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 shrink-0">Entity:</label>
          <select
            value={selectedEntityId}
            onChange={(e) => handleEntitySelect(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.name} ({ent.type})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Main capture row */}
      <div className="flex gap-2 items-center">
        <CaptureTypeSelector value={type} onChange={setType} />
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
          placeholder={
            type === 'NOTE'
              ? 'Capture a thought...'
              : type === 'BOOKMARK'
                ? 'Paste a URL or link...'
                : type === 'CODE_SNIPPET'
                  ? 'Paste a code snippet...'
                  : 'Capture a thought, link, or snippet...'
          }
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleCapture}
          disabled={loading || !content.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Capturing...' : 'Capture'}
        </button>
      </div>

      {/* Inline tag input */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-500 shrink-0">Tags:</label>
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
          placeholder="Add tags (comma-separated, e.g. react, typescript, tips)"
          className="flex-1 px-2 py-1 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {tagInput.trim() && (
          <div className="flex gap-1 flex-wrap">
            {parseTags().map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
