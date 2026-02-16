'use client';

import { useState, useCallback, type FormEvent } from 'react';
import type { CaptureSource, CaptureContentType } from '@/modules/capture/types';

interface QuickCaptureBarProps {
  onCapture: (params: {
    rawContent: string;
    source: CaptureSource;
    contentType: CaptureContentType;
  }) => void;
}

export default function QuickCaptureBar({ onCapture }: QuickCaptureBarProps) {
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const detectContentType = useCallback((text: string): CaptureContentType => {
    if (/^https?:\/\//i.test(text)) return 'URL';
    if (/^data:image\//i.test(text)) return 'IMAGE';
    return 'TEXT';
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isSubmitting) return;

      setIsSubmitting(true);
      try {
        const contentType = detectContentType(input);
        onCapture({
          rawContent: input.trim(),
          source: 'MANUAL',
          contentType,
        });
        setInput('');
      } finally {
        setIsSubmitting(false);
      }
    },
    [input, isSubmitting, onCapture, detectContentType],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result as string;
              onCapture({
                rawContent: base64,
                source: 'CLIPBOARD',
                contentType: 'IMAGE',
              });
            };
            reader.readAsDataURL(blob);
          }
          return;
        }
      }
      // Text paste handled by normal input
    },
    [onCapture],
  );

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        {/* Source indicators */}
        <div className="flex gap-1.5">
          <SourceIcon type="text" active />
          <SourceIcon type="voice" />
          <SourceIcon type="camera" />
          <SourceIcon type="clipboard" />
        </div>

        {/* Input */}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
          placeholder="Quick capture — type, paste a URL, or paste an image..."
          className="flex-1 rounded-lg border-0 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Submit */}
        <button
          type="submit"
          disabled={!input.trim() || isSubmitting}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Capture
        </button>
      </form>
    </div>
  );
}

function SourceIcon({ type, active }: { type: string; active?: boolean }) {
  const color = active ? 'text-blue-600' : 'text-gray-300';
  const icons: Record<string, string> = {
    text: 'M4 6h16M4 12h16M4 18h8',
    voice: 'M12 1a4 4 0 00-4 4v6a4 4 0 008 0V5a4 4 0 00-4-4z',
    camera: 'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z',
    clipboard: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  };

  return (
    <svg
      className={`h-4 w-4 ${color}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={icons[type] ?? ''} />
    </svg>
  );
}
