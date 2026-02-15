'use client';

import { useState } from 'react';
import type { Tone } from '@/shared/types';

const TONES: { value: Tone; label: string; description: string }[] = [
  { value: 'FIRM', label: 'Firm', description: 'Clear expectations, no ambiguity' },
  { value: 'DIPLOMATIC', label: 'Diplomatic', description: 'Balanced and tactful' },
  { value: 'WARM', label: 'Warm', description: 'Friendly and approachable' },
  { value: 'DIRECT', label: 'Direct', description: 'Straight to the point' },
  { value: 'CASUAL', label: 'Casual', description: 'Relaxed and informal' },
  { value: 'FORMAL', label: 'Formal', description: 'Professional and structured' },
  { value: 'EMPATHETIC', label: 'Empathetic', description: 'Understanding and supportive' },
  { value: 'AUTHORITATIVE', label: 'Authoritative', description: 'Commanding and decisive' },
];

interface ToneSelectorProps {
  value: Tone;
  onChange: (tone: Tone) => void;
}

export default function ToneSelector({ value, onChange }: ToneSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = TONES.find((t) => t.value === value);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">Tone</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-left bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <span className="block truncate">{selected?.label ?? 'Select tone'}</span>
        <span className="absolute inset-y-0 right-0 flex items-center pr-2 mt-6 pointer-events-none">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {TONES.map((tone) => (
            <li
              key={tone.value}
              onClick={() => { onChange(tone.value); setIsOpen(false); }}
              className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                tone.value === value ? 'bg-blue-100 font-medium' : ''
              }`}
            >
              <span className="block text-sm font-medium">{tone.label}</span>
              <span className="block text-xs text-gray-500">{tone.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
