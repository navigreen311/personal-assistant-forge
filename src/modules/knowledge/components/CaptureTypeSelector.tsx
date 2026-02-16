'use client';

import type { CaptureType } from '@/modules/knowledge/types';

const CAPTURE_TYPES: { value: CaptureType; label: string }[] = [
  { value: 'NOTE', label: 'Note' },
  { value: 'BOOKMARK', label: 'Bookmark' },
  { value: 'VOICE_MEMO', label: 'Voice Memo' },
  { value: 'CODE_SNIPPET', label: 'Code Snippet' },
  { value: 'QUOTE', label: 'Quote' },
  { value: 'ARTICLE', label: 'Article' },
  { value: 'IMAGE_NOTE', label: 'Image Note' },
];

interface CaptureTypeSelectorProps {
  value: CaptureType;
  onChange: (type: CaptureType) => void;
}

export default function CaptureTypeSelector({ value, onChange }: CaptureTypeSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CaptureType)}
      className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {CAPTURE_TYPES.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
