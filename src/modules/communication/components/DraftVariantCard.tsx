'use client';

import type { DraftVariant } from '@/modules/communication/types';

interface DraftVariantCardProps {
  variant: DraftVariant;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
}

export default function DraftVariantCard({ variant, isSelected, onSelect }: DraftVariantCardProps) {
  return (
    <div
      onClick={() => onSelect?.(variant.id)}
      className={`border rounded-lg p-4 cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">{variant.label}</h3>
        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
          {variant.tone}
        </span>
      </div>

      {variant.subject && (
        <p className="text-xs text-gray-500 mb-2">
          <span className="font-medium">Subject:</span> {variant.subject}
        </p>
      )}

      <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{variant.body}</p>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>{variant.wordCount} words</span>
        <span>{variant.readingLevel}</span>
      </div>

      {variant.complianceFlags.length > 0 && (
        <div className="mt-2 space-y-1">
          {variant.complianceFlags.map((flag, i) => (
            <div
              key={i}
              className={`text-xs px-2 py-1 rounded ${
                flag.startsWith('ERROR')
                  ? 'bg-red-100 text-red-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {flag}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
