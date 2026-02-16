'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import WorkflowDesigner from '@/modules/workflows/components/WorkflowDesigner';
import NodePalette from '@/modules/workflows/components/NodePalette';
import NodeConfigPanel from '@/modules/workflows/components/NodeConfigPanel';
import type { WorkflowGraph, WorkflowNode } from '@/modules/workflows/types';

// ============================================================================
// Workflow Designer Page — Full visual editor with palette and config panel
// ============================================================================

export default function WorkflowDesignerPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;

  const [graph, setGraph] = useState<WorkflowGraph>({ nodes: [], edges: [] });
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [workflowStatus, setWorkflowStatus] = useState('DRAFT');
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);

  // Load workflow
  useEffect(() => {
    if (workflowId === 'new') return;

    const fetchWorkflow = async () => {
      try {
        const response = await fetch(`/api/workflows/${workflowId}`);
        const data = await response.json();
        if (data.success && data.data) {
          setWorkflowName(data.data.name);
          setWorkflowStatus(data.data.status);
          // Parse graph from steps
          if (data.data.steps && 'nodes' in data.data.steps) {
            setGraph(data.data.steps);
          }
        }
      } catch {
        // Handle error
      }
    };

    fetchWorkflow();
  }, [workflowId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const method = workflowId === 'new' ? 'POST' : 'PUT';
      const url =
        workflowId === 'new' ? '/api/workflows' : `/api/workflows/${workflowId}`;

      const body =
        workflowId === 'new'
          ? {
              name: workflowName,
              entityId: 'default-entity',
              graph,
              triggers: [],
            }
          : { name: workflowName, graph };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.success && workflowId === 'new' && data.data?.id) {
        router.replace(`/workflows/${data.data.id}`);
      }
    } catch {
      // Handle error
    } finally {
      setSaving(false);
    }
  }, [workflowId, workflowName, graph, router]);

  const handleSimulate = useCallback(async () => {
    if (workflowId === 'new') return;
    setSimulating(true);
    try {
      const response = await fetch(`/api/workflows/${workflowId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables: {} }),
      });
      const data = await response.json();
      if (data.success) {
        // Display simulation results (in production, show in a modal)
        console.log('Simulation result:', data.data);
      }
    } catch {
      // Handle error
    } finally {
      setSimulating(false);
    }
  }, [workflowId]);

  const handleTrigger = useCallback(async () => {
    if (workflowId === 'new') return;
    try {
      await fetch(`/api/workflows/${workflowId}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'USER', variables: {} }),
      });
    } catch {
      // Handle error
    }
  }, [workflowId]);

  const handleToggleStatus = useCallback(async () => {
    if (workflowId === 'new') return;
    const newStatus = workflowStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await fetch(`/api/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setWorkflowStatus(newStatus);
    } catch {
      // Handle error
    }
  }, [workflowId, workflowStatus]);

  const handleNodeSelect = useCallback((node: WorkflowNode | null) => {
    setSelectedNode(node);
  }, []);

  const handleNodeUpdate = useCallback(
    (updatedNode: WorkflowNode) => {
      setGraph((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === updatedNode.id ? updatedNode : n)),
      }));
      setSelectedNode(updatedNode);
    },
    []
  );

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    PAUSED: 'bg-yellow-100 text-yellow-800',
    DRAFT: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/workflows')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back
          </button>
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="text-lg font-semibold text-gray-900 border-none focus:ring-0 p-0 bg-transparent"
          />
          <button
            onClick={handleToggleStatus}
            className={`px-2 py-1 text-xs font-medium rounded-full ${
              statusColors[workflowStatus] ?? 'bg-gray-100 text-gray-600'
            }`}
          >
            {workflowStatus}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSimulate}
            disabled={simulating || workflowId === 'new'}
            className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50"
          >
            {simulating ? 'Simulating...' : 'Simulate'}
          </button>
          <button
            onClick={handleTrigger}
            disabled={workflowId === 'new'}
            className="px-3 py-1.5 text-sm text-green-700 bg-green-100 hover:bg-green-200 rounded-md disabled:opacity-50"
          >
            Trigger
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Node Palette */}
        <NodePalette />

        {/* Canvas */}
        <div className="flex-1 relative">
          <WorkflowDesigner
            graph={graph}
            onChange={setGraph}
            onNodeSelect={handleNodeSelect}
            selectedNodeId={selectedNode?.id ?? null}
          />
        </div>

        {/* Config Panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={handleNodeUpdate}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
