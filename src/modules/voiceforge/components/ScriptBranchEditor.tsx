'use client';

import { useState } from 'react';
import type { ScriptBranch } from '@/modules/voiceforge/types';

interface ScriptBranchEditorProps {
  branches: ScriptBranch[];
  onSave: (branches: ScriptBranch[]) => void;
}

export function ScriptBranchEditor({ branches, onSave }: ScriptBranchEditorProps) {
  const [edited, setEdited] = useState<ScriptBranch[]>([...branches]);

  const addBranch = () => {
    setEdited([...edited, { condition: '', targetNodeId: '', label: '' }]);
  };

  const updateBranch = (index: number, field: keyof ScriptBranch, value: string) => {
    const updated = [...edited];
    updated[index] = { ...updated[index], [field]: value };
    setEdited(updated);
  };

  const removeBranch = (index: number) => {
    setEdited(edited.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-900">Branches</h4>
      {edited.map((branch, i) => (
        <div key={i} className="rounded border border-gray-200 p-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Label"
              value={branch.label}
              onChange={(e) => updateBranch(i, 'label', e.target.value)}
              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-md"
            />
            <button
              onClick={() => removeBranch(i)}
              className="text-red-500 text-sm hover:text-red-700"
            >
              Remove
            </button>
          </div>
          <input
            type="text"
            placeholder="Condition (e.g., keyword=yes)"
            value={branch.condition}
            onChange={(e) => updateBranch(i, 'condition', e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
          />
          <input
            type="text"
            placeholder="Target Node ID"
            value={branch.targetNodeId}
            onChange={(e) => updateBranch(i, 'targetNodeId', e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
          />
        </div>
      ))}
      <div className="flex gap-2">
        <button
          onClick={addBranch}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          Add Branch
        </button>
        <button
          onClick={() => onSave(edited)}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Save Branches
        </button>
      </div>
    </div>
  );
}
