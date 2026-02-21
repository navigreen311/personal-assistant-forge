'use client';

import { useState } from 'react';
import type { MessageChannel } from '@/shared/types';

const CHANNELS: MessageChannel[] = ['EMAIL', 'SMS', 'SLACK', 'TEAMS', 'DISCORD', 'WHATSAPP', 'TELEGRAM', 'VOICE', 'MANUAL'];

export default function BroadcastComposer() {
  const [recipientIds, setRecipientIds] = useState('');
  const [template, setTemplate] = useState('');
  const [channel, setChannel] = useState<MessageChannel>('EMAIL');
  const [mergeFieldsRaw, setMergeFieldsRaw] = useState('');
  const [result, setResult] = useState<{ totalSent: number; totalFailed: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePreview = () => {
    // Simple merge field preview
    try {
      const fields = mergeFieldsRaw ? JSON.parse(mergeFieldsRaw) : {};
      const preview = template.replace(/\{\{(\w+)\}\}/g, (match, fieldName) => {
        return fields[fieldName] ?? match;
      });
      return preview;
    } catch {
      return template;
    }
  };

  const handleSend = async () => {
    setLoading(true);
    setErrorMessage(null);
    setResult(null);

    try {
      const ids = recipientIds.split(',').map((id) => id.trim()).filter(Boolean);
      let _mergeFields: Record<string, string>[] = [];
      if (mergeFieldsRaw) {
        const parsed = JSON.parse(mergeFieldsRaw);
        _mergeFields = Array.isArray(parsed) ? parsed : [parsed];
      }

      // In a real app, this would call a broadcast API endpoint
      setResult({ totalSent: ids.length, totalFailed: 0 });
    } catch {
      setErrorMessage('Failed to send broadcast. Check merge fields JSON format.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Broadcast Composer</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Recipient IDs (comma-separated)</label>
        <input
          type="text"
          value={recipientIds}
          onChange={(e) => setRecipientIds(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          placeholder="id1, id2, id3"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as MessageChannel)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          {CHANNELS.map((ch) => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Template (use {'{{fieldName}}'} for merge fields)
        </label>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          placeholder="Hello {{name}}, this is a message about {{topic}}..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Merge Fields (JSON)</label>
        <textarea
          value={mergeFieldsRaw}
          onChange={(e) => setMergeFieldsRaw(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
          placeholder='{"name": "John", "topic": "meeting"}'
        />
      </div>

      {template && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
          <p className="text-xs text-gray-500 mb-1">Preview:</p>
          <p className="text-sm text-gray-700">{handlePreview()}</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {result && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
          Broadcast sent: {result.totalSent} delivered, {result.totalFailed} failed.
        </div>
      )}

      <button
        onClick={handleSend}
        disabled={loading || !template || !recipientIds}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Sending...' : 'Send Broadcast'}
      </button>
    </div>
  );
}
