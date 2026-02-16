'use client';

import { useState } from 'react';
import CaptureTypeSelector from './CaptureTypeSelector';
import type { CaptureType } from '@/modules/knowledge/types';

interface QuickCaptureBarProps {
  entityId: string;
  onCaptured?: () => void;
}

export default function QuickCaptureBar({ entityId, onCaptured }: QuickCaptureBarProps) {
  const [content, setContent] = useState('');
  const [type, setType] = useState<CaptureType>('NOTE');
  const [loading, setLoading] = useState(false);

  async function handleCapture() {
    if (!content.trim()) return;
    setLoading(true);
    try {
      await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, type, content, source: 'manual' }),
      });
      setContent('');
      onCaptured?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-2 items-center p-4 bg-white rounded-lg shadow-sm border border-gray-200">
      <CaptureTypeSelector value={type} onChange={setType} />
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
        placeholder="Capture a thought, link, or snippet..."
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
  );
}
