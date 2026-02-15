'use client';

import { useState } from 'react';
import type { ScriptNode } from '@/modules/voiceforge/types';

interface ScriptNodeEditorProps {
  node: ScriptNode;
  onSave: (node: ScriptNode) => void;
  onCancel: () => void;
}

const NODE_TYPES: ScriptNode['type'][] = ['SPEAK', 'LISTEN', 'BRANCH', 'TRANSFER', 'END', 'COLLECT_INFO'];

export function ScriptNodeEditor({ node, onSave, onCancel }: ScriptNodeEditorProps) {
  const [edited, setEdited] = useState<ScriptNode>({ ...node });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <h4 className="text-sm font-semibold text-gray-900">Edit Node</h4>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">ID</label>
        <input
          type="text"
          value={edited.id}
          onChange={(e) => setEdited({ ...edited, id: e.target.value })}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
        <select
          value={edited.type}
          onChange={(e) => setEdited({ ...edited, type: e.target.value as ScriptNode['type'] })}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
        >
          {NODE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Content</label>
        <textarea
          value={edited.content}
          onChange={(e) => setEdited({ ...edited, content: e.target.value })}
          rows={3}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
        />
      </div>

      {edited.type === 'COLLECT_INFO' && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Collect Field</label>
          <input
            type="text"
            value={edited.collectField ?? ''}
            onChange={(e) => setEdited({ ...edited, collectField: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Next Node ID</label>
        <input
          type="text"
          value={edited.nextNodeId ?? ''}
          onChange={(e) => setEdited({ ...edited, nextNodeId: e.target.value || undefined })}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={edited.escalationTrigger ?? false}
          onChange={(e) => setEdited({ ...edited, escalationTrigger: e.target.checked })}
          className="rounded"
        />
        Escalation trigger
      </label>

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => onSave(edited)}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
