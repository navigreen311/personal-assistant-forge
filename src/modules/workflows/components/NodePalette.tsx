'use client';

import React, { useCallback } from 'react';

// ============================================================================
// Node Palette — Sidebar listing all available node types for drag-and-drop
// ============================================================================

interface NodePaletteItem {
  type: string;
  label: string;
  icon: string;
  description: string;
  category: string;
}

const PALETTE_ITEMS: NodePaletteItem[] = [
  // Triggers
  {
    type: 'TRIGGER',
    label: 'Trigger',
    icon: '\u26A1',
    description: 'Start workflow on event, schedule, or manual trigger',
    category: 'Triggers',
  },

  // Actions
  {
    type: 'ACTION',
    label: 'Action',
    icon: '\u25B6',
    description: 'Execute a task, send message, call API, etc.',
    category: 'Actions',
  },

  // Logic
  {
    type: 'CONDITION',
    label: 'Condition',
    icon: '\u2B29',
    description: 'Branch workflow based on a condition',
    category: 'Logic',
  },
  {
    type: 'LOOP',
    label: 'Loop',
    icon: '\uD83D\uDD01',
    description: 'Iterate over a collection of items',
    category: 'Logic',
  },
  {
    type: 'DELAY',
    label: 'Delay',
    icon: '\u23F1',
    description: 'Pause execution for a duration',
    category: 'Logic',
  },
  {
    type: 'ERROR_HANDLER',
    label: 'Error Handler',
    icon: '\u26A0',
    description: 'Catch and handle errors from other nodes',
    category: 'Logic',
  },

  // AI
  {
    type: 'AI_DECISION',
    label: 'AI Decision',
    icon: '\uD83E\uDDE0',
    description: 'Use AI to classify, score, draft, or summarize',
    category: 'AI',
  },

  // Human
  {
    type: 'HUMAN_APPROVAL',
    label: 'Human Approval',
    icon: '\u2714',
    description: 'Require human approval before continuing',
    category: 'Human',
  },
  {
    type: 'SUB_WORKFLOW',
    label: 'Sub-Workflow',
    icon: '\uD83D\uDD17',
    description: 'Execute another workflow as a step',
    category: 'Actions',
  },
];

const CATEGORIES = ['Triggers', 'Actions', 'Logic', 'AI', 'Human'];

const CATEGORY_COLORS: Record<string, string> = {
  Triggers: 'text-green-700',
  Actions: 'text-blue-700',
  Logic: 'text-yellow-700',
  AI: 'text-purple-700',
  Human: 'text-orange-700',
};

export default function NodePalette() {
  const handleDragStart = useCallback(
    (e: React.DragEvent, nodeType: string) => {
      e.dataTransfer.setData('nodeType', nodeType);
      e.dataTransfer.effectAllowed = 'copy';
    },
    []
  );

  return (
    <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Node Palette</h3>
      <p className="text-xs text-gray-500 mb-4">
        Drag nodes onto the canvas to build your workflow.
      </p>

      {CATEGORIES.map((category) => {
        const items = PALETTE_ITEMS.filter((item) => item.category === category);
        if (items.length === 0) return null;

        return (
          <div key={category} className="mb-4">
            <h4
              className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                CATEGORY_COLORS[category] ?? 'text-gray-700'
              }`}
            >
              {category}
            </h4>
            <div className="space-y-1">
              {items.map((item) => (
                <div
                  key={item.type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.type)}
                  className="flex items-start gap-2 p-2 rounded-md border border-gray-200 cursor-grab hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  <span className="text-lg leading-none mt-0.5">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">
                      {item.label}
                    </div>
                    <div className="text-xs text-gray-500 leading-tight">
                      {item.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
