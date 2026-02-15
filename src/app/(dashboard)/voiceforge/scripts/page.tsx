'use client';

import { useState, useEffect } from 'react';
import type { CallScript, ScriptNode } from '@/modules/voiceforge/types';
import { ScriptNodeList } from '@/modules/voiceforge/components/ScriptNodeList';
import { ScriptNodeEditor } from '@/modules/voiceforge/components/ScriptNodeEditor';
import { ScriptValidationPanel } from '@/modules/voiceforge/components/ScriptValidationPanel';

export default function ScriptsPage() {
  const [scripts, setScripts] = useState<CallScript[]>([]);
  const [selectedScript, setSelectedScript] = useState<CallScript | null>(null);
  const [editingNode, setEditingNode] = useState<ScriptNode | null>(null);
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const entityId = 'default';
    fetch(`/api/voice/scripts?entityId=${entityId}`)
      .then((r) => r.json())
      .then((data) => {
        setScripts(data.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleValidate = async () => {
    if (!selectedScript) return;
    try {
      const res = await fetch(`/api/voice/scripts/${selectedScript.id}/validate`, { method: 'POST' });
      const data = await res.json();
      if (data.success) setValidation(data.data);
    } catch {
      // silently fail
    }
  };

  const handleSelectNode = (nodeId: string) => {
    if (!selectedScript) return;
    const node = selectedScript.nodes.find((n) => n.id === nodeId);
    if (node) setEditingNode(node);
  };

  const handleSaveNode = (node: ScriptNode) => {
    if (!selectedScript) return;
    const updated = {
      ...selectedScript,
      nodes: selectedScript.nodes.map((n) => (n.id === node.id ? node : n)),
    };
    setSelectedScript(updated);
    setEditingNode(null);
  };

  if (loading) {
    return <div className="p-6 text-gray-500">Loading scripts...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Script Builder</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Script List */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Scripts</h2>
          {scripts.map((script) => (
            <div
              key={script.id}
              onClick={() => { setSelectedScript(script); setValidation(null); setEditingNode(null); }}
              className={`rounded-lg border p-3 cursor-pointer text-sm ${
                selectedScript?.id === script.id
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:shadow-sm'
              }`}
            >
              <p className="font-medium text-gray-900">{script.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  script.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                  script.status === 'DRAFT' ? 'bg-gray-100 text-gray-600' :
                  'bg-red-100 text-red-600'
                }`}>{script.status}</span>
                <span className="text-xs text-gray-400">{script.nodes.length} nodes</span>
              </div>
            </div>
          ))}
          {scripts.length === 0 && (
            <p className="text-sm text-gray-500">No scripts created</p>
          )}
        </div>

        {/* Script Flow + Editor */}
        <div className="lg:col-span-2 space-y-4">
          {selectedScript ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">
                  {selectedScript.name} - Flow
                </h2>
                <button
                  onClick={handleValidate}
                  className="px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Validate
                </button>
              </div>
              <ScriptNodeList
                nodes={selectedScript.nodes}
                startNodeId={selectedScript.startNodeId}
                onSelectNode={handleSelectNode}
              />
            </>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
              Select a script to view its flow
            </div>
          )}
        </div>

        {/* Right Panel: Editor + Validation */}
        <div className="space-y-4">
          {editingNode ? (
            <ScriptNodeEditor
              node={editingNode}
              onSave={handleSaveNode}
              onCancel={() => setEditingNode(null)}
            />
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
              Select a node to edit
            </div>
          )}
          <ScriptValidationPanel result={validation} />
        </div>
      </div>
    </div>
  );
}
