'use client';

import React from 'react';

interface EnhancedTemplateCardProps {
  template: {
    id: string;
    name: string;
    type: string;
    category: string;
    content?: string;
    variables: Array<{
      name: string;
      label: string;
      type: string;
      required: boolean;
    }>;
    outputFormats: string[];
    version: number;
    description?: string;
    usageCount?: number;
  };
  onUseTemplate: (id: string) => void;
  onPreview?: (id: string) => void;
  onEdit?: (id: string) => void;
}

const TYPE_ICONS: Record<string, string> = {
  BRIEF: '📋',
  MEMO: '📝',
  SOP: '📖',
  MINUTES: '⏱',
  INVOICE: '💰',
  SOW: '📑',
  PROPOSAL: '💼',
  CONTRACT: '📜',
  REPORT: '📊',
  DECK: '🎯',
};

const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  BRIEF: 'Create concise executive summaries with key findings and recommendations',
  MEMO: 'Draft internal memos for team communication and announcements',
  SOP: 'Document standard operating procedures with step-by-step instructions',
  MINUTES: 'Record meeting minutes with action items and decisions',
  INVOICE: 'Generate professional invoices with line items and payment terms',
  SOW: 'Define project scope of work with deliverables and timelines',
  PROPOSAL: 'Build compelling business proposals with objectives and pricing',
  CONTRACT: 'Create legally structured contracts with terms and conditions',
  REPORT: 'Compile detailed reports with data analysis and insights',
  DECK: 'Design presentation decks with structured slides and talking points',
};

function getIcon(type: string): string {
  return TYPE_ICONS[type.toUpperCase()] || '📄';
}

function getDescription(type: string, description?: string): string {
  if (description) return description;
  return DEFAULT_DESCRIPTIONS[type.toUpperCase()] || 'Generate documents from this template';
}

export function EnhancedTemplateCard({
  template,
  onUseTemplate,
  onPreview,
  onEdit,
}: EnhancedTemplateCardProps) {
  const icon = getIcon(template.type);
  const description = getDescription(template.type, template.description);
  const variableCount = template.variables.length;
  const usageCount = template.usageCount ?? 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      <div className="text-2xl mb-2">{icon}</div>

      <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>

      <div className="text-xs text-gray-500 uppercase">
        {template.type} &middot; {template.category}
      </div>

      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{description}</p>

      <div className="text-xs text-gray-400 mt-3">
        {variableCount} variable{variableCount !== 1 ? 's' : ''} &middot; v
        {template.version}
      </div>

      {usageCount > 0 && (
        <div className="text-xs text-gray-400">
          Used {usageCount} time{usageCount !== 1 ? 's' : ''}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onUseTemplate(template.id)}
          className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Use Template
        </button>

        {onPreview && (
          <button
            onClick={() => onPreview(template.id)}
            className="text-gray-500 hover:text-blue-600 text-sm px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
          >
            Preview
          </button>
        )}

        {onEdit && (
          <button
            onClick={() => onEdit(template.id)}
            className="text-gray-500 hover:text-blue-600 text-sm px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
