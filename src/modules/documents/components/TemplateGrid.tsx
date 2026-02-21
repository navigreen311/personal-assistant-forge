'use client';

import React, { useMemo } from 'react';
import { EnhancedTemplateCard } from './EnhancedTemplateCard';

interface TemplateItem {
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
}

interface TemplateGridProps {
  templates: TemplateItem[];
  searchQuery?: string;
  typeFilter?: string;
  categoryFilter?: string;
  onUseTemplate: (id: string) => void;
  onPreview?: (id: string) => void;
  onEdit?: (id: string) => void;
}

export function TemplateGrid({
  templates,
  searchQuery = '',
  typeFilter = '',
  categoryFilter = '',
  onUseTemplate,
  onPreview,
  onEdit,
}: TemplateGridProps) {
  const filtered = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return templates.filter((template) => {
      if (typeFilter && template.type !== typeFilter) return false;
      if (categoryFilter && template.category !== categoryFilter) return false;
      if (
        query &&
        !template.name.toLowerCase().includes(query) &&
        !template.type.toLowerCase().includes(query) &&
        !template.category.toLowerCase().includes(query) &&
        !(template.description?.toLowerCase().includes(query))
      ) {
        return false;
      }
      return true;
    });
  }, [templates, searchQuery, typeFilter, categoryFilter]);

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg font-medium">No templates found</p>
        <p className="text-sm mt-1">
          Try adjusting your search or filter criteria
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {filtered.map((template) => (
        <EnhancedTemplateCard
          key={template.id}
          template={template}
          onUseTemplate={onUseTemplate}
          onPreview={onPreview}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
