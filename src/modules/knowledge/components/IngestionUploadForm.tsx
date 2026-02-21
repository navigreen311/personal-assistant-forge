'use client';

import { useState } from 'react';

interface IngestionUploadFormProps {
  entityId: string;
  onIngested?: () => void;
}

export default function IngestionUploadForm({ entityId, onIngested }: IngestionUploadFormProps) {
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [mimeType, _setMimeType] = useState('text/plain');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ summary: string; wordCount: number; entries: number } | null>(null);

  async function handleIngest() {
    if (!filename.trim() || !content.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/knowledge/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, filename, mimeType, content, source: 'upload' }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({
          summary: data.data.summary,
          wordCount: data.data.wordCount,
          entries: data.data.entries.length,
        });
        setFilename('');
        setContent('');
        onIngested?.();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Ingest Document</h3>
      <div>
        <label className="text-xs font-medium text-gray-600">Filename</label>
        <input
          type="text"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder="document.txt"
          className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">Content</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste document content here..."
          className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
          rows={6}
        />
      </div>
      <button
        onClick={handleIngest}
        disabled={loading || !filename.trim() || !content.trim()}
        className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Ingesting...' : 'Ingest'}
      </button>
      {result && (
        <div className="p-3 bg-green-50 rounded text-sm">
          <p className="font-medium text-green-800">Ingested successfully!</p>
          <p className="text-green-700 text-xs">
            {result.entries} entries created &middot; {result.wordCount} words &middot;{' '}
            {result.summary.substring(0, 100)}...
          </p>
        </div>
      )}
    </div>
  );
}
